import { resolve } from 'node:path'
import { DEVFRAMES_HUB_BASE } from '@devframes/hub/constants'
import type { DevframeHubUi } from '@devframes/hub/initiate'
import { viteDevframeHub } from '@devframes/vite/hub'
import type { Plugin, ResolvedConfig } from 'vite-plus'
import { createTraceDevframe } from '../devframe/devframe.ts'
import type { TraceDevtoolsHubOptions } from './vite-plugin.types.ts'

export type { TraceDevtoolsHubOptions } from './vite-plugin.types.ts'

const HUB_DIR = DEVFRAMES_HUB_BASE.replace(/^\/|\/$/g, '')

function staticHub(): Plugin {
  let config: ResolvedConfig | undefined
  let ui: DevframeHubUi | undefined

  const hubBase = (): string => `${config?.base ?? '/'}${HUB_DIR}/`

  return {
    name: 'console-trace-devtools:static-hub',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async buildStart() {
      const { createUi } = await import('@devframes/hub-ui')
      ui = createUi()
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `${hubBase()}embedded.js` },
          injectTo: 'body',
        },
      ]
    },
    async closeBundle() {
      if (!config) return
      const { buildHub } = await import('@devframes/hub/build')
      await buildHub({
        base: hubBase(),
        cwd: config.root,
        outDir: resolve(config.root, config.build.outDir, HUB_DIR),
        devframes: [createTraceDevframe()],
        ...(ui ? { ui } : {}),
      })
    },
  }
}

/**
 * Mounts a Devframe hub with the console-trace dock on the Vite dev server,
 * and optionally in the build.
 *
 * `viteDevframeHub({ build: true })` bakes the hub, but at a fixed
 * `/__devframes/` whatever Vite's `base` is. Under a sub-path deploy such as
 * GitHub Pages, the embedded script and the dock iframe then point outside the
 * site and 404. This builds the same hub with `buildHub` at `<base>__devframes/`
 * and writes it to `<outDir>/__devframes/`, where that URL resolves.
 *
 * `base` must be absolute (`/` or `/repo/`). A relative `./` base has no
 * single URL the baked dock entries could point at.
 *
 * The hub's one-time-code auth is off, so bind the dev server to localhost.
 *
 * @example
 * ```ts
 * import { traceDevtoolsHub } from '@cbcruk/console-trace-devtools/vite'
 * import { defineConfig } from 'vite'
 *
 * export default defineConfig({
 *   plugins: [traceDevtoolsHub({ build: true })],
 * })
 * ```
 */
export function traceDevtoolsHub(options: TraceDevtoolsHubOptions = {}): Plugin[] {
  const dev = viteDevframeHub({
    quiet: true,
    auth: false,
    devframes: [createTraceDevframe()],
  })
  return options.build ? [dev, staticHub()] : [dev]
}
