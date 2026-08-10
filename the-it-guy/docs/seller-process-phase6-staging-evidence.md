# Seller Process Phase 6 Staging Evidence

Date: 2026-08-10

## Purpose

Phase 6 is the controlled staging evidence gate for tomorrow's global seller QA
run on August 11, 2026. Phase 5 proves the local non-mutating QA pack. Phase 6
records whether the same workflow passed in a real staging environment without
mixing the global process and the Kingstons process.

This phase does not send onboarding links. It does not send mandate signature
requests. It does not upload documents, create listings, mutate portals, or
change organisation configuration. It only validates a redacted evidence file
created by an authorised manual staging run.

## Command

For local contract validation:

```bash
npm run test:seller-process-global-qa-phase6
```

For the guarded staging gate after manual QA evidence has been collected:

```bash
npm run verify:seller-process-global-qa:staging -- --evidence=private-evidence/seller-process-phase6-staging-evidence.json
```

The staging command first reruns Phase 5, then requires the evidence file.

## Evidence Rules

Start from:

```text
docs/seller-process-phase6-staging-evidence.template.json
```

The evidence must be redacted. It must not contain emails, phone numbers,
onboarding tokens, seller portal tokens, signed URLs, document bytes, raw
onboarding facts, client names, property addresses, or provider logs.

Use opaque references only, for example `lead-ref-001`, `runbook-row-007`, or a
ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
GLOBAL_SELLER_QA_PHASE6_REDACTED_EVIDENCE
```

## Required Staging Proof

The evidence must prove:

- Phase 5 passed against the same source state
- production build passed
- global and Kingstons stay separated
- the test lead is global, not Kingstons
- send onboarding link works
- seller onboarding submitted state is recorded
- seller onboarding submitted notification is sent
- conditional compliance documents stay hidden when not selected
- selected GAS, COC, solar, beetle, plumbing, water or related documents appear
  only when selected
- mandate can be generated
- mandate can be sent for signature
- mandate can be signed
- a listing can be created or opened from the signed mandate
- the listing document tab populates with the correct signed mandate, generated
  disclosure, and selected conditional documents
- an agent can upload a required document on behalf of the seller
- seller portal document centre matches the submitted onboarding and listing
  documents

## Stop Conditions

Stop the staging QA run immediately if:

- a global seller lead shows Kingstons valuation or seller-pack states
- Kingstons activates from an organisation name or agent email alone
- conditional COC/GAS documents appear when their onboarding condition is false
- selected conditional documents appear under the wrong category
- mandate generation, sending, or signing cannot recover without full-page state
  resets
- the listing document tab and seller portal document centre disagree
- an agent upload saves but does not remain linked to the listing requirement
- evidence collection requires recording private data
