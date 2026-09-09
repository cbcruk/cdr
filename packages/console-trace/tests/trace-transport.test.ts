import { expect, test } from 'vite-plus/test'
import {
  configure,
  getRoot,
  installTransport,
  log,
  resetTrace,
  trace,
  type WideEvent,
} from '../src/index.ts'

function collect(): { events: WideEvent[]; stop: () => void } {
  const events: WideEvent[] = []
  const stop = installTransport((event) => events.push(event))

  return { events, stop }
}

test('emits one wide event per span on completion', () => {
  resetTrace()
  configure({ enabled: true, retain: true, projectRoot: null })

  const { events, stop } = collect()

  trace('outer', () => {
    trace('inner', () => {})
  })

  stop()

  expect(events.map((event) => event.name)).toEqual(['inner', 'outer'])
})

test('links children to parents and shares a trace id', () => {
  resetTrace()
  configure({ enabled: true, retain: true, projectRoot: null })

  const { events, stop } = collect()

  trace('outer', () => {
    trace('inner', () => {})
  })

  stop()

  const inner = events.find((event) => event.name === 'inner')
  const outer = events.find((event) => event.name === 'outer')

  expect(outer?.parent_id).toBeNull()
  expect(inner?.parent_id).toBe(outer?.span_id)
  expect(inner?.trace_id).toBe(outer?.trace_id)
  expect(outer?.status).toBe('ok')
  expect(outer?.duration).toBeGreaterThanOrEqual(0)
})

test('separate top-level traces get distinct trace ids', () => {
  resetTrace()
  configure({ enabled: true, retain: true, projectRoot: null })

  const { events, stop } = collect()

  trace('a', () => {})
  trace('b', () => {})

  stop()

  const a = events.find((event) => event.name === 'a')
  const b = events.find((event) => event.name === 'b')

  expect(a?.trace_id).not.toBe(b?.trace_id)
})

test('folds logs into the wide event', () => {
  resetTrace()
  configure({ enabled: true, retain: true, projectRoot: null })

  const { events, stop } = collect()

  trace('with-logs', () => {
    log('warn', 'deep', 42)
  })

  stop()

  const event = events.find((item) => item.name === 'with-logs')

  expect(event?.logs).toHaveLength(1)
  expect(event?.logs[0]?.level).toBe('warn')
  expect(event?.logs[0]?.message).toBe('deep 42')
  expect(event?.logs[0]?.source).toContain('trace-transport.test')
})

test('retain:false streams events without growing the tree', () => {
  resetTrace()
  configure({ enabled: true, retain: false, projectRoot: null })

  const { events, stop } = collect()

  trace('prod', () => {
    log('info', 'x')
  })

  stop()
  configure({ retain: true })

  expect(getRoot().children.length).toBe(0)
  expect(events.map((event) => event.name)).toContain('prod')
  expect(events[0]?.logs[0]?.message).toBe('x')
})
