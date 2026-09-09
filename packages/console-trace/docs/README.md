# docs

Explanatory material for console-trace.

## [async-context.html](async-context.html) — interactive explainer

An interactive, step-through visualization of how the ambient span is
propagated. Open it in a browser and walk three scenarios side by side:

- **Sync nesting** — `run` installs and restores `current` in lockstep with the
  call stack, so every `log()` attaches correctly.
- **`await` · fallback** — a plain `await` returns control to `run` before the
  continuation runs, so its `finally` restores `current` too early and the log
  after the await leaks to the root.
- **`await` · native / runAsync** — a `Snapshot` captured at start is
  re-installed on every resume, so attribution stays exact.

Each step shows the `current` map, the call stack, and where each `log()` lands
(correct vs. leaked). It mirrors the real code in
[`async-context.ts`](../src/async-context/async-context.ts) and
[`async-awaiter.ts`](../src/async-awaiter/async-awaiter.ts).
