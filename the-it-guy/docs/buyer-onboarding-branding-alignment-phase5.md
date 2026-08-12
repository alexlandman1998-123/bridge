# Buyer Onboarding Branding Alignment - Phase 5

## Objective

Buyer onboarding should feel like the same branded experience as seller onboarding. The public buyer landing, in-form header, desktop hero, active controls, and sticky actions should all use the agency branding snapshot instead of fixed Arch9 buyer colours.

## Alignment Points

- Buyer onboarding resolves branding through the shared `resolveOnboardingBranding` helper.
- The buyer form now sets `--buyer-brand-*` CSS variables from the resolved primary, secondary, and accent colours.
- Mobile question headers use the same agency logo/name and brand action colour as the landing page.
- Desktop buyer onboarding now keeps the agency mark visible in the first form viewport, matching the seller onboarding pattern.
- Selected options, progress bars, focus rings, review icons, and sticky primary actions use the resolved brand action colour.

## Fallback

If no agency colours are configured, the buyer form falls back to the existing navy and yellow palette so current unbranded demo links keep their visual identity.
