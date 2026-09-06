# Agent module Phase 3 — slow-screen performance

Phase 3 improves the two slowest list surfaces identified by the agent baseline: Listings and Canvassing. It does not change `src/lib/api.js`; transaction and lead-detail API work remains outside this phase.

## Listings

The route now:

- uses the selected workspace immediately and fetches lightweight listing summaries first;
- publishes usable listing cards before membership, transaction, development and detailed listing hydration completes;
- keeps detailed hydration failure non-fatal so summary rows remain visible;
- distinguishes `core_ready` from `settled` performance milestones;
- defers off-screen card layout and paint with `content-visibility`.

## Canvassing

The route now:

- uses the selected workspace before falling back to organisation settings;
- publishes prospects and activities before loading directory users and listing options;
- loads listing summaries rather than complete listing workspaces;
- disables write actions until workspace resolution completes;
- limits blocking loading UI to the prospect detail workspace;
- defers off-screen prospect layout and paint.

## Enforced budgets

The existing performance collector evaluates cold and warm samples separately. The Phase 3 targets are:

| Milestone | p95 budget |
| --- | ---: |
| Instrumented shell ready | 1,500 ms |
| List core ready | 2,500 ms |
| List secondary data settled | 5,000 ms |

A real performance decision requires at least 20 cold and 20 warm samples for each checkpoint. Missing samples are reported as `INSUFFICIENT_DATA`, never as a pass.

## Verification

From `the-it-guy/` run:

```sh
npm run test:agent-phase3-performance
npm run verify:agent-phase3
```

To produce a report from deployed telemetry, provide the configured Supabase environment variables and run:

```sh
npm run report:agent-performance-baseline
```

The report writes JSON evidence to `output/agent-performance-baseline.json` and a readable summary to `docs/agent-performance-baseline.md`.
