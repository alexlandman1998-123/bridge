# Buyer-Side Launch Hardening Phase 3

Implemented on 2026-07-11.

## Goal

Implement the public buyer offer-token browser smoke harness for the buyer-side launch journey from buyer lead to registration.

Phase 3 verifies the buyer-visible token entry points before token delivery and document privacy phases. It covers direct buyer offer links, the `/offers/:token` direct-offer alias, post-viewing offer sessions, invalid tokens, expired tokens, duplicate live offer paths, and revised/counter offer paths.

## Commands

Local contract verification:

```bash
npm run verify:buyer-side-phase3-offer-token-browser
```

Static-only preflight:

```bash
node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --static-only
```

Local mocked browser smoke:

```bash
node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --browser --confirm-staging --require-browser
```

Strict live staging browser evidence:

```bash
node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --live --confirm-staging --require-browser
```

## Browser Matrix

| Case | Route | Expected evidence |
| --- | --- | --- |
| Direct valid offer | `/client/offer/:token` | Secure buyer offer page renders, property context loads, and submit action is visible. |
| Offer detail alias | `/offers/:token` | Direct offer alias renders the same secure buyer offer surface. |
| Post-viewing offer session | `/offers/session/:token` | Viewed properties load and buyer offer form is available. |
| Invalid direct offer | `/client/offer/:token` | Hard unavailable state renders without leaking listing, buyer, or offer detail. |
| Expired direct offer | `/client/offer/:token` | Expired-token copy renders without allowing submission. |
| Duplicate live offer | `/offers/session/:token` and `/client/offer/:token` | Open/live negotiation warning renders and duplicate submission is blocked. |
| Revised direct offer | `/client/offer/:token` | Counter/revised-offer state renders with revised submission copy. |

## Staging Token Contract

Real values must live in `.env.staging.local` or managed deployment secrets. `.env.example` only contains empty placeholders.

Required strict-live token state:

- `BUYER_SIDE_LAUNCH_BASE_URL`
- `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
- `BUYER_SIDE_STAGING_OFFER_TOKEN`
- `BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN`
- `BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN`
- `BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN`
- `BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN`
- `BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN`

Optional but recommended:

- `BUYER_SIDE_STAGING_INVALID_OFFER_TOKEN`

If an explicit invalid token is not configured, the live smoke uses a generated non-existent token for the invalid-token route.

## Static Contracts

Phase 3 gates these contracts before browser evidence:

- Direct offer route `/client/offer/:token` is registered.
- Offer detail alias `/offers/:token` routes to the direct buyer offer surface.
- Post-viewing offer session route `/offers/session/:token` is registered.
- Direct offer page renders valid, invalid, expired, live-review, and revised states.
- Post-viewing offer portal renders valid, invalid, expired, duplicate/live, and revised states.
- Canonical buyer lifecycle service gates offer token lookup by status, expiry, and buyer resubmission eligibility.
- Legacy offer invite service still rejects invalid and expired invite tokens.
- Phase 0 and Phase 8 launch docs include Phase 3 commands.

## Acceptance

- [x] Phase 3 harness is implemented.
- [x] Phase 3 package command is exposed.
- [x] Phase 3 static route, page, and service contracts are gated.
- [x] Phase 3 local mocked browser smoke is available.
- [x] Phase 3 live browser mode is staging-confirmed.
- [ ] Valid, expired, duplicate, and revised live staging offer tokens are supplied.
- [ ] Live staging public-token browser evidence passes with `READY_LIVE` or `READY_LIVE_WITH_WARNINGS`.

## Current Result

2026-07-11 local contract result: `READY_LOCAL_CONTRACT`.

- Static checks: 12 passed, 0 blocked.
- Local prerequisite commands: 1 passed, 0 blocked.
- Command run: `npm run verify:buyer-side-phase3-offer-token-browser`

2026-07-11 local mocked browser result: `READY_BROWSER_SMOKE`.

- Browser cases: direct valid offer, offer detail alias, post-viewing offer session, invalid direct offer, expired direct offer, duplicate live offer session, and revised direct offer all passed.
- Browser checks: no page errors and no blocking console errors.
- Command run: `node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --browser --confirm-staging --require-browser --skip-prerequisites`

2026-07-11 strict live result: `BLOCKED` as expected until live token fixtures are supplied.

- Command run: `node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --live --confirm-staging --require-browser --skip-prerequisites`
- Blocking configuration still required:
  - `BUYER_SIDE_LAUNCH_BASE_URL`
  - `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
  - `BUYER_SIDE_STAGING_OFFER_TOKEN`
  - `BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN`
  - `BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN`
  - `BUYER_SIDE_STAGING_DUPLICATE_OFFER_TOKEN`
  - `BUYER_SIDE_STAGING_DUPLICATE_OFFER_SESSION_TOKEN`
  - `BUYER_SIDE_STAGING_REVISED_OFFER_TOKEN`

Live staging public-token evidence is still required because real token-state fixtures are not stored in the repository.

## Phase 3 Decision

Decision: PHASE 3 HARNESS IMPLEMENTED; LIVE TOKEN EVIDENCE REQUIRED.
