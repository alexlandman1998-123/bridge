# Phase 4.5 Browser Verification Report

Date: 2026-05-10
Environment: local dev (`http://127.0.0.1:4173`), Playwright headless browser sweep + focused rechecks

## Summary
- Initial post-hardening sweep: 14/21 PASS, 7/21 FAIL
- Focused rechecks done on all 7 failures
- True app failures requiring code patch in this pass: 2 (already patched)
- Remaining failed matrix items are either automation false-failures or environment/expectation constraints

## Patches Applied (P0/P1 only)
1. `src/lib/devAuth.js`
- Fixed dev auth bootstrap trap where missing `itg:dev-auth-role` normalized to `viewer` and created unintended pseudo-session.
- Now returns `null` when storage key is absent/empty.
- Also blocks persisting `viewer` as dev bypass role.

2. `src/context/WorkspaceContext.jsx`
- Fixed persona preview bootstrap trap where missing preview key normalized to `viewer`.
- Now returns `null` when preview key is absent/empty.
- Added `firstName`/`lastName` to dev bypass profile to avoid false `profile_incomplete` redirects in test/dev bypass flows.

## Full 21-Test Matrix

| # | Area | Test | Expected | Sweep Result | Actual | Classification | Evidence | Recommended Action | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Auth | Fresh signup | Create account + verification/session path | FAIL | Supabase error: invalid email for `phase45+...@example.com`; subsequent focused run hit rate-limit message | Undefined expected behavior (env constraint) | 400 on `/auth/v1/signup`; UI showed "Too many verification emails..." in focused test | Use demo-safe signup addresses/domain and avoid repeated rapid signup; for demo use pre-created accounts | P1 |
| 2 | Auth | Invalid callback handler | Safe recoverable callback error screen | FAIL | Screen rendered correctly with retry/sign-in/dashboard actions | Automation false failure | Focused check body: "We could not complete sign in... Retry / Return to Sign-in / Continue to Dashboard" | Mark as pass in matrix expectations | P2 |
| 3 | Auth | Login (dev bypass) | Land in app | PASS | Redirected to `/dashboard` | Pass | Sweep evidence | None | - |
| 4 | Auth | Logout flow | Return to auth, no blank screen | FAIL | Script timed out waiting for avatar trigger on dashboard | Automation false failure | Focused check: `AVATAR_COUNT 0` on developer dashboard (header hidden there) | Update automation to logout from a route with shared header (e.g. `/developments`) or via `/client-access` logout button | P2 |
| 5 | Auth | Refresh after login | Stay logged in and stable | PASS | Stayed on `/dashboard` | Pass | Sweep evidence | None | - |
| 6 | Auth | Direct dashboard logged out | Redirect to sign-in | PASS | Routed to `/auth` sign-in view | Pass | Sweep evidence | None | - |
| 7 | Auth | Direct dashboard logged in | Access dashboard | PASS | Dashboard accessible | Pass | Sweep evidence | None | - |
| 8 | Auth | Expired/cleared session | Redirect to sign-in safely | PASS | Session clear returned to `/auth` | Pass | Sweep evidence | None | - |
| 9 | Onboarding | Revisit onboarding after completion | Redirect away from onboarding | FAIL | Sweep recorded `/onboarding/profile`; focused check redirects to `/dashboard` | Automation false failure | Focused script: URL `.../dashboard`, no profile setup view | Add redirect stabilization wait/assertion in automation | P2 |
| 10 | Onboarding | Refresh during onboarding | Stable resolve, no stuck loader | PASS | Resolved to `/dashboard` | Pass | Sweep evidence | None | - |
| 11 | Route Guard | `/reports` while logged out | Redirect to auth | PASS | Redirected to `/auth` | Pass | Sweep evidence | None | - |
| 12 | Route Guard | Agent -> `/snags` | Block agent, safe redirect | FAIL | Sweep read `/snags`; focused check redirects to `/dashboard` | Automation false failure | Focused script: URL `.../dashboard`, no snags page | Update automation wait/assertion after navigation redirects | P2 |
| 13 | Dashboard Empty | Agent empty-state safety | Safe empty/fallback state | FAIL | Agent dashboard loaded (non-crash), but dataset was not empty-state eligible | Undefined expected behavior | No crash/blank loop; screenshot shows valid dashboard shell | Create deterministic empty-data fixture/test tenant for this scenario | P2 |
| 14 | Dashboard Empty | Attorney empty-state safety | Safe fallback | PASS | `/attorney/dashboard` loaded safely | Pass | Sweep evidence | None | - |
| 15 | Permission | Developer -> `/developments` | Access granted | PASS | Access granted | Pass | Sweep evidence | None | - |
| 16 | Permission | Agent blocked from developer-only `/snags` | Redirect/deny | FAIL | Sweep read `/snags`; focused check redirected to `/dashboard` | Automation false failure | Focused script: URL `.../dashboard` | Same as #12, unify guard assertion strategy | P2 |
| 17 | Token Routes | `/client/:token` invalid | Safe invalid-link state | PASS | Correct safe invalid-link state | Pass | Sweep evidence | None | - |
| 18 | Token Routes | `/external/:accessToken` invalid | Safe invalid-link state | PASS | Correct safe invalid-link state | Pass | Sweep evidence | None | - |
| 19 | Token Routes | `/snapshot/:token` invalid | Safe invalid-link state | PASS | Correct safe invalid-link state | Pass | Sweep evidence | None | - |
| 20 | Token Routes | Long-form invalid client token | Graceful recovery page | PASS | Graceful non-blank failure state | Pass | Sweep evidence | None | - |
| 21 | Error Recovery | Auth callback recovery controls | Retry + safe navigation controls | PASS | Controls present and functional | Pass | Sweep + focused evidence | None | - |

## Failure Classification

### True App Failures
1. Dev auth bypass fallback to unintended `viewer` session when storage key absent.
2. Persona preview fallback to unintended `viewer` when preview key absent.

Both fixed in this pass.

### Automation False Failures
1. Invalid callback handler (#2)
2. Logout flow from dashboard avatar (#4)
3. Revisit onboarding after completion (#9)
4. Agent -> `/snags` guard check (#12)
5. Agent blocked from `/snags` permission check (#16)

### Undefined Expected Behavior / Environment Constraints
1. Fresh signup (#1): Supabase email/rate-limit constraints in repeated local test runs.
2. Agent empty-state safety (#13): test environment has seeded data and preview/dataset variability; not a deterministic no-data fixture.

## Screenshots / Evidence Artifacts
- Sweep artifacts: `test-results/phase45/*.png`
- Focused checks:
  - `test-results/phase45/callback-invalid-focused.png`
  - `test-results/phase45/logout-avatar-focused.png`
  - `test-results/phase45/agent-snags-focused.png`

## Build / Lint
- Build: `npm run build` PASS
- Targeted lint: `npx eslint src/lib/devAuth.js src/context/WorkspaceContext.jsx`
  - 0 errors
  - 2 pre-existing warnings in `WorkspaceContext.jsx` (`react-hooks/exhaustive-deps`)

## Demo Readiness Verdict
**DEMO SAFE WITH KNOWN WORKAROUNDS**

### Workarounds to use during demo
1. Use pre-created accounts or low-frequency signup attempts (avoid rapid repeated signup due provider rate limits).
2. For logout demonstration, use a route with shared header (`/developments` then avatar logout) or `/client-access` logout action.
3. Treat agent empty-state as environment-specific unless run against a deterministic no-data fixture.
