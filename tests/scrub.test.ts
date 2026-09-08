import { describe, expect, it } from 'vite-plus/test'
import { makeScrubber } from '../src/scrub'

describe('makeScrubber', () => {
  it('masks sensitive keys by value', () => {
    const scrub = makeScrubber()
    const out = scrub({ token: 'abc123', password: 'hunter2', ok: true })
    expect(out.token).toBe('‹masked›')
    expect(out.password).toBe('‹masked›')
  })

  it('redacts non-sensitive values to their shape by default', () => {
    const scrub = makeScrubber()
    const out = scrub({ name: 'Alice', count: 42, flag: false })
    expect(out.name).toBe('‹string:5›')
    expect(out.count).toBe('‹number›')
    expect(out.flag).toBe(false)
  })

  it('keeps raw values when redactValues is false', () => {
    const scrub = makeScrubber({ redactValues: false })
    const out = scrub({ name: 'Alice', count: 42 })
    expect(out.name).toBe('Alice')
    expect(out.count).toBe(42)
  })

  it('still masks sensitive keys even with redactValues off', () => {
    const scrub = makeScrubber({ redactValues: false })
    const out = scrub({ accessToken: 'secret', note: 'hi' })
    expect(out.accessToken).toBe('‹masked›')
    expect(out.note).toBe('hi')
  })

  it('handles circular references without throwing', () => {
    const scrub = makeScrubber()
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    const out = scrub(obj)
    expect(out.self).toBe('‹circular›')
  })

  it('enforces a max depth', () => {
    const scrub = makeScrubber({ maxDepth: 1 })
    const out = scrub({ a: { b: { c: 1 } } }) as Record<string, unknown>
    expect(JSON.stringify(out)).toContain('‹depth-limit›')
  })

  it('preserves Error structure but redacts the message', () => {
    const scrub = makeScrubber()
    const out = scrub({ err: new Error('boom') }) as {
      err: { name: string; message: string; stack?: string }
    }
    expect(out.err.name).toBe('Error')
    expect(out.err.message).toBe('‹redacted›')
  })

  it('recurses into nested objects masking deep sensitive keys', () => {
    const scrub = makeScrubber()
    const out = scrub({ user: { email: 'a@b.com', id: 7 } }) as {
      user: Record<string, unknown>
    }
    expect(out.user.email).toBe('‹masked›')
    expect(out.user.id).toBe('‹number›')
  })
})
