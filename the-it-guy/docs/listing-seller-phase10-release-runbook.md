# Listing Seller Phase 10 release gate

This gate verifies the complete direct-listing and Seller workspace journey. It does not deploy, apply migrations, publish listings, send invitations, generate live documents, or write remote data.

## Automated gate

Run `npm run check:listing-seller-workspace`. The command covers the seller entity matrix, canonical updates, mandate replacement states, document uploads, collaboration conflicts, historical normalization, permission boundaries, special-condition mapping, and a production build.

## Controlled manual listing

Use disposable synthetic listings covering the ownership matrix in staging or another explicitly authorised non-production environment. Copy `docs/listing-seller-phase10-controlled-manual-test.template.json` outside the repository, replace the non-sensitive references, and mark a check true only after observing it. Do not record seller personal information, tokens, signed links, document contents, or production credentials.

Test desktop and a mobile viewport. Use separate controlled recipients for owners or trustees when independent access is required. Exercise failed upload, save, invitation and generation states with reversible test inputs. Confirm that conflict handling preserves both the agent and seller submissions.

For mandate edits, confirm all three states: before signature produces a refreshed draft; after partial signature preserves the old partial audit and requires a replacement; after full signature preserves the signed original and requires an amendment/replacement.

Existing signed documents must remain downloadable and unchanged. A seller entity change may retire or add requirements only after the agent confirms the new entity. Special conditions must appear in the mandate; internal agent notes must not.

## Release decision

Validate the completed evidence with:

`node scripts/listing-seller-end-to-end-release.test.mjs --require-manual --observation=/absolute/path/to/evidence.json`

Production deployment remains blocked unless every check passes, no high-severity issue remains, and deployment is separately approved. Database migrations and remote data operations require their own explicit approval.

## Seller MVP acceptance (1 October 2026)

The current local run is recorded in the primary README under “Seller MVP acceptance
outcome”. The local PostgreSQL matrix covers 13 ownership scenarios with each of
sole, open and dual mandates; it does not replace a hosted browser/storage test.

For the no-contact run, leave optional delivery addresses blank and record zero
client emails, invitations and reminders through capture, review, download and
wet-ink upload/review. Confirm readback from both the linked seller lead and the
listing, repeat conversion without creating duplicates, and test explicit No,
zero amounts and clearing a previously saved contact field. Use the exact current
reviewed copy for all required signatures. Check its status after reopening both
entry points. Agency review is not external FICA verification.

Run the separate per-document portal signing scenario only with authorised test
recipients and an enabled route; otherwise leave `portalSigningWhenEnabled` false
and describe it as unverified. The retired combined signing route must remain
unavailable. Do not mark the entire gate passed by omitting a check: the validator
now requires every named entry in the template.

Run `scripts/sql/seller-mvp-acceptance-audit.sql` read-only for historical review
candidates. Review the latest result before planning any repair; different legacy
snapshots can be harmless and must not be automatically overwritten. Preserve
approved/signed HTML, digests and original uploads.

The production read-only check on 1 October found the broad onboarding policies
still active and migration `20261001092739` absent. Release the compatible app/API
and the reviewed Phase 1 migration through the database release runbook before
claiming live access acceptance. No release or remote test writes were performed
by this local acceptance run.
