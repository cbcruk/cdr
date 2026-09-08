import type { LogRecord, Sink } from '../types'

/**
 * pull 모델 sink. 아무것도 전송하지 않고 사용자 기기에만 쌓는다.
 * 병원 내부망처럼 outbound가 막힌 환경에서도 동작하는 게 핵심.
 *
 * - autoIncrement key로 시간순 보존 (cursor 오름차순 = 오래된 순)
 * - count > maxRecords면 초과분만큼 가장 오래된 것 삭제 (rotation)
 * - 매 레코드가 아니라 배치로 한 트랜잭션 → 오버헤드 최소화
 *
 * 의존성 없는 순수 IndexedDB. idb 같은 래퍼를 써도 무방.
 */
export interface IdbSinkOptions {
  dbName?: string
  storeName?: string
  /** 유지할 최대 레코드 수. 넘으면 오래된 것부터 삭제. 기본 5000. */
  maxRecords?: number
}

export class IdbSink implements Sink {
  readonly name = 'indexeddb'
  private dbName: string
  private storeName: string
  private maxRecords: number
  private dbPromise: Promise<IDBDatabase> | null = null

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

  /** /log 라우트에서 읽기용. 최신순으로 limit개. */
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

  /** 사용자가 /log에서 직접 비우기. */
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
