# Client portal launch — Phase 2 responsive foundation

## Outcome

Phase 2 establishes one responsive foundation for the buyer demo, production buyer portal, and production seller portal. It consolidates shell sizing, mobile safe areas, bottom navigation, active-location semantics, long-content handling, and global recovery states without changing portal data, permissions, or workflow rules.

## Shared primitives

`ClientPortalResponsiveShell` provides:

- A consistent 430 px mobile reading width
- Minimum page height and navigation clearance
- Device safe-area support
- Long-name, address, status, and value wrapping
- Explicit buyer/seller persona markers

`ClientPortalBottomNavigation` provides:

- Dynamic equal-width columns based on the actual destination count
- 56 px touch targets
- `aria-current="page"` for the active destination
- Agency-token active styling
- A consistent fixed, translucent, safe-area-aware navigation surface

`ClientPortalStatePanel` provides the shared loading, empty, error, offline, expired-link, and unauthorised patterns. Loading and portal-load failures now consume this shared presentation, including 44 px recovery actions.

## Adoption

- Prospect buyer demo mobile shell and navigation
- Authenticated buyer mobile shell and navigation
- Authenticated seller mobile shell and navigation
- Authenticated portal loading and invalid/expired/access recovery states

Desktop compositions remain persona-specific because capability parity does not require identical layouts. Both desktop experiences continue to consume the same data and agency theme contracts established in Phases 1 and 3.

## Responsive certification

The required viewports remain:

- 360×800
- 390×844
- 768×1024
- 1440×900

Every viewport must preserve readable content, expose the active destination, avoid horizontal page scrolling, keep fixed navigation clear of actions, and retain at least 44×44 px interactive targets.

## Validation

```bash
npm run test:client-portal-launch-phase2
npm run test:client-portal-launch-phase1
npm run test:client-portal-launch-phase3
npm run test:client-portal-launch-phase4
npm run test:client-portal-launch-phase5
npm run build
```

Phase 2 certifies the shared responsive implementation. Phase 5 still requires deployed production measurements, physical iOS/Android testing, accessibility evidence, zero critical/high defects, operational ownership, and product-owner sign-off before launch.
