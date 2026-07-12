# Attorney Workflow Phase 6 Person-Level Requirements

Date: 2026-07-12

## Goal

Make person-level legal-document obligations obvious inside the attorney transaction UI so complex parties do not get stuck behind aggregate rows like director IDs, trustee IDs, spouse consent, signatory authority, or beneficial-owner FICA.

## Implemented

- Added a `Person-Level Requirements` panel to the attorney Documents workspace.
- Derived the panel from canonical `requiredDocumentRows`, so it reflects the same source of truth as readiness, missing documents, and the document library.
- Grouped person-level rows by party, role, sequence, and generated participant metadata.
- Covered directors, trustees, spouses, co-owners, signatories, and beneficial owners.
- Kept support for large legal entities: a company with 10 directors renders 10 visible director rows when the underlying canonical requirements contain 10 director instances.
- Preserved existing upload behavior by launching `openDocumentUploadModal({ requirement })` for open person-level rows.
- Added role-count and open-count chips so attorneys can see how many directors, trustees, spouses, co-owners, signatories, and beneficial owners are active.

## Verification

```bash
npm run test:attorney-workflow-phase6-person-level-requirements
npm run verify:attorney-workflow-phase6-person-level-requirements
```

The full Phase 6 verification command runs:

- Attorney workflow Phase 5 signing appointment gate.
- Legal requirement cardinality gate for directors and trustees.
- Legal beneficial-ownership gate for beneficial-owner cardinality.

## Phase 6 Acceptance

- [x] Attorney Documents workspace exposes person-level requirement rows.
- [x] Directors and trustees are grouped per person, not only as aggregate legal-entity rows.
- [x] Spouse, co-owner, signatory, and beneficial-owner categories are first-class in the panel.
- [x] Open rows can launch the existing upload workflow.
- [x] Phase 0 blocker `B-ATTY-0-6` is closed.
- [x] Verification command exists: `npm run verify:attorney-workflow-phase6-person-level-requirements`.

## Deferred

- Phase 7 actionable blocker UI is implemented in `docs/audits/attorney-workflow-phase7-actionable-blockers.md`.
- Exceptional manual-review operational ownership remains Phase 8.
- Strict live multi-firm evidence remains pending from Phase 4 until staging fixture values are supplied.

Decision: GO TO PHASE 7 WITH PERSON-LEVEL REQUIREMENTS VISIBLE.
