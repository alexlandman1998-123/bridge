# Bridgenine removal — Phase 2 implementation

Implemented: 2026-07-19  
Scope: repository code and configuration cleanup only. No deployment, Vercel domain mutation, DNS mutation, Supabase Management API update, or production data migration was performed.

## Changes completed

### Hosting and auth configuration

- Removed the `app.bridgenine.co.za` host redirect from `the-it-guy/vercel.json`.
- Removed the `admin.bridgenine.co.za` host redirect from `apps/admin/vercel.json`.
- Removed five Bridgenine redirect URLs from `supabase/config.toml`.
- Preserved the Arch9 production URLs and localhost development callbacks.

These are deployment/local configuration changes. The live Vercel projects and live Supabase Auth settings remain unchanged until their later operational phases.

### Runtime compatibility

- Removed the old-domain invite-origin compatibility condition from `transactionPartnerInvitationService.js`.
- Changed the attorney showcase identity from `attorney.demo@bridgenine.co.za` to `attorney.demo@arch9.co.za`.
- Changed the canonical attorney runtime fixture to `qa.attorney+canonical@arch9.co.za`.

The corresponding production Auth/profile records still require Phase 3 migration before live tests use these defaults.

### Demo, isolation, and regression fixtures

- Deliverable attorney identities now use controlled `@arch9.co.za` addresses.
- Nondeliverable people and isolation fixtures now use `@example.test`.
- Stale-listing and signer-link regression URLs now use `legacy-app.example.test`.
- Lead-pilot recipient allowlisting now defaults to `arch9.co.za` only.
- Related tests, documentation, examples, and the saved staging fixture email were updated consistently.

## Reference audit

The active application/config/test sweep contains no Bridgenine domain references.

Four intentional repository matches remain outside this evidence directory:

1. the Phase 1 backup ignore rule in `.gitignore`;
2. two search/output constants in `scripts/inventory-bridgenine-phase1.mjs`;
3. one historical audit sentence in `the-it-guy/docs/audits/arch9-buy-listing-bridge-phase-1-audit.md`.

## Verification

Passed:

- `npm test` in `the-it-guy` (core service suite).
- Public listing service and readiness tests.
- Public listing Phase 9 contract.
- Lead-pilot smoke contract.
- Attorney calendar Phase 1, Phase 5, Phase 7, and Phase 8 contracts.
- Main application production build.
- Admin application production build.
- `vercel.json` parsing for the root, main app, and admin app.
- Node syntax checks for modified operational scripts.
- `git diff --check`.

Known unrelated baseline failures:

- Public listing Phase 8 expects a `Check Live` marker absent from the untouched `AgentListingDetail.jsx` file.
- Attorney calendar Phase 4 references `supabase/migrations/202607180025_attorney_calendar_phase4_rsvp_lifecycle.sql`, which is absent from the workspace. Its lower-level RSVP contract test passes before the missing-file failure.

Neither failure is caused by the domain-removal changes.

## Phase 2 exit decision

Code and local configuration cleanup: complete.  
Ready for Phase 3 production-data migration planning/execution: yes.  
Ready to deploy without coordinating Phase 3 fixture identities: no.  
Ready to detach Vercel domains or remove DNS: no.
