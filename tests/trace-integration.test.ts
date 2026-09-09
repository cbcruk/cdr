// cdr does not depend on any tracer: `enrich` takes a plain function. This
// pins what the pairing actually produces when an app wires console-trace
// into that hook, which is the case the hook was added for.
import { configure as configureTrace, resetTrace, spanContext, trace } from 'console-trace'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
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
let sink: MemorySink

beforeEach(() => {
  resetTrace()
  configureTrace({ enabled: true, projectRoot: null, retain: false, captureSource: false })
  sink = new MemorySink()
  logger = new DiagLogger({ sinks: [sink], enrich: spanContext })
})

afterEach(() => {
  logger?.dispose()
  logger = null
})

function ctxOf(index: number): Record<string, unknown> {
  return sink.records[index]?.ctx ?? {}
}

describe('records carry the operation they were written under', () => {
  it('groups everything written inside one operation', async () => {
    trace('checkout.submit', () => {
      logger?.validationBlocked(['email'])
      logger?.swallowed('parseResponse', new Error('bad json'))
    })
    await logger?.flush()

    expect(sink.records).toHaveLength(2)
    expect(ctxOf(0).trace_id).toBeTruthy()
    expect(ctxOf(0).trace_id).toBe(ctxOf(1).trace_id)
    expect(ctxOf(0).span_id).toBe(ctxOf(1).span_id)
  })

  it('keeps two operations apart', async () => {
    trace('checkout.submit', () => logger?.validationBlocked(['email']))
    trace('patient.search', () => logger?.validationBlocked(['query']))
    await logger?.flush()

    expect(ctxOf(0).trace_id).not.toBe(ctxOf(1).trace_id)
  })

  it('links a nested step back to the operation containing it', async () => {
    trace('checkout.submit', () => {
      logger?.log({ type: 'log', message: 'validated' })
      trace('payment.charge', () => {
        logger?.swallowed('gateway', new Error('declined'))
      })
    })
    await logger?.flush()

    const outer = ctxOf(0)
    const inner = ctxOf(1)

    expect(inner.trace_id).toBe(outer.trace_id)
    expect(inner.parent_id).toBe(outer.span_id)
    expect(inner.span_id).not.toBe(outer.span_id)
  })

  it('leaves a record written outside any operation unattributed', async () => {
    logger?.log({ type: 'log', message: 'app booted' })
    await logger?.flush()

    expect(ctxOf(0).trace_id).toBeUndefined()
    expect(ctxOf(0).sessionId).toBeTruthy()
  })

  it('keeps the ids out of the masked payload', async () => {
    trace('checkout.submit', () => {
      logger?.log({ type: 'log', message: 'x', data: { field: 'email' } })
    })
    await logger?.flush()

    // ctx survives so the ids stay usable; data is masked as always, which is
    // why the ids belong in ctx.
    expect(ctxOf(0).trace_id).toBeTruthy()
    expect(sink.records[0]?.data.field).toBe('‹string:5›')
  })
})
