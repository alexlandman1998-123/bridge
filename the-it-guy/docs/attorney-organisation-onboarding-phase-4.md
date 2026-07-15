# Attorney organisation onboarding — Phase 4

## Outcome

Attorney Organisation Settings now presents and saves an attorney-firm contract instead of inheriting agency terminology and options.

## Attorney-specific Settings

The organisation page now uses:

- firm information and registered-office sections;
- independent, multi-office, specialist, and full-service firm operating models;
- legal practice focus options;
- LPC and legal-practice-number terminology;
- firm, office, attorney, matter, and legal-team visibility language;
- firm administrator, managing partner, office manager, and office-management labels;
- attorney-specific page, overview, branding, profile, and help copy.

Agency and bond-originator Settings retain their existing options and wording.

## Canonical save contract

`buildAttorneyOrganisationSettingsInput` maps the hydrated attorney Settings snapshot back to the canonical organisation fields. It covers:

- legal and registration identity;
- VAT, website, email, and phone;
- registered address;
- light and dark logos with bucket/path metadata;
- primary and secondary brand colours.

Explicitly cleared branding values remain empty rather than being silently restored from an older organisation snapshot.

The existing Phase 3 database projection then keeps legacy attorney reads aligned with these canonical Settings edits.

## Verification

```sh
npm run test:attorney-organisation-phase4
```

The Phase 4 contract test covers onboarding-to-Settings hydration, Settings-to-canonical mapping, explicit logo clearing, and attorney-specific UI controls.
