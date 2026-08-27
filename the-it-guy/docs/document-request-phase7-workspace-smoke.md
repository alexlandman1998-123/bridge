# Document Request Phase 7: Workspace Smoke QA

## Purpose

Phase 7 runs a cross-workspace smoke test for the document request programme.

It verifies that canonical required documents and professional-created request containers are visible to the correct audiences, hidden from the wrong audiences, and represented by the same container id wherever they appear.

## Audiences

The smoke matrix covers:

- buyer portal;
- seller portal;
- agent workspace;
- attorney workspace;
- transfer attorney lane;
- cancellation attorney lane;
- bond originator workspace;
- internal workspace.

## Smoke Fixture

The synthetic transaction includes:

- trust buyer;
- company seller;
- hybrid finance;
- existing seller bond;
- sectional title;
- gas, electric fence, solar, and tenant-occupied property triggers;
- transfer-attorney, cancellation-attorney, and bond-originator additional document requests.

## Hard Gates

Phase 7 passes only when:

- every audience smoke expectation passes;
- all eight declared audiences have an explicit smoke expectation, including transfer- and cancellation-attorney lanes;
- no request has multiple container ids across audiences;
- deferred seller upload documents do not leak into any workspace;
- `shared_role_players` requests remain hidden from client portals even when legacy target fields name a buyer or seller;
- the client portal document centre builder returns request containers for additional document requests.

The deferred-document check imports the same runtime policy used by seller requirement generation and the seller portal, preventing the QA fixture from drifting away from production filtering.

## Explicit Guard

The following keys remain blocked from seller upload smoke fixtures:

- `property_acquisition_record`
- `capital_improvement_records`

## Verification

Run:

```sh
npm run verify:document-request-phase7-workspace-smoke
```

The generated report is written to:

```text
output/document-request-phase7-workspace-smoke.json
```
