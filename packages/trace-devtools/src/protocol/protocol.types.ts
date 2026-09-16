import type { AsyncContextMode, LogLevel, SpanIdFields, SpanStatus } from '@cbcruk/console-trace'

/** Where a span or log was recorded, reduced to what the panel displays. */
export interface SourceSnapshot {
  /** `file:line:column`. */
  label: string
  /** `vscode://file/...` link, or `null` without a configured project root. */
  href: string | null
}

/** A log entry flattened for the structured-clone boundary. */
export interface LogSnapshot {
  id: number
  level: LogLevel
  /** The arguments stringified and joined by a space. */
  message: string
  /** Epoch milliseconds. */
  time: number
  source: SourceSnapshot | null
}

/**
 * One span, detached from the live tree.
 *
 * A live `Span` links back to its parent and holds its log arguments as
 * passed, so it cannot cross a `MessagePort`. This is the clonable copy.
 */
export interface SpanSnapshot {
  id: number
  /**
   * The correlation ids `spanContext()` stamps onto records written inside
   * this span, so a record kept elsewhere can be matched back to it.
   */
  ids: SpanIdFields
  name: string
  status: SpanStatus
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, or `null` while running. */
  end: number | null
  source: SourceSnapshot | null
  logs: LogSnapshot[]
  children: SpanSnapshot[]
}

/** The whole view the page script owns and every panel mirrors. */
export interface TraceState {
  /** How far attribution across `await` can be trusted. */
  mode: AsyncContextMode
  /** Top-level spans, in start order. */
  spans: SpanSnapshot[]
}

/** The contract between the page script and its panels. */
export interface TraceChannelProtocol {
  functions: {
    pageScript: {
      /** Drop every recorded span, then publish the empty tree. */
      reset: () => void
    }
  }
  sharedStates: {
    state: TraceState
  }
}
