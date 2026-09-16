/** Renders one log argument as the overlay would show it. */
export function formatArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
