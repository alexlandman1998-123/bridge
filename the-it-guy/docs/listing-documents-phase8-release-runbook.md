# Listing Documents Phase 8 release gate

This gate verifies the complete Listing → Documents journey. It does not deploy, apply migrations, upload customer files, send requests or reminders, or write remote data.

## Automated gate

Run `npm run check:listing-documents`. The command covers the entity/requirement matrix, canonical status model, upload persistence and failure recovery, review workflow, request delivery, transaction continuity, role visibility, the Phase 8 release contract, and a production build.

The automated gate is necessary but cannot prove that deployed RLS/storage policies, authenticated portals, signed links, notification delivery, browser concurrency, or responsive layouts behave correctly in the target environment.

## Controlled test

Use disposable records in staging or another explicitly authorised non-production environment. Copy `docs/listing-documents-phase8-controlled-test.template.json` outside the repository and record only non-sensitive references. Evidence must identify the exact source revision and every check must be observed as passing.

Test distinct controlled accounts for the seller, co-owner or trustee, agent, manager, compliance reviewer, buyer, bond originator and attorney. Verify both allowed and denied access. A participant must never gain seller FICA access merely because they are attached to the transaction.

Exercise upload, refresh, replacement, review, rejection and approval. Simulate storage, metadata, notification and transaction-promotion failures with reversible test data. Confirm that a successful source upload survives a promotion failure and that retry does not create duplicate documents or messages.

For concurrent editing, keep both an agent and seller session open. Confirm that a stale edit becomes a visible conflict and that neither submission silently overwrites the other.

Open a historical listing and its signed documents without changing them. Change a disposable listing's confirmed seller entity only through the controlled workflow and verify that existing document versions remain available while the checklist changes.

## Malware-scanning decision

`docs/listing-documents-phase8-security-risk.json` records that server-side malware scanning is not configured. Its current decision is `block_production_release`. Browser file-type validation is not malware scanning.

Production remains blocked until either:

1. server-side scanning is configured and verified; or
2. authorised security and product owners separately record an explicit, time-bounded risk acceptance.

The Phase 8 implementation does not grant that acceptance.

## Release decision

Validate completed evidence with:

`node --test scripts/listing-documents-phase8-release.test.mjs -- --require-manual --observation=/absolute/path/to/evidence.json`

All automated and controlled checks must pass, no high-severity issue may remain, the malware risk must be resolved or formally accepted, and deployed role-by-role access must be verified. Deployment and every remote database operation require separate explicit approval.
