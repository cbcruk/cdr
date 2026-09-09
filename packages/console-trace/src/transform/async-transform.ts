import type { NodePath, PluginObject, PluginPass, types as BabelTypes } from '@babel/core'

/**
 * Local identifier the transform binds `runAsync` to in each rewritten module.
 * Prefixed to avoid colliding with user code.
 */
export const HELPER_NAME = '__runAsync'

interface TransformResult {
  code: string
  transformed: boolean
}

interface BabelApi {
  types: typeof BabelTypes
}

/**
 * Babel plugin that downlevels `async` functions to generators driven by
 * `runAsync`, so the ambient span survives `await` in `fallback` mode.
 *
 * Each `async` function becomes a plain function returning
 * `__runAsync(this, arguments, void 0, function* () { ... })`, with its
 * `await` expressions rewritten to `yield`. Nested functions are skipped and
 * handled by their own visit, so each `await` binds to the right body. Async
 * generators are left alone; `for await...of` throws a code-frame error rather
 * than being miscompiled.
 *
 * Sets `traceTransformed` on the file metadata when it changed anything, so
 * callers can skip untouched modules.
 */
export function asyncToRunAsyncPlugin({ types }: BabelApi): PluginObject {
  const voidZero = (): BabelTypes.UnaryExpression =>
    types.unaryExpression('void', types.numericLiteral(0))

  const convertAwaits = (path: NodePath<BabelTypes.Function>): void => {
    path.traverse({
      Function(inner) {
        inner.skip()
      },
      AwaitExpression(awaitPath) {
        awaitPath.replaceWith(types.yieldExpression(awaitPath.node.argument, false))
      },
      ForOfStatement(forPath) {
        if (forPath.node.await) {
          throw forPath.buildCodeFrameError(
            'for await...of is not supported by the trace transform',
          )
        }
      },
    })
  }

  return {
    name: 'async-to-run-async',
    visitor: {
      Function: {
        exit(path: NodePath<BabelTypes.Function>, state: PluginPass): void {
          const node = path.node

          if (!node.async || node.generator) {
            return
          }

          convertAwaits(path)

          const isArrow = node.type === 'ArrowFunctionExpression'
          const argsArg = isArrow ? voidZero() : types.identifier('arguments')
          const blockBody = types.isBlockStatement(node.body)
            ? node.body
            : types.blockStatement([types.returnStatement(node.body)])

          const generator = types.functionExpression(null, [], blockBody, true)

          const call = types.callExpression(types.identifier(HELPER_NAME), [
            types.thisExpression(),
            argsArg,
            voidZero(),
            generator,
          ])

          node.async = false

          if (isArrow) {
            node.body = call
          } else {
            node.body = types.blockStatement([types.returnStatement(call)])
          }

          state.file.metadata = {
            ...state.file.metadata,
            traceTransformed: true,
          }
        },
      },
    },
  }
}

/**
 * Runs {@link asyncToRunAsyncPlugin} over a module.
 *
 * Babel is imported lazily and declared as an optional peer dependency, so it
 * is only required when the transform is actually enabled. Project Babel
 * config is ignored — TypeScript and JSX are parsed, nothing else is applied.
 *
 * Source maps are not generated yet, so positions point at transformed code.
 *
 * @returns The emitted code plus whether any `async` function was rewritten,
 * or `null` if Babel produced no output.
 */
export async function transformAsync(
  code: string,
  filename: string,
): Promise<TransformResult | null> {
  const babel = await import('@babel/core')

  const result = await babel.transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [asyncToRunAsyncPlugin],
  })

  if (!result?.code) {
    return null
  }

  const metadata = result.metadata as { traceTransformed?: boolean } | undefined

  return {
    code: result.code,
    transformed: metadata?.traceTransformed === true,
  }
}
