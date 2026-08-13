# Document Request Phase 14: Cross-Workspace Parity QA

Phase 14 verifies that the request-container model is coherent across the buyer portal, seller portal, agent workspace, attorney workspace, bond-originator workspace, and internal view.

## Scope

- Bond finance evidence must appear as granular child upload containers wherever buyer finance documents are relevant.
- The broad `income_affordability_documents` key remains a parent roll-up only and must not appear as an upload container.
- Buyer finance child containers must be visible to the buyer, agent, attorney, bond originator, and internal workspace.
- Seller workspaces must not receive buyer finance child containers.
- Child upload containers must preserve `parentDocumentKey`, `childRequirementKey`, and `childContainer`.
- The same additional document request must keep one container id wherever it is visible.
- Seller grouped upload targets remain accepted only for the groups classified in Phase 12 and Phase 13.

## Out Of Scope

- Document generator workflow, wording, policy drafting, generated legal documents, and signing flows remain out of scope.
- This phase does not query Supabase, create portal requests, or mutate production data.
- The older live portal-verification script remains separate from this local parity gate.

## Verification

Run:

```bash
npm run verify:document-request-phase14-cross-workspace-parity
```

The command chains Phase 13 verification, the Phase 14 contract test, and the Phase 14 report.

Report output:

```text
output/document-request-phase14-cross-workspace-parity.json
```
