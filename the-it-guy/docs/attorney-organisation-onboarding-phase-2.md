# Attorney organisation onboarding — Phase 2

## Outcome

Attorney onboarding now has one canonical transactional write path. The firm, backing organisation, branding, departments, owner memberships, profile link, and onboarding completion records either commit together or roll back together.

The organisation record is the Settings-facing identity record. Phase 2 adds typed organisation fields for VAT, brand colours, dark-logo details, and logo storage metadata, then writes all attorney onboarding identity fields into that record.

## Database contract

Migration: `supabase/migrations/202607150003_attorney_organisation_onboarding_phase2.sql`

RPC: `bridge_complete_attorney_firm_onboarding_v2(payload jsonb)`

The RPC:

- requires an authenticated user and validates ownership/admin access;
- serialises repeat submissions for the same user with a transaction advisory lock;
- creates or repairs the attorney firm and firm-admin membership;
- creates or repairs the backing organisation and organisation membership;
- synchronises name, registration/VAT, contact details, website, full address, logos, storage metadata, and brand colours;
- upserts branding, department activation, organisation settings, profile linkage, onboarding state, completion, and audit event;
- is idempotent for repeat onboarding submissions;
- is executable by `authenticated`, with public execution revoked.

## Frontend rollout compatibility

`completeAttorneyFirmOnboarding` attempts the atomic RPC first. It uses the previous multi-request implementation only when PostgREST reports that the RPC is missing from the deployed schema. Validation, permission, and transaction errors are not downgraded to the legacy path.

Invitations are deliberately sent after the core transaction commits. A failed invitation creates a warning and can be retried from Settings without rolling back the firm or organisation.

Organisation bootstrap reads the new canonical columns after deployment and retries its legacy select when those columns are not available yet. This keeps mixed frontend/database rollout order safe.

## Verification

Run from `the-it-guy/`:

```sh
npm run test:attorney-organisation-phase0
npm run test:attorney-organisation-phase1
npm run test:attorney-organisation-phase2
```

Run the repository migration safety scan from the repository root:

```sh
npm run supabase:safety-check
```

The migration must be deployed before the atomic path is active. This implementation does not apply the migration to a remote environment automatically.
