import { describe, expect, it } from 'vite-plus/test'
import { filterLogs, toNdjson, toPlainText } from '../src/export'
import type { LogRecord } from '../src/types'

function rec(partial: Partial<LogRecord>): LogRecord {
  return {
    type: 'log',
    ts: 1_700_000_000_000,
    level: 'info',
    message: '',
    data: {},
    source: 'test',
    ctx: { url: 'http://test', sessionId: 's1' },
    ...partial,
  }
}

const records: LogRecord[] = [
  rec({ level: 'info', type: 'log', message: 'hello world', ts: 100 }),
  rec({ level: 'warn', type: 'validation_blocked', message: 'blocked', ts: 200 }),
  rec({ level: 'error', type: 'schema_mismatch', message: 'bad shape', ts: 300 }),
]

describe('filterLogs', () => {
  it('filters by level', () => {
    const out = filterLogs(records, { levels: ['warn', 'error'] })
    expect(out).toHaveLength(2)
  })

  it('filters by type', () => {
    const out = filterLogs(records, { types: ['schema_mismatch'] })
    expect(out).toHaveLength(1)
    expect(out[0]?.message).toBe('bad shape')
  })

  it('filters by time range', () => {
    const out = filterLogs(records, { since: 150, until: 250 })
    expect(out).toHaveLength(1)
    expect(out[0]?.message).toBe('blocked')
  })

  it('filters by text (case-insensitive)', () => {
    const out = filterLogs(records, { text: 'HELLO' })
    expect(out).toHaveLength(1)
  })

  it('returns all records with an empty filter', () => {
    expect(filterLogs(records)).toHaveLength(3)
  })
})

describe('serializers', () => {
  it('toNdjson emits one JSON object per line', () => {
    const lines = toNdjson(records).split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]!).message).toBe('hello world')
  })

  it('toPlainText includes level and type', () => {
    const text = toPlainText([records[1]!])
    expect(text).toContain('[warn]')
    expect(text).toContain('(validation_blocked)')
    expect(text).toContain('blocked')
  })
})
