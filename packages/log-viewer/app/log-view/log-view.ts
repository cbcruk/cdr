import { filterLogs } from 'cdr'
import type { LogRecord } from 'cdr'
import type { LoadedLog } from '../../src/log-viewer/log-viewer.types.ts'
import { buildSpanTree } from '../../src/span-tree/span-tree.ts'
import type { SessionNode, SpanNode, TraceNode } from '../../src/span-tree/span-tree.ts'
import type { ViewState } from './log-view.types.ts'
import {
  LEVELS,
  countByLevel,
  countSpanRecords,
  el,
  formatTime,
  plural,
  worstLevel,
} from './log-view.utils.ts'

export type { ViewState } from './log-view.types.ts'

function renderRecord(record: LogRecord): HTMLElement {
  const row = el('div', `record level-${record.level}`)
  row.append(
    el('span', 'time', formatTime(record.ts)),
    el('span', 'level', record.level),
    el('span', 'type', record.type),
    el('span', 'message', record.message || '(no message)'),
  )
  if (Object.keys(record.data).length > 0) {
    row.append(el('pre', 'data', JSON.stringify(record.data)))
  }
  return row
}

function renderSpan(span: SpanNode): HTMLElement {
  const details = el('details', 'span')
  details.open = true

  const summary = el('summary')
  const level = worstLevel(span)
  summary.append(
    el('span', `dot level-${level ?? 'none'}`),
    el('span', 'span-id', span.spanId),
    el('span', 'count', plural(countSpanRecords(span), 'record')),
  )
  details.append(summary)

  for (const record of span.records) details.append(renderRecord(record))
  for (const child of span.children) details.append(renderSpan(child))
  return details
}

function renderTrace(trace: TraceNode): HTMLElement {
  const section = el('section', 'trace')
  section.append(el('h3', undefined, `trace ${trace.traceId}`))
  for (const root of trace.roots) section.append(renderSpan(root))
  return section
}

function renderSession(session: SessionNode): HTMLElement {
  const section = el('section', 'session')
  const title = el('h2')
  title.append('session ', el('code', undefined, session.sessionId))
  section.append(title)

  for (const trace of session.traces) section.append(renderTrace(trace))

  if (session.unattributed.length > 0) {
    const group = el('section', 'trace unattributed')
    group.append(el('h3', undefined, 'unattributed'))
    for (const record of session.unattributed) group.append(renderRecord(record))
    section.append(group)
  }
  return section
}

function renderToolbar(log: LoadedLog, state: ViewState, onChange: () => void): HTMLElement {
  const toolbar = el('div', 'toolbar')
  const counts = countByLevel(log.records)

  for (const level of LEVELS) {
    const chip = el('button', `chip level-${level}`, `${level} ${counts[level]}`)
    chip.type = 'button'
    chip.setAttribute('aria-pressed', String(state.levels.has(level)))
    chip.addEventListener('click', () => {
      if (state.levels.has(level)) state.levels.delete(level)
      else state.levels.add(level)
      chip.setAttribute('aria-pressed', String(state.levels.has(level)))
      onChange()
    })
    toolbar.append(chip)
  }

  const search = el('input', 'search')
  search.type = 'search'
  search.name = 'q'
  search.placeholder = 'Filter messages'
  search.value = state.text
  search.addEventListener('input', () => {
    state.text = search.value
    onChange()
  })
  toolbar.append(search)
  return toolbar
}

function renderIssues(log: LoadedLog): HTMLElement | null {
  if (log.issues.length === 0) return null
  const box = el('details', 'issues')
  box.append(el('summary', undefined, `${plural(log.issues.length, 'line')} skipped`))
  for (const issue of log.issues) {
    box.append(el('div', undefined, `line ${issue.line}: ${issue.reason}`))
  }
  return box
}

/**
 * 읽어 온 로그 파일 하나를 `root` 안에 그린다.
 *
 * 레벨·검색 조건이 바뀌면 트리 부분만 다시 그린다. 검색 입력란은 그대로라
 * 타이핑 중에 포커스를 잃지 않는다.
 */
export function mountLogView(root: HTMLElement, log: LoadedLog): void {
  const state: ViewState = { levels: new Set(LEVELS), text: '' }
  const tree = el('div', 'tree')

  const header = el('header')
  header.append(
    el('h1', undefined, log.fileName),
    el('p', 'meta', plural(log.records.length, 'record')),
  )

  function renderTree(): void {
    const records = filterLogs(log.records, {
      levels: [...state.levels],
      text: state.text || undefined,
    })
    const sessions = buildSpanTree(records)
    tree.replaceChildren(
      ...(sessions.length > 0
        ? sessions.map(renderSession)
        : [el('p', 'empty', 'No records match.')]),
    )
  }

  const toolbar = renderToolbar(log, state, renderTree)

  const issues = renderIssues(log)
  root.replaceChildren(header, ...(issues ? [issues] : []), toolbar, tree)
  renderTree()
}
