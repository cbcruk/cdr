import { fileURLToPath } from 'node:url'
import { tracePlugin } from '../../src/vite-plugin-trace/vite-plugin-trace.ts'

// Alias the bare `console-trace` specifier to the local source so the import
// the transform injects (`import { runAsync } from '@cbcruk/console-trace'`) resolves
// in this in-repo example without a build step. A real consumer installs the
// package and drops this alias.
const packageEntry = fileURLToPath(new URL('../../src/index.ts', import.meta.url))

export default {
  resolve: {
    alias: {
      '@cbcruk/console-trace': packageEntry,
    },
  },
  // `transform: true` downlevels async → runAsync so the fallback stays
  // accurate across `await` — nested/concurrent spans attach correctly even
  // when the browser has no native AsyncContext.
  plugins: [tracePlugin({ transform: true })],
}
