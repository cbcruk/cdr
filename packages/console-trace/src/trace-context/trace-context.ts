import { asyncContextMode } from '../async-context/async-context.ts'
import { getActiveSpan } from '../trace-log/trace-log.ts'
import { getSpanIds } from '../trace-transport/trace-transport.ts'
import type { SpanContext } from './trace-context.types.ts'

export type { SpanContext } from './trace-context.types.ts'

/**
 * Returns the ambient span's correlation ids, ready to stamp onto a record
 * kept by something else.
 *
 * This is the whole point of an ambient span expressed as data: a recorder
 * deep in a call stack can label what it stores with the operation it happened
 * under, without that operation being passed down to it. Feed it to whatever
 * per-record hook the recorder offers.
 *
 * Outside any `trace()` there is no operation to name, so the result is empty
 * and spreads to nothing. That also covers tracing being disabled.
 *
 * `trace_mode` travels with the ids because it says how far they can be
 * trusted. Under `native` the ids follow the real execution flow. Under
 * `fallback` they are exact for synchronous work and, with the trace transform
 * enabled, across `await` — but a record written from a timer, a promise
 * reaction, or a later event dispatch carries no ids at all, having landed on
 * the root. Absent ids mean unattributed, never unrelated.
 *
 * The ids are counters scoped to one document, so pair them with a session
 * identifier before comparing records from more than one run.
 *
 * @example Correlating a diagnostic recorder's own records
 * ```ts
 * const logger = new Recorder({ enrich: spanContext })
 *
 * await trace('checkout', async () => {
 *   logger.warn('validation blocked') // carries trace_id / span_id
 * })
 * ```
 */
export function spanContext(): Partial<SpanContext> {
  const span = getActiveSpan()

  if (span.parent === null) {
    return {}
  }

  return { ...getSpanIds(span), trace_mode: asyncContextMode }
}
