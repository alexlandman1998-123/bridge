# Client portal launch — Phase 3 branded visual system

## Outcome

Phase 3 establishes one agency-controlled visual identity contract for buyer and seller portals on desktop and mobile. It modernises the foundational interaction treatment without changing transaction data, permissions, portal tokens, document workflows, or production messaging behaviour.

## Shared theme contract

Agency-controlled tokens:

- Primary colour
- Secondary colour
- Accent colour
- Light and dark logo
- Agency name
- Support identity

The theme derives accessible foreground colours, branded gradients, active navigation, hero overlays, primary actions, accent actions, surface tokens, card geometry, and focus treatments.

Semantic colours are deliberately not agency-controlled:

| Meaning | System token |
| --- | --- |
| Success | `--portal-success` |
| Warning | `--portal-warning` |
| Error | `--portal-error` |
| Information | `--portal-information` |
| Focus | `--portal-focus` |

This prevents an agency palette from changing the meaning or readability of transaction and compliance states.

## Buyer and seller adoption

- Buyer demo and production portals publish the same CSS theme variables.
- The seller portal resolves primary, secondary, and accent colours from listing, selling-context, or organisation branding with safe defaults.
- Buyer and seller desktop sidebars use their agency gradient and accent treatment.
- Seller mobile property imagery uses an agency-coloured overlay.
- Primary and accent actions calculate a readable foreground for both light and dark agency colours.

## Resilient agency identity

`AgencyBrandMark` renders the configured logo where possible. Missing or broken images fall back to an agency monogram and name, preserving identity and layout instead of displaying a broken image.

## Modern interaction layer

- Subtle agency-coloured canvas atmosphere
- Consistent fast easing for controls
- High-visibility keyboard focus rings
- Branded text selection
- Font smoothing and optimised legibility
- Reduced-motion support
- 44 px seller support actions

## Validation

Run from `the-it-guy/`:

```bash
node --test src/components/client-portal/__tests__/buyerPortalTheme.test.js
npm run test:client-portal-launch-phase3
npm run test:client-portal-launch-phase1
npm run build
```

Browser certification must include buyer and seller fixtures with:

- A dark primary colour
- A light primary colour
- A bright accent colour
- A missing logo
- A broken logo URL
- 360×800, 390×844, 768×1024, and 1440×900 viewports

Phase 3 is complete when identity remains recognisable, semantic states remain consistent, controls remain readable, and no theme breaks navigation or layout.
