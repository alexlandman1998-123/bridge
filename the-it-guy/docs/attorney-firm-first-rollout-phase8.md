# Attorney firm-first allocation rollout

Phase 8 is a read-only release gate for the transfer firm nomination lifecycle. It does not automatically repair assignment, role-player, participant, acceptance, or replacement history.

## Deployment order

Apply all outstanding migrations in timestamp order. The firm-first sequence is Phase 4 `202607170001`, Phase 5 `202607170003`, Phase 6 `202607170004`, Phase 7 `202607170006`, and Phase 8 `202607170007`. Other migrations interleaved in that sequence must retain their timestamps.

Deploy the application only after the database migrations complete. Run the Phase 4–8 contract suite, then run the staging readiness audit with `--strict`.

The remote audit requires `SUPABASE_SERVICE_ROLE_KEY` in the server-side staging environment, or `ATTORNEY_FIRM_FIRST_AUDIT_ACCESS_TOKEN` for an authenticated user allowed to read the assurance view. Never expose the service-role key through a `VITE_` variable.

## Release gate

The Phase 8 gate must return `pass` before broad rollout. A `warning` requires review of overdue firm acceptance, overdue internal allocation, declined nominations, or an environment with no visible pilot records. A `blocked` result stops rollout.

Blocking conditions include multiple open transfer-firm allocations, internal assignment before firm acceptance, a person linked before internal allocation, an assigned state without a primary attorney, an active matter without both gates, or stale access for a declined firm.

## Reconciliation safety

Do not repair lifecycle rows directly. Use the recommended product action—firm decision, internal assignment, activation, or replacement nomination—after confirming the underlying evidence. The reconciliation view is advisory only and deliberately returns `automatic_repair_allowed = false`.

Preserve declined assignments and replacement lineage. Never overwrite the original firm, decline reason, actor, or timestamps to make a report pass.

## Rollback

If the gate regresses after deployment, roll back the application release first. Keep the additive migrations and captured lifecycle history in place while the issue is investigated. Disable broad user rollout until the strict gate passes again.
