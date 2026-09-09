import type { AsyncContextMode } from '../async-context/async-context.types.ts'
import type { SpanIdFields } from '../trace-transport/trace-transport.types.ts'

/**
 * The ambient span rendered as flat fields, for stamping onto records kept
 * outside this library.
 *
 * Every field is optional at the call site: outside any `trace()` there is
 * nothing to report and {@link spanContext} returns an empty object.
 */
export interface SpanContext extends SpanIdFields {
  /**
   * Which `AsyncContext` implementation produced the ids, and so how far they
   * can be trusted across an `await`.
   */
  trace_mode: AsyncContextMode
}
