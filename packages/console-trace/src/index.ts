import { configure, getRoot, subscribe } from './trace-log/trace-log.ts'
import type { Span } from './trace-log/trace-log.types.ts'
import { mountOverlay, replayToConsole } from './trace-overlay/trace-overlay.ts'
import { installTransport } from './trace-transport/trace-transport.ts'
import type { Transport } from './trace-transport/trace-transport.types.ts'

declare const __TRACE_PROJECT_ROOT__: string | undefined

/** Options for {@link setupTrace}. Every field has a default. */
export interface SetupTraceOptions {
  /**
   * Master switch. When `false`, `trace()` calls through to its callback,
   * `log()` is dropped, and nothing is installed. Default `true`.
   */
  enabled?: boolean
  /**
   * Absolute root used to build `vscode://file/...` source links. Defaults to
   * the value `tracePlugin()` injects at build time, or `null` without the
   * plugin, which disables the links.
   */
  projectRoot?: string | null
  /** Mount the live overlay. Defaults to `true` in the browser. */
  overlay?: boolean
  /**
   * Replay each completed top-level span through `console.group`.
   * Default `true`.
   */
  replayOnRootEnd?: boolean
  /**
   * Keep completed spans on the in-memory tree. Set `false` in production so
   * events still reach `transport` while memory stays flat — at the cost of
   * an empty overlay and a replay that stops at each top-level span.
   * Default `true`.
   */
  retain?: boolean
  /**
   * Resolve a source location for every `trace()` and `log()` call. Each one
   * builds a stack trace, so turn it off where the links are not shown anyway.
   * Default `true`.
   */
  captureSource?: boolean
  /** Receives one `WideEvent` per completed span. */
  transport?: Transport
}

function injectedProjectRoot(): string | null {
  return typeof __TRACE_PROJECT_ROOT__ !== 'undefined' ? __TRACE_PROJECT_ROOT__ : null
}

/**
 * Configures tracing and installs the optional overlay, transport, and console
 * replay. Call once at app startup, before the code you want traced runs.
 *
 * Options:
 * - `enabled` — master switch. When `false`, `trace()` calls through to its
 *   callback, `log()` is dropped, and nothing is installed. Default `true`.
 * - `projectRoot` — absolute root used to build `vscode://file/...` source
 *   links. Defaults to the value `tracePlugin()` injects at build time, or
 *   `null` without the plugin, which disables the links.
 * - `overlay` — mount the live overlay. Defaults to `true` in the browser.
 * - `replayOnRootEnd` — replay each completed top-level span through
 *   `console.group`. Default `true`.
 * - `retain` — keep completed spans on the in-memory tree. Set `false` in
 *   production so events still reach `transport` while memory stays flat.
 *   Note the overlay renders that tree, so it stays empty without it, and the
 *   console replay loses everything below each top-level span. Default `true`.
 * - `captureSource` — resolve a source location for every call. Each one
 *   builds a stack trace, so turn it off where the links are not shown
 *   anyway. Default `true`.
 * - `transport` — receives one `WideEvent` per completed span.
 *
 * @returns A cleanup function that unmounts the overlay and removes every
 * listener this call installed. Config changes are not reverted.
 */
export function setupTrace(options: SetupTraceOptions = {}): () => void {
  const enabled = options.enabled ?? true
  const projectRoot = options.projectRoot ?? injectedProjectRoot()
  const overlay = options.overlay ?? typeof document !== 'undefined'
  const replayOnRootEnd = options.replayOnRootEnd ?? true
  const retain = options.retain ?? true
  const captureSource = options.captureSource ?? true

  configure({ enabled, projectRoot, retain, captureSource })

  const cleanups: Array<() => void> = []

  if (!enabled) {
    return (): void => {}
  }

  if (options.transport) {
    cleanups.push(installTransport(options.transport))
  }

  if (overlay) {
    const handle = mountOverlay()
    cleanups.push((): void => handle.unmount())
  }

  if (replayOnRootEnd) {
    const unsubscribe = subscribe((event) => {
      // Resolved per event, not captured once: `resetTrace()` swaps the root
      // object, and a captured one would stop matching and silently end replay.
      if (event.type === 'span:end' && event.span.parent === getRoot()) {
        replayToConsole(event.span)
      }
    })
    cleanups.push(unsubscribe)
  }

  return (): void => {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}

export {
  configure,
  getActiveSpan,
  getConfig,
  getRoot,
  log,
  logger,
  resetTrace,
  subscribe,
  trace,
} from './trace-log/trace-log.ts'
export { mountOverlay, replayToConsole } from './trace-overlay/trace-overlay.ts'
export type { OverlayHandle } from './trace-overlay/trace-overlay.ts'
export { AsyncContext, asyncContextMode } from './async-context/async-context.ts'
export { runAsync } from './async-awaiter/async-awaiter.ts'
export { getSpanIds, installTransport, toWideEvent } from './trace-transport/trace-transport.ts'
export type {
  SpanIdFields,
  Transport,
  WideEvent,
  WideEventLog,
} from './trace-transport/trace-transport.types.ts'
export { spanContext } from './trace-context/trace-context.ts'
export type { SpanContext } from './trace-context/trace-context.types.ts'
export { tracePlugin } from './vite-plugin-trace/vite-plugin-trace.ts'
export type {
  LogEntry,
  Logger,
  LogLevel,
  SourceLocation,
  Span,
  SpanStatus,
  TraceConfig,
  TraceEvent,
  TraceListener,
} from './trace-log/trace-log.types.ts'
export type {
  AsyncContextLike,
  AsyncContextMode,
  Snapshot,
  Variable,
} from './async-context/async-context.types.ts'
export type {
  TracePlugin,
  TracePluginOptions,
} from './vite-plugin-trace/vite-plugin-trace.types.ts'

export type { Span as TraceSpan }
