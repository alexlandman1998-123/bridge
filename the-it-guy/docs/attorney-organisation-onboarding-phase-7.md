# Attorney organisation onboarding — Phase 7

## Outcome

Phase 7 retires application-level writes of shared attorney identity and branding to the legacy mirrors.

The `bridge_update_attorney_organisation_identity_v3` RPC:

- authorises the firm owner, active firm administrators, and active director/partners;
- locks the firm update to prevent concurrent identity races;
- applies only fields present in the JSON patch, preserving omitted values;
- writes shared identity and branding only to `organisations`;
- relies on the Phase 3 one-way projection to refresh `attorney_firms` and `attorney_firm_branding`.

After the RPC is deployed, the frontend writes only the operational `is_active` flag directly to `attorney_firms`. It no longer writes shared fields or branding to either legacy table.

## Mixed-version rollout

If the Phase 7 RPC is not deployed, the service retains the Phase 6 canonical-first compatibility path. Permission and validation failures from a deployed RPC are surfaced; only a genuinely missing RPC activates the fallback.

Deploy migrations in order through Phase 7 before enabling the final release gate.

## Verification

```sh
npm run test:attorney-organisation-phase7
npm run verify:attorney-organisation:readiness
```

