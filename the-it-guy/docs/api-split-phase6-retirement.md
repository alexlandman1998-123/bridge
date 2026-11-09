# API caller migration and entry point retirement

`src/lib/api.js` is retired. Runtime callers import the owning feature module; the development, transaction, unit and client portal adapters select a module per operation, so one action does not preload every workflow.

The retirement guard now requires zero imports, verifies the old file stays absent, rejects dashboard facade consumers, checks the new extraction for cycles and limits each extracted module to 4,000 source lines:

```sh
node scripts/api-split-phase6-retirement.test.mjs
node scripts/api-split-phase1-inventory.test.mjs
node scripts/api-split-phase2-boundaries.test.mjs
npx vitest run src/lib/api/__tests__/apiExtraction.contract.test.js --maxWorkers=1 --no-file-parallelism
```

The domain contract records the owner of every historical public capability and hashes every declaration moved during final retirement. The earlier extraction contract remains in place. `scripts/helpers/domainApiSource.mjs` and `domainApiRuntime.mjs` support historical tests only; production code must not import them or restore an aggregate runtime barrel.

Keep new code under the owning domain. Keep shared read caches and invalidators bound to the same instances. Importing an action module must not send messages or mutate application data. Optional workflows run only after an explicit call.

This is a local source retirement, not evidence of production rollout or measured real-user performance. Production activation still requires the normal release checks and explicit release approval.
