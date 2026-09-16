import { configure, getRoot, log, resetTrace, trace } from '@cbcruk/console-trace'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { snapshotSpans } from '../src/snapshot/snapshot.ts'

beforeEach(() => {
  resetTrace()
  configure({ enabled: true, retain: true, captureSource: false, projectRoot: null })
})

describe('snapshotSpans', () => {
  it('copies the tree below the root, without the root itself', () => {
    trace('checkout', () => {
      log('info', 'cart', { items: 3 })
      trace('payment', () => {
        log('warn', 'retrying', new Error('timeout'))
      })
    })

    const [checkout] = snapshotSpans(getRoot(), 0)

    expect(checkout).toMatchObject({
      name: 'checkout',
      status: 'ok',
      logs: [{ level: 'info', message: 'cart {"items":3}' }],
      children: [{ name: 'payment', logs: [{ level: 'warn', message: 'retrying timeout' }] }],
    })
  })

  it('moves times onto the given origin so another document can read them', () => {
    trace('work', () => {})
    const span = getRoot().children[0]!

    const [snapshot] = snapshotSpans(getRoot(), 1_000_000)

    expect(snapshot!.start).toBe(1_000_000 + span.startTime)
    expect(snapshot!.end).toBe(1_000_000 + span.endTime!)
  })

  it('keeps a running span open', async () => {
    let finish!: () => void
    const pending = trace('slow', () => new Promise<void>((resolve) => (finish = resolve)))

    expect(snapshotSpans(getRoot(), 0)[0]).toMatchObject({ status: 'running', end: null })

    finish()
    await pending
  })

  it('produces something a MessagePort can carry', () => {
    trace('outer', () => {
      log('info', { nested: { fn: 'not cloneable' } }, Symbol.for('x').description)
      trace('inner', () => {})
    })

    const snapshot = snapshotSpans(getRoot(), 0)

    expect(structuredClone(snapshot)).toEqual(snapshot)
  })
})
