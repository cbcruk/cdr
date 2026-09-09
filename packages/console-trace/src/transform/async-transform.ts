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
 * generators are left alone.
 *
 * Because the body moves inside a new `function*`, anything bound by the
 * enclosing function is rebound: `super`, `new.target`, and an arrow's
 * `arguments`. Those, and `for await...of`, are rejected with a code-frame
 * error rather than miscompiled — `super` would otherwise emit a module that
 * does not parse, and the rest would read the wrong values in silence.
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
    })
  }

  /**
   * Rejects constructs the rewrite cannot carry into the generator body.
   *
   * The body moves inside a new `function*`, which rebinds `super`,
   * `arguments` and `new.target`. Left alone, `super` emits a module that will
   * not parse and the other two silently read the wrong values, so refuse the
   * file instead of handing back broken output.
   *
   * Arrow functions inherit all three from the enclosing function, so the walk
   * continues through them and stops at any other function, which rebinds them
   * on its own.
   */
  const assertSupported = (path: NodePath<BabelTypes.Function>, isArrow: boolean): void => {
    const reject = (at: NodePath, what: string): never => {
      throw at.buildCodeFrameError(`${what} is not supported by the trace transform`)
    }

    path.traverse({
      Function(inner) {
        if (!inner.isArrowFunctionExpression()) {
          inner.skip()
        }
      },
      ForOfStatement(forPath) {
        if (forPath.node.await) {
          reject(forPath, 'for await...of')
        }
      },
      Super(superPath) {
        reject(superPath, 'super in an async function')
      },
      MetaProperty(metaPath) {
        if (metaPath.node.meta.name === 'new' && metaPath.node.property.name === 'target') {
          reject(metaPath, 'new.target in an async function')
        }
      },
      Identifier(idPath) {
        // A normal function forwards its own `arguments` through `runAsync`, so
        // only an arrow, which has none to forward, reads the wrong object. A
        // local binding of that name is the user's own variable, not the object.
        if (!isArrow || idPath.node.name !== 'arguments') {
          return
        }

        if (idPath.isReferencedIdentifier() && idPath.scope.getBinding('arguments') === undefined) {
          reject(idPath, 'arguments in an async arrow function')
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

          const isArrow = node.type === 'ArrowFunctionExpression'

          assertSupported(path, isArrow)
          convertAwaits(path)

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
