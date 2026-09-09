import type { LogLevel } from '../trace-log/trace-log.types.ts'
import type { OverlayState } from './trace-overlay.types.ts'

const STORAGE_KEY = 'console-trace:overlay'

/** Every log level, in ascending severity — the order filters render in. */
export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Builds the initial overlay state: nothing collapsed, every level shown. */
export function defaultState(): OverlayState {
  return {
    collapsed: {},
    levels: { debug: true, info: true, warn: true, error: true },
  }
}

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/**
 * Reads the persisted overlay state, merging it over the defaults so state
 * written by an older version stays usable.
 *
 * Falls back to {@link defaultState} when storage is unavailable, empty, or
 * holds unparseable data.
 */
export function loadState(): OverlayState {
  const fallback = defaultState()
  const raw = store()?.getItem(STORAGE_KEY)

  if (!raw) {
    return fallback
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OverlayState>

    return {
      collapsed: parsed.collapsed ?? fallback.collapsed,
      levels: { ...fallback.levels, ...parsed.levels },
    }
  } catch {
    return fallback
  }
}

/**
 * Persists the overlay state. Storage failures (disabled, full, private mode)
 * are swallowed — the overlay keeps working, it just will not remember.
 */
export function saveState(state: OverlayState): void {
  try {
    store()?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota or serialization failures
  }
}
