# Listing Seller Phase 10 release gate

This gate verifies the complete direct-listing and Seller workspace journey. It does not deploy, apply migrations, publish listings, send invitations, generate live documents, or write remote data.

## Automated gate

Run `npm run check:listing-seller-workspace`. The command covers the seller entity matrix, canonical updates, mandate replacement states, document uploads, collaboration conflicts, historical normalization, permission boundaries, special-condition mapping, and a production build.

## Controlled manual listing

Use one disposable listing in staging or another explicitly authorised non-production environment. Copy `docs/listing-seller-phase10-controlled-manual-test.template.json` outside the repository, replace the non-sensitive references, and mark a check true only after observing it. Do not record seller personal information, tokens, signed links, document contents, or production credentials.

Test desktop and a mobile viewport. Use separate controlled recipients for owners or trustees when independent access is required. Exercise failed upload, save, invitation and generation states with reversible test inputs. Confirm that conflict handling preserves both the agent and seller submissions.

For mandate edits, confirm all three states: before signature produces a refreshed draft; after partial signature preserves the old partial audit and requires a replacement; after full signature preserves the signed original and requires an amendment/replacement.

Existing signed documents must remain downloadable and unchanged. A seller entity change may retire or add requirements only after the agent confirms the new entity. Special conditions must appear in the mandate; internal agent notes must not.

## Release decision

Validate the completed evidence with:

`node scripts/listing-seller-end-to-end-release.test.mjs --require-manual --observation=/absolute/path/to/evidence.json`

Production deployment remains blocked unless every check passes, no high-severity issue remains, and deployment is separately approved. Database migrations and remote data operations require their own explicit approval.
