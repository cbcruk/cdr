import { HELPER_NAME, transformAsync } from '../transform/async-transform.ts'
import type {
  ResolvableConfig,
  TracePlugin,
  TracePluginOptions,
  TransformOutput,
} from './vite-plugin-trace.types.ts'

const TRANSFORMABLE = /\.[jt]sx?$/

function shouldTransform(id: string): boolean {
  return TRANSFORMABLE.test(id) && !id.includes('node_modules')
}

/**
 * Vite plugin that wires console-trace into the build.
 *
 * It always defines `__TRACE_PROJECT_ROOT__`, which `setupTrace` reads to turn
 * captured stack positions into `vscode://file/...` links. Tracing works
 * without the plugin — the links are simply disabled.
 *
 * Options:
 * - `projectRoot` — root used for source links. Defaults to Vite's `root`,
 *   falling back to the current working directory.
 * - `transform` — downlevel `async` functions onto `runAsync` so the ambient
 *   span survives `await` in `fallback` mode. Requires `@babel/core`, an
 *   optional peer dependency. Unnecessary in `native` mode. Default `false`.
 *   Rejects `super`, `new.target`, an async arrow's `arguments`, and
 *   `for await...of` rather than miscompiling them.
 * - `importSource` — module the injected `runAsync` import resolves to.
 *   Default `'@cbcruk/console-trace'`; point it elsewhere when consuming the library
 *   through an alias or from source.
 *
 * Only project `.js`/`.jsx`/`.ts`/`.tsx` files are transformed; dependencies
 * and modules that never mention `async` are skipped, as are files where no
 * `async` function was actually rewritten.
 */
export function tracePlugin(options: TracePluginOptions = {}): TracePlugin {
  const transformEnabled = options.transform ?? false
  const importSource = options.importSource ?? '@cbcruk/console-trace'

  return {
    name: 'vite-plugin-trace',
    enforce: 'pre',
    config(config: ResolvableConfig) {
      const root = options.projectRoot ?? config.root ?? process.cwd()

      return {
        define: {
          __TRACE_PROJECT_ROOT__: JSON.stringify(root),
        },
      }
    },
    async transform(code: string, id: string): Promise<TransformOutput | null> {
      if (!transformEnabled || !shouldTransform(id) || !code.includes('async')) {
        return null
      }

      const result = await transformAsync(code, id)

      if (!result?.transformed) {
        return null
      }

      const importLine = `import { runAsync as ${HELPER_NAME} } from '${importSource}'`

      return {
        code: `${importLine}\n${result.code}`,
        map: null,
      }
    },
  }
}
