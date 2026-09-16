import type { LogLevel } from '@cbcruk/console-trace'
import type {
  LogSnapshot,
  SourceSnapshot,
  SpanSnapshot,
  TraceState,
} from '../../src/protocol/protocol.types.ts'
import { loadPrefs, savePrefs } from './panel.storage.ts'
import type { FlatSpan, PanelConnection, PanelHandle, PanelOptions } from './panel.types.ts'
import { duration, el, flatten, timelineWindow } from './panel.utils.ts'

export type { PanelConnection, PanelHandle, PanelOptions } from './panel.types.ts'

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

const EMPTY_TEXT: Record<PanelConnection, string> = {
  connecting: 'Connecting to the page…',
  connected: 'No spans yet. Trigger some traced work.',
  missing: 'No page script found. Call mountTracePageScript() in the app.',
}

function renderSource(source: SourceSnapshot, className: string): HTMLElement {
  if (!source.href) return el('span', className, source.label)
  const link = el('a', className, `${source.label} ↗`)
  link.href = source.href
  return link
}

function renderLog(entry: LogSnapshot): HTMLElement {
  const line = el('div', `log level-${entry.level}`)
  line.append(el('span', 'log-level', entry.level), el('span', 'log-message', entry.message))
  if (entry.source) line.append(renderSource(entry.source, 'log-source'))
  return line
}

/**
 * Mounts the master/detail span view into `root`.
 *
 * The panel holds no trace data of its own. Every {@link PanelHandle.update}
 * replaces the tree, and the selection survives by span id. While any span is
 * still running, durations keep ticking between updates.
 */
export function mountPanel(root: HTMLElement, options: PanelOptions): PanelHandle {
  const prefs = loadPrefs()
  let state: TraceState | null = null
  let connection: PanelConnection = 'connecting'
  let selectedId: number | null = null
  let ticker: ReturnType<typeof setInterval> | null = null

  function renderHeader(): HTMLElement {
    const header = el('header', 'header')
    header.append(el('strong', 'title', 'console-trace'))
    if (state) header.append(el('span', `mode mode-${state.mode}`, state.mode))

    const filters = el('div', 'filters')
    for (const level of LEVELS) {
      const chip = el('button', `chip level-${level}`, level)
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(prefs.levels[level]))
      chip.addEventListener('click', () => {
        prefs.levels[level] = !prefs.levels[level]
        savePrefs(prefs)
        render()
      })
      filters.append(chip)
    }
    header.append(filters, el('span', 'spacer'))

    const clear = el('button', 'clear', 'Clear')
    clear.type = 'button'
    clear.disabled = connection !== 'connected'
    clear.addEventListener('click', () => {
      selectedId = null
      options.onReset()
    })
    header.append(clear)
    return header
  }

  function renderRow({ span, depth }: FlatSpan, now: number): HTMLElement {
    const row = el('button', 'row')
    row.type = 'button'
    row.style.paddingLeft = `${8 + depth * 14}px`
    row.setAttribute('aria-selected', String(span.id === selectedId))
    row.append(
      el('span', `dot status-${span.status}`),
      el('span', 'row-name', span.name),
      el('span', 'row-time', `${duration(span, now).toFixed(0)}ms`),
    )
    row.addEventListener('click', () => {
      selectedId = span.id
      render()
    })
    return row
  }

  function renderDetail(
    entry: FlatSpan | undefined,
    spans: SpanSnapshot[],
    now: number,
  ): HTMLElement {
    const detail = el('section', 'detail')
    if (!entry) {
      detail.append(el('p', 'empty', 'Select a span to inspect its logs, timing, and source.'))
      return detail
    }

    const { span, path } = entry
    const title = el('div', 'detail-title')
    title.append(
      el('strong', undefined, span.name),
      el('span', `badge status-${span.status}`, span.status),
      el('span', 'muted', `${duration(span, now).toFixed(1)}ms`),
    )
    detail.append(title)
    if (path.length > 0) detail.append(el('div', 'muted path', path.join(' › ')))
    detail.append(
      el('div', 'muted ids', `trace_id ${span.ids.trace_id} · span_id ${span.ids.span_id}`),
    )

    const frame = timelineWindow(spans, now)
    const track = el('div', 'track')
    const bar = el('div', `bar status-${span.status}`)
    bar.style.left = `${((span.start - frame.start) / frame.length) * 100}%`
    bar.style.width = `${Math.max((duration(span, now) / frame.length) * 100, 0.5)}%`
    track.append(bar)
    detail.append(track)

    if (span.source) detail.append(renderSource(span.source, 'span-source'))

    const logs = span.logs.filter((log) => prefs.levels[log.level])
    detail.append(el('h3', 'logs-title', `Logs (${logs.length})`))
    if (logs.length === 0) detail.append(el('p', 'empty', 'No logs at the selected levels.'))
    for (const log of logs) detail.append(renderLog(log))
    return detail
  }

  function syncTicker(flat: FlatSpan[]): void {
    const running = flat.some(({ span }) => span.status === 'running')
    if (running && ticker === null) ticker = setInterval(render, 250)
    if (!running && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function render(): void {
    const now = Date.now()
    const spans = state?.spans ?? []
    const flat = flatten(spans)
    syncTicker(flat)

    const master = el('nav', 'master')
    if (flat.length === 0) master.append(el('p', 'empty', EMPTY_TEXT[connection]))
    for (const entry of flat) master.append(renderRow(entry, now))

    const scroll = {
      master: root.querySelector('.master')?.scrollTop ?? 0,
      detail: root.querySelector('.detail')?.scrollTop ?? 0,
    }
    const selected = flat.find(({ span }) => span.id === selectedId)
    const detail = renderDetail(selected, spans, now)
    const body = el('div', 'body')
    body.append(master, detail)
    root.replaceChildren(renderHeader(), body)
    master.scrollTop = scroll.master
    detail.scrollTop = scroll.detail
  }

  render()

  return {
    update(nextState, nextConnection): void {
      state = nextState
      connection = nextConnection
      render()
    },
  }
}
