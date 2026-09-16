export type {
  LogSnapshot,
  SourceSnapshot,
  SpanSnapshot,
  TraceChannelProtocol,
  TraceState,
} from './protocol.types.ts'

/** Id of the devframe, and so the default dock id. */
export const TRACE_DEVFRAME_ID = 'console-trace'

/** In-page channel name, namespaced with the devframe id. */
export const TRACE_CHANNEL = `${TRACE_DEVFRAME_ID}:devtools`
