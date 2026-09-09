# Example: cross-module tracing

`checkout.ts` opens a `checkout` span and calls `processPayment` from a separate
module. Because `trace()`/`logger` read the ambient span, the payment span and
its logs attach under `checkout` with **no context argument threading**.

```bash
node examples/cross-module/main.ts
```

In a non-browser run the overlay is skipped; the tree is replayed through
`console.group` when the root span completes.

The calls here are synchronous, so the tree is exact in any mode. For the
`await` caveat in `fallback` mode — and how `runAsync` fixes it — see
`tests/fallback-await.test.ts`.
