# Rentals release readiness — Phase 9 end-to-end certification

Phase 9 certifies the rebuilt staging environment, not local fixtures or an arbitrary deployment. The gate is read-only:

```sh
node scripts/rentals-release-phase9-e2e-certification.mjs
```

The rebuilt staging receipt must bind the target project and source-chain digest. Then attach redacted evidence references for all eight scenarios in [`config/rentals-release-e2e-certification.json`](../config/rentals-release-e2e-certification.json): lead qualification, in-lead viewings, application/FICA, tenancy conversion, tenant portal, landlord portal, workspace navigation, and RLS/public-portal boundaries.

A passing result certifies staging only. It does not authorise production deployment or database application.
