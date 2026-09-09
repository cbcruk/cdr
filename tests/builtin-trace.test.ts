import { resetTrace } from '@cbcruk/console-trace'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { setupDiagLogger, trace } from '../src'
import type { IdbSink, DiagLogger, LogRecord } from '../src'

let diag: DiagLogger
let idbSink: IdbSink

beforeEach(() => {
  resetTrace()
})

afterEach(async () => {
  await idbSink?.clear()
  diag?.dispose()
})

async function recordsFrom(): Promise<LogRecord[]> {
  await diag.flush()
  return idbSink.read(50)
}

describe('setupDiagLogger({ trace: true })', () => {
  it('labels records with the operation that produced them', async () => {
    ;({ diag, idbSink } = setupDiagLogger({ trace: true }))

    trace('form.submit', () => {
      diag.validationBlocked(['email'])
      diag.swallowed('parseResponse', new Error('bad json'))
    })

    const records = await recordsFrom()

    expect(records).toHaveLength(2)
    expect(records[0]?.ctx.trace_id).toBeTruthy()
    expect(records[0]?.ctx.trace_id).toBe(records[1]?.ctx.trace_id)
  })

  it('links a nested step to the operation containing it', async () => {
    ;({ diag, idbSink } = setupDiagLogger({ trace: true }))

    trace('form.submit', () => {
      diag.log({ type: 'log', message: 'validated' })
      trace('payment.charge', () => diag.swallowed('gateway', new Error('declined')))
    })

    const records = await recordsFrom()
    const outer = records.find((r) => r.message === 'validated')?.ctx
    const inner = records.find((r) => r.type === 'swallowed_exception')?.ctx

    expect(inner?.trace_id).toBe(outer?.trace_id)
    expect(inner?.parent_id).toBe(outer?.span_id)
  })

  it('stays off by default', async () => {
    ;({ diag, idbSink } = setupDiagLogger())

    trace('form.submit', () => diag.log({ type: 'log', message: 'x' }))

    const records = await recordsFrom()

    expect(records[0]?.ctx.trace_id).toBeUndefined()
    expect(records[0]?.ctx.sessionId).toBeTruthy()
  })

  it('composes with a caller-supplied enrich, which wins on a clash', async () => {
    ;({ diag, idbSink } = setupDiagLogger({
      trace: true,
      enrich: () => ({ route: '/orders', trace_mode: 'overridden' }),
    }))

    trace('form.submit', () => diag.log({ type: 'log', message: 'x' }))

    const ctx = (await recordsFrom())[0]?.ctx

    expect(ctx?.route).toBe('/orders')
    expect(ctx?.trace_id).toBeTruthy()
    expect(ctx?.trace_mode).toBe('overridden')
  })

  it('leaves a record written outside any operation unattributed', async () => {
    ;({ diag, idbSink } = setupDiagLogger({ trace: true }))

    diag.log({ type: 'log', message: 'app booted' })

    const ctx = (await recordsFrom())[0]?.ctx

    expect(ctx?.trace_id).toBeUndefined()
    expect(ctx?.sessionId).toBeTruthy()
  })

  it('shares one engine with the tracer package, not a second copy', async () => {
    // The ambient span is module-level state. If cdr bundled its own copy, a
    // span opened through the package would be invisible to cdr's enrichment
    // and every record would come out unattributed.
    const { trace: packageTrace } = await import('@cbcruk/console-trace')

    ;({ diag, idbSink } = setupDiagLogger({ trace: true }))

    packageTrace('opened.elsewhere', () => diag.log({ type: 'log', message: 'x' }))

    expect((await recordsFrom())[0]?.ctx.trace_id).toBeTruthy()
  })
})
