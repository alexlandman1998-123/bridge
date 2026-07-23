# Legal Document Rollout — Phase 3 Production Preflight

Phase 3 is a production **dark-launch** receipt. It proves that the exact source accepted in Phases 0–2 is present and observable in the exact production environment while the legal-document runtime remains disabled:

- pilot disabled;
- allowlist `__none__`;
- new pilot creation paused;
- customer document generation disabled;
- customer delivery/signing invites disabled; and
- scale disabled.

It is not a pilot activation, customer canary, scale-up, template change, or rollback execution. Phase 4 owns the separately authorised, bounded activation decision.

## Prerequisites

- Phase 0 verifies `FROZEN` from a clean, linear receipt-only chain.
- Phase 1 verifies `STAGING_EVIDENCE_RECORDED`.
- Phase 2 verifies `STAGING_ACCEPTANCE_RECORDED`, including a passing server-attested physical-signature capability. An `unsupported` physical-signature result remains a hard hold.
- The Phase 1 and Phase 2 evidence must both still be within 24 hours. Receipt history is append-only, so stale evidence requires a new frozen receipt chain; it cannot be refreshed in place.
- The Phase 2 acceptance receipt must already be committed. Phase 3 binds its immutable commit SHA and manifest digest, not just a working-tree JSON file.
- `config/legal-document-rollout-phase3-production-preflight.json` and `config/legal-document-rollout-phase4-pilot-activation.json` must already exist in the frozen source. Receipt commits modify pre-provisioned regular files; they can never add a new control file.

The allowed receipt chain is:

```text
frozen source
  → Phase 0 freeze receipt
  → Phase 1 pending receipt
  → Phase 1 evidence-recorded receipt
  → Phase 2 acceptance receipt
  → Phase 3 production-preflight receipt
  → Phase 4 pilot-activation receipt
```

Each receipt is a one-file, regular-file commit. Phase 4 is the sole permitted successor to Phase 3; Phase 5 is the sole permitted successor to Phase 4 and is the terminal receipt. No source change, merge, receipt rewrite, or later receipt is permitted after Phase 5.

## Plan the preflight

Run from `the-it-guy/`. This command only emits JSON to stdout; it does not deploy, query production, write a receipt, or activate anything.

```bash
npm run plan:legal-documents:rollout-phase3 -- \
  --environment=production \
  --production-project-ref=<exact-production-supabase-project-ref> \
  --production-origin=https://<exact-production-supabase-project-ref>.supabase.co \
  --production-url=https://<production-web-origin> \
  --prepared-by=<accountable-person> \
  --reference=<change-ticket>
```

Save `proposedReceipt` outside the clean release worktree. To emit a concise operator checklist without contacting a provider, run:

```bash
npm run work-order:legal-documents:rollout-phase3 -- \
  --plan=<saved-pending-phase3-plan.json>
```

## Separately authorised operator evidence

The receipt is intentionally local-only. A separately authorised production procedure may gather read-only provider evidence and, if approved, perform the dark deployment. It must record redacted evidence for all of the following:

| Area | Required proof |
| --- | --- |
| Production web deployment | A `READY` Vercel production deployment bound to the frozen commit, exact production web origin, exact production Supabase origin, release marker, provider metadata digest, generated manifest/index digests, and critical asset-tree digest. |
| Database | One ordered observed record for every Phase 1 legal migration, matching the source hash and production project, with a chained ledger digest plus catalog, behavior, and no-residue checks. |
| Edge Functions | Every Phase 1 Edge Function matching its source-tree and full deploy-unit digest in the production project, plus every required function-configuration review. |
| Runtime hold | Read-only evidence that pilot/scale/customer generation/customer delivery are `false`, creation remains paused, and the effective allowlist is `__none__`. Store only a redacted evidence digest—never a secret value. |
| Templates | Production routable-template set bound to the frozen B1 review digest, with a route-set/evidence digest and accountable legal review. |
| Operations | Monitoring, incident runbook, named owner, rollback plan, and a **dry-run** that restores the disabled runtime. A dry run is evidence only; do not execute a rollback in Phase 3. |

Record SHA-256 evidence digests, safe opaque provider identifiers, timestamps, counts, project/origin identities, and safe source/storage metadata only. Do not record credentials, secret values, email addresses, onboarding facts, document bytes, signed URLs, signing tokens, or raw provider logs.

The existing `legal-document-phase3-launch-readiness.mjs` is a historical staging/OTP readiness check. It is not production evidence and cannot satisfy this receipt. Likewise, legacy M/N and Phase 4 controls expect an active pilot and are deliberately not used here.

## Finalize and verify

Prepare a redacted evidence JSON outside the release worktree. The finalizer prints the candidate receipt by default:

```bash
npm run finalize:legal-documents:rollout-phase3 -- \
  --plan=<saved-pending-phase3-plan.json> \
  --evidence=<redacted-production-preflight-evidence.json>
```

Review the output. Only then write the canonical receipt with the explicit confirmation:

```bash
npm run finalize:legal-documents:rollout-phase3 -- \
  --plan=<saved-pending-phase3-plan.json> \
  --evidence=<redacted-production-preflight-evidence.json> \
  --out=config/legal-document-rollout-phase3-production-preflight.json \
  --confirm-write=RECORD_PHASE3_PRODUCTION_PREFLIGHT
```

Commit only `config/legal-document-rollout-phase3-production-preflight.json` as the Phase 3 receipt-only descendant commit. Then, from a clean worktree, run:

```bash
npm run verify:legal-documents:rollout-phase3
```

`PRODUCTION_PREFLIGHT_RECORDED` means the frozen dark-launch boundary is proven. It still does **not** authorise Phase 4 pilot activation, a customer document, email/signing delivery, or scale-up.
