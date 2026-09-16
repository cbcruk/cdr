import { setupTrace } from '@cbcruk/console-trace'
import { mountTracePageScript } from '../src/page-script/page-script.ts'
import { runCheckout } from './workload.ts'

setupTrace({ overlay: false })
await mountTracePageScript()

const cart = [12_000, 8_000, 45_000]
const bigCart = [80_000, 40_000]

document.querySelector('#run')?.addEventListener('click', () => {
  void runCheckout(cart)
})

document.querySelector('#run-fail')?.addEventListener('click', () => {
  void runCheckout(bigCart)
})

void runCheckout(cart)
