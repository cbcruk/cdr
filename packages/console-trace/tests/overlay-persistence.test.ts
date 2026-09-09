// @vitest-environment happy-dom
import { beforeEach, expect, test } from 'vite-plus/test'
import { configure, log, resetTrace, trace } from '../src/index.ts'
import { mountOverlay } from '../src/trace-overlay/trace-overlay.ts'
import { defaultState, loadState, saveState } from '../src/trace-overlay/trace-overlay.storage.ts'

beforeEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
  resetTrace()
  configure({ enabled: true, retain: true, projectRoot: null })
})

function findByText(text: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('span')).find(
    (element) => element.textContent === text,
  )
}

test('loadState returns defaults when storage is empty', () => {
  expect(loadState()).toEqual(defaultState())
})

test('state round-trips through storage', () => {
  const state = defaultState()

  state.collapsed['root/x#0'] = true
  state.levels.debug = false
  saveState(state)

  expect(loadState()).toEqual(state)
})

test('loadState merges older partial data with current defaults', () => {
  localStorage.setItem('console-trace:overlay', JSON.stringify({ collapsed: { a: true } }))

  const loaded = loadState()

  expect(loaded.collapsed).toEqual({ a: true })
  expect(loaded.levels).toEqual(defaultState().levels)
})

test('collapsing a span hides its subtree and persists', () => {
  trace('outer', () => {
    trace('inner', () => {})
    log('info', 'msg')
  })

  const first = mountOverlay()

  expect(document.body.textContent).toContain('inner')

  findByText('▼')?.click()

  expect(document.body.textContent).not.toContain('inner')
  expect(document.body.textContent).not.toContain('msg')
  expect(localStorage.getItem('console-trace:overlay')).toContain('root/outer#0')

  first.unmount()

  const second = mountOverlay()

  expect(document.body.textContent).not.toContain('inner')

  second.unmount()
})

test('toggling a level filter hides logs of that level and persists', () => {
  trace('s', () => {
    log('debug', 'dbg')
    log('error', 'err')
  })

  const handle = mountOverlay()

  expect(document.body.textContent).toContain('dbg')

  findByText('debug')?.click()

  expect(document.body.textContent).not.toContain('dbg')
  expect(document.body.textContent).toContain('err')
  expect(loadState().levels.debug).toBe(false)

  handle.unmount()
})
