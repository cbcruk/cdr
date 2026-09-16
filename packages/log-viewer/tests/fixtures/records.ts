import type { LogRecord } from 'cdr'

export function record(
  overrides: Omit<Partial<LogRecord>, 'ctx'> & { ctx?: Record<string, unknown> },
): LogRecord {
  const { ctx, ...rest } = overrides
  return {
    ts: 1_000,
    level: 'info',
    type: 'log',
    message: '',
    data: {},
    source: 'app',
    ...rest,
    ctx: { url: 'https://app.test/', sessionId: 'a', ...ctx },
  }
}
