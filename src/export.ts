import type { LogLevel, LogRecord } from './types'

/** {@linkcode filterLogs}의 조건. 지정한 항목만 AND로 적용된다. */
export interface LogFilter {
  /** 이 레벨 중 하나여야 통과. */
  levels?: LogLevel[]
  /** 이 `DiagEventType` 중 하나여야 통과. */
  types?: string[]
  /** 이 시각(epoch ms) 이후만. */
  since?: number
  /** 이 시각(epoch ms) 이전만. */
  until?: number
  /** `message` 부분 일치 (대소문자 무시). */
  text?: string
}

/**
 * 레코드를 조건에 맞게 걸러낸다.
 *
 * `/log` 화면에서 목록을 좁힐 때 쓴다. 조건을 하나도 주지 않으면 원본을
 * 그대로 담은 새 배열이 나온다.
 *
 * @param records 거를 대상.
 * @param f 적용할 조건. 지정한 것만 AND로 걸린다.
 * @returns 조건을 통과한 레코드의 새 배열. 순서는 입력을 따른다.
 *
 * @example 최근 한 시간의 오류만 추리기
 * ```ts
 * import { filterLogs, setupDiagLogger } from 'cdr'
 *
 * const { idbSink } = setupDiagLogger()
 * const errors = filterLogs(await idbSink.read(), {
 *   levels: ['error'],
 *   since: Date.now() - 60 * 60 * 1000,
 * })
 * ```
 */
export function filterLogs(records: LogRecord[], f: LogFilter = {}): LogRecord[] {
  return records.filter((r) => {
    if (f.levels && !f.levels.includes(r.level)) return false
    if (f.types && !f.types.includes(r.type)) return false
    if (f.since && r.ts < f.since) return false
    if (f.until && r.ts > f.until) return false
    if (f.text && !r.message.toLowerCase().includes(f.text.toLowerCase())) return false
    return true
  })
}

/**
 * 레코드를 NDJSON 문자열로 만든다.
 *
 * 한 줄당 한 레코드라 대용량에 강하고 스트림 처리에 유리하다. 기계가 다시
 * 읽을 용도라면 이쪽.
 *
 * @param records 직렬화할 레코드.
 * @returns 줄바꿈으로 이어붙인 JSON. 빈 배열이면 빈 문자열.
 */
export function toNdjson(records: LogRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n')
}

/**
 * 레코드를 사람이 훑기 좋은 평문으로 만든다.
 *
 * `ISO 시각 [레벨] (타입) 메시지 {데이터}` 한 줄씩. 담당자에게 그대로 붙여넣기
 * 좋은 형태다.
 *
 * @param records 직렬화할 레코드.
 * @returns 줄바꿈으로 이어붙인 평문. 빈 배열이면 빈 문자열.
 */
export function toPlainText(records: LogRecord[]): string {
  return records
    .map((r) => {
      const t = new Date(r.ts).toISOString()
      const data = Object.keys(r.data).length ? ` ${JSON.stringify(r.data)}` : ''
      return `${t} [${r.level}] (${r.type}) ${r.message}${data}`
    })
    .join('\n')
}

/**
 * 레코드를 파일로 내려받게 한다.
 *
 * `/log`의 진짜 가치는 "보는 것"보다 "내보내는 것"이다. HAR 추출
 * ("F12 → 우클릭 → Save as HAR")을 대체하는 지점으로, 지원 담당자에게는
 * "`/log` 가서 내보내기 눌러서 보내주세요" 한 줄로 끝난다. 이미 마스킹을 거쳐
 * 저장된 레코드라 내보내도 원본 값은 나가지 않는다.
 *
 * 파일 이름은 `cdr-<ISO 시각>.<확장자>`. 브라우저에서만 동작한다.
 *
 * @param records 내보낼 레코드.
 * @param format `'ndjson'`이면 기계용, `'txt'`면 평문. 기본 `'ndjson'`.
 *
 * @example 경고 이상만 평문으로 내보내기
 * ```ts
 * import { downloadLogs, filterLogs, setupDiagLogger } from 'cdr'
 *
 * const { idbSink } = setupDiagLogger()
 * const records = await idbSink.read()
 *
 * downloadLogs(filterLogs(records, { levels: ['warn', 'error'] }), 'txt')
 * ```
 */
export function downloadLogs(records: LogRecord[], format: 'ndjson' | 'txt' = 'ndjson'): void {
  const content = format === 'ndjson' ? toNdjson(records) : toPlainText(records)
  const blob = new Blob([content], {
    type: format === 'ndjson' ? 'application/x-ndjson' : 'text/plain',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cdr-${new Date().toISOString().slice(0, 19)}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 레코드를 클립보드에 복사한다.
 *
 * 담당자에게 메신저로 붙여넣기 좋게, 기본이 평문이다. 브라우저가 클립보드
 * 권한을 거부하면 reject 된다.
 *
 * @param records 복사할 레코드.
 * @param format `'txt'`면 평문, `'ndjson'`이면 기계용. 기본 `'txt'`.
 * @returns 복사가 끝나면 resolve.
 */
export async function copyLogs(
  records: LogRecord[],
  format: 'ndjson' | 'txt' = 'txt',
): Promise<void> {
  const content = format === 'ndjson' ? toNdjson(records) : toPlainText(records)
  await navigator.clipboard.writeText(content)
}
