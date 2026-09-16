import { connectPanelChannel } from 'devframe/in-page-channel'
import { TRACE_CHANNEL } from '../src/protocol/protocol.ts'
import type { TraceChannelProtocol, TraceState } from '../src/protocol/protocol.types.ts'
import { mountPanel } from './panel/panel.ts'
import type { PanelConnection } from './panel/panel.ts'
import './style.css'

const PAGE_SCRIPT_TIMEOUT_MS = 3000

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('#app mount node missing from index.html')

const channel = connectPanelChannel<TraceChannelProtocol>({
  name: TRACE_CHANNEL,
  functions: {},
  events: {},
})

let state: TraceState | null = null
let connection: PanelConnection = 'connecting'

const panel = mountPanel(root, {
  onReset: () => void channel.call('reset'),
})

channel.events.on('status:updated', (status) => {
  connection = status === 'connected' ? 'connected' : 'connecting'
  panel.update(state, connection)
})

channel.whenConnected(PAGE_SCRIPT_TIMEOUT_MS).catch(() => {
  if (channel.status !== 'connected') {
    connection = 'missing'
    panel.update(state, connection)
  }
})

void channel.sharedState.get('state').then((shared) => {
  const apply = (value: TraceState): void => {
    state = value
    panel.update(state, connection)
  }
  apply(shared.value() as TraceState)
  shared.on('updated', (full) => apply(full))
})
