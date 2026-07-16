# Legal Document Generator - Phase 5 Operations and Scale

Phase 5 turns the controlled pilot into an observable, auditable service with explicit SLOs and a separate scale-up decision.

## Watchdog

`legal-document-watchdog` records a privacy-safe row in `system_health_snapshots` for every run. It measures unresolved generation failures, signing packets stale for more than two hours, completed OTP/SalesMandate packets without final signed artifacts, final-artifact integrity, and approval blocks. Structured start/completion/failure logs include request ID and duration.

The production scheduler should invoke it at least hourly using a protected service credential. The function accepts only the Supabase service-role bearer token. Never place that token in source control; use the platform secret store or Vault-backed scheduler configuration.

The repository includes an hourly staging GitHub workflow. It requires the protected `SUPABASE_STAGING_URL` and `SUPABASE_STAGING_SERVICE_ROLE_KEY` environment secrets. Production must use separate production secrets and an independently approved environment.

## Reconciliation

```bash
npm run verify:legal-documents:phase5-reconcile
```

Reconciliation is dry-run by default. It automatically classifies only superseded controlled fixtures as safe to archive. All real or ambiguous packets remain in `manualReviewIds`. Apply is restricted to canonical staging and requires `LEGAL_DOCUMENT_RECONCILIATION_WRITE=true --apply --confirm-staging`.

## Incidents

Critical watchdog snapshots can be acknowledged through the guarded operator. Acknowledgement creates another durable health snapshot; it does not delete, downgrade, or edit the incident.

## Evidence and scale-up

```bash
npm run export:legal-documents:phase5-evidence
npm run verify:legal-documents:phase5-scale
```

Scale-up requires Phase 4 `GO`, at least seven healthy watchdog snapshots spanning 144 hours, ten completed pilot packets, 100% final-artifact integrity, and an explicit change to `config/legal-document-scale.json`. Expansion is never automatic.

## Current production boundary

Phase 5 operational tooling can run in staging while Phase 4 remains blocked. Production scheduling, pilot activation, and scale-up require genuine legal approvals, an approved cohort, and a clean release gate.
