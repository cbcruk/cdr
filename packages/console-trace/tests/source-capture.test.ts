import { expect, test } from 'vite-plus/test'
import {
  captureSource,
  isInternal,
  parseFrame,
  toHref,
  toPathname,
} from '../src/trace-log/trace-log.utils.ts'

test('parseFrame reads a V8 named frame', () => {
  const parsed = parseFrame('    at processPayment (http://localhost:5173/src/payment.ts:12:5)')

  expect(parsed).toEqual({
    url: 'http://localhost:5173/src/payment.ts',
    line: 12,
    column: 5,
  })
})

test('parseFrame reads a V8 anonymous frame', () => {
  const parsed = parseFrame('    at http://localhost:5173/src/bar.ts:3:10')

  expect(parsed?.url).toBe('http://localhost:5173/src/bar.ts')
  expect(parsed?.line).toBe(3)
  expect(parsed?.column).toBe(10)
})

test('parseFrame reads a Firefox frame', () => {
  const parsed = parseFrame('checkout@http://localhost:5173/src/checkout.ts:7:2')

  expect(parsed?.url).toBe('http://localhost:5173/src/checkout.ts')
  expect(parsed?.line).toBe(7)
})

test('parseFrame reads an absolute file path frame', () => {
  const parsed = parseFrame('    at Object.<anonymous> (/Users/x/proj/src/x.ts:1:1)')

  expect(parsed?.url).toBe('/Users/x/proj/src/x.ts')
})

test('parseFrame returns null for a non-location line', () => {
  expect(parseFrame('Error: boom')).toBeNull()
})

test('isInternal flags engine frames', () => {
  expect(isInternal('http://localhost:5173/src/trace-log/trace-log.ts')).toBe(true)
  expect(isInternal('http://localhost:5173/src/async-awaiter/async-awaiter.ts')).toBe(true)
  expect(isInternal('http://localhost:5173/src/payment.ts')).toBe(false)
})

test('toPathname strips origin and query', () => {
  expect(toPathname('http://localhost:5173/src/foo.ts?t=123')).toBe('/src/foo.ts')
  expect(toPathname('/already/a/path.ts')).toBe('/already/a/path.ts')
})

test('toHref builds a vscode link and is null without a root', () => {
  expect(toHref('/src/foo.ts', 12, 5, '/Users/x/proj')).toBe(
    'vscode://file/Users/x/proj/src/foo.ts:12:5',
  )
  expect(toHref('/src/foo.ts', 12, 5, '/Users/x/proj/')).toBe(
    'vscode://file/Users/x/proj/src/foo.ts:12:5',
  )
  expect(toHref('/src/foo.ts', 12, 5, null)).toBeNull()
})

test('captureSource skips internal frames and returns the caller', () => {
  const source = captureSource('/Users/x/proj')

  expect(source).not.toBeNull()
  expect(source?.file).toContain('source-capture.test')
  expect(source?.href).toContain('vscode://file/Users/x/proj')
})

test('captureSource omits href when no project root is set', () => {
  const source = captureSource(null)

  expect(source?.href).toBeNull()
})
