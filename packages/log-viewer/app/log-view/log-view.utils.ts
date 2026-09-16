import type { LogLevel, LogRecord } from 'cdr'
import type { SpanNode } from '../../src/span-tree/span-tree.ts'

/** 심각도 오름차순 레벨 목록. */
export const LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']

const LEVEL_ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }

/** 태그와 속성, 텍스트로 요소 하나를 만든다. */
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

/** 개수와 단위를 `1 record` / `2 records`처럼 붙인다. */
export function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** 레코드 시각을 `HH:MM:SS.mmm`으로 적는다. */
export function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23)
}

/** 레벨별 레코드 수를 센다. 없는 레벨은 0. */
export function countByLevel(records: readonly LogRecord[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 }
  for (const record of records) counts[record.level] += 1
  return counts
}

/** span과 그 자손에 담긴 레코드 수를 센다. */
export function countSpanRecords(span: SpanNode): number {
  return span.children.reduce((sum, child) => sum + countSpanRecords(child), span.records.length)
}

/**
 * span과 그 자손 중 가장 높은 레벨을 돌려준다.
 *
 * @returns 레코드가 하나도 없으면 `null`.
 */
export function worstLevel(span: SpanNode): LogLevel | null {
  let worst: LogLevel | null = null
  for (const record of span.records) {
    if (worst === null || LEVEL_ORDER[record.level] > LEVEL_ORDER[worst]) worst = record.level
  }
  for (const child of span.children) {
    const level = worstLevel(child)
    if (level !== null && (worst === null || LEVEL_ORDER[level] > LEVEL_ORDER[worst])) worst = level
  }
  return worst
}
