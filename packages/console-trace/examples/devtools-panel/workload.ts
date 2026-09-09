import { logger, trace } from '../../src/index.ts'

// A small async workload with nested + concurrent spans, an await on every
// step, and an error branch — enough to exercise the devtools tree, timeline,
// and level filter. `trace`/`logger` read the ambient span, so nothing here
// threads a context argument.

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function validateCart(items: number[]): Promise<number> {
  return trace('validateCart', async () => {
    logger.debug('validating', items.length, 'items')
    await delay(120)

    const subtotal = items.reduce((sum, price) => sum + price, 0)

    logger.info('subtotal', subtotal)
    return subtotal
  })
}

function reserveInventory(items: number[]): Promise<void> {
  return trace('reserveInventory', async () => {
    logger.info('reserving', items.length, 'items')
    await delay(90)
    logger.debug('inventory reserved')
  })
}

function processPayment(amount: number): Promise<number> {
  return trace('processPayment', async () => {
    logger.info('charging', amount)
    await delay(180)

    if (amount > 100_000) {
      logger.error('payment declined — amount exceeds limit')
      throw new Error('payment declined')
    }

    const fee = Math.round(amount * 0.03)

    logger.info('fee computed', fee)
    return amount + fee
  })
}

export function runCheckout(items: number[]): Promise<void> {
  return trace('checkout', async () => {
    logger.info('checkout started', items.length, 'items')

    const subtotal = await validateCart(items)

    // Both spans open synchronously under `checkout`, then run concurrently.
    const [total] = await Promise.all([processPayment(subtotal), reserveInventory(items)])

    logger.info('order complete — total', total)
  }).catch((error: unknown) => {
    logger.warn('checkout failed:', error instanceof Error ? error.message : String(error))
  })
}
