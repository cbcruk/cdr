import { asyncContextMode, getRoot, resetTrace, subscribe } from '@cbcruk/console-trace'
import { createPageScriptChannel } from 'devframe/in-page-channel'
import { TRACE_CHANNEL } from '../protocol/protocol.ts'
import type { TraceChannelProtocol, TraceState } from '../protocol/protocol.types.ts'
import { snapshotSpans } from '../snapshot/snapshot.ts'
import type { TracePageScriptHandle, TracePageScriptOptions } from './page-script.types.ts'

export { TRACE_CHANNEL, TRACE_DEVFRAME_ID } from '../protocol/protocol.ts'
export type {
  LogSnapshot,
  SourceSnapshot,
  SpanSnapshot,
  TraceChannelProtocol,
  TraceState,
} from '../protocol/protocol.types.ts'
export type { TracePageScriptHandle, TracePageScriptOptions } from './page-script.types.ts'

function currentState(): TraceState {
  return { mode: asyncContextMode, spans: snapshotSpans(getRoot(), performance.timeOrigin) }
}

/**
 * Streams the live span tree to console-trace devtools panels.
 *
 * Call it from the app, next to `setupTrace()`. It has to run in the page
 * whose spans it reports: the tree lives in that page's copy of
 * console-trace, so a script loaded any other way would watch an empty one.
 *
 * Panels find it through Devframe's same-origin in-page channel, so there is
 * no server involved and boot order does not matter. The page script owns the
 * state; a panel that opens late, or reloads, is seeded with the current tree.
 *
 * Only public console-trace API is used, so this doubles as a template for
 * other front-ends.
 *
 * @example
 * ```ts
 * import { setupTrace } from '@cbcruk/console-trace'
 * import { mountTracePageScript } from '@cbcruk/console-trace-devtools'
 *
 * setupTrace({ overlay: false })
 * mountTracePageScript()
 * ```
 */
export async function mountTracePageScript(
  options: TracePageScriptOptions = {},
): Promise<TracePageScriptHandle> {
  const throttleMs = options.throttleMs ?? 50

  const channel = createPageScriptChannel<TraceChannelProtocol>({
    name: TRACE_CHANNEL,
    functions: {
      reset: {
        type: 'action',
        handler: () => {
          resetTrace()
          publish()
        },
      },
    },
    events: {},
  })

  const state = await channel.sharedState.get('state', { initialValue: currentState() })
  let timer: ReturnType<typeof setTimeout> | null = null

  function publish(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    const next = currentState()
    state.mutate((draft) => {
      draft.mode = next.mode
      draft.spans = next.spans
    })
  }

  const unsubscribe = subscribe(() => {
    if (timer === null) timer = setTimeout(publish, throttleMs)
  })

  return {
    channel,
    close(): void {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
      channel.close()
    },
  }
}
