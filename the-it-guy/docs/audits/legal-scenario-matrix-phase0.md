# Legal Scenario Matrix Phase 0

Implemented on 2026-07-11.

## Goal

Freeze the legal scenario rule map before changing document-request behavior. Phase 0 establishes which buyer, seller, finance, property, and condition branches are supported, require manual review, or are unsupported.

This phase does not yet enforce runtime blocking. It creates the source contract that Phase 1 can use as the support-boundary gate.

## Source Contract

| Artifact | Purpose |
| --- | --- |
| `src/core/legal/legalScenarioMatrix.js` | Versioned canonical scenario matrix and classifier. |
| `scripts/legal-scenario-matrix.test.mjs` | Regression lock for supported, manual-review, and unsupported scenarios. |
| `npm run test:legal-scenario-matrix` | Phase 0 verification command. |

## Status Definitions

| Status | Meaning |
| --- | --- |
| `supported` | Baseline document automation may proceed for ordinary workflow handling. |
| `manual_review` | Intake may be collected, but automation must pause for conveyancer or compliance review before progression. |
| `unsupported` | The automated workflow must stop and hand off outside the current product scope. |

## Locked Axes

- Buyer type
- Seller type
- Finance type
- Property or tenure type
- Suspensive or special condition type

## Key Phase 0 Decisions

- Foreign individual buyer is `manual_review`, even though baseline document prompts exist.
- Seller POA is `manual_review`, even though seller-side POA capture exists.
- Close corporations are `manual_review` until member authority rules are first-class.
- Business rescue and liquidation seller branches are `unsupported`.
- Share block, long-term leasehold, and land-claim/restitution property branches are `unsupported`.
- `other` legal types are `manual_review`, not supported automation.
- Unrecognized non-empty scenario values are `unsupported`; missing scenario values are `manual_review`.

## Acceptance

- The scenario matrix is versioned as `legal_scenario_matrix_v1`.
- All locked Phase 0 fixtures resolve to their expected status.
- Standard branches remain supported.
- High-risk branches cannot be normalized into supported aliases.
- Whole-matter classification returns the highest-risk status across all supplied axes.

## Verification

Run:

```bash
npm run test:legal-scenario-matrix
```
