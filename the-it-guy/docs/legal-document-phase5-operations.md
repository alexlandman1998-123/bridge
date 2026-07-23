# Legal Document Generator - Phase 5 Operations and Scale

Phase 5 turns the controlled pilot into an observable, auditable service with explicit SLOs and a separate scale-up decision.

## Watchdog

`legal-document-watchdog` records a privacy-safe, append-only row in `system_health_snapshots` for every successful run. A health row uses the versioned `phase5-f2-f3-f4-v2` contract: the current packet version must match immutable F2 evidence and its canonical finalisation event, the shared/client-visible `documents` row, and a storage readback whose byte length and SHA-256 match the evidence. It also checks F3 recipient delivery, portal publication, transaction publication, F4 completion receipts, stale signing, stuck completion retries, unresolved generation failures, and pending final-document publication. Structured start/completion/failure logs include request ID and duration.

Generation failures are resolved per packet, not by an unrelated packet's later success. To monitor a deliberately constrained cohort, set `LEGAL_DOCUMENT_WATCHDOG_ORGANISATION_IDS` to a comma-separated, reviewed UUID list; the run records only a digest of that scope. With no scope configured, the watchdog covers all canonical legal packets, which is stricter than a pilot-only check.

The production scheduler should invoke it at least hourly using a protected service credential. The function accepts only a service-role bearer token. Never place that token in source control; use the platform secret store or Vault-backed scheduler configuration.

The repository includes an hourly staging GitHub workflow. It requires the protected `SUPABASE_STAGING_URL` and `SUPABASE_STAGING_SERVICE_ROLE_KEY` environment secrets. Production must use separate production secrets and an independently approved environment.

There is one canonical G3 operational evaluator: `document-generator-phase-g3-operational-readiness.mjs`. The historical `legal-document-phase-g3-operational-readiness.mjs` command delegates to it, so release gates and operator commands use the same F2–F4 watchdog and read-only reconciliation criteria.

## Reconciliation

```bash
npm run verify:legal-documents:phase5-reconcile
```

Reconciliation is deliberately read-only. It evaluates the current version against the same F2 event/evidence and published-document tuple and returns every incomplete packet in `manualReviewIds`.

Automatic archival is disabled. A caller-controlled `source_context_json.fixture` label is not sufficient authority to archive a completed legal record. Re-enable archival only after a service-owned transactional operator can lock the packet, verify a reviewed server-side fixture allowlist plus an explicit replacement relation, prove F2/F3/F4 are absent, and append the archive event atomically.

## Incidents

Critical watchdog snapshots can be acknowledged through the guarded operator. Acknowledgement requires an accountable user UUID and calls the service-owned database RPC; it creates a durable acknowledgement linked to the original critical snapshot. Watchdog and acknowledgement rows are service-role insert-only and immutable.

```bash
npm run acknowledge:legal-documents:phase5-incident -- \
  --incident-id=<snapshot-uuid> --owner="Legal Operations" --note="Triaged; investigation opened" \
  --actor-id=<auth-user-uuid> --apply --confirm-project-ref=<project-ref>
```

## Evidence and scale-up

```bash
npm run export:legal-documents:phase5-evidence
npm run verify:legal-documents:phase5-scale
```

Evidence export requires `--confirm-project-ref=<project-ref>` and writes only to ignored `private-evidence/`. It omits packet/document IDs, incident notes, and approval references, and writes a SHA-256 manifest alongside the report.

Scale-up fails closed unless Phase 4 returns an actual `GO` exit result, the pilot is active for the exact target project and approved cohort, the cohort has at least seven current-contract healthy snapshots spanning 144 hours without a warning/critical run or a watchdog cadence gap over 90 minutes, ten packets completed after pilot activation, and 100% current-version F2/document/storage integrity. It also checks F3/F4 surface completion directly. Expansion still requires an explicit change to `config/legal-document-scale.json`; it is never automatic.

## Current production boundary

Phase 5 operational tooling can run in staging while Phase 4 remains blocked. Production scheduling, pilot activation, and scale-up require genuine legal approvals, an approved cohort, and a clean release gate.
