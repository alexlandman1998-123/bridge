# Client portal launch — Phase 5D capability parity

## Outcome

Phase 5D maps every buyer and seller surface in the Phase 0 contract to desktop and mobile routes and requires proof that both compositions expose the same capability, action, canonical data, and status meaning. Identical layouts are not required.

## Certification procedure

For every persona and mapped surface:

1. Open the immutable Phase 5B candidate at 1440×900 and the matching mobile route at 390×844.
2. Exercise every `requiredCapability` and `requiredAction` from the Phase 0 surface.
3. Confirm values, statuses, dates, requirements, permissions, and recovery actions come from the same canonical record.
4. Record desktop, mobile, and same-data results as `passed` with an immutable evidence URL.
5. Record any intentional exception in `approvedExceptions`; exceptions keep the automated gate on hold until product-owner review.

Use demo or sanitised records only. Evidence must not expose portal tokens, client identifiers, contact details, documents, or transaction information.

## Commands

```bash
npm run test:client-portal-launch-phase5d
npm run report:client-portal-launch-phase5d
npm run gate:client-portal-launch-phase5d
```

The enforced command returns non-zero until all 17 required persona/surface comparisons pass with evidence. Only then may Phase 5's `capabilityParity` evidence be promoted to `passed`.
