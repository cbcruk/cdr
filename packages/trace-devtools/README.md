# console-trace devtools

The console-trace span tree as a [Devframe](https://devfra.me) dock: pick a
span to see its timing, source link, and logs, live as traced work runs.

It replaces the hand-built `examples/devtools-panel` in console-trace. The
launcher, docking, and resizing now come from the hub, so this package only
carries the data and the view.

> Private workspace package, not published.

## How it fits together

```
app page                                   hub dock iframe
─────────────────────────────              ─────────────────────────
console-trace (span tree)                  panel (app/)
   │ subscribe / getRoot                      ▲
   ▼                                          │ shared state: TraceState
mountTracePageScript() ── in-page channel ────┘
   ▲                                          │ call: reset
   └──────────────────────────────────────────┘
```

- **Page script** (`src/page-script`). Runs in the app, snapshots the tree
  into clonable data, and owns it as the channel's shared state. It uses only
  console-trace's public API.
- **Panel** (`app/`). A plain DOM view that mirrors that state. A panel
  opening late or reloading is seeded with the current tree.
- **Devframe** (`src/devframe`). Registers the built panel as a dock. It has
  no RPC; nothing here needs a server.

### Why the app mounts the page script

A dock can declare a client script for the hub to load, but that script would
get its own copy of console-trace and watch an empty tree. The spans live in
the module instance the app imported, so the app starts the page script
itself.

## Use

```ts
// app entry
import { setupTrace } from '@cbcruk/console-trace'
import { mountTracePageScript } from '@cbcruk/console-trace-devtools'

setupTrace({ overlay: false })
await mountTracePageScript()
```

```ts
// vite.config.ts
import { traceDevtoolsHub } from '@cbcruk/console-trace-devtools/vite'

export default defineConfig({
  plugins: [traceDevtoolsHub()],
})
```

`traceDevtoolsHub({ build: true })` also bakes the hub into `vite build`
output, so a deployed app carries the dock. Use it rather than
`viteDevframeHub({ build: true })` when the app is served under a sub-path
such as GitHub Pages' `/repo/`: that plugin bakes the hub at a fixed
`/__devframes/`, so the embedded script and the dock iframe point outside the
site. This one builds at `<base>__devframes/`. `base` must be absolute.

To mount the dock into a hub you assemble yourself, pass
`createTraceDevframe()` from `@cbcruk/console-trace-devtools/devframe`.

Build the panel once before a hub serves it:

```bash
pnpm -C packages/trace-devtools build
```

Unless the build carries the hub, gate `mountTracePageScript()` to development yourself (for example behind
`import.meta.env.DEV`). It adds a listener to every trace event and copies the
tree on each publish, which is not free on a busy page.

## Playground

```bash
pnpm -C packages/trace-devtools dev
```

Builds the panel, then serves the checkout workload with the hub mounted. Open
the dock from the rail at the bottom-left. The playground turns off the hub's
one-time-code auth, since it only listens on localhost.

## Notes

- Updates are coalesced (`throttleMs`, default 50) because each publish copies
  the whole tree. A burst of spans costs one publish.
- Times cross as epoch milliseconds. The panel is another document with its own
  `performance.timeOrigin`, so page-relative times would be wrong there.
- Each span carries the `trace_id` / `span_id` that `spanContext()` stamps onto
  records, shown in the detail pane, so a record kept elsewhere (cdr's IndexedDB,
  for one) can be matched back to the span it came from.
- The level filter persists in the panel's `localStorage`; selection does not.

## Development

```bash
pnpm -C packages/trace-devtools test       # snapshot + page script ↔ panel over a real channel
pnpm -C packages/trace-devtools typecheck
```
