import { AsyncContext } from '../async-context/async-context.ts'

type GeneratorFactory = () => Generator<unknown, unknown, unknown>

/**
 * Drives a downleveled `async` function, re-installing the ambient context on
 * every resume.
 *
 * The trace transform rewrites `async`/`await` into a generator that `yield`s
 * awaited values and hands it to this helper. An `AsyncContext.Snapshot` is
 * captured when the function starts and replayed before each `next`/`throw`,
 * so `trace()`/`log()` calls after an `await` still see the span that was
 * active when the function began — the accuracy a plain `await` loses in
 * `fallback` mode.
 *
 * @param thisArg - `this` binding for the generator body.
 * @param args - The original function's `arguments`, forwarded to the body.
 * @param promiseCtor - Promise constructor for the result; defaults to `Promise`.
 * @param factory - Generator function emitted by the transform.
 * @returns A promise settling with the generator's return value, or rejecting
 * with the first error it throws.
 */
export function runAsync<T>(
  thisArg: unknown,
  args: ArrayLike<unknown>,
  promiseCtor: PromiseConstructorLike | undefined,
  factory: GeneratorFactory,
): Promise<T> {
  const P: PromiseConstructorLike = promiseCtor ?? Promise

  return new P<T>((resolve, reject) => {
    const snapshot = new AsyncContext.Snapshot()
    const generator = factory.apply(thisArg, args as never)

    const resume = (input: () => IteratorResult<unknown>): void => {
      try {
        snapshot.run(() => step(input()))
      } catch (error) {
        reject(error)
      }
    }

    const fulfilled = (value: unknown): void => resume(() => generator.next(value))

    const rejected = (value: unknown): void => resume(() => generator.throw(value))

    function step(result: IteratorResult<unknown>): void {
      if (result.done) {
        resolve(result.value as T)
        return
      }

      Promise.resolve(result.value).then(fulfilled, rejected)
    }

    resume(() => generator.next())
  }) as Promise<T>
}
