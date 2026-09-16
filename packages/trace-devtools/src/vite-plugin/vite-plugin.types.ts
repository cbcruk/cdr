/** Options for {@link traceDevtoolsHub}. */
export interface TraceDevtoolsHubOptions {
  /**
   * Also bake the hub into `vite build` output, so the deployed app carries the
   * dock. Default `false`.
   *
   * Only the page script and the panel run there, over the in-page channel, so
   * nothing is lost without a server.
   */
  build?: boolean
}
