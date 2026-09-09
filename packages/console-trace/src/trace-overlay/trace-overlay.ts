import { asyncContextMode } from '../async-context/async-context.ts'
import { getRoot, subscribe } from '../trace-log/trace-log.ts'
import type { LogEntry, LogLevel, SourceLocation, Span } from '../trace-log/trace-log.types.ts'
import { LOG_LEVELS, loadState, saveState } from './trace-overlay.storage.ts'
import type { OverlayHandle, OverlayState } from './trace-overlay.types.ts'

export type { OverlayHandle } from './trace-overlay.types.ts'

interface RenderContext {
  state: OverlayState
  refresh: () => void
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#8a8a8a',
  info: '#4aa3ff',
  warn: '#e6a700',
  error: '#ff5c5c',
}

const STATUS_COLORS: Record<Span['status'], string> = {
  running: '#9aa0a6',
  ok: '#3fb950',
  error: '#ff5c5c',
}

function isBrowser(): boolean {
  return typeof document !== 'undefined'
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(formatArg).join(' ')
}

function formatDuration(span: Span): string {
  if (span.endTime === null) {
    return '…'
  }

  return `${(span.endTime - span.startTime).toFixed(1)}ms`
}

function appendSource(parent: HTMLElement, source: SourceLocation | null): void {
  if (!source) {
    return
  }

  const style = 'margin-left:6px;font-size:10px;color:#7a7a7a;text-decoration:none;'

  if (source.href) {
    const link = document.createElement('a')

    link.href = source.href
    link.textContent = `${source.label} ↗`
    link.setAttribute('style', style)
    parent.appendChild(link)
    return
  }

  const span = document.createElement('span')

  span.textContent = source.label
  span.setAttribute('style', style)
  span.title = 'Add tracePlugin() to enable jump-to-source links'
  parent.appendChild(span)
}

function renderLog(entry: LogEntry): HTMLElement {
  const row = document.createElement('div')

  row.setAttribute('style', `padding:1px 0;color:${LEVEL_COLORS[entry.level]};font-size:11px;`)

  const text = document.createElement('span')

  text.textContent = `${entry.level} ${formatArgs(entry.args)}`
  row.appendChild(text)
  appendSource(row, entry.source)

  return row
}

function renderSpan(span: Span, key: string, ctx: RenderContext): HTMLElement {
  const container = document.createElement('div')

  container.setAttribute(
    'style',
    'margin-left:12px;border-left:1px solid #2a2a2a;padding-left:8px;',
  )

  const header = document.createElement('div')

  header.setAttribute('style', 'padding:2px 0;font-size:12px;color:#e6e6e6;')

  const hasChildren = span.children.length > 0 || span.logs.length > 0
  const collapsed = ctx.state.collapsed[key] === true

  if (hasChildren) {
    const toggle = document.createElement('span')

    toggle.textContent = collapsed ? '▶' : '▼'
    toggle.setAttribute('style', 'cursor:pointer;margin-right:4px;color:#9aa0a6;')
    toggle.addEventListener('click', () => {
      ctx.state.collapsed[key] = !collapsed
      ctx.refresh()
    })
    header.appendChild(toggle)
  }

  const dot = document.createElement('span')

  dot.textContent = '●'
  dot.setAttribute('style', `color:${STATUS_COLORS[span.status]};margin-right:6px;`)
  header.appendChild(dot)

  const name = document.createElement('span')

  name.textContent = `${span.name} (${formatDuration(span)})`
  header.appendChild(name)
  appendSource(header, span.source)
  container.appendChild(header)

  if (collapsed) {
    return container
  }

  for (const entry of span.logs) {
    if (ctx.state.levels[entry.level]) {
      container.appendChild(renderLog(entry))
    }
  }

  renderChildren(container, span.children, key, ctx)

  return container
}

function renderChildren(
  parent: HTMLElement,
  spans: Span[],
  parentKey: string,
  ctx: RenderContext,
): void {
  const counts = new Map<string, number>()

  for (const span of spans) {
    const index = counts.get(span.name) ?? 0

    counts.set(span.name, index + 1)
    parent.appendChild(renderSpan(span, `${parentKey}/${span.name}#${index}`, ctx))
  }
}

function renderLevelFilter(ctx: RenderContext): HTMLElement {
  const group = document.createElement('div')

  group.setAttribute('style', 'display:flex;gap:4px;')

  for (const level of LOG_LEVELS) {
    const active = ctx.state.levels[level]
    const button = document.createElement('span')

    button.textContent = level
    button.setAttribute(
      'style',
      `cursor:pointer;font-size:10px;padding:1px 5px;border-radius:4px;` +
        `background:${LEVEL_COLORS[level]};color:#000;opacity:${active ? '1' : '0.35'};`,
    )
    button.addEventListener('click', () => {
      ctx.state.levels[level] = !active
      ctx.refresh()
    })
    group.appendChild(button)
  }

  return group
}

function renderHeader(ctx: RenderContext): HTMLElement {
  const header = document.createElement('div')

  header.setAttribute(
    'style',
    'display:flex;justify-content:space-between;align-items:center;gap:8px;' +
      'padding:6px 8px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#fff;',
  )

  const title = document.createElement('strong')

  title.textContent = 'trace'
  header.appendChild(title)
  header.appendChild(renderLevelFilter(ctx))

  const badge = document.createElement('span')

  badge.textContent = asyncContextMode
  badge.setAttribute(
    'style',
    `font-size:10px;padding:1px 6px;border-radius:4px;color:#fff;background:${
      asyncContextMode === 'native' ? '#3fb950' : '#e6a700'
    };`,
  )
  header.appendChild(badge)

  return header
}

/**
 * Replays a span tree through nested `console.group` calls, so a completed
 * trace can be read in the browser console or a terminal.
 *
 * Each log is emitted with its original arguments through the matching
 * `console` method, keeping objects inspectable. `setupTrace` calls this for
 * every top-level span that ends unless `replayOnRootEnd` is disabled.
 *
 * @param root - Span to replay; defaults to the current root.
 */
export function replayToConsole(root: Span = getRoot()): void {
  const walk = (span: Span): void => {
    const label = span.parent === null ? 'trace' : span.name

    console.group(label)

    for (const entry of span.logs) {
      console[entry.level](...entry.args)
    }

    for (const child of span.children) {
      walk(child)
    }

    console.groupEnd()
  }

  walk(root)
}

/**
 * Mounts the live overlay: a fixed panel rendering the span tree with status,
 * timings, and jump-to-source links.
 *
 * Re-renders are batched into an animation frame as events arrive. Collapse
 * state and level filters persist to `localStorage` and are restored on the
 * next mount. Outside a browser this is a no-op returning an inert handle.
 *
 * @returns A handle whose `unmount()` removes the panel and its subscription.
 */
export function mountOverlay(): OverlayHandle {
  if (!isBrowser()) {
    return { unmount: (): void => {} }
  }

  const panel = document.createElement('div')

  panel.setAttribute(
    'style',
    'position:fixed;right:12px;bottom:12px;width:380px;max-height:60vh;' +
      'overflow:auto;background:#1a1a1a;border:1px solid #333;border-radius:8px;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;z-index:2147483647;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);',
  )
  document.body.appendChild(panel)

  const state = loadState()
  let frame = 0

  const ctx: RenderContext = {
    state,
    refresh: (): void => {
      saveState(state)
      render()
    },
  }

  function render(): void {
    frame = 0
    panel.replaceChildren()
    panel.appendChild(renderHeader(ctx))

    const body = document.createElement('div')

    body.setAttribute('style', 'padding:6px 4px;')
    renderChildren(body, getRoot().children, 'root', ctx)
    panel.appendChild(body)
  }

  const schedule = (): void => {
    if (frame !== 0) {
      return
    }

    frame =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(render)
        : (setTimeout(render, 16) as unknown as number)
  }

  const unsubscribe = subscribe(schedule)

  render()

  return {
    unmount: (): void => {
      unsubscribe()
      panel.remove()
    },
  }
}
