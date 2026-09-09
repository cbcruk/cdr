import { asyncContextMode, getRoot, resetTrace, subscribe } from '../../src/index.ts'
import type { LogEntry, LogLevel, Span, SpanStatus } from '../../src/index.ts'

// A TanStack-Devtools-style panel built entirely on console-trace's public API:
// `subscribe` for live updates, `getRoot` to walk the span tree, `resetTrace`
// to clear. Nothing here reaches into the library internals — a consumer could
// write the exact same file against the published package.

const STORAGE_KEY = 'console-trace:devtools'
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#8a8a8a',
  info: '#4aa3ff',
  warn: '#e6a700',
  error: '#ff5c5c',
}

const STATUS_COLORS: Record<SpanStatus, string> = {
  running: '#9aa0a6',
  ok: '#3fb950',
  error: '#ff5c5c',
}

const ACCENT = '#8957e5'

interface DevtoolsState {
  open: boolean
  levels: Record<LogLevel, boolean>
}

interface DevtoolsHandle {
  unmount(): void
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  if (style) {
    node.setAttribute('style', style)
  }

  if (text !== undefined) {
    node.textContent = text
  }

  return node
}

function defaultState(): DevtoolsState {
  return {
    open: false,
    levels: { debug: true, info: true, warn: true, error: true },
  }
}

function loadState(): DevtoolsState {
  if (typeof localStorage === 'undefined') {
    return defaultState()
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return defaultState()
    }

    const parsed = JSON.parse(raw) as Partial<DevtoolsState>
    const base = defaultState()

    return {
      open: parsed.open ?? base.open,
      levels: { ...base.levels, ...parsed.levels },
    }
  } catch {
    return defaultState()
  }
}

function saveState(state: DevtoolsState): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full or disabled — the panel still works in-memory.
  }
}

interface FlatSpan {
  span: Span
  depth: number
}

function flatten(spans: Span[], depth: number, out: FlatSpan[]): void {
  for (const span of spans) {
    out.push({ span, depth })
    flatten(span.children, depth + 1, out)
  }
}

function findById(spans: Span[], id: number): Span | null {
  for (const span of spans) {
    if (span.id === id) {
      return span
    }

    const nested = findById(span.children, id)

    if (nested) {
      return nested
    }
  }

  return null
}

function pathOf(span: Span): string {
  const names: string[] = []
  let cursor: Span | null = span

  while (cursor && cursor.parent !== null) {
    names.unshift(cursor.name)
    cursor = cursor.parent
  }

  return names.join(' › ')
}

function duration(span: Span): number {
  return (span.endTime ?? now()) - span.startTime
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.message
  }

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function mountDevtools(): DevtoolsHandle {
  if (typeof document === 'undefined') {
    return { unmount: (): void => {} }
  }

  const state = loadState()
  let selectedId: number | null = null
  let frame = 0

  const host = el(
    'div',
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
  )
  document.body.appendChild(host)

  const persist = (): void => saveState(state)

  function statusCounts(): Record<SpanStatus, number> {
    const flat: FlatSpan[] = []
    flatten(getRoot().children, 0, flat)

    const counts: Record<SpanStatus, number> = { running: 0, ok: 0, error: 0 }

    for (const { span } of flat) {
      counts[span.status] += 1
    }

    return counts
  }

  function renderLauncher(): HTMLElement {
    const counts = statusCounts()
    const total = counts.running + counts.ok + counts.error

    const button = el(
      'button',
      'display:flex;align-items:center;gap:8px;position:fixed;right:16px;bottom:16px;' +
        `padding:8px 12px;border:none;border-radius:9999px;cursor:pointer;color:#fff;` +
        `background:${ACCENT};box-shadow:0 6px 20px rgba(0,0,0,0.35);font:inherit;font-size:12px;`,
    )

    button.appendChild(el('span', 'font-size:14px;', '◎'))
    button.appendChild(el('span', 'font-weight:600;', 'trace'))

    if (total > 0) {
      const color = counts.error > 0 ? STATUS_COLORS.error : STATUS_COLORS.ok
      const badge = el(
        'span',
        `background:${color};color:#04140a;border-radius:9999px;` +
          'min-width:18px;text-align:center;padding:1px 6px;font-size:11px;font-weight:700;',
        String(total),
      )
      button.appendChild(badge)
    }

    button.addEventListener('click', () => {
      state.open = true
      persist()
      render()
    })

    return button
  }

  function renderHeader(): HTMLElement {
    const header = el(
      'div',
      'display:flex;align-items:center;gap:10px;padding:8px 12px;' +
        'border-bottom:1px solid #2a2a2a;background:#141414;',
    )

    const logo = el('div', 'display:flex;align-items:center;gap:6px;color:#fff;')
    logo.appendChild(el('span', `color:${ACCENT};font-size:15px;`, '◎'))
    logo.appendChild(el('strong', 'font-size:13px;', 'console-trace devtools'))
    header.appendChild(logo)

    const mode = el(
      'span',
      `font-size:10px;padding:1px 6px;border-radius:4px;color:#fff;background:${
        asyncContextMode === 'native' ? STATUS_COLORS.ok : '#e6a700'
      };`,
      asyncContextMode,
    )
    header.appendChild(mode)

    header.appendChild(renderLevelFilter())

    const spacer = el('div', 'flex:1;')
    header.appendChild(spacer)

    const clear = el(
      'button',
      'font:inherit;font-size:11px;color:#c9d1d9;background:#20232a;border:1px solid #333;' +
        'border-radius:6px;padding:3px 10px;cursor:pointer;',
      'Clear',
    )
    clear.addEventListener('click', () => {
      resetTrace()
      selectedId = null
      render()
    })
    header.appendChild(clear)

    const close = el(
      'button',
      'font:inherit;font-size:14px;color:#c9d1d9;background:transparent;border:none;' +
        'cursor:pointer;padding:0 4px;',
      '▾',
    )
    close.title = 'Close panel'
    close.addEventListener('click', () => {
      state.open = false
      persist()
      render()
    })
    header.appendChild(close)

    return header
  }

  function renderLevelFilter(): HTMLElement {
    const group = el('div', 'display:flex;gap:4px;')

    for (const level of LEVELS) {
      const active = state.levels[level]
      const chip = el(
        'button',
        'font:inherit;cursor:pointer;font-size:10px;padding:1px 6px;border:none;border-radius:4px;' +
          `background:${LEVEL_COLORS[level]};color:#000;opacity:${active ? '1' : '0.35'};`,
        level,
      )
      chip.addEventListener('click', () => {
        state.levels[level] = !active
        persist()
        render()
      })
      group.appendChild(chip)
    }

    return group
  }

  function renderRow(entry: FlatSpan): HTMLElement {
    const { span, depth } = entry
    const selected = span.id === selectedId

    const row = el(
      'div',
      'display:flex;align-items:center;gap:6px;padding:3px 8px;cursor:pointer;font-size:12px;' +
        `padding-left:${8 + depth * 14}px;color:#e6e6e6;` +
        (selected
          ? `background:${ACCENT}33;border-left:2px solid ${ACCENT};`
          : 'border-left:2px solid transparent;'),
    )

    row.appendChild(el('span', `color:${STATUS_COLORS[span.status]};`, '●'))
    row.appendChild(
      el('span', 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', span.name),
    )
    row.appendChild(el('span', 'color:#7a7a7a;font-size:11px;', `${duration(span).toFixed(0)}ms`))

    row.addEventListener('click', () => {
      selectedId = span.id
      render()
    })

    return row
  }

  function renderMaster(): HTMLElement {
    const list = el(
      'div',
      'width:42%;min-width:220px;overflow:auto;border-right:1px solid #2a2a2a;background:#181818;',
    )

    const flat: FlatSpan[] = []
    flatten(getRoot().children, 0, flat)

    if (flat.length === 0) {
      list.appendChild(
        el(
          'div',
          'padding:16px;color:#7a7a7a;font-size:12px;',
          'No spans yet — trigger some traced work.',
        ),
      )
      return list
    }

    for (const entry of flat) {
      list.appendChild(renderRow(entry))
    }

    return list
  }

  function renderTimeline(span: Span): HTMLElement {
    const root = getRoot()
    const t0 = root.startTime
    const total = Math.max(now() - t0, 1)
    const left = ((span.startTime - t0) / total) * 100
    const width = Math.max((duration(span) / total) * 100, 0.5)

    const track = el(
      'div',
      'height:6px;background:#20232a;border-radius:3px;position:relative;margin:8px 0;',
    )
    track.appendChild(
      el(
        'div',
        `position:absolute;top:0;bottom:0;left:${left}%;width:${width}%;` +
          `background:${STATUS_COLORS[span.status]};border-radius:3px;`,
      ),
    )

    return track
  }

  function renderLogLine(entry: LogEntry): HTMLElement {
    const line = el('div', 'padding:2px 0;font-size:11px;display:flex;gap:6px;')

    line.appendChild(
      el('span', `color:${LEVEL_COLORS[entry.level]};min-width:42px;font-weight:600;`, entry.level),
    )
    line.appendChild(el('span', 'color:#d0d0d0;', entry.args.map(formatArg).join(' ')))

    if (entry.source) {
      if (entry.source.href) {
        const link = el(
          'a',
          'margin-left:auto;color:#7a7a7a;text-decoration:none;font-size:10px;',
          `${entry.source.label} ↗`,
        )
        link.href = entry.source.href
        line.appendChild(link)
      } else {
        line.appendChild(
          el('span', 'margin-left:auto;color:#7a7a7a;font-size:10px;', entry.source.label),
        )
      }
    }

    return line
  }

  function renderDetail(): HTMLElement {
    const detail = el('div', 'flex:1;overflow:auto;padding:12px 16px;background:#141414;')

    const span = selectedId === null ? null : findById(getRoot().children, selectedId)

    if (!span) {
      detail.appendChild(
        el(
          'div',
          'color:#7a7a7a;font-size:12px;',
          'Select a span to inspect its logs, timing, and source.',
        ),
      )
      return detail
    }

    const titleRow = el('div', 'display:flex;align-items:center;gap:8px;')
    titleRow.appendChild(el('strong', 'font-size:14px;color:#fff;', span.name))
    titleRow.appendChild(
      el(
        'span',
        `font-size:10px;padding:1px 6px;border-radius:4px;color:#04140a;background:${STATUS_COLORS[span.status]};`,
        span.status,
      ),
    )
    titleRow.appendChild(
      el('span', 'color:#7a7a7a;font-size:11px;', `${duration(span).toFixed(1)}ms`),
    )
    detail.appendChild(titleRow)

    const path = pathOf(span)
    if (path) {
      detail.appendChild(el('div', 'color:#7a7a7a;font-size:11px;margin-top:2px;', path))
    }

    detail.appendChild(renderTimeline(span))

    if (span.source) {
      const src = el('div', 'font-size:11px;margin-bottom:8px;')
      if (span.source.href) {
        const link = el('a', `color:${ACCENT};text-decoration:none;`, `${span.source.label} ↗`)
        link.href = span.source.href
        src.appendChild(link)
      } else {
        src.appendChild(el('span', 'color:#7a7a7a;', span.source.label))
      }
      detail.appendChild(src)
    }

    const visibleLogs = span.logs.filter((entry) => state.levels[entry.level])

    detail.appendChild(
      el(
        'div',
        'text-transform:uppercase;font-size:10px;color:#7a7a7a;margin:8px 0 4px;',
        `Logs (${visibleLogs.length})`,
      ),
    )

    if (visibleLogs.length === 0) {
      detail.appendChild(
        el('div', 'color:#7a7a7a;font-size:11px;', 'No logs at the selected levels.'),
      )
    } else {
      for (const entry of visibleLogs) {
        detail.appendChild(renderLogLine(entry))
      }
    }

    return detail
  }

  function renderPanel(): HTMLElement {
    const panel = el(
      'div',
      'height:42vh;display:flex;flex-direction:column;background:#141414;' +
        'border-top:1px solid #333;box-shadow:0 -8px 24px rgba(0,0,0,0.4);',
    )

    panel.appendChild(renderHeader())

    const body = el('div', 'flex:1;display:flex;overflow:hidden;')
    body.appendChild(renderMaster())
    body.appendChild(renderDetail())
    panel.appendChild(body)

    return panel
  }

  function render(): void {
    frame = 0
    host.replaceChildren(state.open ? renderPanel() : renderLauncher())
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
      host.remove()
    },
  }
}
