# Attorney practical release — Phase 3 UI quality

Phase 3 certifies the six authenticated role/device journeys only after workflow and propagation evidence pass. Each audit records its route, exact viewport and screenshot, automated accessibility results, overflow, accessible control names, keyboard and focus behavior, modal behavior, state feedback, human visual review and every required action touchpoint.

Mobile audits must use a viewport no wider than 480px and retain 44px touch targets. Desktop audits must be at least 1024px wide. Critical or serious accessibility violations, horizontal overflow, unnamed controls, broken feedback, open P0/P1 defects or an undispositioned P2 fail the phase.

Run `npm run check:attorney-practical-phase3`. `BLOCKED` means genuine Phase 1 or Phase 2 evidence is not passed. `READY_TO_RUN` permits authenticated browser review in staging. Only `PASSED` completes Phase 3. The checker itself is read-only and does not touch production.
