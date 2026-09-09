import { AsyncContext } from '../async-context/async-context.ts'
import type {
  LogEntry,
  Logger,
  LogLevel,
  SourceLocation,
  Span,
  TraceConfig,
  TraceEvent,
  TraceListener,
} from './trace-log.types.ts'
import { captureSource } from './trace-log.utils.ts'

const config: TraceConfig = {
  enabled: true,
  projectRoot: null,
  retain: true,
  captureSource: true,
}

const listeners = new Set<TraceListener>()

let sequence = 0

function nextId(): number {
  sequence += 1
  return sequence
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function createRoot(): Span {
  return {
    id: 0,
    name: 'root',
    parent: null,
    children: [],
    logs: [],
    startTime: now(),
    endTime: null,
    status: 'running',
    source: null,
  }
}

let rootSpan: Span = createRoot()

const currentSpan = new AsyncContext.Variable<Span>({
  name: 'trace-span',
})

function activeSpan(): Span {
  return currentSpan.get() ?? rootSpan
}

function sourceForCall(): SourceLocation | null {
  return config.captureSource ? captureSource(config.projectRoot) : null
}

function emit(event: TraceEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

/**
 * Merges `partial` into the global trace config, leaving unspecified keys
 * untouched. `setupTrace` calls this; use it directly to flip settings at
 * runtime.
 */
export function configure(partial: Partial<TraceConfig>): void {
  Object.assign(config, partial)
}

/** Returns the live trace config. Mutate it through {@link configure}. */
export function getConfig(): Readonly<TraceConfig> {
  return config
}

/**
 * Registers a listener for span and log events. Listeners are called
 * synchronously as spans start, end, and record logs.
 *
 * @returns A function that removes this listener.
 */
export function subscribe(listener: TraceListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Returns the root span — the implicit parent of every `trace()` call that
 * runs outside another span, and the entry point for walking the tree.
 */
export function getRoot(): Span {
  return rootSpan
}

/**
 * Returns the span `trace()` and `log()` would currently attach to.
 *
 * Outside any `trace()` this is the synthetic root, so a caller wanting to
 * know whether real work is in flight should check `parent !== null`. Reading
 * it does not affect propagation, which makes it the entry point for anything
 * that wants to stamp the ambient span onto its own records.
 */
export function getActiveSpan(): Span {
  return activeSpan()
}

/**
 * Replaces the root with a fresh, empty span, dropping the retained tree.
 *
 * Listeners stay subscribed and spans already in flight still complete, but
 * they end on the detached tree. Anything holding the previous root (a
 * rendered overlay, a test assertion) keeps observing it.
 */
export function resetTrace(): void {
  rootSpan = createRoot()
}

/**
 * Runs `fn` inside a new span attached to the ambient span and returns its
 * result unchanged.
 *
 * The parent/child edge is recorded synchronously, before `fn` runs, so nested
 * `trace()` calls always nest correctly and no span is lost. When `fn` returns
 * a thenable the span stays `running` until it settles, then ends as `ok` or
 * `error`; otherwise it ends as soon as `fn` returns. Errors are re-thrown
 * after the span is marked `error`.
 *
 * Attribution *after* an `await` depends on context propagation: exact in
 * `native` mode, but in `fallback` mode a plain `await` drops the ambient span
 * and later calls attach to the root unless the trace transform is enabled.
 *
 * When tracing is disabled `fn` is called directly and no span is created.
 * With `retain: false` the span is still emitted to listeners but not kept on
 * its parent, so the in-memory tree does not grow.
 *
 * @param name - Span name shown in the overlay, replay, and wide events.
 * @param fn - Work to run inside the span.
 */
export function trace<T>(name: string, fn: () => T): T {
  if (!config.enabled) {
    return fn()
  }

  const parent = activeSpan()
  const span: Span = {
    id: nextId(),
    name,
    parent,
    children: [],
    logs: [],
    startTime: now(),
    endTime: null,
    status: 'running',
    source: sourceForCall(),
  }

  if (config.retain) {
    parent.children.push(span)
  }

  emit({ type: 'span:start', span })

  const finish = (status: Span['status']): void => {
    span.status = status
    span.endTime = now()
    emit({ type: 'span:end', span })
  }

  return currentSpan.run(span, () => {
    try {
      const result = fn()

      if (isThenable(result)) {
        return result.then(
          (value) => {
            finish('ok')
            return value
          },
          (error: unknown) => {
            finish('error')
            throw error
          },
        ) as T
      }

      finish('ok')
      return result
    } catch (error) {
      finish('error')
      throw error
    }
  })
}

/**
 * Records a log entry on the ambient span, capturing its call site for the
 * jump-to-source link. Arguments are stored as-is and only formatted when
 * rendered, so objects stay inspectable in the overlay and console replay.
 *
 * Outside any `trace()` the entry lands on the root span. It is dropped
 * entirely when tracing is disabled.
 */
export function log(level: LogLevel, ...args: unknown[]): void {
  if (!config.enabled) {
    return
  }

  const span = activeSpan()
  const entry: LogEntry = {
    id: nextId(),
    level,
    args,
    time: now(),
    source: sourceForCall(),
  }

  span.logs.push(entry)
  emit({ type: 'log', span, entry })
}

/** Level-bound shorthands for {@link log} — `logger.info(...)` and friends. */
export const logger: Logger = {
  debug: (...args: unknown[]): void => log('debug', ...args),
  info: (...args: unknown[]): void => log('info', ...args),
  warn: (...args: unknown[]): void => log('warn', ...args),
  error: (...args: unknown[]): void => log('error', ...args),
}
