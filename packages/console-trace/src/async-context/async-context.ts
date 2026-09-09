import type {
  AsyncContextLike,
  AsyncContextMode,
  Callable,
  Snapshot,
  Variable,
  VariableInit,
} from './async-context.types.ts'

type Mapping = Map<symbol, unknown>

let current: Mapping = new Map()

class FallbackVariable<T> implements Variable<T> {
  readonly name: string
  readonly #key: symbol
  readonly #defaultValue: T | undefined

  constructor(init?: VariableInit<T>) {
    this.name = init?.name ?? ''
    this.#key = Symbol(this.name)
    this.#defaultValue = init?.defaultValue
  }

  get(): T | undefined {
    return current.has(this.#key) ? (current.get(this.#key) as T) : this.#defaultValue
  }

  run<R>(value: T, fn: Callable<R>, ...args: unknown[]): R {
    const previous = current
    const next: Mapping = new Map(previous)

    next.set(this.#key, value)
    current = next

    try {
      return fn(...args)
    } finally {
      current = previous
    }
  }
}

class FallbackSnapshot implements Snapshot {
  readonly #mapping: Mapping

  constructor() {
    this.#mapping = current
  }

  run<R>(fn: Callable<R>, ...args: unknown[]): R {
    const previous = current

    current = this.#mapping

    try {
      return fn(...args)
    } finally {
      current = previous
    }
  }
}

const fallback: AsyncContextLike = {
  Variable: FallbackVariable,
  Snapshot: FallbackSnapshot,
}

function resolveNative(): AsyncContextLike | null {
  const candidate = (globalThis as { AsyncContext?: AsyncContextLike }).AsyncContext

  return candidate?.Variable && candidate.Snapshot ? candidate : null
}

const native = resolveNative()

/**
 * The `AsyncContext` implementation in use: the runtime's native global when
 * it exposes one, otherwise a userland fallback backed by a module-level map.
 *
 * The fallback installs its mapping before calling `Variable.run`'s callback
 * and restores it in a `finally`, so synchronous nesting is exact. A plain
 * `await` returns control before the continuation runs, so the restore happens
 * too early and the value is lost — see `runAsync` for the workaround.
 */
export const AsyncContext: AsyncContextLike = native ?? fallback

/**
 * Which implementation {@link AsyncContext} resolved to.
 *
 * `native` propagates across `await` exactly. `fallback` only does so when
 * async functions are downleveled onto `runAsync` by the trace transform;
 * without it, calls after an `await` see no ambient value.
 */
export const asyncContextMode: AsyncContextMode = native ? 'native' : 'fallback'
