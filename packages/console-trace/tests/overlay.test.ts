// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vite-plus/test'
import { configure, resetTrace, trace } from '../src/index.ts'
import { mountOverlay } from '../src/trace-overlay/trace-overlay.ts'
import { log } from '../src/trace-log/trace-log.ts'

afterEach(() => {
  document.body.replaceChildren()
})

test('overlay renders the span tree with names and logs', () => {
  resetTrace()
  configure({ enabled: true, projectRoot: null })

  trace('checkout', () => {
    log('info', 'cart validated')
    trace('payment', () => {
      log('warn', 'retrying')
    })
  })

  const handle = mountOverlay()
  const text = document.body.textContent ?? ''

  expect(text).toContain('checkout')
  expect(text).toContain('payment')
  expect(text).toContain('cart validated')
  expect(text).toContain('retrying')

  handle.unmount()
  expect(document.body.textContent).toBe('')
})

test('overlay emits vscode links when a project root is set', () => {
  resetTrace()
  configure({ enabled: true, projectRoot: '/Users/x/proj' })

  trace('with-root', () => {
    log('info', 'linked')
  })

  const handle = mountOverlay()
  const link = document.querySelector('a')

  expect(link?.getAttribute('href')).toContain('vscode://file/Users/x/proj')

  handle.unmount()
})

test('overlay renders plain source labels without a project root', () => {
  resetTrace()
  configure({ enabled: true, projectRoot: null })

  trace('no-root', () => {
    log('info', 'plain')
  })

  const handle = mountOverlay()

  expect(document.querySelector('a')).toBeNull()
  expect(document.body.textContent).toContain('no-root')

  handle.unmount()
})
