import { expect, test } from 'vite-plus/test'
import { AsyncContext, runAsync } from '../src/index.ts'
import { transformAsync } from '../src/transform/async-transform.ts'

test('rewrites await to yield inside a runAsync generator', async () => {
  const result = await transformAsync('async function f() { await g(); return 1 }', 'f.js')

  expect(result?.transformed).toBe(true)
  expect(result?.code).toContain('__runAsync(this, arguments, void 0, function* ()')
  expect(result?.code).toContain('yield g()')
  expect(result?.code).not.toContain('async function')
})

test('passes void 0 for arguments on async arrows', async () => {
  const result = await transformAsync('const f = async () => { await g() }', 'f.js')

  expect(result?.code).toContain('__runAsync(this, void 0, void 0, function* ()')
})

test('transforms nested async functions independently', async () => {
  const result = await transformAsync(
    'async function outer() { await a(); async function inner() { await b() } }',
    'f.js',
  )

  const helperCount = result?.code.match(/__runAsync/g)?.length ?? 0

  expect(helperCount).toBe(2)
})

test('reports nothing to transform for sync code', async () => {
  const result = await transformAsync('function f() { return 1 }', 'f.js')

  expect(result?.transformed).toBe(false)
})

test('rejects for await...of with a clear error', async () => {
  await expect(
    transformAsync('async function f(xs) { for await (const x of xs) {} }', 'f.js'),
  ).rejects.toThrow('for await...of is not supported')
})

test('transformed code preserves context across await (fallback safe)', async () => {
  const result = await transformAsync(
    'async function read(v) { await Promise.resolve(); return v.get() }',
    'read.js',
  )

  // eslint-disable-next-line no-implied-eval -- evaluate the transformed output
  const factory = new Function('__runAsync', 'v', `${result?.code}; return read(v)`) as (
    helper: typeof runAsync,
    v: unknown,
  ) => Promise<string>

  const v = new AsyncContext.Variable<string>({ defaultValue: 'root' })
  const seen = await v.run('scoped', () => factory(runAsync, v))

  expect(seen).toBe('scoped')
})
