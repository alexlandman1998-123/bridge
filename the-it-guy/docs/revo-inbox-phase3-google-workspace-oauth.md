# Revo inbox — phase 3 Google Workspace connector

## What is implemented

The `revo-google-workspace-inbox` Edge Function provides the Google Workspace
equivalent of the Microsoft mailbox connector. A Revo administrator starts the
connection from channel setup, signs in to the intended Google account, and is
redirected back only after Arch9 has securely stored a server-side token.

For a standard inbox the function verifies the signed-in Gmail account. For a
delegated inbox it also checks access to the configured mailbox address. This
does not use domain-wide delegation, a service account, or Google Workspace
organisation-wide access.

## Google Cloud configuration required before use

Create an Arch9-owned OAuth **Web application** in Google Cloud, enable the
Gmail API, and configure the OAuth consent screen. Set these Edge Function
secrets, never Vite/browser environment variables:

- `REVO_GOOGLE_CLIENT_ID`
- `REVO_GOOGLE_CLIENT_SECRET`

Register the redirect URI exactly as follows, once for each Supabase project:

`https://<your-supabase-project-ref>.supabase.co/functions/v1/revo-google-workspace-inbox`

The requested delegated scopes are:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `openid`, `email`, and offline access for identity verification and secure
  server-side renewal.

These Gmail scopes can require Google OAuth app verification before the
connector is broadly released. Test users can consent while that review is in
progress. A connection is marked failed if Google does not return a refresh
token, so Arch9 never records a connection that cannot support later sync.

## Gmail delegated-mailbox note

Google Workspace does not model shared mailboxes in the same way as Microsoft
365. The generic mailbox must either be connected by its actual owner or have
Gmail delegation configured for the person completing the consent flow. The
function verifies that delegated access before accepting the connection.

## Still deferred

This authorises and securely stores the connection only. Sync, sending,
attachments, change notifications/polling, refresh scheduling, and
disconnect/revocation remain later phases.
