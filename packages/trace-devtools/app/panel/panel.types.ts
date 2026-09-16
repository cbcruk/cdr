import type { LogLevel } from '@cbcruk/console-trace'
import type { SpanSnapshot, TraceState } from '../../src/protocol/protocol.types.ts'

/** Viewer choices that survive a panel reload. */
export interface PanelPrefs {
  levels: Record<LogLevel, boolean>
}

/** A span placed in the flattened master list. */
export interface FlatSpan {
  span: SpanSnapshot
  depth: number
  /** Names of the enclosing spans, outermost first. */
  path: string[]
}

/** Where the connection to the page script stands. */
export type PanelConnection = 'connecting' | 'connected' | 'missing'

/** What the panel needs from its host. */
export interface PanelOptions {
  /** Asks the page script to drop every span. */
  onReset(): void
}

/** A mounted panel. */
export interface PanelHandle {
  /** Re-renders with the latest tree, or `null` before the first one arrives. */
  update(state: TraceState | null, connection: PanelConnection): void
}
