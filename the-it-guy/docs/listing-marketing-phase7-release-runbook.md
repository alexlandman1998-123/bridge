# Listing Marketing Phase 7 controlled release

Phase 7 is the fail-closed release gate for the Listing Marketing tab. It packages the Phase 1–6 automated checks with a controlled cross-channel observation. It does not deploy, publish a production listing, withdraw a production listing, apply migrations, or change remote data.

## Automated gate

Run `npm run check:listing-marketing` from the primary application directory. The gate verifies content and media safeguards, publication lifecycles, channel references and safe links, show-day creation, unified withdrawal, failure recovery, the Phase 7 evidence contract, and the production build.

## Controlled observation

Use one disposable listing in staging or another explicitly authorised test environment. Copy `docs/listing-marketing-phase7-controlled-test.template.json` outside the repository and replace only its non-sensitive references. Mark a check true only after observing it. Keep `deploymentApproved` and `remoteDataOperationApproved` false: completing the observation does not grant either permission.

Test Property24, Private Property, and the agency website only where the relevant non-production or explicitly authorised account is available. If a channel cannot be exercised, its check remains false and the release stays blocked. Do not substitute an Arch9-only save for portal confirmation.

For show days, confirm the property and media are prefilled, the public RSVP link opens, and the event appears in Marketing → Events → Show days. Exercise failed media and save states with reversible inputs.

For withdrawal, first create a controlled partial failure and confirm successful removals are retained. Retry and confirm only failed channels run again. Finally confirm every previously live channel is inactive and the Marketing tab reports Withdrawn rather than an unpublished-change warning.

Validate the completed evidence with:

`node --test scripts/listing-marketing-phase7-release.test.mjs --require-manual --observation=/absolute/path/to/evidence.json`

## Decision and rollback

The release stays on hold if any check is false, a high-severity issue remains, portal state disagrees with Arch9, or the evidence does not match the exact source revision being released.

Before deployment, record the current deployable revision and confirm the normal rollback path for the application. If the deployed Marketing tab creates incorrect portal data, exposes unsafe links, loses saved content, or cannot complete/retry withdrawal, stop further listing operations and roll back the application. Portal records already created or changed must be reconciled explicitly; an application rollback cannot undo external portal mutations.

Deployment and every production portal or remote-data operation require separate explicit approval.
