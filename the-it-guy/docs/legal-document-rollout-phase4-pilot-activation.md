# Legal Document Rollout — Phase 4 One-Organisation Pilot Activation

Phase 4 is the only rollout step that can activate the production legal-document pilot. It is deliberately narrow: one explicitly approved organisation, the sealed `mandate` and `otp` packet types, no scale-up, and an immutable receipt that binds the remote activation to the exact frozen release and Phase 3 dark-launch proof.

This implementation adds the control plane and a guarded operator command. It has **not** activated a pilot, changed a production secret, deployed source, sent a customer document, contacted a provider, or created customer data.

## Non-negotiable boundary

Phase 4 does not authorise a second organisation, expansion, a template/source/migration/function change, automatic packet creation, or general customer delivery. It requires:

- exactly one production organisation UUID;
- one sealed `activationPlanDigest` and the server-side `legal-document-pilot-release-v1` guard;
- `LEGAL_DOCUMENT_PILOT_ENABLED=true`, an exact one-item organisation allowlist, and the matching `LEGAL_DOCUMENT_PILOT_PLAN_DIGEST` only after explicit activation;
- customer generation and outbound signing/final-delivery restricted to that cohort and release marker;
- creation paused and scale disabled; and
- a dark-launch restore path back to `false` / `__none__` / `__none__`.

Already-issued signer completion and final-PDF download remain the Phase 0 safe exceptions; Phase 4 must not strand a signer or make a final artefact unavailable during a rollback.

## Immutable receipt chain

The frozen source must already contain all receipt placeholders, including `config/legal-document-rollout-phase4-pilot-activation.json`. A receipt commit modifies a pre-provisioned regular file only; it must never add a control file.

```text
frozen source
  → Phase 0 freeze receipt
  → Phase 1 pending receipt
  → Phase 1 evidence-recorded receipt
  → Phase 2 acceptance receipt
  → Phase 3 production-preflight (dark launch) receipt
  → Phase 4 one-organisation pilot-activation receipt
  → Phase 5 one-organisation pilot-observation receipt (terminal)
```

Phase 4 is the sole permitted successor to Phase 3. It is one single-file receipt-only commit. Its sole permitted successor is the one-file Phase 5 pilot-observation receipt; Phase 5 is terminal. No source change, merge, rewrite, rename, deletion, executable-bit change, dependency change, migration, function change, or deployment-config change is valid after Phase 5.

## Prerequisites

- Phase 0 verifies `FROZEN` from the clean, linear receipt chain.
- Phase 1 verifies `STAGING_EVIDENCE_RECORDED`; Phase 2 verifies `STAGING_ACCEPTANCE_RECORDED`, including server-attested physical-signature capability.
- Phase 3 verifies `PRODUCTION_PREFLIGHT_RECORDED` from the exact immutable Phase 3 receipt, within the sealed planning window, and proves the runtime is still dark-launched.
- Legal and release approvals are recorded as redacted SHA-256 evidence digests, with accountable approvers and timestamps.
- The selected organisation is active and has approved mandate/OTP template routing, candidate readiness, and the required preferred-attorney/release evidence.
- A scoped Phase 5 watchdog, incident owner, template-revocation path, and dark-launch restore dry-run are ready before activation.

An incomplete earlier receipt, stale parent evidence, an unsupported physical-signature capability, a nonempty/unrelated pilot, a second organisation, or any scale flag is a hard hold. Do not activate around a hold.

## Plan and work order

These commands are local-only. They do not query production, write a receipt, change a secret, or create a document.

```bash
npm run plan:legal-documents:rollout-phase4 -- \
  --environment=production \
  --production-project-ref=<exact-production-supabase-project-ref> \
  --production-origin=https://<exact-production-supabase-project-ref>.supabase.co \
  --production-url=https://<production-web-origin> \
  --organisation-id=<one-organisation-uuid> \
  --prepared-by=<accountable-person> \
  --reference=<change-ticket> \
  --approved-by=<accountable-person> \
  --approved-at=<ISO-8601-time> \
  --approval-reference=<approval-ticket> \
  --legal-approval-evidence-digest=sha256:<64-hex> \
  --release-approval-evidence-digest=sha256:<64-hex>
```

Save the emitted pending plan outside the clean release worktree. It contains the exact `activationPlanDigest`, Phase 3 receipt commit, cohort UUID, and runtime envelope. The sealed plan expires after 30 minutes; generate a new one rather than activating a stale plan. Produce the operator checklist with:

```bash
npm run work-order:legal-documents:rollout-phase4 -- \
  --plan=<saved-pending-phase4-plan.json>
```

## Separately authorised remote activation

The Phase 4 activator defaults to a non-mutating dry run. It validates the sealed plan and reports the precise remote values that would be used, but makes no provider call:

```bash
npm run activate:legal-documents:rollout-phase4 -- \
  --plan=<saved-pending-phase4-plan.json>
```

An actual production change is a separate authorised operation. It requires all of the following: `LEGAL_DOCUMENT_ROLLOUT_PHASE4_ACTIVATION_APPROVED=true`, `--apply`, exact confirmation of the production project, organisation, plan digest, and committed Phase 3 receipt SHA, an accountable operator and change reference, and a redacted route-coverage evidence digest.

```bash
LEGAL_DOCUMENT_ROLLOUT_PHASE4_ACTIVATION_APPROVED=true \
npm run activate:legal-documents:rollout-phase4 -- \
  --plan=<saved-pending-phase4-plan.json> \
  --apply \
  --confirm-project-ref=<exact-production-supabase-project-ref> \
  --confirm-organisation-id=<one-organisation-uuid> \
  --confirm-activation-plan-digest=sha256:<64-hex> \
  --confirm-phase3-receipt-commit=<committed-phase3-40-character-sha> \
  --activated-by=<accountable-person> \
  --reference=<change-ticket> \
  --route-coverage-evidence-digest=sha256:<64-hex>
```

Only this explicit apply path can write the three remote runtime values. It first re-reads the exact target fingerprints and refuses to overwrite anything other than the sealed dark-launch `false` / `__none__` / `__none__` baseline. It never writes `config/legal-document-pilot.json` or any other local pilot config. After the write it re-reads remote secret fingerprints and requires them to match the sealed plan. If writing or post-write verification fails, it attempts an immediate restore to the dark-launch values; if that restore cannot be verified, treat the result as an incident requiring a manual dark-launch restore before any customer activity.

Capture redacted evidence only: SHA-256 digests, opaque provider identifiers, UUIDs, timestamps, counts, project/origin identities, and safe source metadata. Never put secret values, credentials, personal data, onboarding facts, email addresses, signer tokens, signed URLs, document bytes, or raw provider logs in a plan or receipt.

## Record the activation receipt

After the remote activation has been independently verified, collect all of the following in a redacted evidence file outside the clean release worktree:

- pre-activation proof of the exact production dark-launch values and no scale;
- selected-organisation readiness for mandate and OTP routes;
- post-write activation/allowlist/plan-digest verification and route-coverage evidence;
- an armed, scoped Phase 5 watchdog with zero blockers; and
- owned rollback, template-revocation, and dark-launch restore-dry-run evidence.

The finalizer does not contact a provider or change runtime state. It only derives an immutable receipt from the sealed pending plan and the supplied evidence:

```bash
npm run finalize:legal-documents:rollout-phase4 -- \
  --plan=<saved-pending-phase4-plan.json> \
  --evidence=<redacted-phase4-activation-evidence.json>
```

Review the candidate. Only then may the explicit confirmed command write the canonical receipt:

```bash
npm run finalize:legal-documents:rollout-phase4 -- \
  --plan=<saved-pending-phase4-plan.json> \
  --evidence=<redacted-phase4-activation-evidence.json> \
  --out=config/legal-document-rollout-phase4-pilot-activation.json \
  --confirm-write=RECORD_PHASE4_PILOT_ACTIVATION
```

Commit only `config/legal-document-rollout-phase4-pilot-activation.json` as its receipt-only commit, then verify from a clean worktree. Do not add any source change; the only possible later commit is the separately verified Phase 5 receipt:

```bash
npm run verify:legal-documents:rollout-phase4
```

`PILOT_ACTIVATION_RECORDED` proves that the tightly bounded activation record is internally coherent. It does not by itself prove a customer’s full lifecycle; Phase 5 observation must do that before any expansion decision.

## Phase 5 handoff and stop conditions

Phase 5 observes the one permitted cohort only. It must correlate generation, signing invitation, completion, final PDF/database/storage linkage, and authorised download to the same release marker and organisation. Keep scale disabled and the second-organisation count at zero. A generation failure, stale signing packet, delivery or finalisation mismatch, guard mismatch, watchdog blocker, unexpected organisation, or rollback uncertainty requires an immediate stop and a return to dark-launch values before investigation.

Phase 5 is an observation/acceptance handoff, not an implicit permission to scale. Any future expansion needs its own separately authorised control and receipt chain; it cannot be inferred from this Phase 4 activation.

## Historical controls are not rollout authority

Do not use the legacy A2/A3 activation/deactivation scripts, historical Phase 4 release gates, or M/N monitor controls as authority for this rollout. They are not bound to the Phase 0–4 immutable receipt chain; some mutate the frozen local pilot config and/or assume an already-active pilot. The Phase 4 plan, guarded activator, finalizer, verifier, receipt chain, and scoped Phase 5 watchdog are the rollout authority.
