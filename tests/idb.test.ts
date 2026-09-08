import { describe, expect, it } from 'vite-plus/test'
import { IdbSink } from '../src/sinks/idb'
import type { LogRecord } from '../src/types'

function makeRecord(message: string, ts: number): LogRecord {
  return {
    type: 'log',
    ts,
    level: 'info',
    message,
    data: {},
    source: 'test',
    ctx: { url: 'http://test', sessionId: 's1' },
  }
}

let dbCounter = 0
function freshSink(opts: { maxRecords?: number } = {}): IdbSink {
  dbCounter += 1
  return new IdbSink({ dbName: `cdr-test-${dbCounter}`, ...opts })
}

describe('IdbSink', () => {
  it('writes records and reads them back newest-first', async () => {
    const sink = freshSink()
    await sink.write([
      makeRecord('first', 1000),
      makeRecord('second', 2000),
      makeRecord('third', 3000),
    ])

    const out = await sink.read()
    expect(out.map((r) => r.message)).toEqual(['third', 'second', 'first'])
  })

  it('respects the read limit', async () => {
    const sink = freshSink()
    await sink.write([makeRecord('a', 1), makeRecord('b', 2), makeRecord('c', 3)])

    const out = await sink.read(2)
    expect(out).toHaveLength(2)
    expect(out[0]?.message).toBe('c')
  })

  it('rotates out oldest records beyond maxRecords', async () => {
    const sink = freshSink({ maxRecords: 3 })
    await sink.write([
      makeRecord('r1', 1),
      makeRecord('r2', 2),
      makeRecord('r3', 3),
      makeRecord('r4', 4),
      makeRecord('r5', 5),
    ])

    const out = await sink.read()
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.message)).toEqual(['r5', 'r4', 'r3'])
  })

  it('clears all records', async () => {
    const sink = freshSink()
    await sink.write([makeRecord('a', 1)])
    await sink.clear()

    const out = await sink.read()
    expect(out).toHaveLength(0)
  })

  it('ignores empty writes', async () => {
    const sink = freshSink()
    await expect(sink.write([])).resolves.toBeUndefined()
  })
})
