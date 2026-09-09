# Roadmap / TODO

Future directions for console-trace. None are committed work — they are noted
here so the next session has context.

## Babel transform

- **Source maps.** The transform currently returns `map: null` in
  [vite-plugin-trace.ts](src/vite-plugin-trace/vite-plugin-trace.ts), so stack
  traces and the overlay's `source` point at transformed code. Generate a
  source map from Babel (`sourceMaps: true`) and thread it through the Vite
  `transform` result.
- **Async generators.** `async function*` is skipped today
  ([async-transform.ts](src/transform/async-transform.ts)). Decide whether to
  support it or keep it explicitly unsupported.
- **`for await...of`.** Currently rejected with a clear error. Lowering it to a
  manual iterator + `yield` would lift the restriction.
- **`super` in an async method.** Currently rejected. TypeScript lifts the same
  restriction by capturing a `_super` binding outside the generator; the same
  trick would work here. Rejected first because the old behaviour emitted a
  module that would not parse.

## Transport

- **Batching / sampling.** `installTransport`
  ([trace-transport.ts](src/trace-transport/trace-transport.ts)) fires one
  network-shaped call per span. Add a buffered transport (flush on interval /
  size) and head-based sampling by `trace_id`.
- **Span start events.** Only `span:end` is emitted. Some backends want a
  `span:start` event for long-running spans.

## Overlay

- **Search / filter by name.** Add a text filter over span names alongside the
  level filter.
- **Drag + resize, persisted.** Let the panel be moved/resized and persist its
  geometry next to the collapse/level state in
  [trace-overlay.storage.ts](src/trace-overlay/trace-overlay.storage.ts).

## Devtools

- **Browser-extension devtools panel.** The
  [devtools-panel example](examples/devtools-panel/) renders a
  TanStack-Devtools-style UI in-page on the public API. A natural extension is
  to move it into a real browser devtools panel (a `chrome.devtools`/WebExtension
  front-end that subscribes to the same span stream), so the trace tree lives in
  DevTools rather than overlaying the app. Deferred — not committed work.

## Node / terminal

The engine (`async-context` / `trace-log` / `trace-transport`) is
environment-agnostic; only the _presentation_ is browser-shaped today. Split
the two problems when bringing this to Node:

- **Capture is easier in Node, not harder.** The fallback + Babel transform
  exist only because the browser has no native `AsyncContext` yet. Node's
  `AsyncLocalStorage` (`node:async_hooks`, stable) gives the same guarantees
  across `await`. Add an `AsyncLocalStorage` adapter in
  [async-context.ts](src/async-context/async-context.ts) (`run`→`als.run`,
  `get`→`als.getStore`, `Snapshot`→`als.snapshot()`), so Node runs in `native`
  mode and needs **no transform**. `resolveNative()` only checks
  `globalThis.AsyncContext` today.
- **In Node the answer is a data format, not a UI.** Lean on the existing
  `WideEvent` (already OpenTelemetry-shaped: `trace_id` / `span_id` /
  `parent_id`). Ship a pretty-printing **console exporter** and an **OTLP
  adapter** so traces flow into the terminal / Jaeger / Tempo / Honeycomb
  instead of rebuilding an overlay.
- **Batch tree printer (dev, low-cost, high-value).** Grow
  [`replayToConsole`](src/trace-overlay/trace-overlay.ts) into the terminal
  analog of the overlay: box-drawing (`├─ └─`), ANSI colors for status/level,
  per-span timings, and **OSC 8 hyperlinks** so the `vscode://` jump-to-source
  survives in terminals that support it (iTerm2, WezTerm, the VS Code
  integrated terminal). Write to `stderr` to avoid fighting app `stdout`.
- **Live TUI (deferred, high-cost).** A real in-terminal live tree
  (alternate-screen buffer + cursor control, or Ink / listr2) is possible but
  the least necessary — the console exporter + batch printer cover most needs,
  and it has to manage stdout contention. Revisit only on demand.

## Validation

- Run the engine in a real app to confirm whether the `fallback` mode
  concurrency limit actually bites before investing further in the transform.
  Cheap to do now: the `cdr` demo in this repository is a real app, so enabling
  `tracePlugin({ transform: true })` there and clicking through would show how
  many records are written after an `await` and whether losing their
  attribution actually hurts. Source maps are the expensive item and are worth
  deferring until that question is answered — deleting the transform is a live
  outcome.
