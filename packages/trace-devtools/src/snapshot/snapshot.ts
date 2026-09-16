import { getSpanIds } from '@cbcruk/console-trace'
import type { LogEntry, SourceLocation, Span } from '@cbcruk/console-trace'
import type { LogSnapshot, SourceSnapshot, SpanSnapshot } from '../protocol/protocol.types.ts'
import { formatArg } from './snapshot.utils.ts'

function snapshotSource(source: SourceLocation | null): SourceSnapshot | null {
  return source ? { label: source.label, href: source.href } : null
}

function snapshotLog(entry: LogEntry, timeOrigin: number): LogSnapshot {
  return {
    id: entry.id,
    level: entry.level,
    message: entry.args.map(formatArg).join(' '),
    time: timeOrigin + entry.time,
    source: snapshotSource(entry.source),
  }
}

function snapshotSpan(span: Span, timeOrigin: number): SpanSnapshot {
  return {
    id: span.id,
    ids: getSpanIds(span),
    name: span.name,
    status: span.status,
    start: timeOrigin + span.startTime,
    end: span.endTime === null ? null : timeOrigin + span.endTime,
    source: snapshotSource(span.source),
    logs: span.logs.map((entry) => snapshotLog(entry, timeOrigin)),
    children: span.children.map((child) => snapshotSpan(child, timeOrigin)),
  }
}

/**
 * Copies the children of `root` into a tree that can cross a `MessagePort`.
 *
 * Times move from `performance.now()` to epoch milliseconds. The panel runs in
 * its own document with its own time origin, so page-relative times would be
 * meaningless there.
 *
 * @param root The synthetic root from `getRoot()`; it is not itself included.
 * @param timeOrigin `performance.timeOrigin` of the page that recorded the spans.
 */
export function snapshotSpans(root: Span, timeOrigin: number): SpanSnapshot[] {
  return root.children.map((span) => snapshotSpan(span, timeOrigin))
}
