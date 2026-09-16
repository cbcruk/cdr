import type { LogRecord } from 'cdr'
import type { SessionNode, SpanNode, TraceNode } from './span-tree.types.ts'

export type { SessionNode, SpanNode, TraceNode } from './span-tree.types.ts'

interface SessionBuilder {
  node: SessionNode
  spans: Map<string, SpanNode>
  parents: Map<string, string | null>
  traceOf: Map<string, string>
  traces: Map<string, TraceNode>
}

function readId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function spanFor(session: SessionBuilder, spanId: string): SpanNode {
  let span = session.spans.get(spanId)
  if (!span) {
    span = { spanId, records: [], children: [] }
    session.spans.set(spanId, span)
  }
  return span
}

function link(session: SessionBuilder): void {
  for (const [spanId, span] of session.spans) {
    const parentId = session.parents.get(spanId) ?? null
    if (parentId !== null) {
      spanFor(session, parentId).children.push(span)
      const traceId = session.traceOf.get(spanId)
      if (traceId !== undefined && !session.traceOf.has(parentId)) {
        session.traceOf.set(parentId, traceId)
      }
      continue
    }

    const traceId = session.traceOf.get(spanId)
    if (traceId === undefined) continue

    let trace = session.traces.get(traceId)
    if (!trace) {
      trace = { traceId, roots: [] }
      session.traces.set(traceId, trace)
      session.node.traces.push(trace)
    }
    trace.roots.push(span)
  }
}

/**
 * 내보낸 레코드를 세션 → trace → span 트리로 다시 세운다.
 *
 * 레코드에는 span 이름이 없고 `ctx`의 `trace_id` / `span_id` / `parent_id`만
 * 남는다. 이 식별자는 문서 하나 안에서만 유일한 카운터라서, 먼저
 * `ctx.sessionId`로 나눈 뒤에 잇는다. 여러 탭이나 새로고침이 섞인 파일에서
 * `s1`끼리 엉키지 않게 하기 위해서다.
 *
 * 부모 span이 레코드를 하나도 남기지 않았어도 자식의 `parent_id`로 노드를
 * 만들어 연결한다. 식별자가 없는 레코드는 `unattributed`로 간다. 이건 "관련
 * 없음"이 아니라 "귀속되지 않음"이라는 뜻이다.
 *
 * @param records 시각순이 아니어도 된다. 결과 안에서 시각순으로 정렬된다.
 * @returns 세션별 트리. 세션은 처음 기록된 시각순.
 */
export function buildSpanTree(records: readonly LogRecord[]): SessionNode[] {
  const sessions = new Map<string, SessionBuilder>()
  const sorted = [...records].sort((a, b) => a.ts - b.ts)

  for (const record of sorted) {
    const sessionId = record.ctx.sessionId
    let session = sessions.get(sessionId)
    if (!session) {
      session = {
        node: { sessionId, traces: [], unattributed: [] },
        spans: new Map(),
        parents: new Map(),
        traceOf: new Map(),
        traces: new Map(),
      }
      sessions.set(sessionId, session)
    }

    const spanId = readId(record.ctx.span_id)
    const traceId = readId(record.ctx.trace_id)
    if (spanId === null || traceId === null) {
      session.node.unattributed.push(record)
      continue
    }

    spanFor(session, spanId).records.push(record)
    session.traceOf.set(spanId, traceId)
    session.parents.set(spanId, readId(record.ctx.parent_id))
  }

  for (const session of sessions.values()) link(session)

  return [...sessions.values()].map((session) => session.node)
}
