import { expect, test } from 'vite-plus/test'
import { AsyncContext, getRoot, log, resetTrace, runAsync, trace } from '../src/index.ts'

test('trace nests spans synchronously under the active span', () => {
  resetTrace()

  trace('outer', () => {
    trace('inner', () => {
      log('info', 'hello')
    })
  })

  const root = getRoot()
  const outer = root.children[0]

  expect(outer?.name).toBe('outer')
  expect(outer?.children[0]?.name).toBe('inner')
  expect(outer?.children[0]?.logs[0]?.args).toEqual(['hello'])
  expect(outer?.status).toBe('ok')
})

test('trace marks a span as error when fn throws', () => {
  resetTrace()

  expect(() =>
    trace('boom', () => {
      throw new Error('nope')
    }),
  ).toThrow('nope')

  expect(getRoot().children[0]?.status).toBe('error')
})

test('async trace attributes ambient logs through context propagation', async () => {
  resetTrace()

  await trace('async', async () => {
    await Promise.resolve()
    log('info', 'after await')
  })

  const span = getRoot().children[0]

  expect(span?.status).toBe('ok')
  expect(span?.name).toBe('async')
})

test('AsyncContext.Variable scopes values to run()', () => {
  const v = new AsyncContext.Variable<number>({ defaultValue: 0 })

  expect(v.get()).toBe(0)

  const seen = v.run(42, () => v.get())

  expect(seen).toBe(42)
  expect(v.get()).toBe(0)
})

test('runAsync restores the snapshot across awaits', async () => {
  const v = new AsyncContext.Variable<string>({ defaultValue: 'none' })

  const result = await v.run('scoped', () =>
    runAsync<string>(undefined, [], undefined, function* () {
      yield Promise.resolve()
      return v.get() ?? 'none'
    }),
  )

  expect(result).toBe('scoped')
})
