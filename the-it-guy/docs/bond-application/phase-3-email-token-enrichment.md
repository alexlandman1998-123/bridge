# Phase 3 - Buyer Bond Email Token Enrichment

## Purpose

Phase 3 makes the real buyer portal path/token available before the buyer bond originator introduction email is sent.

Phase 2 created the canonical link builder. Phase 3 feeds that builder with the real portal context from the signed OTP handoff.

## Implementation

The signed OTP handoff in `src/lib/api.js` now resolves buyer portal metadata before calling `notifyBondIntakeStartedForOnboarding`.

The resolver:

- Uses the existing `getOrCreateClientPortalLinkRecord` helper.
- Reuses an active `client_portal_links` row when one already exists.
- Creates a link when the transaction, development, and unit context are available and client portal settings allow it.
- Returns `clientPortalPath`, `clientPortalToken`, `buyerPortalPath`, and `buyerPortalToken`.
- Marks `portalLinkSource` as `client_portal_links`, `unavailable`, `missing_context`, or `resolution_failed`.

## Email Path

`notifyBondIntakeStartedForOnboarding` receives the portal metadata and passes it to `buildBuyerBondApplicationLink`.

The buyer email CTA therefore resolves to:

`/client/:token/bond-application`

when a portal token is available.

## Failure Behaviour

Portal link resolution is guarded. If it fails, the signed OTP handoff continues and the buyer intro email falls back through the canonical Phase 2 helper.

This keeps the transaction workflow moving while making fallback usage visible through `portalLinkSource`.

## Remaining Follow-Up

Phase 4 should split the buyer email copy into a clear "Complete your bond application" intent instead of reusing the broader originator introduction wording.
