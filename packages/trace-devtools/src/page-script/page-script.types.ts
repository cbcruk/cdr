import type { PageScriptChannel } from 'devframe/in-page-channel'
import type { TraceChannelProtocol } from '../protocol/protocol.types.ts'

/** Options for {@link mountTracePageScript}. */
export interface TracePageScriptOptions {
  /**
   * Coalesce trace events for this many milliseconds before publishing.
   *
   * Every `trace()` and `log()` emits, and each publish copies the whole tree,
   * so a burst of work should cost one publish rather than one per call.
   * Default `50`.
   */
  throttleMs?: number
}

/** A mounted page script. */
export interface TracePageScriptHandle {
  /**
   * The underlying page-script endpoint, for custom transports such as
   * `addPanelPort` in tests.
   */
  channel: PageScriptChannel<TraceChannelProtocol>
  /** Stops listening to traces and disconnects every panel. */
  close(): void
}
