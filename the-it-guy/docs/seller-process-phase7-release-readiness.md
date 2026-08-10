# Seller Process Phase 7 Release Readiness

Date: 2026-08-10

## Purpose

Phase 7 is the go/no-go release-readiness gate for the global seller QA run. It
starts only after Phase 5 has passed locally and Phase 6 has accepted redacted
staging evidence.

This phase does not deploy. It does not send onboarding links. It does not send
mandate signature requests. It does not upload documents, create listings,
mutate seller portals, alter organisation configuration, or enable the
Kingstons process. It only validates a redacted release decision file.

## Command

For local contract validation:

```bash
npm run test:seller-process-global-qa-phase7
```

For the guarded release-readiness gate after Phase 6 evidence and a release
decision have been collected:

```bash
npm run verify:seller-process-global-qa:release -- --phase6-evidence=private-evidence/seller-process-phase6-staging-evidence.json --decision=private-evidence/seller-process-phase7-release-decision.json
```

The release command reruns Phase 5, revalidates the Phase 6 evidence, then
requires the Phase 7 decision file.

## Decision Rules

Start from:

```text
docs/seller-process-phase7-release-decision.template.json
```

The decision must be redacted. It must not contain emails, phone numbers, URLs,
onboarding tokens, seller portal tokens, signed URLs, credentials, document
bytes, raw onboarding facts, client names, property addresses, or provider logs.

Use opaque references only, for example `qa-owner-001`, `release-ref-001`, or a
ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
GLOBAL_SELLER_QA_PHASE7_RELEASE_READY
```

## Required Release Proof

The decision must prove:

- Phase 5 was rerun and passed against the same source state
- Phase 6 evidence was accepted and is still fresh
- production build passed
- global and Kingstons stay separated
- the global process is the only process in scope
- Kingstons is excluded unless explicitly configured through the profile boundary
- no organisation name, branch name, or agent email can activate Kingstons
- conditional GAS, COC, solar, beetle, plumbing, water and related documents
  were verified from the seller onboarding choices
- the gate itself made no live mutations
- the support team has the exact stop conditions
- rollback owner, rollback plan, and last-known-good source reference are ready
- QA and release ownership are separate opaque references

## Stop Conditions

The release decision must be `no_go` if:

- the Phase 6 evidence is stale, missing, private, or from the wrong project
- a global seller lead shows Kingstons valuation or seller-pack states
- conditional compliance documents appear when their onboarding condition is
  false
- the listing document tab and seller portal document centre disagree
- agent uploads cannot persist against the correct listing requirement
- mandate generation, sending, signing, or listing conversion needs manual data
  repair
- rollback is not validated
- the decision requires recording private data

No production rollout should be treated as approved by Phase 7 alone. Phase 7 is
the release-readiness record for the global seller process QA scope.
