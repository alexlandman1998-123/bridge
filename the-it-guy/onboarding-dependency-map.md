# Onboarding Dependency Map

## Scope
This map covers first-time auth/onboarding and invite onboarding paths currently active in the app.

## Route and Service Map

| Route / Component / Service | What It Does | Reads | Writes | Redirects | Failure Modes | Correct Layer |
| --- | --- | --- | --- | --- | --- | --- |
| `src/pages/Auth.jsx` | Sign-up/sign-in entry and email verification initiation | Supabase auth session state | Supabase auth signup/signin | `/auth/callback` (email verify redirect target), `/dashboard` or `next` route | session bootstrap mismatch, unsupported JWT, callback never restoring | Auth Layer |
| `src/pages/AuthCallback.jsx` | Exchanges verification code, restores session, resumes pending invite or onboarding | `supabase.auth.getSession()`, `sessionStorage[itg:pending-org-invite-token]`, query `next` | Supabase auth code exchange, clears local auth on retry path | pending invite route or `/onboarding/profile` | timeout, code exchange failure, no restored session | Auth Layer |
| `src/context/WorkspaceContext.jsx:getOrCreateUserProfile` | Ensures profile exists after auth | `profiles` table by `id`, auth user metadata | upsert `profiles` fallback record when missing | none directly | missing table/column, RLS deny, session out-of-sync | Identity/Profile Layer |
| `src/context/WorkspaceContext.jsx:saveProfileDraft` | PATCH-safe profile update for onboarding/profile edits | current workspace profile in memory | upsert `profiles` (`first_name`, `last_name`, `company_name`, `phone_number`, `role`, `onboarding_completed`) | none directly | schema missing, permission errors | Identity/Profile + App Role Layer |
| `src/pages/OnboardingProfileSetup.jsx` | Collects baseline profile fields and app role | workspace profile | `saveProfileDraft` with `onboardingCompleted=false` | role onboarding route (`/agent/onboarding`, `/developer/onboarding`, `/bond-originator/onboarding`, `/attorney/onboarding`) | profile bootstrap timeout, profile read failure, invalid session | Identity/Profile + App Role Layer |
| `src/pages/RoleModuleOnboarding.jsx` | Finalizes first-time onboarding for selected app role | workspace profile role | `saveProfileDraft` with role + `onboardingCompleted=true` | `/dashboard` | profile write failure | App Role Layer |
| `src/pages/AgentInviteOnboarding.jsx` | Validates invite token, captures invite profile details, binds invite membership | `fetchOrganisationInviteByToken`, local invite context fallback, auth session email | `completeInvitedMemberOnboarding` (Supabase flow) or `acceptAgentInvite` (local fallback), session storage token persist/clear | `/auth?next=...` when not signed in, completion path to dashboard/sign-in | invalid/expired token, signed-in email mismatch, membership write failure | Invite Flow (cross-layer orchestration) |
| `src/lib/settingsApi.js:fetchOrganisationContext` | Reads organisation/membership/settings context for post-dashboard features | `profiles`, `organisation_users`, `organisations`, `organisation_settings`, RPC `bridge_claim_pending_org_invite` | may auto-attach pending invite and (legacy path) auto-create org + membership when enabled | none directly | missing org tables, missing RPC, RLS policy conflicts | Organisation + Permission Layer (post-dashboard) |
| `src/lib/settingsApi.js:completeInvitedMemberOnboarding` | Claims invite, updates profile and membership | invite token context, auth user/session | profile patch + membership activation (organisation user invite acceptance) | none directly | invite token invalid, claim conflict, policy failure | Invite Flow + Organisation Layer |
| `src/App.jsx:AuthGate` | Central gate for auth/profile/onboarding route decisions | session presence, workspace profile + base role, route path | none | centralized redirect decisions from `decideAuthRedirect` | route loops if logic diverges, profile missing role/name | Boundary Orchestration Layer |
| `src/App.jsx:AttorneyFirmRoute` | Restricts firm-required attorney routes (operations/settings) while allowing dashboard shell | attorney membership/firms via `getCurrentUserPrimaryAttorneyFirm` + `getCurrentUserAttorneyMembership` | none | `/setup` when firm-required route lacks active firm | membership lookup errors, suspended/removed membership | Post-dashboard Organisation Setup + Permission Layer |
| `src/pages/Dashboard.jsx` (agent fallback block) | Keeps dashboard shell resilient when org not attached | org id from `fetchOrganisationSettings` context | none | CTA to `/setup` / `/settings/organisation` | no org id or membership role unresolved | Workflow Layer (safe empty state) |
| `src/pages/AttorneyDashboardPage.jsx` (firm pending state) | Prevents hard redirect trap when attorney has no firm | attorney dashboard read model + permissions hook | none | CTA to `/attorney/onboarding` / `/setup` | no firm data, permission read errors | Workflow Layer (safe empty state) |

## Layer Violations Identified (Current Risk)

1. Organisation context (`fetchOrganisationContext`) still contains legacy auto-bootstrap capability (`organisations`, `organisation_users`, `organisation_settings`) that can be invoked by post-onboarding services and is risky if called too early.
2. Invite onboarding is multi-source (Supabase + local fallback), increasing path divergence risk.
3. Attorney flow historically mixed role onboarding and firm onboarding; this is now partially isolated by allowing dashboard access without forcing firm creation.

## What Must Stay In Signup Onboarding

- Create/repair profile row.
- Capture `first_name`, `last_name`, optional `phone_number`/`company_name`.
- Select app role.
- Mark `onboarding_completed=true`.

## What Must Stay Post-Dashboard

- Organisation creation/joining.
- Membership administration and invite operations.
- Permission-sensitive settings writes.
- Workflow-bound data access (transactions/developments/doc packets).
