# Legal Document Rollout — Phase 6 Successor-Release Proposal

Phase 6 is an independent, local decision-recording control. It can prepare or record a non-authoritative proposal for a separately governed future release. It is not Phase 5's successor in the Phase 0→5 receipt chain and it cannot activate, deploy, expand, message, change runtime state, or roll back anything.

No production operation is implemented by this control plane. The scripts use only local files and local Git; they do not query Supabase, Vercel, an email provider, a browser, a customer system, or a provider API.

## Terminal Phase 5 boundary

Phase 5 remains terminal in the canonical receipt-only source-continuity chain:

```text
Phase 0 freeze → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (terminal)
```

Phase 6 does not add itself to that allowlist and must never amend, rewrite, or follow the Phase 5 receipt in that chain. Instead, the operator supplies one explicit committed Phase 5 receipt SHA. The Phase 6 history helper reads that exact blob with local `git cat-file`, verifies that the commit changed only the canonical Phase 5 receipt, and checks its stored manifest digest. An editable working-tree Phase 5 file is not authority.

The parent must be a recorded Phase 5 observation with exactly one existing organisation and both `mandate` and `otp` packet types. The Phase 6 proposal binds its parent commit, Phase 5 manifest and observation-plan digests, Phase 4 receipt digests, activation plan digest, frozen source commit, lockfile digest, production identities, and existing cohort digest.

## What a Phase 6 proposal may contain

The proposal carries:

- an exact reference to the existing one-organisation mandate/OTP cohort;
- a `potential_successor_non_authority_inventory`, represented only by an aggregate count and SHA-256 inventory digest—never raw candidate identifiers or customer data;
- fresh SHA-256 legal-approval and release-approval evidence digests, their timestamps, and safe opaque actor references;
- a server-owned release-epoch readiness contract, including evidence digests for the future migration, retirement of legacy A3/Q2/V2 mutators, and preservation of the current v1 allowlist; and
- a sealed `proposalPlanDigest`, a redacted `evidencePacketDigest`, and a full receipt `manifestDigest`.

The approval material itself stays in the separately authorised private governance system. Do not put names, email addresses, phone numbers, customer or candidate IDs, onboarding facts, credentials, access tokens, headers, signed URLs, raw approval text, raw logs, document bytes, or storage paths in a Phase 6 receipt or evidence input.

Approval evidence is fresh only when both legal and release decisions were made after the committed Phase 5 observation, after the Phase 6 plan was prepared, and no more than 30 days before the proposal record is finalised.

## No authority boundary

Even a `SUCCESSOR_PROPOSAL_RECORDED` result does **not** authorise:

- scale-up or a second organisation;
- widening the current v1 allowlist;
- a new release epoch, runtime guard, secret, template, source, or database change;
- deployment, production activation, customer document generation, email, or campaign;
- rollback execution; or
- any contact with a candidate inventory entry.

The release-epoch evidence means only that a future separately authorised review can evaluate readiness. It is not an activation token. The v1 allowlist must remain unchanged; widening it is a hard `HOLD` condition.

## Implemented safeguards, still inactive

This repository contains an unapplied Phase 6 schema migration,
`supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql`.
It defines a future server-owned release epoch with exactly two immutable
membership slots (`existing_pilot` and `first_expansion`), exact
packet-version/artifact bindings, append-only lifecycle evidence, and
service-role-only RPCs. It seeds no epoch and has no runtime hook, so adding
the file alone cannot enable a second organisation or change a customer flow.

The current runtime was also hardened so that new F2/F3/F4 publication and
customer delivery require the exact active release-plan identity before the
first write. A fully completed historical document remains resolver-accessible
on a later hold, but cannot be republished or used to open a new customer
delivery path.

Applying that migration, wiring a v2 runtime guard, preparing or activating an
epoch, changing a secret, deploying a function, or adding an organisation are
all separate future actions and require their own approval and release record.

## States

The canonical receipt begins at `not_recorded`, which the verifier reports as `HOLD`. A local generated plan has receipt state `pending_proposal`; when its immutable Phase 5 parent and no-authority envelope are valid, the report state is `SUCCESSOR_PROPOSAL_READY` and has one pending evidence item. Only the finalizer can create `successor_proposal_recorded`, which verifies as `SUCCESSOR_PROPOSAL_RECORDED`.

Neither ready nor recorded represents a rollout, activation, or expansion decision.

## Plan and work order

All commands are local-only and make no remote request.

```bash
npm run plan:legal-documents:rollout-phase6 -- \
  --environment=production \
  --phase5-receipt-commit=<committed-phase5-40-hex-sha> \
  --prepared-by-reference=<opaque-actor-reference> \
  --reference=<change-reference>

npm run work-order:legal-documents:rollout-phase6 -- \
  --plan=<saved-pending-phase6-proposal.json>
```

Save the plan outside the release worktree. The work order is a collection checklist for independently authorised governance evidence; it does not perform the evidence collection itself.

The evidence JSON contains exactly:

```text
inventory
legalApproval
releaseApproval
releaseEpochReadiness
proposalRecordedAt
proposalRecordedByReference
reviewedByReference
```

`inventory` contains only `candidateCount` and `candidateInventoryDigest`. The legal and release approval objects contain only `actorReference`, `approvedAt`, and `evidenceDigest`. `releaseEpochReadiness` contains only SHA-256 digests for the migration, legacy-mutator retirement, and v1-allowlist-preservation evidence.

## Finalize and verify

The finalizer validates the parent commit again, checks the proposal and evidence digests, rejects sensitive values, and does not call a remote system. Without `--out`, it prints a candidate for review:

```bash
npm run finalize:legal-documents:rollout-phase6 -- \
  --plan=<saved-pending-phase6-proposal.json> \
  --evidence=<redacted-phase6-evidence.json>
```

Only an explicit confirmation can write the one canonical inert placeholder:

```bash
npm run finalize:legal-documents:rollout-phase6 -- \
  --plan=<saved-pending-phase6-proposal.json> \
  --evidence=<redacted-phase6-evidence.json> \
  --out=config/legal-document-rollout-phase6-successor-proposal.json \
  --confirm-write=RECORD_PHASE6_SUCCESSOR_PROPOSAL
```

The finalizer refuses any other output path and refuses to overwrite a receipt that is no longer `not_recorded`. This file is an independent governance artifact and must not be inserted into or used to alter the terminal Phase 0→5 receipt-only chain.

```bash
npm run test:legal-documents:rollout-phase6
npm run verify:legal-documents:rollout-phase6
```

The canonical placeholder intentionally produces `HOLD` until an independently authorised, fresh, redacted, internally coherent proposal is recorded. A `HOLD` is a stop condition, not a request to weaken boundaries or perform a runtime action.
