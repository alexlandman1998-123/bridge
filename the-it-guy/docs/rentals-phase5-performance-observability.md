# Rentals Phase 5 — Performance and Observability Foundation

Phase 5 makes performance measurable before introducing rental-owned data tables. It does not change Sales metrics, queries, permissions, routes or database policies.

## Metric catalogue and budgets

| Metric | Budget |
| --- | --- |
| `rentals.route.shell_ready` | 1.5 s, 8 requests, 500 KB transfer |
| `rentals.route.first_data` | 3 s, 12 requests, 800 KB transfer |
| `rentals.interaction.complete` | 150 ms |
| `rentals.query.complete` | 1 s, 250 KB payload |
| `rentals.job.complete` | 30 s |

`createRentalPerformanceTrace` samples only aggregate resource counts, transfer bytes and slowest request duration. It excludes the telemetry writes themselves and does not retain request URLs, query strings, personal data or provider tokens. The existing shared telemetry transport applies additional metadata redaction.

`persistRentalPerformanceSample` is non-blocking. It records a metric through the shared performance store and emits one warning event only when a budget is exceeded. Monitoring failure cannot block a rental command or page.

## Error classification

The existing application error boundary now labels errors inside Rentals with `scope: rentals_module`. This keeps failure telemetry separate from Sales without duplicating error-reporting infrastructure.

## Repeatable report and release gate

```bash
npm run test:rentals-phase5
npm run report:rentals-phase5 -- --samples=path/to/rental-performance-samples.json
npm run test:performance-budget
```

The report accepts a privacy-safe JSON array of Rental performance samples and produces p50/p95 duration, maximum request count, maximum payload size and pass/fail counts per metric. Phase 7 must call the trace at actual rental query, route-ready and job boundaries; until rental-owned tables exist, this phase intentionally does not invent synthetic database writes.
