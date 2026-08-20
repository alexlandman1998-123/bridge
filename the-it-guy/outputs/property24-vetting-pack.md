# Property24 ExDev Vetting Pack

Generated: 2026-08-20T12:38:30.334Z
Status: READY_FOR_VETTING
Environment: exdev
Arch9 listing ID: f35d8916-2ae9-4364-b364-fc279e260fa7
Property24 listing number: 100314793

## Summary

- Passed evidence items: 12
- Manual ExDev items: 0
- Items needing evidence: 0

## Evidence Checklist

### Authenticated echo test
Status: PASS
Evidence: outputs/property24-phase1-smoke.json

### Agency and agent fetch
Status: PASS
Evidence: outputs/property24-phase1-smoke.json

### Catalog fetch and mapping
Status: PASS
Evidence: outputs/property24-phase1-smoke.json, outputs/property24-real-listing-preview.json

### Create listing with image
Status: PASS
Evidence: outputs/property24-publish-listing.json, outputs/property24-record-listing-sync.json, outputs/property24-reconciliation.json

### Update price/description without resending images
Status: PASS
Evidence: outputs/property24-proof-update-without-images.json, outputs/property24-publish-listing.json

### Update listing images
Status: PASS
Evidence: outputs/property24-proof-update-with-images.json, outputs/property24-publish-listing.json

### Status changes
Status: PASS
Evidence: outputs/property24-proof-status-withdrawn.json, outputs/property24-proof-status-active.json, outputs/property24-proof-status-pending.json, outputs/property24-proof-status-sold.json, outputs/property24-proof-status-final-active.json, outputs/property24-status-update.json

### Check is-on-portal
Status: PASS
Evidence: outputs/property24-reconciliation.json

### Reconciliation result
Status: PASS
Evidence: outputs/property24-reconciliation.json

### Invalid listing blocker handling
Status: PASS
Evidence: server/services/property24ListingMapper.js

### Retry/idempotency behavior
Status: PASS
Next step: Show property24_sync_attempts during vetting after a live ExDev apply run.
Evidence: server/property24/workflowService.js, sql/20260820_property24_sync_attempts.sql

### Redacted audit log
Status: PASS
Evidence: outputs/property24-publish-listing.json, outputs/property24-record-listing-sync.json

## Operational Notes

- Credentials are read from server-side environment files only and are not written to the evidence pack.
- Image bytes are redacted from reports; evidence only keeps counts, MIME types, and approximate byte lengths.
- Existing Property24 listingNumber values are stored and reused for updates.
- Photo updates can be minimized with photosChanged=false, which sends photos:null for unchanged images.
- Status-only changes use the dedicated Property24 status endpoint.
- Reconciliation is report-only and can run on a schedule without publishing listings or creating leads.
- Failed readiness checks expose blocker codes before Property24 is called.

## Commands

Safe/report-only:

- `npm run property24:phase1`
- `npm run property24:preview-listing -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --load-image-bytes`
- `npm run property24:reconcile`
- `npm run property24:vetting-pack`

Manual ExDev write evidence:

- `npm run property24:publish-listing -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --apply`
- `npm run property24:publish-listing -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --photos-unchanged --apply`
- `npm run property24:publish-listing -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --apply`
- `npm run property24:status-update -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --status=Withdrawn --apply`
- `npm run property24:status-update -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --status=Active --apply`
- `npm run property24:status-update -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --status=Pending --apply`
- `npm run property24:status-update -- --listing-id=f35d8916-2ae9-4364-b364-fc279e260fa7 --listing-number=100314793 --status=Sold --apply`

