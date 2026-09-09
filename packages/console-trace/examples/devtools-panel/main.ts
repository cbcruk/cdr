import { setupTrace } from '../../src/index.ts'
import { mountDevtools } from './devtools.ts'
import { runCheckout } from './workload.ts'

// Disable the built-in overlay — this example mounts its own devtools UI
// instead, to show that the public API is enough to build one.
setupTrace({ overlay: false })

mountDevtools()

const cart = [12_000, 8_000, 45_000]
const bigCart = [80_000, 40_000]

const run = document.querySelector('#run')
const runFail = document.querySelector('#run-fail')

run?.addEventListener('click', () => {
  void runCheckout(cart)
})

runFail?.addEventListener('click', () => {
  void runCheckout(bigCart)
})

// Kick off one run on load so the panel has something to show.
void runCheckout(cart)
