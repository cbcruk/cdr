/** Severity of a log entry, matching the `console` method used on replay. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Lifecycle state of a span.
 *
 * `running` until the callback returns — or, for an async callback, until its
 * promise settles — then `ok` or `error`. A span left `running` means the work
 * never finished: still pending, or the page went away mid-flight.
 */
export type SpanStatus = 'running' | 'ok' | 'error'

/** Where a `trace()` or `log()` call was made, resolved from the call stack. */
export interface SourceLocation {
  /** Path to the module, without scheme, host, or query. */
  file: string
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  column: number
  /** `file:line:column`, ready to display. */
  label: string
  /**
   * `vscode://file/...` link opening that exact position, or `null` when no
   * project root is configured — add `tracePlugin()` to enable it.
   */
  href: string | null
}

/** A single `log()` call, recorded against the span that was active. */
export interface LogEntry {
  /** Process-wide counter, unique across spans and entries alike. */
  id: number
  level: LogLevel
  /**
   * The arguments as passed, unformatted — objects stay inspectable in the
   * overlay and console replay, and are only stringified for transport.
   */
  args: unknown[]
  /** `performance.now()` at the time of the call. */
  time: number
  source: SourceLocation | null
}

/**
 * One traced unit of work and everything recorded beneath it.
 *
 * Spans form a tree through `parent`/`children`. The synthetic root has
 * `id: 0` and `parent: null`; every other span descends from it.
 */
export interface Span {
  /** Process-wide counter; `0` is reserved for the root. */
  id: number
  /** Label passed to `trace()`. Not unique — siblings may share one. */
  name: string
  /** Enclosing span, or `null` for the root. */
  parent: Span | null
  /**
   * Child spans in start order.
   *
   * Populated synchronously as each child starts, so nesting is exact. Stays
   * empty when `retain` is off, even though children still link back here.
   */
  children: Span[]
  logs: LogEntry[]
  /** `performance.now()` when the span started. */
  startTime: number
  /** `performance.now()` when it settled, or `null` while still running. */
  endTime: number | null
  status: SpanStatus
  source: SourceLocation | null
}

/**
 * Something worth rendering happened.
 *
 * `span:start` fires before the callback runs and `span:end` once it settles,
 * so each span is reported twice and the same object is mutated in between —
 * read `status` and `endTime` rather than assuming a snapshot.
 */
export type TraceEvent =
  | { type: 'span:start'; span: Span }
  | { type: 'span:end'; span: Span }
  | { type: 'log'; span: Span; entry: LogEntry }

/** Receives every {@link TraceEvent} synchronously, in the order it occurred. */
export type TraceListener = (event: TraceEvent) => void

/** Global tracing settings. Set through `configure` or `setupTrace`. */
export interface TraceConfig {
  /** When `false`, `trace()` just calls through and `log()` is dropped. */
  enabled: boolean
  /** Absolute project root backing source links, or `null` to disable them. */
  projectRoot: string | null
  /**
   * Keep completed spans on the tree. Turn off in production so events still
   * reach a transport while memory stays flat.
   */
  retain: boolean
  /**
   * Resolve a `SourceLocation` for every `trace()` and `log()` call.
   *
   * Each capture builds a stack trace, which is the most expensive part of
   * recording a span. Turn it off where the jump-to-source links are not shown
   * anyway, such as production, and every `source` becomes `null`.
   */
  captureSource: boolean
}

/** Level-bound logging methods; each records against the active span. */
export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}
