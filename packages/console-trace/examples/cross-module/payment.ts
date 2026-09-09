import { logger, trace } from '../../src/index.ts'

export function processPayment(amount: number): number {
  return trace('processPayment', () => {
    logger.info('charging', amount)

    const fee = Math.round(amount * 0.03)

    logger.info('fee computed', fee)
    return amount + fee
  })
}
