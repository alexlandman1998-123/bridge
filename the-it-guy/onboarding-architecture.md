# Onboarding Architecture

## Objective
Stabilize onboarding by enforcing a strict lifecycle boundary:

`AUTH -> PROFILE -> APP ROLE -> DASHBOARD -> ORGANISATION SETUP -> WORKFLOWS`

## First-Time Onboarding (In Scope)

Implemented boundary for signup onboarding:
1. Restore authenticated session (`Auth`, `AuthCallback`).
2. Ensure profile record exists (`WorkspaceContext` + `getOrCreateUserProfile`).
3. Capture baseline identity fields (`OnboardingProfileSetup`).
4. Set app role (`OnboardingProfileSetup`).
5. Mark `onboarding_completed=true` (`RoleModuleOnboarding`).
6. Grant dashboard shell access.

No organisation bootstrap is required for this path.

## Post-Dashboard Setup (Separated)

Introduced route:
- `/setup` (`src/pages/PostDashboardSetup.jsx`)

Purpose:
- role-specific guided next actions for organisation/module setup.
- make setup status explicit instead of embedding this into signup.

## Central Redirect Decision Service

Implemented:
- `src/lib/onboardingRouting.js`

Key functions:
- `deriveOnboardingSetupState(...)`
- `decideAuthRedirect(...)`
- `resolveRoleOnboardingPath(...)`
- `isOnboardingRoute(...)`

`AuthGate` now consumes `decideAuthRedirect` instead of distributed role/onboarding checks.

## Setup State Flags (Derived)

Current derived flags (no schema migration required):
- `profileStatus`: `incomplete | complete`
- `onboardingStatus`: `not_started | in_progress | complete`
- `organisationSetupStatus`: `not_required | pending | complete`
- `moduleSetupStatus`: `not_required | pending | complete`

Notes:
- Attorney org setup uses `profiles.primary_attorney_firm_id` as explicit signal.
- Other internal roles are marked `pending` post-onboarding until post-dashboard setup is completed.

## Invite Onboarding Lifecycle

Invite flow (`AgentInviteOnboarding`) now follows:
1. Token load + persist in session storage.
2. Validate invite context.
3. Require sign-in if needed (`/auth?next=/agent/invite/:token`).
4. Restore session.
5. Enforce signed-in email matches invite email.
6. Complete invite/member onboarding.
7. Clear pending token and continue.

## Recovery Behaviour

Implemented safety behaviours:
- profile/session bootstrap timeout states with retry actions.
- profile repair redirect (`/onboarding/profile`) when names/role are missing.
- no forced attorney-firm redirect trap before dashboard access.
- agent no-org and attorney no-firm dashboard-safe fallback cards with setup CTAs.
- invite token persistence + cleanup to survive auth redirects.

## What Must Not Be Added Back Into Signup Onboarding

- Organisation creation or claiming logic.
- Membership bootstrap/upsert side effects.
- Permission-sensitive workflow writes.
- Transaction/development/document provisioning.

## Known Limitations

1. Some organisation context functions still contain legacy auto-bootstrap paths and should remain callable only post-dashboard.
2. Local invite fallback and Supabase invite flow coexist; this should be consolidated later once migrations and RLS parity are fully stable.
3. Derived non-attorney organisation status is intentionally conservative (`pending`) until canonical org-setup completion signal is standardized.
