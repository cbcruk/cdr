# Example: devtools panel

A TanStack-Devtools-style interface for `console-trace`, built **entirely on the
public API** — `subscribe` for live updates, `getRoot` to walk the span tree,
and `resetTrace` to clear. Nothing in [`devtools.ts`](./devtools.ts) reaches
into library internals, so it doubles as a template for your own devtools.

```bash
vp dev
```

Then open the served URL and click the **trace** launcher (bottom-right).

## What it shows

- **Floating launcher → docked panel.** Collapsed to a pill button with a live
  span count; click to expand a bottom-docked panel. The open/closed state and
  level filters are persisted to `localStorage`.
- **Master / detail layout.** The span tree on the left; select a span to
  inspect its status, duration, timeline bar, source link, and logs on the
  right.
- **Level filter.** Toggle `debug` / `info` / `warn` / `error`; the detail pane
  respects the selection.
- **Live updates.** The panel re-renders (rAF-throttled) as traced work runs.

The two buttons drive a traced `checkout` workload
([`workload.ts`](./workload.ts)) with nested and concurrent spans. The failing
run overflows the payment limit, producing an `error` span and a `warn` log so
you can see the non-happy path.

## How it differs from the built-in overlay

`setupTrace({ overlay: false })` disables the bundled overlay so this example
can mount its own UI. The built-in overlay ([`trace-overlay`](../../src/trace-overlay/trace-overlay.ts))
is an always-on tree; this panel adds the launcher + master/detail shape you
expect from framework devtools. Both read the same span tree through the same
public API.

## Accuracy across `await`

This example enables the Babel transform (`tracePlugin({ transform: true })` in
[`vite.config.ts`](./vite.config.ts)) so the `fallback` context mode stays
accurate across `await` — otherwise, in a browser without native
`AsyncContext`, the concurrent `processPayment` / `reserveInventory` spans would
attach to the root instead of nesting under `checkout`. The header badge shows
which mode is active (`native` vs `fallback`).
