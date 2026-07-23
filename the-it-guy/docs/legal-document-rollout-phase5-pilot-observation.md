# Legal Document Rollout — Phase 5 Pilot Observation and Acceptance

Phase 5 is a read-only acceptance gate for the one organisation activated by the immutable Phase 4 receipt. It is not a scale gate, activation procedure, customer campaign, or configuration tool.

This implementation adds a local control plane only. It has not activated production, changed a runtime secret, sent a document, downloaded a customer file, queried a provider, contacted a customer, or created customer data.

## Boundary

Phase 5 accepts evidence only when it proves all of the following for the exact Phase 4 release marker:

- exactly one committed organisation UUID and the `mandate` plus `otp` packet types;
- the same `activationPlanDigest`, cohort digest, `legal-document-pilot-release-v1` runtime guard, and `phase5-f2-f3-f4-v2` watchdog contract;
- a continuous observation starting at the Phase 4 activation timestamp and lasting at least 144 hours;
- at least seven healthy, configured-organisation watchdog snapshots, with zero warnings, zero criticals, zero blockers, and no gap over 90 minutes;
- one release-bound mandate lifecycle and one release-bound OTP lifecycle proving generation, signing, F2 final-artifact integrity, F3 delivery/transaction publication, F4 surface completion, and authorised final-resolver access; and
- zero unresolved generation failures, stale signers, missing finals, F2/F3/F4 failures, final-resolver-access failures, and other reconciliation blockers.

The final-resolver proof is deliberately required even though final-file access remains a Phase 0 safe exception during rollback. The proof must be tied to the pre-existing release-bound lifecycle trace; Phase 5 never blocks an already-issued signer or final-file download to manufacture evidence.

The canonical Phase 5 placeholder starts inert (`not_recorded`) with no production identity, raw customer data, or lifecycle evidence. Any unrecorded or incomplete evidence produces `HOLD`.

Phase 5 never authorises a second organisation, scale-up, template/source/migration/deployment changes, runtime activation, a customer campaign, or rollback execution. A future expansion needs a separate approved control and receipt chain.

## Immutable receipt chain

The frozen source must already contain every receipt placeholder. The only valid Phase 5 commit updates the pre-provisioned Phase 5 file; it must not add a control file or change any source artifact.

```text
frozen source
  → Phase 0 freeze
  → Phase 1 pending
  → Phase 1 staging evidence
  → Phase 2 acceptance
  → Phase 3 production preflight
  → Phase 4 one-organisation activation
  → Phase 5 pilot-observation acceptance (terminal)
```

Phase 5 reads the committed Phase 4 receipt through `git cat-file`, not from an editable working-tree value. It rejects a mismatch in the committed Phase 4 manifest, receipt SHA, activation plan digest, cohort, runtime guard, watchdog contract, parent source, or environment.

Each pending plan carries a sealed `observationPlanDigest`. The finalizer derives an `evidencePacketDigest` from all submitted redacted lifecycle, monitoring, reconciliation, rollback-readiness, and recording-accountability fields, then derives the receipt `manifestDigest`. A post-finalization edit is therefore visible to the verifier.

## Plan and work order

These commands are local-only. They do not invoke Supabase, Vercel, a browser, or an email provider, and they do not write the canonical receipt.

```bash
npm run plan:legal-documents:rollout-phase5 -- \
  --environment=production \
  --prepared-by=<accountable-person> \
  --reference=<change-ticket>

npm run work-order:legal-documents:rollout-phase5 -- \
  --plan=<saved-pending-phase5-plan.json>
```

Save the emitted pending plan outside the clean release worktree. It names the committed Phase 4 receipt SHA, sealed activation marker, exact cohort, and fixed acceptance thresholds. A `HOLD` output is a stop condition, not a prompt to weaken evidence or alter the pilot.

## Collect redacted, read-only evidence

Operators may collect evidence using separately approved, read-only production procedures. The Phase 5 scripts do not perform those queries. Record only SHA-256 digests, safe opaque reference digests, organisation UUIDs, timestamps, aggregate counts, and project/origin identities.

Never include credentials, passwords, secrets, access tokens, authorisation headers, signed URLs, email addresses, phone numbers, addresses, raw logs, document bytes, storage paths, artifact paths, signer data, onboarding facts, or raw packet identifiers. Use a SHA-256 `packetReferenceDigest` in each lifecycle proof rather than a raw packet ID.

The evidence JSON has exactly these top-level fields:

```text
lifecycleProofs
monitoring
reconciliation
rollbackReadiness
overallEvidenceDigest
observationRecordedAt
observationRecordedBy
reviewedBy
```

`lifecycleProofs` contains exactly two ordered objects: `mandate`, then `otp`. Each has the exact same organisation ID, cohort digest, activation-plan digest, `legal-document-pilot-lifecycle-trace-v1` contract, a unique redacted packet-reference digest, and six ordered `attested` stages:

```text
generation
signing
f2FinalArtifact
f3DeliveryAndTransaction
f4SurfaceCompletion
finalResolverAccess
```

Every stage must have `releaseMarkerBound: true`, an evidence digest, and an observation timestamp. The proof cannot be substituted with a generic health snapshot or a mutable packet event.

The monitoring object must name the exact configured organisation, cohort digest, activation plan digest, runtime guard, watchdog contract, window start/end, snapshot counts, gap, redacted snapshot evidence, and reviewer. The reconciliation must show zero for every failure category. The rollback-readiness object confirms the pilot is still enabled only for its existing one-org marker while creation is paused, scale is false, and the dark-launch restore remains ready.

## Finalize and verify

The finalizer is local-only. It validates schema, the sealed pending plan, redaction keys, accountable timestamps, and an evidence self-digest; it does not contact production or modify the pilot.

```bash
npm run finalize:legal-documents:rollout-phase5 -- \
  --plan=<saved-pending-phase5-plan.json> \
  --evidence=<redacted-phase5-observation-evidence.json>
```

Review the generated candidate. Only then may the explicit confirmation overwrite the inert canonical placeholder:

```bash
npm run finalize:legal-documents:rollout-phase5 -- \
  --plan=<saved-pending-phase5-plan.json> \
  --evidence=<redacted-phase5-observation-evidence.json> \
  --out=config/legal-document-rollout-phase5-pilot-observation.json \
  --confirm-write=RECORD_PHASE5_PILOT_OBSERVATION
```

The finalizer refuses any output path other than the canonical Phase 5 receipt and refuses to overwrite a receipt that is no longer `not_recorded`. Commit only that one receipt file, then run:

```bash
npm run test:legal-documents:rollout-phase5
npm run verify:legal-documents:rollout-phase5
```

`PILOT_OBSERVATION_RECORDED` proves only that the bounded observation receipt is internally coherent and tied to the frozen Phase 4 release. It is not permission to scale. Any warning, critical, blocker, missing lifecycle stage, release-marker mismatch, raw/sensitive evidence field, or parent-history mismatch remains `HOLD`.
