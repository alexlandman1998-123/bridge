# Client portal launch — Phase 5H final approval and promotion

## Outcome

Phase 5H is the final fail-closed release orchestrator. It does not deploy or promote automatically. It produces `READY_FOR_PRODUCTION_PROMOTION` only when physical-device, parity, accessibility, performance, operations, defect, approval, and change-window evidence are complete.

## Bound artifacts

- Application candidate: the immutable Vercel Preview deployment recorded in the packet.
- Production target: `https://app.arch9.co.za`.
- Rollback target: the explicitly recorded current production deployment.
- Pilot boundary: one agency, no automatic expansion, 72 hours of observation.

## Final procedure

1. Complete and enforce Phases 5C through 5G.
2. Confirm zero open critical and high defects with immutable evidence.
3. Obtain product-owner and release-manager approval.
4. Approve a dated change window, notify support, and identify the approved pilot agency.
5. Run the Phase 5H report and enforced gate.
6. Only after `READY_FOR_PRODUCTION_PROMOTION`, execute the exact promotion command from the packet.
7. Verify the production deployment ID, run buyer/seller smoke checks, scan runtime errors, and begin the 72-hour observation window.
8. Use the explicit rollback command immediately if a configured rollback trigger occurs.

## Commands

```bash
npm run test:client-portal-launch-phase5h
npm run report:client-portal-launch-phase5h
npm run gate:client-portal-launch-phase5h
```

The gate never executes Vercel promotion itself. This separation ensures approval evidence is complete before the irreversible production action and preserves a clear human-controlled release boundary.
