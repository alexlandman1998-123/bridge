# Public Websites — Phase 7 One-Agency Staging Pilot

**Status:** staging infrastructure prepared; agency selection, enrolment and acceptance evidence pending

**Implemented:** 5 September 2026

## Outcome

Phase 7 turns the completed website product into a controlled, fail-closed pilot for exactly one agency. It does not connect a client-owned domain and it cannot modify nameservers or email DNS.

The release remains on the single `property-standard-v1` template. An agency must be explicitly active in the pilot before a website can be created, publicly resolved or accept a new enquiry. Pausing the enrolment immediately closes those paths while preserving the site, revisions, listings, leads and audit history.

## Delivered controls

- `website_pilot_enrolments` records the selected organisation, operator, status and timestamps.
- A partial unique index permits at most one `active` agency.
- Pilot changes are service-role-only; agency administrators may see their own status but cannot enrol themselves.
- Database triggers block website creation and lead receipt inserts outside the active pilot.
- The public resolver requires both an exact published revision and an active pilot enrolment.
- Website Studio explains unavailable and paused states without exposing another organisation.
- The hostname command accepts only generated `*.vercel.app` or managed `*.sites.propdata.co.za` preview hosts.
- A production-project reference guard and explicit confirmation phrase protect every operator mutation.
- The staging workflow builds a reviewed Vercel artifact, deploys it to the dedicated website project, binds its generated hostname and records machine-readable acceptance evidence.
- A pause command provides the pilot kill switch without deleting data.

## Current environment position

The isolated staging infrastructure was prepared on 6 September 2026, but no agency has been enrolled:

- the `Arch9 Staging` Supabase project contains the controlled public-website migration chain through the Phase 7 privilege hardening migration;
- the website pgTAP contracts pass against staging, while unrelated pre-existing database lint findings remain outside this release scope;
- `apps/websites` is linked to the dedicated `arch9-websites-staging` Vercel project with staging-only server credentials;
- the protected GitHub environment `public-websites-staging` contains the six required deployment secrets;
- a preview deployment is live and correctly fails closed with HTTP 404 while no agency is enrolled; and
- the pilot agency has not been selected explicitly.

Selecting an agency implicitly would exceed this phase's one-agency boundary. The current preview must remain fail-closed until the agency, reviewer and support owner are recorded.

## Staging activation runbook

1. Confirm the dedicated Supabase staging project and database backup/recovery position.
2. Review the remote migration ledger. Apply the public-website migration chain from the Phase 1 foundation through `20260906063435_public_websites_phase7_privilege_hardening.sql` using the repository's controlled migration process. Do not use a blanket migration push when unrelated pending migrations exist.
3. Run `supabase test db` and `supabase db lint --level warning` against the staging database.
4. Create a dedicated Vercel project rooted at `apps/websites`. It must contain no client domains and must use only staging Supabase credentials plus the server-only lead fingerprint secret.
5. Select one agency UUID deliberately. Record why it is suitable, its active administrator, one complete published listing and the support owner.
6. Activate only that organisation from `the-it-guy`:

   ```bash
   node --env-file=.env.staging.local scripts/public-websites-phase7-pilot.mjs \
     --activate \
     --organisation-id <agency-uuid> \
     --operator <operator-name> \
     --notes "First property-standard-v1 staging pilot" \
     --confirm MANAGE_ONE_AGENCY_STAGING_PILOT
   ```

7. In Website Studio, create the seeded site, check the logo and colours, edit the standard pages, bind the preview hostname and publish the exact reviewed revision.
8. In the CRM listing module, publish one eligible listing, update it and unpublish it; then republish the final reviewed version.
9. Submit and retry an enquiry, verify one routed CRM lead with attribution, and test notification fallback.
10. Create a later website revision, publish it, restore the earlier revision and confirm the immutable `rolled_back` publication event.
11. Test the public journeys at 320px, 375px and 768px, then current iOS Safari and Android Chrome. Verify cross-tenant isolation with an unrelated agency account.
12. Complete a copy of `public-websites-phase7-manual-acceptance.example.json` with the exact reviewed commit SHA and run the protected GitHub workflow with that JSON. The evidence command rejects evidence from another commit and passes only when automated, database, public-route and reviewed manual checks all pass.

## Evidence command

The command is read-only unless a status or hostname mutation flag is supplied:

```bash
node --env-file=.env.staging.local scripts/public-websites-phase7-pilot.mjs \
  --organisation-id <agency-uuid> \
  --base-url https://<deployment>.vercel.app \
  --manual-evidence ../docs/public-websites-phase7-manual-acceptance.json \
  --output public-websites-phase7-evidence.json \
  --require-ready
```

The result cannot report `readyForPhase8: true` unless it finds one active enrolment, the exact published website revision, standard pages, an active preview domain, a published listing, a routed lead, publication and rollback history, all public routes, and every reviewed manual check.

## Pause and recovery

If a tenant leak, incorrect listing, broken lead route or severe public regression is found, pause the enrolment first:

```bash
node --env-file=.env.staging.local scripts/public-websites-phase7-pilot.mjs \
  --pause \
  --organisation-id <agency-uuid> \
  --operator <operator-name> \
  --notes "Paused while incident is reviewed" \
  --confirm MANAGE_ONE_AGENCY_STAGING_PILOT
```

The website then stops resolving and the lead trigger rejects new receipts. Resume only after the cause is fixed and the evidence suite is rerun. Do not delete the enrolment or rewrite publication history.

## Phase 7 exit gate

Phase 7 is operationally complete only when the protected evidence artifact reports `PASS`, the agency reviewer signs off on the preview URL and no high-severity database lint/advisor finding remains. Until then, Phase 8 production release, client domains and DNS work remain blocked.
