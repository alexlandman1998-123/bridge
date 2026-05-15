# Attorney Transaction Workflow Phase 3 Notes

## Scope Completed

Phase 3 adds the conditional workflow logic layer only. It does not create full attorney lane UI, readiness scoring, blocker automation, dashboard analytics, or client-facing legal update redesign.

## New Resolver Layer

Implemented:

- `src/services/attorneyWorkflow/transactionFactsResolver.js`
- `src/services/attorneyWorkflow/attorneyWorkflowResolver.js`
- `src/services/attorneyWorkflow/attorneyWorkflowService.js`

The resolver normalizes transaction facts into a single facts object and then derives:

- required attorney lanes
- optional/not-required attorney lanes
- required attorney roles
- document requirements
- signing requirements
- attorney update options
- missing/unreliable data warnings

## Field Inputs Checked

The facts resolver checks drift-tolerant field candidates:

- finance: `finance_type`, `transaction_finance_type`, `funding_type`, `deal_type`, `purchase_type`, `purchase_finance_type`
- transaction type: `transaction_type`, `property_transaction_type`, `sale_type`, `listing_type`, `deal_type`
- buyer entity: `buyer_entity_type`, `buyer_type`, `purchaser_type`, `purchaser_entity_type`, `client_type`, and nested buyer fields
- seller entity: `seller_entity_type`, `seller_type`, `vendor_type`, and nested seller fields
- cancellation: `cancellation_required`, `requires_cancellation`, `bond_cancellation_required`, `seller_requires_bond_cancellation`
- seller bond: `seller_has_existing_bond`, `seller_has_bond`, `seller_existing_bond`, `existing_bond`, `has_existing_bond`, `outstanding_bond`, `bond_status`

## Fallback Rules

Safe defaults:

- transfer attorney is always required
- bond attorney is required only when finance is clearly bond or hybrid
- cancellation attorney is required only when seller bond/cancellation flags are true
- missing finance/entity/transaction-type fields produce internal warnings instead of client-facing noise

## Lane Logic

Transfer lane:

- always required

Bond lane:

- required for `bond`, `bonded`, `bond_finance`, `mortgage`, `hybrid`, `cash_and_bond`, `partial_bond`, `combination`
- hidden/not required for cash by default

Cancellation lane:

- required when seller has an existing bond or cancellation is explicitly required

## UI Integration

The transaction attorney assignment panel now shows a basic "Resolved Legal Workflow" section:

- required/not-required transfer, bond, and cancellation roles
- reason for each lane decision
- missing required assignment indicator
- internal-only confidence warnings

This compares required roles against existing attorney assignments but does not auto-create assignments.

## QA Fixtures

Added:

- `scripts/verify-attorney-workflow-resolvers.mjs`

The script validates:

- cash deal
- bond company buyer
- hybrid trust seller with cancellation
- development sale
- missing finance fallback
- role-filtered update options

Result:

- `node scripts/verify-attorney-workflow-resolvers.mjs` passed with 5 fixtures.
- Targeted lint for the new resolver files and updated assignment section passed.
- `npm run build` passed.
- Full `npm run lint` still fails on existing repo-wide lint debt outside this Phase 3 slice: 95 errors and 31 warnings.

Build warnings:

- Existing CSS minifier warning around generated CSS token `-: TZ.;`
- Existing large bundle warning for the main Vite chunk.

## Phase 4 Readiness

Phase 4 can now consume the resolver output to build actual attorney workflow lanes, readiness scoring, blocker detection, document automation, and client/legal update surfaces.
