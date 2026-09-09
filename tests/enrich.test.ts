import { afterEach, describe, expect, it } from 'vite-plus/test'
import { DiagLogger } from '../src/logger'
import type { LogRecord, Sink } from '../src/types'

class MemorySink implements Sink {
  readonly name = 'memory'
  records: LogRecord[] = []
  write(records: LogRecord[]): void {
    this.records.push(...records)
  }
}

let logger: DiagLogger | null = null

afterEach(() => {
  logger?.dispose()
  logger = null
})

describe('DiagLogger enrich', () => {
  it('merges the returned fields into every record ctx', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({
      sinks: [sink],
      enrich: () => ({ trace_id: 't1', span_id: 's2' }),
    })

    logger.validationBlocked(['email'])
    await logger.flush()

    expect(sink.records[0]?.ctx.trace_id).toBe('t1')
    expect(sink.records[0]?.ctx.span_id).toBe('s2')
  })

  it('is evaluated per record, not once at construction', async () => {
    const sink = new MemorySink()
    let step = 0
    logger = new DiagLogger({
      sinks: [sink],
      enrich: () => {
        step += 1
        return { span_id: `s${step}` }
      },
    })

    logger.log({ type: 'log' })
    logger.log({ type: 'log' })
    await logger.flush()

    expect(sink.records.map((record) => record.ctx.span_id)).toEqual(['s1', 's2'])
  })

  it('keeps correlation ids verbatim, unlike scrubbed data', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({
      sinks: [sink],
      enrich: () => ({ trace_id: 't1' }),
    })

    logger.log({ type: 'log', data: { trace_id: 't1' } })
    await logger.flush()

    const record = sink.records[0]

    // ctx is metadata and survives; data is masked, which is why the ids
    // belong in ctx and not in data.
    expect(record?.ctx.trace_id).toBe('t1')
    expect(record?.data.trace_id).not.toBe('t1')
  })

  it('swallows an enrich failure and still records', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({
      sinks: [sink],
      enrich: () => {
        throw new Error('boom')
      },
    })

    logger.swallowed('checkout.submit')
    await logger.flush()

    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.ctx.sessionId).toBeTruthy()
  })

  it('leaves ctx untouched when no hook is given', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({ sinks: [sink] })

    logger.log({ type: 'log' })
    await logger.flush()

    expect(Object.keys(sink.records[0]?.ctx ?? {}).sort()).toEqual(['sessionId', 'url'])
  })
})

describe('DiagLogger flushOn', () => {
  it('writes an error immediately instead of buffering it', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({ sinks: [sink] })

    logger.log({ type: 'log', level: 'error', message: 'boom' })
    await Promise.resolve()

    expect(sink.records.map((record) => record.message)).toEqual(['boom'])
  })

  it('still buffers anything below the threshold', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({ sinks: [sink] })

    logger.log({ type: 'log', level: 'warn', message: 'later' })
    await Promise.resolve()

    expect(sink.records).toHaveLength(0)

    await logger.flush()
    expect(sink.records).toHaveLength(1)
  })

  it('buffers everything when the threshold is disabled', async () => {
    const sink = new MemorySink()
    logger = new DiagLogger({ sinks: [sink], flushOn: null })

    logger.log({ type: 'log', level: 'error', message: 'boom' })
    await Promise.resolve()

    expect(sink.records).toHaveLength(0)
  })
})
