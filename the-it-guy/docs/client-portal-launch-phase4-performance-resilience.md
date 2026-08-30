# Client portal launch — Phase 4 performance and resilience

## Outcome

Phase 4 makes the buyer and seller portal shells feel fast on mobile and remain understandable when connectivity is slow or unavailable. It applies the Phase 0 performance budgets without changing portal authentication, permissions, transaction data, uploads, or production messaging.

## Fast useful content

- The prospect buyer portal renders its complete default shell immediately instead of blocking useful content on the optional agency-brand lookup.
- Remote prospect branding has a 1,200 ms foreground budget. A safe default is used after that point and a completed request remains available to later views.
- Successful prospect branding is cached in memory for five minutes.
- Concurrent requests for the same prospect are deduplicated.
- Static buyer and seller fixtures stop after their complete core response rather than requesting the same workspace a second time.

These changes target the Phase 0 budgets of useful mobile content within **1,500 ms**, core content within **2,500 ms** on a slow connection, and cached section navigation within **100 ms**.

## Stable media loading

- Above-the-fold buyer and seller property imagery receives high fetch priority and asynchronous decoding.
- Avatars, bank logos, and other secondary imagery use lazy loading and asynchronous decoding.
- Existing skeletons keep the authenticated portal structure stable while core data is loading.

## Connectivity and recovery

Buyer and seller shells now share `PortalResilienceStatus`:

- Offline state is announced through an accessible status region.
- Existing readable content remains visible.
- Copy explains that updates resume after reconnection.
- Background hydration is shown as a compact non-blocking status rather than replacing the page.
- Status placement respects mobile safe areas and reduced-motion preferences.

## Validation

Run from `the-it-guy/`:

```bash
npm run test:client-portal-launch-phase4
npm run test:client-portal-launch-phase3
npm run test:client-portal-launch-phase1
npm run build
```

Browser evidence covers buyer and seller portals at 360×800, 390×844, 768×1024, and 1440×900. Record first useful content, interactive-ready timing, horizontal overflow, layout stability, console errors, cached navigation response, offline messaging, and reconnection behaviour.

Phase 4 is complete when static fixtures avoid redundant loads, useful content is not blocked by optional branding, navigation remains immediate after initial load, offline state is clear, and no performance treatment removes a capability or recovery action.
