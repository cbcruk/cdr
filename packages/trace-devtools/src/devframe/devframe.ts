import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import type { DevframeDefinition } from 'devframe/types'
import { TRACE_DEVFRAME_ID } from '../protocol/protocol.ts'

const PANEL_DIST = fileURLToPath(new URL('../../dist/panel', import.meta.url))

/**
 * Creates the devframe that docks the console-trace panel into a hub.
 *
 * The definition carries no RPC. The panel reads everything from the page
 * script over the in-page channel, so the same built panel works under a
 * live hub and in a static hub build alike. The page script is not declared
 * as a dock client script, because it must share the app's module instance;
 * the app mounts it with `mountTracePageScript()`.
 *
 * The panel must be built first (`pnpm -C packages/trace-devtools build`).
 *
 * @example
 * ```ts
 * import { createTraceDevframe } from '@cbcruk/console-trace-devtools/devframe'
 * import { viteDevframeHub } from '@devframes/vite/hub'
 * import { defineConfig } from 'vite'
 *
 * export default defineConfig({
 *   plugins: [viteDevframeHub({ devframes: [createTraceDevframe()] })],
 * })
 * ```
 */
export function createTraceDevframe(): DevframeDefinition {
  return defineDevframe({
    id: TRACE_DEVFRAME_ID,
    name: 'console-trace',
    version: '0.1.0',
    packageName: '@cbcruk/console-trace-devtools',
    homepage: 'https://github.com/cbcruk/cdr',
    description: 'Live span tree from console-trace, with timing, source links, and logs.',
    icon: 'ph:tree-structure-duotone',
    importMetaUrl: import.meta.url,
    clientAssets: PANEL_DIST,
    setup() {},
  })
}
