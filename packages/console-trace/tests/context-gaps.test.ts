// @vitest-environment happy-dom
//
// Where the ambient span survives, and where it does not.
//
// `runAsync` re-installs a snapshot when a downleveled `async` function
// resumes, so `await` is covered. Nothing re-installs it for a callback the
// runtime invokes on its own — a timer, a promise reaction, an event listener
// — so work started from one attaches to the root instead of the enclosing
// span. These tests pin that boundary rather than wish it away: they assert
// the leak in `fallback` mode and correct nesting under a native
// `AsyncContext`.
import { expect, test } from 'vite-plus/test'
import { asyncContextMode, configure, getRoot, resetTrace, runAsync, trace } from '../src/index.ts'

function start(): void {
  resetTrace()
  configure({ enabled: true, projectRoot: null })
}

function childrenOf(name: string): string[] {
  const span = getRoot().children.find((candidate) => candidate.name === name)

  return span?.children.map((child) => child.name) ?? []
}

function topLevel(): string[] {
  return getRoot().children.map((span) => span.name)
}

test('a span started from a setTimeout callback leaks to the root', async () => {
  start()

  await trace(
    'outer',
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          trace('from-timer', () => {})
          resolve()
        }, 0)
      }),
  )

  if (asyncContextMode === 'fallback') {
    expect(childrenOf('outer')).not.toContain('from-timer')
    expect(topLevel()).toContain('from-timer')
  } else {
    expect(childrenOf('outer')).toContain('from-timer')
  }
})

test('a span started from a promise reaction leaks to the root', async () => {
  start()

  await trace('outer', () =>
    Promise.resolve().then(() => {
      trace('from-then', () => {})
    }),
  )

  if (asyncContextMode === 'fallback') {
    expect(childrenOf('outer')).not.toContain('from-then')
    expect(topLevel()).toContain('from-then')
  } else {
    expect(childrenOf('outer')).toContain('from-then')
  }
})

test('a span started from a later event dispatch leaks to the root', () => {
  start()

  const button = document.createElement('button')

  trace('outer', () => {
    button.addEventListener('click', () => {
      trace('from-event', () => {})
    })
  })

  // Dispatched after `outer` has ended, the way a real user click arrives.
  button.click()

  if (asyncContextMode === 'fallback') {
    expect(childrenOf('outer')).not.toContain('from-event')
    expect(topLevel()).toContain('from-event')
  }

  // Under a native `AsyncContext` this case is deliberately left unasserted:
  // propagation through event listeners is still unsettled in the proposal.
})

test('an event dispatched inside the span nests correctly', () => {
  start()

  const button = document.createElement('button')

  button.addEventListener('click', () => {
    trace('from-sync-dispatch', () => {})
  })

  trace('outer', () => {
    button.click()
  })

  expect(childrenOf('outer')).toContain('from-sync-dispatch')
})

test('runAsync covers await but not a timer it schedules', async () => {
  start()

  await trace('outer', () =>
    runAsync<void>(undefined, [], undefined, function* () {
      yield Promise.resolve()
      trace('after-await', () => {})

      yield new Promise<void>((resolve) => {
        setTimeout(() => {
          trace('from-timer', () => {})
          resolve()
        }, 0)
      })
    }),
  )

  expect(childrenOf('outer')).toContain('after-await')

  if (asyncContextMode === 'fallback') {
    expect(childrenOf('outer')).not.toContain('from-timer')
    expect(topLevel()).toContain('from-timer')
  }
})
