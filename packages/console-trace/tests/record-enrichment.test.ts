// `spanContext` exists so a recorder that keeps its own records can label them
// with the operation they happened under, without that operation being passed
// down to it. These tests stand a minimal recorder in for a real one and pin
// that contract, including where it goes quiet.
import { expect, test } from 'vite-plus/test'
import { asyncContextMode, configure, resetTrace, spanContext, trace } from '../src/index.ts'

interface Entry {
  message: string
  ctx: Record<string, unknown>
}

class Recorder {
  readonly entries: Entry[] = []

  constructor(private readonly enrich: () => Record<string, unknown>) {}

  write(message: string): void {
    this.entries.push({ message, ctx: { session: 'sess-1', ...this.enrich() } })
  }

  ctxOf(index: number): Record<string, unknown> {
    return this.entries[index]?.ctx ?? {}
  }
}

function start(): Recorder {
  resetTrace()
  configure({ enabled: true, projectRoot: null, retain: false, captureSource: false })

  return new Recorder(spanContext)
}

test('records written under one operation share its ids', () => {
  const recorder = start()

  trace('checkout.submit', () => {
    recorder.write('validation blocked')
    recorder.write('gateway declined')
  })

  expect(recorder.ctxOf(0).trace_id).toBeTruthy()
  expect(recorder.ctxOf(0).trace_id).toBe(recorder.ctxOf(1).trace_id)
  expect(recorder.ctxOf(0).span_id).toBe(recorder.ctxOf(1).span_id)
  expect(recorder.ctxOf(0).trace_mode).toBe(asyncContextMode)
})

test('a nested step links back to the operation containing it', () => {
  const recorder = start()

  trace('checkout.submit', () => {
    recorder.write('validated')
    trace('payment.charge', () => {
      recorder.write('declined')
    })
  })

  const outer = recorder.ctxOf(0)
  const inner = recorder.ctxOf(1)

  expect(inner.trace_id).toBe(outer.trace_id)
  expect(inner.parent_id).toBe(outer.span_id)
})

test('two operations do not share a trace', () => {
  const recorder = start()

  trace('checkout.submit', () => recorder.write('one'))
  trace('patient.search', () => recorder.write('two'))

  expect(recorder.ctxOf(0).trace_id).not.toBe(recorder.ctxOf(1).trace_id)
})

test('a record written outside any operation carries no ids', () => {
  const recorder = start()

  recorder.write('app booted')

  expect(recorder.ctxOf(0)).toEqual({ session: 'sess-1' })
})

test('the recorder keeps working while tracing is disabled', () => {
  const recorder = start()

  configure({ enabled: false })
  trace('checkout.submit', () => recorder.write('still recorded'))
  configure({ enabled: true })

  expect(recorder.entries).toHaveLength(1)
  expect(recorder.ctxOf(0)).toEqual({ session: 'sess-1' })
})

test('a record written from a timer is unattributed, not misattributed', async () => {
  const recorder = start()

  await trace(
    'checkout.submit',
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          recorder.write('late')
          resolve()
        }, 0)
      }),
  )

  if (asyncContextMode === 'fallback') {
    // The span leaked to the root, so there is nothing to stamp. A reader sees
    // an unattributed record rather than one filed under the wrong operation.
    expect(recorder.ctxOf(0)).toEqual({ session: 'sess-1' })
  } else {
    expect(recorder.ctxOf(0).trace_id).toBeTruthy()
  }
})
