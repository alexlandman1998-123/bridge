# Manual Review Packet

Generated: `2026-07-29T19:24:57Z`

Version: `202607270015`
Stream: `bond_finance_runtime`
Original file: `202607270015_bond_finance_document_metadata_cleanup.sql`
Original action: `manual_data_review`
Current decision: `apply_original_after_dependency_check`

## Why This Is Gated

This migration updates existing finance document metadata and inserts missing bond grant requirements for active bond or hybrid transactions. The Phase 5 catalog audit classified it as `no_static_objects`, so catalog checks cannot prove whether production already has the intended data outcome.

## Intended Outcome

- Normalize bond grant, bond approval, home loan approval, and guarantee document requirements into the `finance` group.
- Set bond-originator ownership metadata for matching required documents.
- Seed a `bond_grant` required document for active bond or hybrid transactions where one does not already exist.
- Normalize existing uploaded finance documents to canonical document types and finance metadata.

## Required Review Before Clearance

- Count matching `transaction_required_documents` rows before and after a staging run.
- Confirm the `bond_grant` insert does not create duplicates for transactions that already have equivalent grant documents.
- Confirm guarantee rows remain shared, while grant and approval rows remain client-scoped.
- Confirm existing uploaded `documents` rows are not incorrectly reclassified from unrelated guarantee or finance wording.
- Run the bond finance document/request smoke after staging.

## Phase 20 Live Review

Read-only production audit on `2026-07-29T19:32:16Z` found:

- Ledger row recorded: `false`
- Matching required document rows: `20`
- Active bond/hybrid transactions missing a canonical `bond_grant`: `189`
- Uploaded finance documents matching grant/approval/guarantee wording: `1`

The original migration is idempotent for the seeded `bond_grant` rows because it uses `on conflict (transaction_id, document_key) do nothing`. The update clauses are deterministic metadata normalization for rows matching the finance document pattern.

## Phase 20 Decision

Clear for the staging runner as:

`apply_original_after_dependency_check`

Staging evidence must still prove row-count deltas, catalog checks, bond finance behavior checks, and rollback/no-residue before this can move toward production.

## Blockers

- None
