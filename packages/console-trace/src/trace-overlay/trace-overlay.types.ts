import type { LogLevel } from '../trace-log/trace-log.types.ts'

/** Overlay view state, persisted to `localStorage` across reloads. */
export interface OverlayState {
  /**
   * Collapsed spans, keyed by tree path rather than span id, so the same
   * branch stays folded as new spans take the old ones' place.
   */
  collapsed: Record<string, boolean>
  /** Which levels to show. Filtering hides entries; it does not drop them. */
  levels: Record<LogLevel, boolean>
}

/** Controls a mounted overlay. */
export interface OverlayHandle {
  /** Removes the panel and stops listening. Safe to call more than once. */
  unmount(): void
}
