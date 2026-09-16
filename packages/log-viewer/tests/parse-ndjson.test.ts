import { toNdjson } from 'cdr'
import { describe, expect, it } from 'vite-plus/test'
import { parseNdjson } from '../src/parse-ndjson/parse-ndjson.ts'
import { record } from './fixtures/records.ts'

describe('parseNdjson', () => {
  it('reads back what toNdjson wrote', () => {
    const records = [
      record({
        id: 1,
        ts: 1,
        level: 'warn',
        type: 'validation_blocked',
        data: { fields: ['email'] },
      }),
      record({ id: 2, ts: 2, message: 'done', ctx: { trace_id: 't1', span_id: 's1' } }),
    ]

    expect(parseNdjson(toNdjson(records))).toEqual({ records, issues: [] })
  })

  it('keeps the readable lines and reports the rest by line number', () => {
    const good = JSON.stringify(record({ ts: 5 }))
    const text = [
      good,
      '{"ts":',
      '',
      '[1]',
      JSON.stringify({ ...record({}), level: 'fatal' }),
      good,
    ].join('\n')

    const { records, issues } = parseNdjson(text)

    expect(records).toHaveLength(2)
    expect(issues).toEqual([
      { line: 2, reason: 'invalid JSON' },
      { line: 4, reason: 'not a JSON object' },
      { line: 5, reason: 'unknown "level"' },
    ])
  })

  it('rejects records without a session, since the span tree cannot place them', () => {
    const line = JSON.stringify({ ts: 1, level: 'info', type: 'log', ctx: {} })

    expect(parseNdjson(line).issues).toEqual([{ line: 1, reason: 'missing "ctx.sessionId"' }])
  })

  it('fills optional fields the way the logger would', () => {
    const line = JSON.stringify({ ts: 1, level: 'info', type: 'log', ctx: { sessionId: 'a' } })

    expect(parseNdjson(line).records[0]).toEqual({
      ts: 1,
      level: 'info',
      type: 'log',
      message: '',
      data: {},
      source: 'app',
      ctx: { sessionId: 'a' },
    })
  })

  it('accepts CRLF line endings', () => {
    const line = JSON.stringify(record({}))

    expect(parseNdjson(`${line}\r\n${line}\r\n`).records).toHaveLength(2)
  })
})
