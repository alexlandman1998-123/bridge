# Attorney release — Phase 2 propagation classification

## Objective

Account for every staging propagation-health gap before any repair is authorised. This phase is read-only.

## Command

Run `npm run report:attorney-release-propagation-phase2`. The report is written with owner-only file permissions to `output/attorney-release/phase2-propagation-classification.json`.

## Classification contract

- `seeded_demo`: one of the six deterministic attorney UAT matters.
- `other_demo`: demo data outside the canonical attorney fixture set.
- `genuine`: a non-demo transaction requiring explicit operator allowlisting.
- `demo_automatic_candidate`: valid deterministic source state eligible for the demo-first repair phase.
- `allowlisted_automatic_candidate`: technically valid source state that must not be repaired until its raw transaction ID is resolved privately and explicitly approved.
- `manual_review`: invalid or ambiguous source state that must be corrected before projection.

The manifest never contains raw transaction or lane UUIDs, client names, contact details, or credentials. Its stable redacted record keys support review without exposing matter identifiers. The manifest fingerprint changes whenever its classified content changes.

## Current staging result

- 143 of 143 RPC gaps classified.
- 10 missing transaction baselines.
- 133 missing lane projections.
- 14 canonical seeded-demo candidates.
- 5 other-demo candidates requiring allowlisting.
- 124 genuine-matter candidates requiring allowlisting.
- No stale professional or client-visible projections in the reported gap set.

## Exit criteria

- Classified count exactly equals the health RPC gap count.
- Every entry has a matter class, gap type, process key, visibility expectation, decision, and reason.
- Privacy validation finds no raw UUID.
- No database write occurs.
