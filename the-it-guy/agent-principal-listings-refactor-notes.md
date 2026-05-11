# Agent Principal Listings Refactor Notes

## Files changed
- src/pages/AgentListings.jsx
- src/components/AddDevelopmentModal.jsx

## Seller lead modal improvements
- Refactored layout into grouped sections (`Seller`, `Property`, `Lead Routing`) with cleaner spacing and clearer field hierarchy.
- Improved modal ergonomics: cleaner section cards, better field distribution on desktop/mobile, and consistent footer action placement.
- Residential actions now separate into:
  - `New Seller Lead`
  - `Add Listing` (manual fallback flow)

## Add Listing flow added
- Added a manual residential listing flow in `AgentListings` modal mode (`listingModalFlow = manual`).
- Captures manual fallback data including:
  - listing title, address, suburb/city/province, property type/category
  - bedrooms/bathrooms/parking, erf/floor size
  - listing price, commission %, commission amount
  - mandate type/start/end
  - assigned agent, branch/organisation, co-agents
  - listing status (`draft`, `active`, `under_offer`, `sold`, `archived`)
- Added mandate upload prompt and supporting documents selectors (filename capture in this phase).

## Manual mandate + commission handling
- Added explicit manual mandate warning copy for manual listing flow.
- Business rule enforced in UI:
  - `active` status is blocked if no signed mandate file is selected.
- Added live-status guard for manual flow so live statuses require listing price.
- Manual fallback persists commission/mandate context into listing notes payload for traceability without schema changes.

## Residential listing card changes
- Removed duplicate pill row clutter; retained one clear status pill.
- Added address directly below price.
- Added compact detail row for bedrooms, bathrooms, and parking.
- Added explicit `Go to Listing` button with route navigation.
- Simplified card footer and reduced dense metadata blocks.

## Development heading and actions
- Updated heading from `Development Listings Workspace` to `Development Listings`.
- Added left-aligned development heading action buttons:
  - `New Development`
  - `Invite Developer Access`

## Developer Access invite/email automation status
- Audited `src/components/AddDevelopmentModal.jsx`.
- Existing automation is already present and reused:
  - email via `invokeEdgeFunction('send-email', { type: 'developer_access_invite', ... })`
  - WhatsApp via `sendWhatsAppNotification(...)`
  - invite token + onboarding link generation (`/auth?developer_invite=...`)
- No fake completion added; existing fail-safe console logging remains.

## Commercial Inputs step removal (Agent New Development flow)
- Implemented context-aware step model (`getStepsForContext(isAgentContext)`).
- For agent context, `financials` (Commercial Inputs / Basic Costings) is removed from step navigation and rendering.
- Step navigation, skip buttons, and finalization flow now use active step IDs rather than hardcoded indexes.

## Agent Team auto-populate behavior
- Added workspace/profile-aware legal defaults.
- `Agent Team` first row now auto-populates from current user profile/workspace context.
- Multi-agent support remains intact (`Add Another Agent`).
- Team guidance copy updated to indicate co-agent/invite-by-email behavior.

## Commercial / Industrial lock/hide behavior
- Removed `Commercial` and `Industrial` from active listing tabs in principal listings view.
- Local storage tab restore now only allows `residential` and `developments`.
- Active listing UX now focuses on:
  - Residential
  - Developments

## Permission considerations
- No auth, onboarding, RLS, or schema logic was changed.
- Existing backend permission model remains unchanged.
- UI changes respect current service-layer access patterns and current user role context.

## Known gaps
- Manual mandate/supporting document file inputs currently capture selected filenames in this phase; they do not yet upload files directly from this modal into storage.
- Manual listing extra fields are persisted via existing listing fields + notes payload without schema expansion.
- `Invite Developer Access` in heading intentionally routes through the existing `New Development` flow where invite mode is selected in Developer Access step.

## Build result
- `npm run build`: success
- Existing build warnings remain (pre-existing CSS minify warning and bundle-size warning).

## Targeted lint result
- `npx eslint src/pages/AgentListings.jsx src/components/AddDevelopmentModal.jsx`: success
