# Seller Process Phase 8 Controlled Smoke

Date: 2026-08-10

## Purpose

Phase 8 records the controlled smoke observation for the global seller process.
It starts only after Phase 5 has passed, Phase 6 staging evidence has been
accepted, and Phase 7 has recorded a go release-readiness decision.

This phase does not itself send onboarding links. It does not itself send
mandate signature requests. It does not itself upload documents, create
listings, mutate seller portals, change organisation configuration, deploy, or
enable the Kingstons process. It validates a redacted observation from an
authorised controlled smoke run.

## Command

For local contract validation:

```bash
npm run test:seller-process-global-qa-phase8
```

For the guarded controlled-smoke gate after the run has been completed:

```bash
npm run verify:seller-process-global-qa:controlled-smoke -- --phase6-evidence=private-evidence/seller-process-phase6-staging-evidence.json --decision=private-evidence/seller-process-phase7-release-decision.json --observation=private-evidence/seller-process-phase8-controlled-smoke.json
```

The command reruns Phase 5, revalidates the Phase 7 decision, which revalidates
Phase 6, and then accepts or blocks the Phase 8 observation.

## Observation Rules

Start from:

```text
docs/seller-process-phase8-controlled-smoke.template.json
```

The observation must be redacted. It must not contain emails, phone numbers,
URLs, onboarding tokens, seller portal tokens, signed URLs, credentials, document
bytes, raw onboarding facts, client names, property addresses, or provider logs.

Use opaque references only, for example `smoke-run-001`, `lead-ref-001`, or a
ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
GLOBAL_SELLER_QA_PHASE8_CONTROLLED_SMOKE_COMPLETE
```

## Required Controlled Smoke Proof

The observation must prove:

- Phase 7 go decision was accepted
- change window was approved before the smoke
- global and Kingstons stay separated
- the test lead is isolated and controlled
- onboarding link was sent only to the controlled recipient
- seller onboarding submitted state was observed
- seller onboarding submitted notification was observed
- conditional GAS, COC, solar, beetle, plumbing, water and related documents
  matched the onboarding choices
- mandate was generated
- mandate signature request was sent only to the controlled signer
- mandate was signed
- listing was opened or created from the signed mandate
- listing document tab showed the correct mandate, disclosure, selected
  conditional documents, and uploaded seller documents
- seller portal document centre matched the listing document tab
- agent upload on behalf of the seller persisted against the right requirement
- no Kingstons valuation or seller-pack state appeared in the global run
- rollback was validated before the smoke and was not needed
- support monitoring was clear after the smoke

## Stop Conditions

The observation must be `failed` or `aborted` if:

- evidence is missing, stale, private, or from a different project/source
- a global seller lead shows Kingstons states
- a Kingstons profile activates from name, branch, domain, or agent email alone
- conditional compliance documents do not match the seller onboarding choices
- mandate generation, sending, signing, or listing conversion requires manual
  data repair
- the listing document tab and seller portal document centre disagree
- an agent upload saves but does not remain linked to the listing requirement
- rollback readiness is missing
- support monitoring shows any global/Kingstons cross-over

Phase 8 is an observation gate only. It does not approve wider rollout beyond
the explicitly controlled smoke scope.
