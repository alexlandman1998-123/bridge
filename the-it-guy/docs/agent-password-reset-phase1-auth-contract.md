# Agent Password Reset Phase 1 Auth Contract

Date: 2026-07-24

## Scope

This audit covers agent workspace account password reset only. It does not cover seller portal passwords on listing records, buyer/client portal access, invite acceptance passwords, or document signer links.

Agent accounts use Supabase Auth through the main `/auth` and `/auth/callback` routes. Seller portal passwords use listing-scoped RPCs and a separate seller portal recovery function, so those controls must remain separate from agent account recovery.

## Current Routes

| Route | Current purpose | Reset relevance |
| --- | --- | --- |
| `/auth` | Main login/signup page rendered by `Auth.jsx`. | Has login and signup forms. No forgot-password mode is implemented. |
| `/auth/callback` | Supabase Auth callback rendered by `AuthCallback.jsx`. | Exchanges `code` for a session and routes into onboarding, invite, or the post-login destination. It does not detect password recovery callbacks yet. |
| `/settings/account` | Account settings page rendered by `SettingsAccountPage.jsx`. | Lets a signed-in user change password through `changePassword`. |
| `/auth/reset-password` | Not present. | Needed for Phase 4. |

## Current Agent Auth Behavior

`Auth.jsx` supports:

- password sign-in via `supabase.auth.signInWithPassword`
- signup via `supabase.auth.signUp`
- signup verification resend via `supabase.auth.resend({ type: 'signup' })`
- invite-aware redirects through `next`, pending invite session storage, and signup intent state

`Auth.jsx` does not currently call `supabase.auth.resetPasswordForEmail`, and no public "Forgot your password?" action exists for agent accounts.

`SettingsAccountPage.jsx` supports signed-in password changes by calling `changePassword`, which calls:

```js
client.auth.updateUser({ password })
```

That path only works after a valid Supabase session already exists.

## Current Callback Behavior

`AuthCallback.jsx` currently:

1. Logs callback diagnostics without token values.
2. Exchanges a `code` query parameter through `supabase.auth.exchangeCodeForSession(code)`.
3. Polls `supabase.auth.getSession()`.
4. Loads the authenticated user.
5. Resolves pending invite/signup intent state.
6. Navigates to the pending invite path, partner invite signup path, callback invite path, signup intent route, or the safe `next`/post-login fallback.

There is no recovery-specific branch. A password recovery email link that lands on `/auth/callback` would currently be treated like a normal sign-in or onboarding callback after the session is restored.

Phase 3 must add an early recovery branch after session restoration and before signup/onboarding routing.

## Redirect Contract

The existing email verification helper builds callback URLs with this precedence:

1. `VITE_PUBLIC_APP_URL`
2. `VITE_APP_BASE_URL`
3. `VITE_SITE_URL`
4. `window.location.origin`

It always targets `/auth/callback` and appends a `next` path for normal signup/login verification flows.

The local environment inspected during this audit has Supabase URL variables configured, but no app-origin variables configured. That means browser-origin fallback is the active local behavior.

Agent password reset should use the same origin-selection rule, but the recovery callback must be distinguishable. Recommended Phase 2 redirect shape:

```text
{app-origin}/auth/callback?type=recovery
```

Do not send recovery links directly to `/auth/reset-password` unless Supabase recovery session behavior is verified for that route. Keeping `/auth/callback` as the first landing point preserves the existing `exchangeCodeForSession` behavior.

## Supabase Auth Config Observed In Repo

`supabase/config.toml` contains:

- `site_url = "https://app.arch9.co.za"`
- production callback allow-list entry: `https://app.arch9.co.za/auth/callback`
- local callback allow-list entries for ports `5173`, `5175`, and `5177`
- recovery email template: `supabase/templates/auth/recovery.html`

The repo config does not currently include `/auth/reset-password` in the redirect allow list. That is acceptable if recovery links first land on `/auth/callback?type=recovery`, because `/auth/callback` is the allowed Auth redirect target.

The deployed Supabase dashboard allow list was not mutated in Phase 1. Before staging verification, confirm the remote dashboard matches the repo callback allow list.

## Agent Versus Seller Boundary

Agent account reset must not reuse these seller portal paths:

- `AgentListingDetail.jsx` reset buttons
- `resetSellerPortalPassword`
- `requestSellerPortalPasswordRecovery`
- `completeSellerPortalPasswordRecovery`
- `seller-portal-password-recovery` Edge Function

Those flows are listing/seller scoped and operate against `private_listing_seller_onboarding`, not Supabase Auth user accounts.

Agent password reset belongs in:

- `Auth.jsx` for reset email request
- `AuthCallback.jsx` for recovery callback routing
- a new `/auth/reset-password` page for setting the new password
- `App.jsx` for route registration

## Phase 1 Findings

1. Signed-in agent password change works through Settings.
2. Public forgotten-password reset for agents is not implemented.
3. The callback route is present and suitable as the first recovery landing point.
4. The callback route must be taught to branch on recovery before onboarding/invite routing.
5. Repo Supabase config already allows `/auth/callback` for production and local dev ports.
6. The implementation must preserve invite, signup intent, and post-login redirect behavior for non-recovery callbacks.

## Phase 2 Inputs

Phase 2 should add only the reset request flow in `Auth.jsx`:

- introduce forgot-password UI state
- collect email
- call `supabase.auth.resetPasswordForEmail`
- redirect to `/auth/callback?type=recovery`
- return neutral success copy
- avoid account enumeration

Phase 2 should not add the new password screen yet unless the phase plan is intentionally expanded.
