import type { SpanSnapshot } from '../../src/protocol/protocol.types.ts'
import type { FlatSpan } from './panel.types.ts'

/** Creates an element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Lists spans depth-first, the order the master list shows them in. */
export function flatten(spans: readonly SpanSnapshot[]): FlatSpan[] {
  const out: FlatSpan[] = []
  const walk = (list: readonly SpanSnapshot[], depth: number, path: string[]): void => {
    for (const span of list) {
      out.push({ span, depth, path })
      walk(span.children, depth + 1, [...path, span.name])
    }
  }
  walk(spans, 0, [])
  return out
}

/**
 * Milliseconds a span took, or has taken so far.
 *
 * @param now Epoch milliseconds used as the end of a running span.
 */
export function duration(span: SpanSnapshot, now: number): number {
  return (span.end ?? now) - span.start
}

/**
 * The window the timeline bars are drawn against.
 *
 * @returns Epoch start and length in milliseconds; the length is at least 1.
 */
export function timelineWindow(
  spans: readonly SpanSnapshot[],
  now: number,
): { start: number; length: number } {
  if (spans.length === 0) return { start: now, length: 1 }
  const start = Math.min(...spans.map((span) => span.start))
  const end = Math.max(...flatten(spans).map(({ span }) => span.end ?? now))
  return { start, length: Math.max(end - start, 1) }
}
