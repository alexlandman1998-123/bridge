# Revo inbox — phase 2 Microsoft 365 connector

## What is implemented

The `revo-microsoft-inbox` Edge Function implements the server-side Microsoft
OAuth authorization-code flow with PKCE for a Revo Email channel.

1. A Revo administrator starts a connection from channel setup.
2. The function creates a short-lived, one-time OAuth state and PKCE verifier.
3. The administrator is redirected to Microsoft sign-in and consent.
4. Microsoft returns the code to the Edge Function callback.
5. The callback exchanges it server-side, verifies the signed-in account (and,
   for a shared mailbox, verifies delegated access to that mailbox), then writes
   the token payload through Supabase Vault.

The browser receives only a return redirect and safe connection status.

## Microsoft Entra configuration required before use

Create an Arch9-owned confidential web application in Microsoft Entra, then
set these **server-side Edge Function secrets**:

- `REVO_MICROSOFT_CLIENT_ID`
- `REVO_MICROSOFT_CLIENT_SECRET` (or replace this flow with certificate auth
  before a high-scale production rollout)
- `REVO_MICROSOFT_TENANT_ID` — omit to accept work/school tenants generally;
  set it when intentionally restricting the application to one tenant.

Register this exact redirect URI in Entra:

`https://<your-supabase-project-ref>.supabase.co/functions/v1/revo-microsoft-inbox`

Use the production and staging project URLs independently. Do not place any of
these values in Vite environment variables or browser code.

## Permission boundary

Individual mailbox connections request delegated `Mail.ReadWrite` and
`Mail.Send`. Shared mailbox connections request delegated
`Mail.ReadWrite.Shared` and `Mail.Send.Shared`. Both flows include
`offline_access` for server-side renewal. Arch9 does not request Microsoft
application permissions and cannot read unrelated employee mailboxes.

## Still deferred

This phase authorises and securely stores the connection only. Message sync,
sending, attachments, change notifications/polling, token refresh scheduling,
and disconnect/revocation are subsequent work.
