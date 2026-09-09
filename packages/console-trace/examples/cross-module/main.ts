import { getRoot, setupTrace } from '../../src/index.ts'
import { checkout } from './checkout.ts'

setupTrace({ projectRoot: process.cwd() })

const total = checkout([1200, 800, 4500])

console.log('total:', total)
console.log('root span children:', getRoot().children.length)
