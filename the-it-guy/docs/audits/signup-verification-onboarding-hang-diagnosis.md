# Sign-Up → Verification → Onboarding/Profile Hang Diagnosis

## 1. Executive Summary
- The `/onboarding/profile` route is currently hard-wired to **agency onboarding bootstrap** and is not role-neutral.
- After email verification, onboarding bootstraps by calling `fetchAgencyOnboardingSettings()` (organisation context resolution). That path requires a valid authenticated Supabase user/session and runs additional org/membership queries.
- The observed failure (`User from sub claim in JWT does not exist`) indicates the session JWT `sub` is not resolvable in the active Supabase project context for at least one bootstrap call.
- The UX presents a loading card for up to 15s, which feels like an indefinite hang. Error handling exists, but user experience is still “stuck then failure,” not an immediate guided recovery.

## 2. Current Auth Flow
1. User signs up in [`src/pages/Auth.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Auth.jsx).
2. `supabase.auth.signUp()` is called with `options.emailRedirectTo` from `resolveEmailVerificationRedirectTo()`.
3. Verification link returns user to `/auth?next=/onboarding/profile` (intended).
4. App auth bootstrap runs in [`src/App.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/App.jsx) via `supabase.auth.getSession()` and `onAuthStateChange`.
5. `WorkspaceProvider` runs profile bootstrap in [`src/context/WorkspaceContext.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/context/WorkspaceContext.jsx) via `getOrCreateUserProfile()`.
6. Route guard sends non-onboarded internal users to `/onboarding/profile`.
7. `/onboarding/profile` renders [`src/pages/Onboarding.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Onboarding.jsx), then calls `fetchAgencyOnboardingSettings()`.

## 3. Email Verification Redirect Handling
- Redirect URL source priority in `Auth.jsx`:
  1. `VITE_PUBLIC_APP_URL`
  2. `VITE_APP_BASE_URL`
  3. `VITE_SITE_URL`
  4. `window.location.origin`
- If any of the first three env vars are stale (old Vercel domain), confirmation links will continue using that stale host.
- No dedicated `/auth/callback` route exists; callback handling relies on Supabase client URL session detection and `getSession()` bootstrap.

## 4. `/onboarding/profile` Current Logic
- `/onboarding/profile` and `/onboarding/persona` both map to the same `Onboarding` component in `App.jsx`.
- `Onboarding.jsx` always runs agency bootstrap (`fetchAgencyOnboardingSettings`) and shows:
  - “Preparing Agency Onboarding… Loading your organisation setup workspace.”
- It is not a lightweight profile/role selector first step; it assumes organisation bootstrap path immediately.
- Timeout is 15s (`ONBOARDING_BOOTSTRAP_TIMEOUT_MS`).

## 5. Session Hydration Findings
- App-level session hydration is in `App.jsx` with 15s timeout and `onAuthStateChange` listener.
- Workspace profile hydration is in `WorkspaceContext.jsx` and also has a 15s timeout.
- `AuthGate` blocks while auth/session/workspace are unresolved; it has its own timeout and retry path.

## 6. Profile Creation Findings
- Profile creation logic is DB-first in [`src/lib/api.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js) (`getOrCreateUserProfile`, `ensureProfileRecord`).
- If no profile row exists, it upserts into `profiles` by `auth user.id`.
- Missing-profile by itself is handled; it is not the primary hang driver.

## 7. Role/Module Selection Findings
- Default role normalizes to `viewer` if missing (`DEFAULT_APP_ROLE = 'viewer'`).
- Onboarding UI is agency-first. In [`src/lib/agencyOnboarding.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyOnboarding.js), only `agency` organisation type is enabled; others are disabled.
- `/onboarding/profile` copy and bootstrap currently imply agency setup even when user/module context is not yet explicitly resolved in UX.

## 8. Organisation Setup Findings
- `fetchAgencyOnboardingSettings()` calls `ensureOrganisationContext()` in [`src/lib/settingsApi.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/settingsApi.js).
- `ensureOrganisationContext()` does:
  - `getAuthenticatedUser()` (`supabase.auth.getUser()`)
  - `getOrCreateUserProfile()`
  - membership lookup (`organisation_users`)
  - optional pending invite activation
  - optional organisation auto-create (for selected roles)
  - organisation settings fetch/create
- This is a heavy path for first post-verification render.

## 9. Infinite Loading Cause
### Confirmed failure path
- The user-visible hang is the onboarding bootstrap loading state while `fetchAgencyOnboardingSettings()` attempts to resolve auth/org context.
- In failing sessions, this chain surfaces `User from sub claim in JWT does not exist`.

### Why this occurs
Most likely conditions (based on current wiring and observed symptom):
1. **Session/project mismatch**: JWT/session resolves in browser, but downstream auth/db calls are against a Supabase context where that `sub` is not valid.
2. **Stale verification redirect host**: signup confirmation may be landing on an old deployment host (or deployment with different env/project wiring), increasing mismatch risk.
3. **Agency bootstrap is executed too early**: route does org bootstrap immediately instead of first resolving a minimal verified-user onboarding state.

### Important nuance
- This is not truly “infinite” in code now; it is a timeout-driven stall (15s) followed by failure state.

## 10. Runtime/Console Errors
Observed/loggable errors in current flow:
- `[Onboarding] fetchAgencyOnboardingSettings:failed ...`
- `[OrgContext] resolve:failed ...`
- surfaced UI error: `User from sub claim in JWT does not exist`.

Existing diagnostics are already present in:
- `App.jsx` (`[Auth]...`, `[AuthGate]...`)
- `WorkspaceContext.jsx` (`[Workspace]...`)
- `Onboarding.jsx` (`[Onboarding]...`)
- `settingsApi.js` (`[OrgContext]...`)

## 11. Recommended Fix Plan
1. **Redirect integrity first**
   - Ensure one canonical frontend URL is used for verification redirects.
   - Align `VITE_PUBLIC_APP_URL`/`VITE_APP_BASE_URL`/`VITE_SITE_URL` across active Vercel environments.
   - Ensure Supabase Auth allowed redirect URLs include only current active domains.
2. **Add callback hardening**
   - Introduce explicit `/auth/callback` handling route (or explicit code/session exchange flow) before onboarding route decisions.
3. **Decouple onboarding bootstrap phases**
   - Make `/onboarding/profile` do minimal checks first (session + profile existence + role intent), then branch to agency/org bootstrap.
4. **Graceful sub-claim mismatch recovery**
   - Detect `isUserFromSubClaimMissingError` consistently in onboarding bootstrap path and force local sign-out + redirect to `/auth` with a clear message.
5. **Do not block on org bootstrap for initial verified state**
   - If org context fails, show role/profile completion recovery path instead of hard-stalling agency onboarding loader.

## 12. Files Reviewed
- [`src/pages/Auth.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Auth.jsx)
- [`src/App.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/App.jsx)
- [`src/context/WorkspaceContext.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/context/WorkspaceContext.jsx)
- [`src/pages/Onboarding.jsx`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Onboarding.jsx)
- [`src/lib/settingsApi.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/settingsApi.js)
- [`src/lib/api.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js)
- [`src/lib/supabaseClient.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/supabaseClient.js)
- [`src/lib/agencyOnboarding.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyOnboarding.js)
- [`src/lib/roles.js`](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/roles.js)
- [`vercel.json`](/Users/alexanderlandman/the-it-guy/the-it-guy/vercel.json)
