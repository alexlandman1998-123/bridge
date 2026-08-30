# Rentals Phase 52 — production readiness

## Implemented safeguards

- Vacancy media stays in the private `rental-vacancy-media` bucket.
- Storage permits authenticated upload only where the user has branch access to the vacancy's property.
- Uploads are limited to 20 MB and JPEG, PNG, WebP, MP4, or MOV at both the browser and Storage bucket layers.
- Rental pages provide explicit loading, error, and empty states for vacancies, applications, tenancies, collections, and financial imports.
- The tenancy activity surface remains the operational audit record for financial, lease, and inspection actions.

## Release check

Run from `the-it-guy/`:

```bash
npm run test:rentals-phase52
```

Then complete the Phase 50 disposable-tenancy walkthrough on a mobile-width browser. Confirm that a 21 MB file and an SVG are rejected before upload, a permitted 20 MB-or-smaller file uploads, and a user from another branch cannot list, upload, or delete that vacancy's media.

## Operational response

- For a failed import or payment action, retain the error and the test/reference ID; do not retry by duplicating a financial record.
- For a media failure, preserve the original file and retry only after correcting its type/size or the user's branch membership.
- For an authorisation failure, verify the active membership and branch assignment before escalating. Never use a browser-exposed service key.
