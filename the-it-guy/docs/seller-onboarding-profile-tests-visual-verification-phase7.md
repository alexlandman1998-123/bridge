# Seller Onboarding Profile Tests + Visual Verification - Phase 7

## Objective

Phase 7 closes the seller onboarding/profile sync work with a repeatable verification gate. It proves the source-of-truth write path, profile save wiring, protected merge behavior, migration/backfill guardrails, and onboarding branding/visual surfaces are all covered before release.

## Required Local Gate

Run:

```sh
npm run verify:seller-onboarding-profile-sync
```

This command covers:

- Phase 2 canonical persistence helper.
- Phase 3 agency Seller Profile save wiring.
- Phase 4 protected merge guardrails.
- Phase 5 buyer/seller onboarding branding contract.
- Phase 6 seller profile alignment and migration/backfill guardrails.
- Phase 7 verification contract.

## Visual Verification

Run a local dev server, then run:

```sh
npm run test:onboarding-branding-browser-smoke -- --base-url http://127.0.0.1:5175
```

The browser smoke captures:

- buyer desktop onboarding landing
- buyer mobile onboarding landing
- seller desktop onboarding landing
- seller mobile onboarding landing

Review the generated screenshots in `tmp/onboarding-screenshots`. Confirm:

- buyer and seller onboarding use the same agency branding system
- agency mark is visible in first viewport
- start CTA is visible and not overlapped
- brand colour CSS variables resolve on the landing surface
- no Vite/browser error overlay appears

## Release Notes

This phase does not mutate production data. It does not run a live backfill. The Phase 6 SQL remains audit-only, and any future migration must be reviewed from that bucketed output first.
