# Buyer-Side Lead-To-Registration Diagnostic

## Goal

Run a repeatable diagnostic over the buyer-side transaction journey from lead capture through registration readiness and closeout evidence.

## Journey Covered

1. Buyer lead is captured, normalized, assigned, and visible in the agent lead workspace.
2. Buyer requirements are collected and matched against available property/listing context.
3. Buyer submits or revises an offer from public/tokenized offer surfaces.
4. Accepted offer converts into a transaction while preserving buyer lead, contact, offer, listing, branch, agent, finance, routing, and participant context.
5. Buyer onboarding collects natural person, foreign buyer, company, trust, cash, bond, and hybrid finance requirements.
6. Finance, canonical document, transfer, workflow, and communication workspaces expose buyer blockers and readiness.
7. Registration completion remains evidence-gated and auditable.

## Routes In Scope

- `/pipeline/leads`
- `/pipeline/leads/:leadId`
- `/client/onboarding/:token`
- `/mobile/buyer-onboarding/:token`
- `/client/:token/buying`
- `/client/:token/buying/:section`
- `/client/offer/:token`
- `/offers/session/:token`
- `/offers/:token`
- `/transactions/:transactionId`

## Diagnostic Command

```bash
npm run verify:buyer-side-lead-registration-diagnostic
```

Static-only preflight:

```bash
node scripts/buyer-side-lead-registration-diagnostic-gate.mjs --static-only
```

Optional browser smoke:

```bash
node scripts/buyer-side-lead-registration-diagnostic-gate.mjs --include-browser-smoke
```

## Evidence Chain

- Lead capture, assignment, requirements, matching, and agent lead workspace tests.
- Buyer onboarding canonical contract and South African buyer scenario tests.
- Offer-to-transaction scenario matrix.
- Accepted-offer transaction spine propagation and routing profile tests.
- Finance tab, document request, transaction document command centre, and canonical document engine tests.
- Canonical workflow gate, workflow rollup, workflow action, transaction overview, and browser entry blocker tests.

## Launch Checklist

- [x] Static route and contract checks pass.
- [x] Buyer lead ingestion, assignment, matching, and requirements suites pass.
- [x] Buyer onboarding contract and SA scenario suites pass.
- [x] Offer-to-transaction matrix passes.
- [x] Transaction spine propagation and routing profile suites pass.
- [x] Finance, document, workflow, registration, and overview suites pass.
- [x] Browser entry blockers pass.
- [x] Optional mobile buyer onboarding browser smoke passes before launch sign-off.
- [ ] Live staging buyer transaction and RLS evidence is captured with real credentials and transaction IDs.

## Current Result

2026-07-11 local diagnostic result: `READY`.

- Static checks: 11 passed, 0 blocked.
- Command checks: 21 passed, 0 blocked.
- Browser smoke: mobile buyer onboarding reached review for individual cash, individual bond, co-purchasing hybrid, company purchaser, and trust purchaser scenarios.
- Command run: `node scripts/buyer-side-lead-registration-diagnostic-gate.mjs --include-browser-smoke`

Note: the browser-inclusive run needs local-server permission because it starts Vite on `127.0.0.1` and drives Playwright.

## Known Gaps Before Final Launch Sign-Off

- Live authenticated staging evidence is not covered by the local-only diagnostic unless staging credentials and a real buyer transaction are supplied.
- RLS cross-workspace evidence requires live staging actor credentials and an unrelated actor probe.
- Public buyer offer routes are contract-checked through the offer matrix, but a dedicated seeded demo offer-token browser smoke should be added if release sign-off requires visual public-offer proof.
