// @vitest-environment happy-dom
import { configure, resetTrace, trace } from '@cbcruk/console-trace'
import { connectPanelChannel } from 'devframe/in-page-channel'
import type { PanelChannel } from 'devframe/in-page-channel'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { mountTracePageScript } from '../src/page-script/page-script.ts'
import type { TracePageScriptHandle } from '../src/page-script/page-script.ts'
import { TRACE_CHANNEL } from '../src/protocol/protocol.ts'
import type { TraceChannelProtocol, TraceState } from '../src/protocol/protocol.types.ts'

let pageScript: TracePageScriptHandle
let panel: PanelChannel<TraceChannelProtocol>

async function connect(): Promise<() => TraceState> {
  pageScript = await mountTracePageScript({ throttleMs: 5 })
  const { port1, port2 } = new MessageChannel()
  pageScript.channel.addPanelPort(port1)
  panel = connectPanelChannel<TraceChannelProtocol>({
    name: TRACE_CHANNEL,
    transport: port2,
    functions: {},
    events: {},
  })
  const state = await panel.sharedState.get('state')
  return () => state.value() as TraceState
}

function until(check: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = (): void => {
      if (check()) return resolve()
      if (Date.now() - started > 2000) return reject(new Error('timed out waiting for the panel'))
      setTimeout(poll, 5)
    }
    poll()
  })
}

beforeEach(() => {
  resetTrace()
  configure({ enabled: true, retain: true, captureSource: false, projectRoot: null })
})

afterEach(() => {
  panel?.close()
  pageScript?.close()
})

describe('mountTracePageScript', () => {
  it('seeds a panel that connects after spans were recorded', async () => {
    trace('before-connect', () => {})

    const read = await connect()

    expect(read().spans.map((span) => span.name)).toEqual(['before-connect'])
  })

  it('streams spans recorded after the panel connected', async () => {
    const read = await connect()

    trace('checkout', () => {
      trace('payment', () => {})
    })

    await until(() => read().spans.length === 1)
    expect(read().spans[0]).toMatchObject({ name: 'checkout', children: [{ name: 'payment' }] })
  })

  it('clears the tree when a panel asks for a reset', async () => {
    trace('stale', () => {})
    const read = await connect()

    await panel.call('reset')

    await until(() => read().spans.length === 0)
    expect(read().spans).toEqual([])
  })

  it('stops publishing once closed', async () => {
    const read = await connect()
    pageScript.close()

    trace('after-close', () => {})
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(read().spans).toEqual([])
  })
})
