import { tracePlugin } from '@cbcruk/console-trace/vite-plugin-trace'
import { defineConfig } from 'vite-plus'
import { traceDevtoolsHub } from '../src/vite-plugin/vite-plugin.ts'

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [
    // Without native AsyncContext, the concurrent payment and inventory spans
    // would otherwise attach to the root instead of nesting under `checkout`.
    tracePlugin({ transform: true }),
    traceDevtoolsHub(),
  ],
})
