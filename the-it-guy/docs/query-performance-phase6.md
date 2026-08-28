# Query Performance Phase 6

Phase 6 turns the scheduled Phase 5 check into steady-state regression
governance. Every six hours it compares the latest 24 hours with the preceding
24 hours, while still performing only one snapshot capture and two reads.

## Governance model

The monitor evaluates the existing Phase 4 absolute budgets for both periods,
then detects material increases in:

- requests per minute and route-load requests;
- idle requests, latency, errors, and peak Realtime channels;
- the busiest query ID's calls and execution time per hour;
- total tracked database execution time per hour.

Small absolute changes are ignored before percentage thresholds are applied so
low-volume noise does not create incidents. Failing regressions block the
workflow. Warnings require review, and missing current or baseline coverage
fails closed as `INSUFFICIENT_DATA`.

The evidence includes an incident title and remediation actions. GitHub renders
the same information in the job summary and retains the JSON and Markdown
artifacts for 90 days.

## Data and query overhead

Phase 6 replaces the Phase 5 command in the existing workflow; it does not add
another schedule. Each run performs:

1. one service-role-only snapshot RPC;
2. one telemetry read covering 48 hours;
3. one snapshot read returning at most ten six-hour snapshots, allowing for
   normal workflow scheduling jitter around the 48-hour boundary.

No raw SQL, bind values, user data, or credentials are included. The Phase 0
database table retains snapshots for 45 days, while GitHub retains the redacted
governance evidence for 90 days.

Run it manually with server-only credentials:

```sh
npm run monitor:query-performance-phase6 -- --strict --period-hours=24 --output=output/query-performance/phase6-latest.json --summary=output/query-performance/phase6-summary.md
```

The Phase 0 migration and telemetry deployment remain prerequisites. With a
six-hour schedule, full comparison coverage normally requires at least nine
well-spaced snapshots and sufficient sampled browser windows in both 24-hour periods.
