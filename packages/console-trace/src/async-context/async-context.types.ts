/** Any function a context can be run around; arguments are forwarded as-is. */
export type Callable<R> = (...args: unknown[]) => R

/** Options for a {@link Variable}. */
export interface VariableInit<T> {
  /** Label for debugging. Does not identify the variable — each instance is distinct. */
  name?: string
  /** Returned by `get()` outside any `run()`. */
  defaultValue?: T
}

/**
 * A value scoped to an execution flow rather than to a lexical scope.
 *
 * Mirrors the TC39 `AsyncContext.Variable` proposal, so the native class can
 * be swapped in unchanged where a runtime provides it.
 */
export interface Variable<T> {
  readonly name: string
  /** The value for the current flow, or the default outside any `run()`. */
  get(): T | undefined
  /**
   * Runs `fn` with `value` visible to `get()`, restoring the previous value
   * afterwards — including when `fn` throws.
   *
   * The restore is bound to `fn` *returning*, which for an `async` callback
   * happens at its first `await`. Under the fallback implementation that means
   * work resumed after an `await` no longer sees `value`; a native
   * implementation carries it across.
   */
  run<R>(value: T, fn: Callable<R>, ...args: unknown[]): R
}

/**
 * A frozen copy of every variable at the moment it was constructed, replayable
 * later to restore that flow's values — how `runAsync` survives a resume.
 */
export interface Snapshot {
  /** Runs `fn` with the captured values installed, then restores. */
  run<R>(fn: Callable<R>, ...args: unknown[]): R
}

/** Constructor half of {@link Variable}, so implementations stay swappable. */
export interface VariableConstructor {
  new <T>(init?: VariableInit<T>): Variable<T>
}

/** Constructor half of {@link Snapshot}, so implementations stay swappable. */
export interface SnapshotConstructor {
  new (): Snapshot
}

/** The surface this library needs from an `AsyncContext` implementation. */
export interface AsyncContextLike {
  Variable: VariableConstructor
  Snapshot: SnapshotConstructor
}

/**
 * Which implementation is active.
 *
 * `native` propagates across `await` on its own; `fallback` needs the trace
 * transform to stay accurate past one.
 */
export type AsyncContextMode = 'native' | 'fallback'
