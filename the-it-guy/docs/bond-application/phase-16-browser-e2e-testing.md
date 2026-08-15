# Bond Application Prefill Phase 16: Browser-Level E2E Testing

## Purpose

Phase 16 locks the buyer portal and originator handoff workflows at browser-contract level.

The goal is to make sure the redesigned bond application is not only valid as data plumbing, but also testable as the user actually experiences it:

- buyer receives an email link and lands on `/client/:token/bond-application`
- OTP unlock reveals the guided application workspace
- prefilled data from agent onboarding or buyer onboarding is presented for confirmation
- missing fields and documents stay visible as buyer tasks
- originator review receives the same confirmed, prefilled, and missing-data context
- the generated handoff PDF carries the same review sections

## Runtime Contract

`buildBondApplicationBrowserE2EContract()` defines the Phase 16 browser scenarios.

It exposes:

- `version: phase-16-v1`
- `status: browser_e2e_contract_locked`
- `scenarioCount`
- `scenarios`
- `requiredSelectors`
- `requiredTexts`
- `runtimeChecks`

The locked scenarios are:

- `buyer_deep_link_unlock`
- `buyer_prefill_confirmation`
- `buyer_document_blockers`
- `originator_review_workspace`
- `originator_handoff_pdf`

## Stable UI Markers

The buyer portal browser contract checks these markers:

- `data-bond-ux-task-workspace="phase-10"`
- `data-bond-ux-next-action-bar="true"`
- `data-bond-ux-section-stepper="true"`
- `data-bond-prefill-confirmation-cards="true"`
- `data-bond-prefill-section-actions="true"`

The originator workspace browser contract checks these markers:

- `data-bond-originator-review-workspace="phase-15"`
- `data-bond-originator-action-list="true"`

## Verification

Run the contract-only regression:

```bash
node scripts/bond-application-prefill-phase16.test.mjs
```

Run the same regression with a live browser smoke against a local dev server:

```bash
BOND_APPLICATION_E2E_URL=http://127.0.0.1:5175/ node scripts/bond-application-prefill-phase16.test.mjs
```

The live smoke checks:

- page renders visible content
- no Vite, webpack, or Next.js error overlay is visible
- no browser console or page errors are emitted

## Boundary

Phase 16 does not mutate buyer data, originator data, bank payloads, email delivery, or submission behaviour. It adds the browser-level regression contract and smoke harness needed before deeper authenticated portal fixtures are added.
