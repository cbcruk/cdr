import { tracePlugin } from '@cbcruk/console-trace/vite-plugin-trace'
import { viteDevframeHub } from '@devframes/vite/hub'
import { defineConfig } from 'vite-plus'
import { createTraceDevframe } from '../src/devframe/devframe.ts'

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [
    // Without native AsyncContext, the concurrent payment and inventory spans
    // would otherwise attach to the root instead of nesting under `checkout`.
    tracePlugin({ transform: true }),
    viteDevframeHub({
      quiet: true,
      // A local playground: skip the one-time-code handshake.
      auth: false,
      devframes: [createTraceDevframe()],
    }),
  ],
})
