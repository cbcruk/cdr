import { logger, trace } from '../../src/index.ts'
import { processPayment } from './payment.ts'

export function checkout(cart: number[]): number {
  return trace('checkout', () => {
    logger.info('cart validated', cart.length)

    const subtotal = cart.reduce((sum, item) => sum + item, 0)

    return processPayment(subtotal)
  })
}
