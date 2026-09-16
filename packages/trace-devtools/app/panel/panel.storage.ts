import type { PanelPrefs } from './panel.types.ts'

const STORAGE_KEY = 'console-trace:devtools'

function defaultPrefs(): PanelPrefs {
  return { levels: { debug: true, info: true, warn: true, error: true } }
}

/** Reads the saved level filter, falling back to everything on. */
export function loadPrefs(): PanelPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPrefs()
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>
    return { levels: { ...defaultPrefs().levels, ...parsed.levels } }
  } catch {
    return defaultPrefs()
  }
}

/** Saves the level filter. A full or blocked storage is ignored. */
export function savePrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    return
  }
}
