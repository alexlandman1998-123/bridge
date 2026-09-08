# High-level journey production release — 8 September 2026

User-directed production release following an explicit repeat request to deploy with the staging seller-session verification gap disclosed. This is not full cross-role certification; the release gate remains blocked for missing live evidence and was not changed or supplied fabricated evidence.

## Verification before release

- All 12 local phase-six acceptance suites and the production build passed.
- Staging attorney workflow and shared commercial reader checks passed; existing buyer-link access and negative-access checks passed.
- A valid live staging seller session and the full live cross-role transition matrix remain unverified.

## Database

Applied to production project `isdowlnollckzvltkasn` before frontend publication:

- `20260908181335_shared_journey_active_plan_manifest.sql`
- `20260908183116_shared_journey_commercial_facts.sql`

Both replace the private shared reader without changing transaction records. A production reader smoke check returned schema version 1 and commercial facts version 1. Direct execute access remains denied for anonymous and authenticated roles; authorised public wrappers are unchanged.

The migration service assigned versions `20260908185503` and `20260908185507`. These were reconciled to the repository versions with exact version/name matches, target-absence checks, and one-row assertions.

## Rollback reference

Previous production deployment: `dpl_FnZcm5294AYUhmU2GCzGsiHdSF7Z`, commit `7032a38ea084cd9fb07235ac30f2022fd2ce2327`. Reader additions are backwards compatible with that app version. Confirm deployment completion separately; this document records the release scope and evidence, not a successful deployment claim.
