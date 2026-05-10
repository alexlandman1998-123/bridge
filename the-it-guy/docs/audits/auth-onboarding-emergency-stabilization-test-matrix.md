# Auth / Sign-Up / Onboarding Emergency Stabilization Test Matrix

Date: 2026-05-10
Owner: Demo Stabilization Pass

## Scope
- Sign up
- Email verification callback
- Login
- Onboarding completion
- Dashboard access
- Invite onboarding resume behavior

## Environment
- App: `the-it-guy` web client
- Supabase project ref: `isdowlnollckzvltkasn`
- Primary callback route: `/auth/callback`

## Execution Log
| Flow | Role | Steps | Expected Result | Status | Notes |
|---|---|---|---|---|---|
| New signup | Developer | Signup -> verify email -> callback -> onboarding -> dashboard | No hang, no loop, no profile data loss | Pending | |
| New signup | Agent | Signup -> verify email -> callback -> onboarding -> dashboard | No org bootstrap failure on first run | Pending | |
| New signup | Attorney | Signup -> verify email -> callback -> onboarding -> dashboard | Attorney onboarding route resolves cleanly | Pending | |
| Invite onboarding | Agent invited user | Open invite -> auth required -> sign in -> return -> accept invite | Token survives redirect and resume works | Pending | |
| Session repeat | Any role | Logout -> login -> refresh dashboard | Session restore stable, no callback loop | Pending | |
| Refresh during onboarding | Any internal role | Refresh on `/onboarding/profile` and role onboarding route | No blank screen, recoverable state | Pending | |
| Email verification return | Any role | Verify link from email into `/auth/callback` | Session restored and redirected safely | Pending | |
| Expired/out-of-sync session recovery | Any role | Force stale session and reload | Clear error + safe sign-in recovery path | Pending | |

## Failure Capture Template
- Flow:
- Exact URL:
- Console log prefix path (`[AUTH]`, `[ONBOARDING]`, `[PROFILE]`, `[REDIRECT]`):
- Error message:
- Repro steps:
- Severity (`blocker` / `high` / `medium` / `low`):

