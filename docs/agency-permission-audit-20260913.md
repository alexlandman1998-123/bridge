# Agency module permission audit — 13 September 2026

Status: approved agency migration applied and primary app deployed to production on 13 September 2026. Production-schema rollback tests and deployed ownership UI verification passed. This is not a clean bill of health or proof that every action works; outstanding unrelated UI defects remain listed below.

Scope: primary transaction workspace (`the-it-guy/`), agency organisation, branches, agents, partners, commission structures, ownership, and assignment. User requested removal of operational permission gates. Unrelated agencies remain isolated.

The user authorised adding and deleting test records in Kingdom Real Estate, explicitly prohibiting deletion of existing agents. No existing agent may be deleted. Do not send invitations or external messages as an incidental test.

## Environment and preserved baseline

- Live app: `https://app.arch9.co.za`, signed in as Kingdom Demo, Kingdom Real Estate.
- Database: Arch9 SaaS (`isdowlnollckzvltkasn`).
- Organisation: `13c6b79f-1d8b-4886-aabf-42ea49565ef5`.
- Existing branches: Head Office (`9b5e684e-7735-4df0-95d4-dfa2a4e1f690`) and I Sell Property (`ededa6d1-6fa5-4ccf-84a8-6df96f7a660d`).
- Existing memberships: `65c17c31-ddb6-48bd-8caa-138c6f95f00d`, `c9115e69-72f6-4e7a-90bd-18ff95f98096`, `6dcf144d-d4d9-4738-9ea4-3dd7f2de4b91`. Preserve all three.
- Local Docker daemon is not running. Existing browser smoke uses mock Supabase responses, not real RLS enforcement.

## Confirmed restrictions and defects

1. Ownership inconsistency in live data: the primary membership has `is_primary_owner=true` but `role`, `workspace_role`, and `organisation_role` are `principal`; `organization_role` is null. No existing member has the canonical `owner` role. App and database ownership controls require primary owner AND owner role. This explains why a displayed “Principal / Owner” is not sufficient to share ownership.
2. `src/lib/roles.js` restricts Agents access and management to leadership roles or profile leadership keywords. Ordinary agents are excluded.
3. `src/auth/permissions/permissionResolver.js`, `src/services/agencyAuthorityService.js`, and `src/lib/organisationRoleGovernance.js` impose separate role and authority checks. Branch management also filters by assigned branch in `src/services/agencyBranchService.js`.
4. `src/lib/settingsApi.js` requires primary-owner role for granting/transferring ownership, and owner role for changing job titles. SQL ownership RPCs enforce this too. Role changes block self, peers, higher authority, and owner changes outside the ownership flow.
5. Live commission structure/profile RLS explicitly excludes the `admin` role and restricts writes to organisation administrators. Opening controls under the current principal account does not prove access for other roles.
6. Live partner relationship inserts/updates require organisation administrator access. Branch member writes require `bridge_phase5_can_manage_branch`.
7. Clicking Agents → More actions → Assign Lead navigates to `/pipeline/leads?assignAgent=<membership-id>` but the leads screen shows no assignment flow. Source search finds `assignAgent` only at the producer, not a consumer.
8. The live Add Agent form displays organisation “Arch9 Organisation” while the current workspace is Kingdom Real Estate.
9. Commission overview shows three users on default New Agent level; Levels tab shows zero users on the same level.
10. Commission “Override Split” leaves both percentage fields disabled. Source confirms the control chooses a predefined level, not a freely editable split.
11. Agent workspace Message and Call are explicitly disabled because integrations are not connected. These are not role permission failures.
12. Branch Archive and two overflow buttons have no handlers; clicking Archive did nothing. Clients is a placeholder tab. These are unfinished actions, not permission denials.
13. Creating a Referral Agency fails the live `organisation_preferred_partners_partner_type_check`: canonical `referral_agency` was passed into the legacy identity table which expects `agency`. The pending migration corrects the identity mapping while preserving the canonical partner role.
14. Deactivating a third party hides it from the directory entirely, leaving no visible reactivation action.

## Live browser coverage

- Commission Overview, Levels, Agents and Rules opened.
- Create Level form opened/cancelled; Edit Split opened; override checkbox toggled then cancelled; Create Template opened/cancelled. No existing commission values saved.
- Branch New Branch form opened/cancelled; branch actions menu opened; Manage agents navigated to the filtered directory and opened Add Agent; invitation cancelled without sending.
- Agent More actions opened; Assign Lead exercised; agent detail opened; Permissions form opened/cancelled without changes.
- Disposable branch created via the live UI and persistence independently verified through a read-only SQL query.
- Disposable branch edited, all eight branch tabs inspected, Archive attempted (no-op), and branch deleted through the list menu and confirmation. Original branches preserved.
- Commission template created with 63/37 split, reopened, edited to 64/36, then deleted. Existing template `Test` and live agent commission assignments preserved.
- Third Parties, Connections, Invites and Discover inspected. Referral Agency creation reproduced the constraint failure. Disposable Transfer Attorney created, edited, deactivated, restored through the canonical authenticated RPC solely to exercise Remove, then removed through the UI. No invitations resent/revoked, no messages sent.
- Existing agent ownership, branch assignments and roles were not changed in production. New ownership and rank-free operations were tested with isolated database fixtures. Actual agent invitation delivery, live reassignment, and live ownership saves remain unverified; they must not be inferred from the principal-session inspection.

## Test fixtures and cleanup ledger

| Fixture | ID | Status |
| --- | --- | --- |
| QA Permissions 20260913 branch | `492e0bd4-4325-40a6-8f1a-65558051e192` | Created, edited, deleted; absence independently verified |
| QA Permissions 20260913 template | `551e033c-86c0-46d8-8201-957a9d6a54c0` | Created, edited, deleted; original template preserved |
| QA Permissions 20260913 Edited partner | `981f8971-2d86-4219-891c-4cf14e37db17` | Removed through UI; identity and role configuration verified inactive (normal soft deletion) |
| Partner role configuration | `cd01f0ca-1eff-48fa-9791-4e8de23807b9` | Inactive; retained audit row |
| QA Release Referral 20260913 | `88a83299-d341-4ab1-bed6-92f4e46853f7` | Post-deploy live UI creation passed; removed through normal recoverable soft-delete |

No existing agents were deleted or edited. The partner removal is recoverable because its inactive records remain; the disposable branch and template were hard-deleted.

## Implementation (now deployed)

- Central temporary agency operations policy opens operational permissions to active agency members regardless of rank. Covers Agents access, member management, branch scope, partner routing, commission management and assignment permissions.
- Ownership controls allow self-claim, sharing owner status, and selecting a primary owner. Primary transfer retains other owners. Role and job-title changes no longer require superior rank within an agency.
- Invite authority no longer compares inviter and recipient ranks for active agency members. Branch command-centre authority receives verified workspace/membership context.
- New append-only migration `supabase/migrations/20260913072739_agency_open_operations.sql` opens corresponding database helpers, hierarchy/queue scopes and six branch/commission RLS policies. Fixes Referral Agency identity mapping. No existing membership data is rewritten automatically.
- Authentication, active membership, unrelated-organisation isolation, canonical owner integrity, and audit events remain. This is not anonymous/public access. Billing and organisation-deletion UI capabilities were not deliberately opened. Shared SQL organisation-admin helpers now treat active agency members as operational administrators, so downstream agency consumers inherit that broader capability.
- Reversing launch mode requires a corresponding follow-up database migration as well as changing the frontend policy; the JavaScript constant alone does not restore database restrictions.
- The unrelated incomplete UI actions in findings 7–12 and 14 have not been repaired by these permission changes.

## Automated checks

- `test:agency-full-smoke -- --skip-browser`: FAIL. Audit fails on missing `Import Leads` source marker. Workflow: 13 passed, 8 failed. Optional commission invite guard passed.
- Workflow failures: `agent-leads-workspace`, `seller-journey`, `seller-mandate-save-preserves-data`, `lead-communication`, `lead-listing-interest`, `lead-requirements`, `lead-matching`, `lead-property-sharing`. Do not assume each represents a runtime defect; several checks are source-text assertions.
- `test:agency-browser-smoke`: PASS using mocked Supabase. Coverage is lead creation forms, listing action visibility, branding, and no auth bounce; it does not exercise agency ownership or actual database writes.
- PASS: `organisation-ownership-contract-phase1`, `organisation-ownership-ui-phase4`, `organisation-permission-integrity-audit-phase1`, `organisation-permission-integrity-repair-phase2`, `workspace-branch-scope`, `agent-invite-commission-readiness`, `partner-directory-phase5`, `property24-listing-agent-reassignment`.
- `agent-commission-structure`: FAIL at phase 5 source extraction (missing `PrincipalAgentTabShell` boundary after `AgentCommissionStructureSummary`).
- `partner-directory-phase6`: FAIL at source assertion for `shouldShowPartnersBlockingLoader`.

Passing existing ownership tests verifies the old restrictive contract, not the requested open operational model.

### New verification

- `node scripts/agency-open-operations.test.mjs` from the primary app: PASS. Exercises permission scopes and authority across eight roles, ordinary-agent SQL CRUD on six RLS-protected tables, branch scope, legacy primary-principal ownership recovery by claim, shared owners, primary transfer, and denial for unrelated/suspended/signed-out users. Uses PGlite with actual migration/RPC SQL and a minimal schema fixture, not the complete production schema.
- `npm run check:app`: PASS (lint: 0 errors, 423 warnings; all nine standard service test groups passed; production build passed). Ran before the final small invite-authority and command-centre context additions.
- Focused ESLint after those additions: PASS, 0 errors and one existing unused-function warning in `agencyBranchService.js`.
- `git diff --check`: PASS.

## Production rollout evidence

- Approval: user explicitly replied “approved” to applying the agency migration and deploying the primary app.
- Target: production Arch9 SaaS `isdowlnollckzvltkasn`; Vercel project `bridge`, `prj_rbfXykMU6mU1eECbc0lJS9sPspmp`.
- `npm run supabase:guard` confirmed broad pushes remain frozen. No broad push, reset, migration repair, or guard override was used.
- `npm run supabase:push:lock-recovery` returned `RECOVERY_LOCKED` after live backup verification. Phase 5 audit found zero duplicate timestamps and zero unreviewed split versions. The patch replaces captured definitions deliberately; “partial_live” in the static inventory reflects those intended replacements, not a replay of an unknown migration.
- Captured production definitions and prepared `docs/agency-permission-rollback-20260913.sql`. This rollback is a recovery artifact, not an applied migration.
- Ran `docs/agency-permission-preflight-20260913.sql` against the full production schema in a rolled-back transaction. First run rejected a test commission fixture missing its required listing percentage; corrected the fixture, then all checks passed.
- Applied only `20260913072739_agency_open_operations.sql` with the scoped Supabase CLI query. Verified the helper and all six policies. Re-ran the behavior smoke after applying; PASS.
- Smoke exercised Kingdom Demo temporarily as an ordinary agent: self role changes, branch create/edit/delete, moving its branch assignment and back, commission template create/edit/delete, canonical Referral Agency creation, self ownership claim, granting another owner, and self primary ownership. All test writes rolled back, including events. No email sent. No persistent ownership change was made.
- Verified the three original memberships retain their roles, active status, primary flag and branch assignment; no rollback test branch/template/partner residue remains.
- Recorded exactly version `20260913072739` with its SQL in the migration ledger after verification; no other versions were recorded or applied. Reran Phase 5 audit; the agency migration is no longer in the local-only set.
- Source deployed from isolated `/tmp/arch9-agency-release.aOMHee`: the verified currently-live commit plus only the ten agency source files. Unrelated Revo, website, package and generated-file work was excluded. No commits or pushes were made.

### Deploy Result

- **URL**: https://app.arch9.co.za
- **Deployment**: https://bridge-4uiro54oj-alexs-projects-f5496a21.vercel.app (`dpl_CH1g8yZHD5T27soVQ9PqowRZiXwj`)
- **Target / status**: production / READY; promoted after successful build. Live domain resolves to the new deployment.
- **Commit**: base `f78db081b18833500106d14871a3512fe876308b` plus the scoped uncommitted agency patch, recorded as deployment metadata.
- **Framework / build duration**: Vite / approximately 2 minutes 52 seconds.
- **Previous deployment**: `dpl_9CkfGs6UYVtuSbYCxVqj6NtuRGi1`, retained for app rollback.
- Live browser reload verified enabled owner/principal invite options, editable peer/self role and job-title selectors, Grant owner, Claim ownership, and Make primary owner. Opened and cancelled the self-claim confirmation without permanently changing a real user's role.
- Live UI Referral Agency regression: saved a disposable nondefault partner with no email/contact, observed “Third party added”, independently verified identity type `agency` and canonical role `referral_agency`, then removed it using the product's soft-delete flow. Existing partners preserved.

### Post-Deploy Observability

- Error scan: no error/fatal runtime logs found for this deployment during the immediate post-release scan. This short, low-traffic window is not evidence of long-term reliability.
- Drains: not inspected; no new monitor configured.
- Supabase advisors ran. Existing project-wide warnings/errors remain, including one unrelated public table with RLS disabled. The new membership helper is intentionally authenticated-callable SECURITY DEFINER and flagged by the generic advisor; its active same-agency predicate and denied outsider tests are the authorization boundary. No RLS table was disabled by this patch. See [Supabase linter remediation](https://supabase.com/docs/guides/database/database-linter).
- Release manifest is served successfully, but reports `releaseId: local-unknown` because this was an isolated CLI source deployment. Deployment ID, base commit and release metadata identify this release.

## Remaining verification

The requested production rollout is complete. The deploy depended on the reviewed agency migration only; other pending migrations and unrelated source changes were excluded.

An actual separate ordinary-agent browser login, invitation delivery, and the broken Assign Lead entry point are not fully verified end-to-end. Production database tests covered ordinary-agent permissions with transaction-local authenticated role impersonation; the live browser session remained Kingdom Demo. The legacy primary-principal inconsistency is intentionally not silently rewritten: use the now-enabled ownership controls to choose the desired ownership. The full “every action works” acceptance check remains incomplete because the unrelated unfinished actions documented above still exist.
