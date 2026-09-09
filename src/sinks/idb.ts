import type { LogRecord, Sink } from '../types'

/** {@linkcode IdbSink} 생성 옵션. */
export interface IdbSinkOptions {
  /** IndexedDB 데이터베이스 이름. 기본 `'cdr'`. */
  dbName?: string
  /** object store 이름. 기본 `'logs'`. */
  storeName?: string
  /** 유지할 최대 레코드 수. 넘으면 오래된 것부터 삭제. 기본 5000. */
  maxRecords?: number
}

/**
 * 레코드를 사용자 기기의 IndexedDB에만 쌓는 pull 모델 sink.
 *
 * 아무것도 전송하지 않는다. 병원 내부망처럼 outbound가 막힌 환경에서도
 * 동작하는 게 핵심이고, 꺼내는 건 사용자가 `/log`에서
 * {@linkcode IdbSink.read}와 `downloadLogs`로 직접 한다.
 *
 * - autoIncrement key로 시간순 보존 (cursor 오름차순 = 오래된 순).
 * - 레코드 수가 `maxRecords`를 넘으면 초과분만큼 가장 오래된 것부터 삭제.
 * - 매 레코드가 아니라 배치로 한 트랜잭션 → 오버헤드 최소화.
 *
 * 의존성 없는 순수 IndexedDB. `idb` 같은 래퍼를 써도 무방하다.
 *
 * @example /log 라우트에서 읽고 비우기
 * ```ts
 * import { IdbSink, downloadLogs } from 'cdr'
 *
 * const sink = new IdbSink({ maxRecords: 5000 })
 * const records = await sink.read(500)
 * downloadLogs(records)
 * await sink.clear()
 * ```
 */
export class IdbSink implements Sink {
  /** sink 이름. 항상 `'indexeddb'`. */
  readonly name = 'indexeddb'
  private dbName: string
  private storeName: string
  private maxRecords: number
  private dbPromise: Promise<IDBDatabase> | null = null

  /**
   * sink를 만든다. 데이터베이스는 첫 읽기·쓰기 때 열린다.
   *
   * @param opts 데이터베이스 이름과 보존 상한.
   */
  constructor(opts: IdbSinkOptions = {}) {
    this.dbName = opts.dbName ?? 'cdr'
    this.storeName = opts.storeName ?? 'logs'
    this.maxRecords = opts.maxRecords ?? 5000
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('ts', 'ts')
          store.createIndex('type', 'type')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.dbPromise
  }

  /**
   * 배치를 한 트랜잭션으로 저장하고, 이어서 오래된 레코드를 정리한다.
   *
   * `id`는 store가 autoIncrement로 채우므로 넣기 전에 떼어낸다.
   *
   * @param records 저장할 레코드. 빈 배열이면 아무것도 하지 않는다.
   * @returns 저장과 정리가 끝나면 resolve.
   */
  async write(records: LogRecord[]): Promise<void> {
    if (records.length === 0) return
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      for (const r of records) {
        // id는 autoIncrement가 채우므로 제거하고 넣는다
        const { id: _omit, ...rest } = r
        store.add(rest)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await this.rotate(db)
  }

  /** maxRecords 초과분을 오래된 순으로 삭제. */
  private async rotate(db: IDBDatabase): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      const countReq = store.count()
      countReq.onsuccess = () => {
        let toDelete = countReq.result - this.maxRecords
        if (toDelete <= 0) {
          resolve()
          return
        }
        // 오름차순 cursor = 가장 오래된 레코드부터
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result
          if (cursor && toDelete > 0) {
            cursor.delete()
            toDelete--
            cursor.continue()
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * 쌓인 레코드를 최신순으로 읽는다.
   *
   * `/log` 라우트에서 목록을 그릴 때 쓴다.
   *
   * @param limit 가져올 최대 개수. 기본 1000.
   * @returns 최신 레코드부터 `limit`개. 저장된 게 없으면 빈 배열.
   */
  async read(limit = 1000): Promise<LogRecord[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const out: LogRecord[] = []
      // "prev" = 내림차순(최신 먼저)
      const cursorReq = store.openCursor(null, 'prev')
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor && out.length < limit) {
          out.push(cursor.value as LogRecord)
          cursor.continue()
        } else {
          resolve(out)
        }
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  }

  /**
   * 저장된 레코드를 전부 지운다.
   *
   * 사용자가 `/log`에서 직접 비울 때 쓴다. 되돌릴 수 없다.
   *
   * @returns 삭제가 끝나면 resolve.
   */
  /**
   * 저장소를 열 수 없는 브라우저에서는 거부된다.
   *
   * 시크릿 창이나 정책으로 IndexedDB가 막힌 환경이 있다. 기록 경로는
   * {@linkcode DiagLogger.flush}가 sink 예외를 삼켜 앱을 깨지 않지만, 읽기와
   * 비우기는 호출부가 직접 처리해야 한다. `/log` 화면이라면 빈 목록 대신
   * 저장소를 쓸 수 없다는 사실을 보여줄 것. 레코드가 없는 것과 못 읽는 것은
   * 다른 상태다.
   */
  async clear(): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}
