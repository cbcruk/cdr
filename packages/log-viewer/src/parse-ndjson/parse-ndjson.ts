import type { LogLevel, LogRecord } from 'cdr'
import type { ParsedLog, ParseIssue } from './parse-ndjson.types.ts'

export type { ParsedLog, ParseIssue } from './parse-ndjson.types.ts'

const LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toRecord(value: unknown): LogRecord | string {
  if (!isObject(value)) return 'not a JSON object'
  if (typeof value.ts !== 'number') return 'missing numeric "ts"'
  if (!LEVELS.includes(value.level as LogLevel)) return 'unknown "level"'
  if (typeof value.type !== 'string') return 'missing "type"'
  if (!isObject(value.ctx) || typeof value.ctx.sessionId !== 'string') {
    return 'missing "ctx.sessionId"'
  }

  return {
    ...(typeof value.id === 'number' ? { id: value.id } : {}),
    ts: value.ts,
    level: value.level as LogLevel,
    type: value.type as LogRecord['type'],
    message: typeof value.message === 'string' ? value.message : '',
    data: isObject(value.data) ? value.data : {},
    source: typeof value.source === 'string' ? value.source : 'app',
    ctx: value.ctx as LogRecord['ctx'],
  }
}

/**
 * cdr이 내보낸 NDJSON 텍스트를 레코드로 읽는다.
 *
 * 사용자가 보내온 파일은 잘리거나 손으로 편집됐을 수 있다. 그래서 한 줄이
 * 깨졌다고 전체를 버리지 않고, 읽지 못한 줄은 `issues`에 줄 번호와 함께 남긴다.
 * 빈 줄은 문제로 치지 않는다.
 *
 * @param text `toNdjson`이나 `downloadLogs(records, 'ndjson')`로 만든 내용.
 */
export function parseNdjson(text: string): ParsedLog {
  const records: LogRecord[] = []
  const issues: ParseIssue[] = []

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    if (raw.trim() === '') return

    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      issues.push({ line, reason: 'invalid JSON' })
      return
    }

    const result = toRecord(value)
    if (typeof result === 'string') issues.push({ line, reason: result })
    else records.push(result)
  })

  return { records, issues }
}
