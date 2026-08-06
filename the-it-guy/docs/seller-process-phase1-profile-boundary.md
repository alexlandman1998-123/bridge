# Seller Process Phase 1 Profile Boundary

Date: 2026-08-06

## Purpose

Phase 1 introduces a seller process profile resolver without changing the
seller journey, readiness gates, mandate lifecycle, document requirements,
appointments, partner handoffs, notifications, or reporting.

This phase is an isolation layer only. It lets later Kingstons work ask one
central question: which seller process profile is this organisation configured
to use?

## Supported Profiles

The supported profile keys are:

- `default_residential`
- `kingstons_residential`

`default_residential` remains the fallback for every organisation unless a
known profile is explicitly configured.

Default organisation settings now carry:

```json
{
  "sellerProcess": {
    "profile": "default_residential"
  }
}
```

This is metadata only in Phase 1.

## Activation Write Path

Phase 1 also exposes one explicit activation path:

```js
updateOrganisationSellerProcessProfile({
  sellerProcessProfile: 'kingstons_residential',
})
```

The write path:

- requires organisation admin access
- validates the requested profile against known profile keys
- writes only `organisation_settings.settings_json.sellerProcess.profile`
- preserves existing organisation settings metadata
- records a `seller_process_profile_updated` audit event
- clears the organisation runtime cache after persistence

It does not expose a public UI toggle, infer Kingstons from branding, or change
the visible seller journey by itself.

## Explicit Configuration Only

Kingstons behaviour must not be inferred from organisation names, branch names,
domains, user emails, partner names, or free-form labels.

The resolver accepts the profile from explicit settings paths such as:

- `sellerProcessProfile`
- `seller_process_profile`
- `sellerProcess.profile`
- `seller_process.profile`
- `settings.sellerProcess.profile`
- `organisationSettings.sellerProcess.profile`
- `organisation.seller_process_profile`
- `onboarding.sellerProcess.profile`
- `metadata.seller_process_profile`

Unknown profile values are treated as configured-but-unknown and safely fall
back to `default_residential`.

## Non-Spillover Contract

Phase 1 must preserve these rules:

- default seller journey stages remain unchanged
- default readiness actions remain unchanged
- mandate signature lifecycle side effects remain unchanged
- valuation appointments do not become default process stages
- valuation, defects, and FICA evidence do not become default requirements
- partner surfaces do not receive Kingstons-specific states yet

Future profile-specific behaviour must route through
`src/services/sellerProcessProfileService.js` rather than scattered
Kingstons-specific conditionals.

## Phase 1 Verification

Run:

```bash
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```

The Phase 1 contract proves that Kingstons activates only through explicit
profile configuration and that the Phase 0 default freeze remains intact.
