# Rentals Phase 4 — Event, Outbox and Job Foundation

Phase 4 adds the code-level contract for reliable rental background work. It remains inert: it creates no database table, sends no notification, calls no integration and changes no Sales object or policy.

## Delivery model

A future rental command uses `commitRentalCommandWithOutbox` with one database transaction adapter. The adapter executes the domain mutation and inserts matching `rental_event_outbox` rows through the same transaction object. If either part fails, neither may commit.

Events are delivered at least once. A consumer records a receipt under:

```text
<consumer name>:<business idempotency key>
```

Redelivery detects the receipt and completes without repeating the consumer's business effect. “Exactly once” therefore means at-least-once transport plus idempotent business consumers; it does not claim impossible exactly-once provider delivery.

## States

```text
pending → processing → completed
                    ↘ retry_scheduled → processing
                    ↘ dead_letter
```

Every attempt increments `attempts`. Failures are scheduled until `maxAttempts`; poison events become `dead_letter` and are not silently discarded.

## Phase 7 database handoff

Introduce rental-owned `rental_event_outbox`, `rental_event_consumer_receipts` and `rental_job_runs` in the same expand-first migration as the first emitting command. Enable RLS and apply the Phase 3 organisation/branch/assigned-user contract. Worker-only mutations go through a server-side worker boundary—never a browser-held service-role key. The receipt table needs a unique `(consumer_name, idempotency_key)` constraint and event claims must be atomic.

## Verification

`npm run test:rentals-phase4` covers duplicate delivery, scheduled retry, poison-event dead-lettering and transaction rollback. Live queue/provider tests remain correctly deferred until the Phase 7 migration and worker rollout.
