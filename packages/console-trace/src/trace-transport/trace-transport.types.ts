import type { LogLevel, SpanStatus } from '../trace-log/trace-log.types.ts'

/** A log entry folded into its span's wide event. */
export interface WideEventLog {
  level: LogLevel
  /** The entry's arguments stringified and joined by a space. */
  message: string
  /** `file:line:column` of the call site, or `null` if it was not resolved. */
  source: string | null
}

/**
 * The correlation ids identifying one span and its place in a trace.
 *
 * Field names follow the OpenTelemetry span shape, so they map onto common
 * observability backends, and onto other recorders, without translation.
 */
export interface SpanIdFields {
  /** Shared by every span under one top-level `trace()` call. */
  trace_id: string
  /** Unique to this span. */
  span_id: string
  /**
   * Enclosing span's `span_id`, or `null` for a top-level span — the synthetic
   * root is not itself an event, so it never appears as a parent.
   */
  parent_id: string | null
}

/**
 * One completed span, flattened into a single event with its logs folded in.
 */
export interface WideEvent extends SpanIdFields {
  /** Span name, as passed to `trace()`. */
  name: string
  status: SpanStatus
  /** `performance.now()` when the span started. */
  start: number
  /** Elapsed milliseconds; `0` if the span never settled. */
  duration: number
  logs: WideEventLog[]
}

/**
 * Receives one {@link WideEvent} per completed span.
 *
 * Called synchronously as each span ends, so keep it cheap — buffer or sample
 * inside the callback rather than blocking on the network.
 */
export type Transport = (event: WideEvent) => void
