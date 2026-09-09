/** Options for `tracePlugin()`. */
export interface TracePluginOptions {
  /**
   * Absolute root that source links resolve against. Defaults to Vite's
   * `root`, falling back to the current working directory.
   */
  projectRoot?: string
  /**
   * Downlevel `async` functions onto `runAsync` so the ambient span survives
   * `await` in `fallback` mode.
   *
   * Requires `@babel/core`, an optional peer dependency, and is unnecessary in
   * `native` mode. Default `false`.
   *
   * The rewrite moves each `async` body into a generator, which rebinds what
   * the enclosing function provided. Four constructs are rejected with a
   * code-frame error rather than miscompiled: `super`, `new.target`, an async
   * arrow's `arguments`, and `for await...of`.
   */
  transform?: boolean
  /**
   * Module the injected `runAsync` import resolves to. Default
   * `'@cbcruk/console-trace'`; point it elsewhere when consuming the library through
   * an alias or straight from source.
   */
  importSource?: string
}

/** The slice of Vite's config the plugin reads while resolving the root. */
export interface ResolvableConfig {
  root?: string
}

/** Result of a transformed module. */
export interface TransformOutput {
  code: string
  /**
   * Always `null` — no source map is generated yet, so positions in
   * transformed files point at generated code.
   */
  map: null
}

/**
 * Structural type for the plugin, kept independent of Vite's own types so the
 * package does not depend on them.
 */
export interface TracePlugin {
  name: string
  enforce?: 'pre' | 'post'
  /** Defines `__TRACE_PROJECT_ROOT__` for `setupTrace` to pick up. */
  config(config: ResolvableConfig): {
    define: Record<string, string>
  }
  /** Returns `null` for modules left untouched, so Vite keeps the original. */
  transform?(code: string, id: string): Promise<TransformOutput | null> | TransformOutput | null
}
