# Query Performance Phase 5

Phase 5 operationalizes the Phase 4 release budget with a production monitor.
Its Phase 6 successor is what GitHub Actions now runs every six hours. Both capture one
`pg_stat_statements` snapshot, reads the existing sampled browser telemetry and
the latest two database snapshots, then uploads a JSON evidence artifact.

## Production setup

Configure these secrets on the protected `production` GitHub environment:

- `SUPABASE_PRODUCTION_URL`
- `SUPABASE_PRODUCTION_SERVICE_ROLE_KEY`

The service-role key is used only by the server-side workflow. It must never be
stored in a `VITE_` variable or sent to the browser.

The Phase 0 snapshot migration and telemetry deployment must exist before the
monitor can pass. It also needs at least 12 sampled windows from the previous 48
hours and two comparable database snapshots at least 15 minutes apart. The
first run will normally report `INSUFFICIENT_DATA`; a later run can become
`PASS` once coverage is complete.

## Failure and evidence behavior

The scheduled command is strict: `WARN`, `FAIL`, `INSUFFICIENT_DATA`, and
operational `ERROR` all fail the GitHub Actions job, making normal workflow
failure notifications available for alerting. The Phase 6 successor preserves
failed evidence and retains its JSON and Markdown artifacts for 90 days.

Snapshots contain query identifiers and aggregate counters only. They do not
contain SQL text, bind values, user data, or the service-role key.

Run the same monitor manually with server-only credentials:

```sh
npm run monitor:query-performance-phase5 -- --strict --hours=48 --output=output/query-performance/phase5-latest.json
```

Each run adds only one snapshot RPC and two reads. There is no browser timer,
database cron, or continuously running poller.
