import { describe, expect, it } from 'vite-plus/test'
import { buildSpanTree } from '../src/span-tree/span-tree.ts'
import type { SpanNode } from '../src/span-tree/span-tree.ts'
import { record } from './fixtures/records.ts'

function shape(span: SpanNode): unknown {
  return {
    id: span.spanId,
    records: span.records.map((r) => r.message),
    children: span.children.map(shape),
  }
}

describe('buildSpanTree', () => {
  it('nests spans by parent_id under their trace', () => {
    const sessions = buildSpanTree([
      record({ ts: 3, message: 'child', ctx: { trace_id: 't1', span_id: 's2', parent_id: 's1' } }),
      record({ ts: 1, message: 'root', ctx: { trace_id: 't1', span_id: 's1', parent_id: null } }),
      record({ ts: 2, message: 'plain' }),
    ])

    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.unattributed.map((r) => r.message)).toEqual(['plain'])
    expect(sessions[0]!.traces.map((t) => ({ id: t.traceId, roots: t.roots.map(shape) }))).toEqual([
      {
        id: 't1',
        roots: [
          {
            id: 's1',
            records: ['root'],
            children: [{ id: 's2', records: ['child'], children: [] }],
          },
        ],
      },
    ])
  })

  it('keeps sessions apart, because span ids are only unique per document', () => {
    const sessions = buildSpanTree([
      record({
        ts: 1,
        message: 'first tab',
        ctx: { sessionId: 'a', trace_id: 't1', span_id: 's1' },
      }),
      record({
        ts: 2,
        message: 'second tab',
        ctx: { sessionId: 'b', trace_id: 't1', span_id: 's1' },
      }),
    ])

    expect(sessions.map((s) => [s.sessionId, s.traces[0]!.roots.map(shape)])).toEqual([
      ['a', [{ id: 's1', records: ['first tab'], children: [] }]],
      ['b', [{ id: 's1', records: ['second tab'], children: [] }]],
    ])
  })

  it('creates a parent that logged nothing, and roots it in the child trace', () => {
    const sessions = buildSpanTree([
      record({ message: 'deep', ctx: { trace_id: 't1', span_id: 's3', parent_id: 's2' } }),
    ])

    expect(sessions[0]!.traces).toHaveLength(1)
    expect(sessions[0]!.traces[0]!.roots.map(shape)).toEqual([
      { id: 's2', records: [], children: [{ id: 's3', records: ['deep'], children: [] }] },
    ])
  })

  it('orders records inside a span by time', () => {
    const ids = { trace_id: 't1', span_id: 's1' }
    const sessions = buildSpanTree([
      record({ ts: 20, message: 'later', ctx: ids }),
      record({ ts: 10, message: 'earlier', ctx: ids }),
    ])

    expect(sessions[0]!.traces[0]!.roots[0]!.records.map((r) => r.message)).toEqual([
      'earlier',
      'later',
    ])
  })
})
