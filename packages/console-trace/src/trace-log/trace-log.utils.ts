import type { SourceLocation } from './trace-log.types.ts'

const INTERNAL_MARKERS = [
  'async-context',
  'async-awaiter',
  'trace-log',
  'trace-overlay',
  'vite-plugin-trace',
]

const FRAME_PATTERN = /(?:\(|@|\s)((?:[a-z]+:\/\/|\/)[^\s()]+?):(\d+):(\d+)\)?$/i

/** One stack frame's location, before it is resolved to a {@link SourceLocation}. */
export interface ParsedFrame {
  /** Module URL exactly as the engine reported it, scheme and query included. */
  url: string
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  column: number
}

/**
 * Extracts the URL, line, and column from one stack-trace line.
 *
 * Handles both the V8 (`at fn (url:1:2)`) and SpiderMonkey/JavaScriptCore
 * (`fn@url:1:2`) shapes.
 *
 * @returns The parsed frame, or `null` if the line carries no location.
 */
export function parseFrame(frame: string): ParsedFrame | null {
  const match = FRAME_PATTERN.exec(frame.trim())

  if (!match) {
    return null
  }

  return {
    url: match[1] as string,
    line: Number(match[2]),
    column: Number(match[3]),
  }
}

/**
 * Reports whether `url` belongs to this library, so its own frames can be
 * skipped when walking a stack for the caller's location.
 */
export function isInternal(url: string): boolean {
  return INTERNAL_MARKERS.some((marker) => url.includes(marker))
}

/**
 * Reduces a module URL to its path, dropping the scheme, host, and query — the
 * form that appends cleanly onto the project root.
 *
 * Values without a scheme are returned unchanged.
 */
export function toPathname(url: string): string {
  const schemeIndex = url.indexOf('://')

  if (schemeIndex === -1) {
    return url
  }

  const afterScheme = url.slice(schemeIndex + 3)
  const slash = afterScheme.indexOf('/')
  const pathname = slash === -1 ? '/' : afterScheme.slice(slash)
  const query = pathname.indexOf('?')

  return query === -1 ? pathname : pathname.slice(0, query)
}

/**
 * Builds a `vscode://file/...` link that opens the file at the given position.
 *
 * @param projectRoot - Absolute project root, normally injected by
 * `tracePlugin()`. Without it there is nothing to resolve the path against, so
 * the result is `null` and source links stay disabled.
 */
export function toHref(
  pathname: string,
  line: number,
  column: number,
  projectRoot: string | null,
): string | null {
  if (!projectRoot) {
    return null
  }

  const root = projectRoot.replace(/\/+$/, '')

  return `vscode://file${root}${pathname}:${line}:${column}`
}

/**
 * Captures the call site of whoever invoked `trace()` or `log()`.
 *
 * Walks a synthetic stack and returns the first frame outside this library, so
 * the location points at user code rather than the engine. Returns `null` when
 * the runtime gives no stack or every frame is internal.
 *
 * @param projectRoot - Passed through to {@link toHref}; when `null` the
 * location still carries a label, just no clickable link.
 */
export function captureSource(projectRoot: string | null): SourceLocation | null {
  const stack = new Error().stack

  if (!stack) {
    return null
  }

  const lines = stack.split('\n').slice(1)

  for (const raw of lines) {
    const parsed = parseFrame(raw)

    if (!parsed || isInternal(parsed.url)) {
      continue
    }

    const pathname = toPathname(parsed.url)
    const label = `${pathname}:${parsed.line}:${parsed.column}`

    return {
      file: pathname,
      line: parsed.line,
      column: parsed.column,
      label,
      href: toHref(pathname, parsed.line, parsed.column, projectRoot),
    }
  }

  return null
}
