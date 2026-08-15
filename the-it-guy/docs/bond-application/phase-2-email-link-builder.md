# Phase 2 - Buyer Bond Email Link Builder

## Purpose

Phase 2 replaces service-local buyer bond application URL construction with one canonical helper. The helper is responsible for turning buyer portal inputs into the route the app owns:

`/client/:token/bond-application`

## Implementation

The canonical helper lives in `src/lib/buyerBondApplicationLink.js`.

It accepts:

- `applicationLink`
- `applicationUrl`
- `applicationPath`
- `clientPortalPath`
- `buyerPortalPath`
- `portalPath`
- `portalToken`
- `clientPortalToken`
- `buyerPortalToken`
- `token`
- `baseUrl`, `appBaseUrl`, or `origin`

It returns a relative link by default and returns an absolute link when the input is absolute or a base URL is provided.

## Normalization Rules

- `/client/:token` becomes `/client/:token/bond-application`.
- `/client/:token/buying`, `/client/:token/documents`, `/client/:token/team`, and other buyer portal sub-routes become `/client/:token/bond-application`.
- Query strings and hash fragments are preserved.
- Token input is encoded and converted into `/client/:token/bond-application`.
- Non-buyer paths do not become buyer links. They fall back to `/client-access/bond-application`.

## Service Wiring

`notifyBondIntakeStartedForOnboarding` now sends buyer-intro metadata with `applicationLink` built by `buildBuyerBondApplicationLink`.

Internal originator intake notifications still use their internal `/bond/applications` path. Buyer portal links and originator workspace links remain separate.

## Remaining Gap For Phase 3

The canonical helper can build the correct destination when given a portal path or token, but the signed OTP handoff call still does not pass the real buyer portal token/path into the notification service.

Phase 3 must enrich that call before the buyer intro email is sent.
