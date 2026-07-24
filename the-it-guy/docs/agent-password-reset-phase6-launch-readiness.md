# Agent Password Reset Phase 6 Launch Readiness

Date: 2026-07-24

## Scope

Phase 6 is the release gate for agent workspace password reset. It covers the Supabase Auth account flow only:

1. `/auth` requests a recovery email with neutral copy.
2. Supabase lands recovery links on `/auth/callback?type=recovery`.
3. `/auth/callback` restores the recovery session and routes to `/auth/reset-password`.
4. `/auth/reset-password` verifies the session, validates the new password, updates the Supabase Auth user, audits completion, and returns the user to `/dashboard`.

Seller portal password recovery remains listing-scoped and separate.

## Required Local Checks

Run:

```bash
npm run verify:agent-password-reset
```

This command executes the Phase 2, Phase 3, Phase 4, Phase 6, Phase 7, and Phase 8 contract checks.

Run the Phase 8 success-path state-machine check directly when changing reset-page logic:

```bash
npm run test:agent-password-reset-phase8
```

The Phase 8 check uses a mocked Supabase Auth client to prove recovery-session detection, exact password preservation, successful `updateUser({ password })` calls, and update-error handling without sending email or mutating remote data.

Run the Phase 7 browser smoke when preparing a staging or release candidate:

```bash
npm run smoke:agent-password-reset:browser
```

The smoke is non-mutating. It verifies that `/auth` exposes the forgot-password surface and that `/auth/reset-password` renders a usable invalid-link state without a recovery session.

Run the production build before release:

```bash
npm run build
```

## Supabase Auth Requirements

The repository Supabase config must keep `/auth/callback` in the redirect allow-list for production and local dev. `/auth/reset-password` does not need to be an Auth redirect URL because recovery links first land on `/auth/callback?type=recovery`, where the session is exchanged and restored before the app navigates internally.

Before staging or production verification, confirm the hosted Supabase dashboard matches these callback URLs:

- `https://app.arch9.co.za/auth/callback`
- `http://localhost:5173/auth/callback`
- `http://127.0.0.1:5173/auth/callback`
- `http://localhost:5175/auth/callback`
- `http://127.0.0.1:5175/auth/callback`
- `http://localhost:5177/auth/callback`
- `http://127.0.0.1:5177/auth/callback`

## Manual Smoke

Use a staging agent account:

1. Open `/auth`.
2. Choose `Forgot your password?`.
3. Submit the staging agent email.
4. Confirm the UI shows `If an Arch9 account exists for that email, a password reset link has been sent.`
5. Open the recovery email.
6. Confirm the link lands on `/auth/callback?type=recovery` and then `/auth/reset-password`.
7. Enter mismatched passwords and confirm the page blocks submission.
8. Enter a password shorter than 8 characters and confirm the page blocks submission.
9. Enter a valid matching password and confirm `Password updated.`
10. Confirm the app navigates to `/dashboard`.
11. Sign out, then sign in with the new password.
12. Confirm seller portal reset buttons on listing details still use seller portal recovery only.

## Release Boundary

Do not route agent reset through seller portal Edge Functions or listing passwords. Do not add `/auth/reset-password` as the first Supabase recovery redirect unless the callback exchange behavior is re-verified for that route.
