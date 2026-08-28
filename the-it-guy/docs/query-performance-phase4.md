# Query Performance Phase 4

Phase 4 prevents the query-volume improvements from silently regressing. It
classifies each existing sampled telemetry window without making another
request, and provides a manual release gate across browser request volume,
latency, errors, Realtime channels, and `pg_stat_statements` snapshot deltas.

## Release gate

The strict gate requires:

- at least 12 sampled windows from the last 48 hours;
- two comparable database snapshots at least 15 minutes apart;
- no failing telemetry or database budget.

Generate database snapshots with the Phase 0 report at least 15 minutes apart:

```sh
npm run report:query-baseline-phase0 -- --hours=48
```

Then run the gate with server-only credentials:

```sh
npm run verify:query-performance-phase4 -- --hours=48
```

The command exits non-zero for `WARN`, `FAIL`, or `INSUFFICIENT_DATA`. The
service-role key must never be exposed through a `VITE_` variable or browser
bundle.

Phase 4 does not create a timer, cron job, database trigger, or background
poller. Automation can invoke the strict command in an existing deployment
workflow once Phase 0 telemetry is deployed and has enough coverage.
