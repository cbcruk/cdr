import { expect, test } from 'vite-plus/test'
import {
  AsyncContext,
  asyncContextMode,
  configure,
  getRoot,
  log,
  resetTrace,
  runAsync,
  trace,
} from '../src/index.ts'

test('runAsync restores context across await, plain await does not (fallback)', async () => {
  const v = new AsyncContext.Variable<string>({ defaultValue: 'root' })

  const plain = await v.run('scoped', async () => {
    await Promise.resolve()
    return v.get()
  })

  const restored = await v.run('scoped', () =>
    runAsync<string | undefined>(undefined, [], undefined, function* () {
      yield Promise.resolve()
      return v.get()
    }),
  )

  expect(restored).toBe('scoped')

  if (asyncContextMode === 'fallback') {
    expect(plain).toBe('root')
  } else {
    expect(plain).toBe('scoped')
  }
})

test('ambient log after plain await leaks to root in fallback mode', async () => {
  resetTrace()
  configure({ enabled: true, projectRoot: null })

  await trace('async-span', async () => {
    log('info', 'before')
    await Promise.resolve()
    log('info', 'after')
  })

  const root = getRoot()
  const span = root.children[0]
  const spanMessages = span?.logs.map((entry) => entry.args[0]) ?? []
  const rootMessages = root.logs.map((entry) => entry.args[0])

  expect(spanMessages).toContain('before')

  if (asyncContextMode === 'fallback') {
    expect(spanMessages).not.toContain('after')
    expect(rootMessages).toContain('after')
  } else {
    expect(spanMessages).toContain('after')
  }
})

test('synchronous nesting is always correct', () => {
  resetTrace()
  configure({ enabled: true, projectRoot: null })

  trace('outer', () => {
    trace('inner', () => {})
  })

  const outer = getRoot().children[0]

  expect(outer?.name).toBe('outer')
  expect(outer?.children[0]?.name).toBe('inner')
})

test('nested trace after await follows the same context rule as logs', async () => {
  resetTrace()
  configure({ enabled: true, projectRoot: null })

  await trace('outer', async () => {
    await Promise.resolve()
    trace('inner', () => {})
  })

  const root = getRoot()
  const outer = root.children[0]

  if (asyncContextMode === 'fallback') {
    expect(outer?.children.length).toBe(0)
    expect(root.children.map((span) => span.name)).toContain('inner')
  } else {
    expect(outer?.children[0]?.name).toBe('inner')
  }
})
