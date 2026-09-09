import { expect, test } from 'vite-plus/test'
import {
  asyncContextMode,
  configure,
  getActiveSpan,
  getRoot,
  getSpanIds,
  spanContext,
  toWideEvent,
  trace,
  type SpanContext,
} from '../src/index.ts'

function start(): void {
  configure({ enabled: true, projectRoot: null, retain: true, captureSource: true })
}

test('spanContext is empty outside any trace', () => {
  start()

  expect(spanContext()).toEqual({})
  expect(getActiveSpan()).toBe(getRoot())
})

test('spanContext is empty while tracing is disabled', () => {
  configure({ enabled: false })

  const seen = trace('ignored', () => spanContext())

  expect(seen).toEqual({})

  start()
})

test('spanContext names the ambient span and its mode', () => {
  start()

  const seen = trace('checkout', () => spanContext())

  expect(seen.span_id).toBeTruthy()
  expect(seen.trace_id).toBeTruthy()
  expect(seen.parent_id).toBeNull()
  expect(seen.trace_mode).toBe(asyncContextMode)
})

test('a nested span points at its parent and shares the trace', () => {
  start()

  let outer: Partial<SpanContext> = {}
  let inner: Partial<SpanContext> = {}

  trace('outer', () => {
    outer = spanContext()
    trace('inner', () => {
      inner = spanContext()
    })
  })

  expect(inner.trace_id).toBe(outer.trace_id)
  expect(inner.parent_id).toBe(outer.span_id)
  expect(inner.span_id).not.toBe(outer.span_id)
})

test('separate top-level traces do not share a trace id', () => {
  start()

  const first = trace('first', () => spanContext())
  const second = trace('second', () => spanContext())

  expect(first.trace_id).not.toBe(second.trace_id)
})

test('ids read while running match the completed wide event', () => {
  start()

  let stamped: Partial<SpanContext> = {}

  const span = trace('checkout', () => {
    stamped = spanContext()
    return getActiveSpan()
  })

  const event = toWideEvent(span)

  expect(stamped.span_id).toBe(event.span_id)
  expect(stamped.trace_id).toBe(event.trace_id)
  expect(getSpanIds(span)).toEqual({
    trace_id: event.trace_id,
    span_id: event.span_id,
    parent_id: event.parent_id,
  })
})

test('repeated reads of the same span are stable', () => {
  start()

  trace('stable', () => {
    expect(spanContext()).toEqual(spanContext())
  })
})

test('captureSource off leaves every source null', () => {
  configure({ enabled: true, projectRoot: '/tmp/project', retain: true, captureSource: false })

  const span = trace('quiet', () => getActiveSpan())

  expect(span.source).toBeNull()

  start()

  const loud = trace('noisy', () => getActiveSpan())

  expect(loud.source).not.toBeNull()
})
