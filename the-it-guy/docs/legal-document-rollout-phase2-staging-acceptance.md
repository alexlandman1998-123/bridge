# Legal Document Rollout — Phase 2 Staging Acceptance

Phase 2 is the staging proof that the legal-document lifecycle works end to end on the exact release that Phase 1 deployed: reviewed template and onboarding facts → canonical server PDF → targeted signing delivery → completed signers → immutable final PDF in storage/database → authorised download.

It is deliberately a receipt gate, not a permissive smoke script. The local commands never contact staging or create a packet. Separately authorised operators perform the bounded staging work and produce a redacted evidence packet; the Phase 2 finalizer then records one immutable acceptance receipt. The frozen source must already contain the inert `config/legal-document-rollout-phase4-pilot-activation.json` and `config/legal-document-rollout-phase5-pilot-observation.json` placeholders. The receipt chain permits this one Phase 2 change after the Phase 0 receipt and the two Phase 1 receipts; the one-file Phase 3 production-preflight receipt may follow it, Phase 4 is the sole permitted successor to Phase 3, and Phase 5 is the sole permitted successor to Phase 4 and terminal.

## Prerequisites

- Phase 0 must verify `FROZEN` from a clean, receipt-only release chain.
- Phase 1 must verify `STAGING_EVIDENCE_RECORDED`, including current source, migration, function, and provider-bound Vercel preview evidence.
- The Phase 1 evidence is valid for 24 hours. Phase 2 must begin after it and complete within that same evidence window.
- Pilot and scale remain disabled; new pilot creation remains paused.
- Use one named active staging owner/admin, a controlled test mailbox/sandbox, a bounded fixture namespace, and no production/customer recipients.

## Plan an acceptance run

Run from `the-it-guy/`. This produces a pending plan on stdout only; it does not change the canonical Phase 2 config and does not contact staging.

```bash
npm run plan:legal-documents:rollout-phase2 -- \
  --environment=staging \
  --prepared-by=<accountable-person> \
  --reference=<change-ticket> \
  --fixture-namespace=<lowercase_fixture_namespace> \
  --fixture-write-limit=4 \
  --test-mailbox-digest=sha256:<redacted-mailbox-identity-digest>
```

Save the emitted `proposedReceipt` outside the clean release worktree. It pins the Phase 1 receipt digest, frozen commit and lockfile, exact staging origin, generated Vercel preview/release, preview attestation/artifact digests, fixture limit, and test-mailbox digest. It also requires physical signing to be server-attested; the scope cannot be silently narrowed to print/download.

For a concise non-mutating work order, use:

```bash
npm run work-order:legal-documents:rollout-phase2 -- \
  --plan=<saved-pending-phase2-plan.json>
```

## Required controlled staging evidence

All evidence is redacted: UUIDs, safe storage paths, counts, timestamps, and SHA-256 digests only. Do not put names, email addresses, raw onboarding data, document bytes, signed URLs, signing tokens, credentials, or raw provider logs in the JSON.

| Scenario | Required proof |
| --- | --- |
| `mandate_onboarding_individual` | Seller-onboarding facts generate a mandate from a B1-approved canonical template; no required merge fields missing; D1/D2/D3 certified source PDF; seller-targeted confirmed delivery; all required signatures; F2 final PDF/database/storage/download evidence. |
| `mandate_onboarding_company` | Same lifecycle, including entity/signatory/authority merge branch. |
| `otp_cash` | A complete cash OTP lifecycle—not generation only—with buyer/seller targeted delivery, all signatures, F2 final PDF, storage/document link, and byte-matching download. |
| `otp_bond` | Same complete proof for bond OTP. |
| `negative_template_and_authority` | Alternate/unapproved template, cross-organisation/unauthorised actor, and dispatch-target mismatch are rejected before artifact creation. |
| `idempotency_and_recovery` | Send/finalise/retry/reconciliation reuses the exact canonical version/final artifact and never creates a duplicate completion. |
| `physical_signature_capability` | Server-attested physical upload, party attestation, and immutable finalisation, or the exact `P2_PHYSICAL_SIGNATURE_UNSUPPORTED` hold. |

The browser portion must exercise the **Phase 1-attested generated Vercel preview and frozen release ID**. A local Vite SSR run, an arbitrary old completed packet, or a production/custom alias is not valid browser evidence.

The existing `otp-phase2-staging-acceptance.mjs` is a historical OTP harness. It is not the rollout authority: it does not bind Phase 1 receipt/preview facts, does not cover both mandate onboarding branches, and historically did not complete cash OTP. Do not use it as Phase 2 proof.

## Physical signature is currently a hard hold

The current legal workspace can generate and download a mandate for printing, but it states that server-attested physical completion is not enabled. A printable PDF is therefore **not** a completed physical legal record. Record the physical scenario as:

```json
{
  "scenario": "physical_signature_capability",
  "status": "unsupported",
  "capability": "server_attested_physical_completion",
  "serverAttested": false,
  "blockerCode": "P2_PHYSICAL_SIGNATURE_UNSUPPORTED"
}
```

Because physical signing is part of the declared product requirement, that result correctly leaves Phase 2 in `HOLD`. It may become a passing result only after a server-owned flow atomically captures the signed PDF, party attestation, immutable evidence, and final-artifact linkage.

## Record and verify evidence

Put the redacted structured evidence in a file outside the clean release worktree. The finalizer prints a proposed receipt by default:

```bash
npm run finalize:legal-documents:rollout-phase2 -- \
  --plan=<saved-pending-phase2-plan.json> \
  --evidence=<redacted-controlled-acceptance-evidence.json>
```

Review it. Only then may an explicitly confirmed command write the canonical receipt:

```bash
npm run finalize:legal-documents:rollout-phase2 -- \
  --plan=<saved-pending-phase2-plan.json> \
  --evidence=<redacted-controlled-acceptance-evidence.json> \
  --out=config/legal-document-rollout-phase2-staging-acceptance.json \
  --confirm-write=RECORD_PHASE2_ACCEPTANCE
```

Commit only that file as the single Phase 2 receipt-only descendant commit. Then run:

```bash
npm run verify:legal-documents:rollout-phase2
```

`STAGING_ACCEPTANCE_RECORDED` requires every scenario, including server-attested physical completion, to pass. A recorded physical-signature `unsupported` result is intentionally reported as `HOLD`; it is evidence of the product gap, not a release approval. Neither result authorises a pilot, scale-up, arbitrary fixture writes, or customer email delivery. A passing result is only an input to the separately controlled Phase 3 production dark-launch preflight.
