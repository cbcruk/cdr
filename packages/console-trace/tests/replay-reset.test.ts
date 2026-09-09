import { expect, test } from 'vite-plus/test'
import { getRoot, resetTrace, setupTrace, trace } from '../src/index.ts'

interface ConsoleCapture {
  labels: string[]
  restore: () => void
}

function captureGroups(): ConsoleCapture {
  const labels: string[] = []
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  console.group = (...args: unknown[]): void => {
    labels.push(String(args[0]))
  }
  console.groupEnd = (): void => {}

  return {
    labels,
    restore: (): void => {
      console.group = originalGroup
      console.groupEnd = originalGroupEnd
    },
  }
}

test('console replay survives resetTrace', () => {
  resetTrace()

  const cleanup = setupTrace({ overlay: false, projectRoot: null })
  const captured = captureGroups()

  try {
    trace('before-reset', () => {})
    resetTrace()
    trace('after-reset', () => {})
  } finally {
    captured.restore()
    cleanup()
  }

  expect(captured.labels).toContain('before-reset')
  expect(captured.labels).toContain('after-reset')
})

test('a nested span is replayed inside its parent, not on its own', () => {
  resetTrace()

  const cleanup = setupTrace({ overlay: false, projectRoot: null })
  const captured = captureGroups()

  try {
    trace('outer', () => {
      trace('inner', () => {})
    })
  } finally {
    captured.restore()
    cleanup()
  }

  expect(captured.labels).toEqual(['outer', 'inner'])
  expect(getRoot().children.map((span) => span.name)).toEqual(['outer'])
})

test('cleanup stops the replay listener', () => {
  resetTrace()

  const cleanup = setupTrace({ overlay: false, projectRoot: null })

  cleanup()

  const captured = captureGroups()

  try {
    trace('after-cleanup', () => {})
  } finally {
    captured.restore()
  }

  expect(captured.labels).toEqual([])
})
