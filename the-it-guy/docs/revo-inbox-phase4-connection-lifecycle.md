# Revo inbox — phase 4 connection lifecycle

## What is implemented

Revo administrators can now check or disconnect a connected Microsoft 365 or
Google Workspace mailbox from channel setup.

- A health check reads the credential only inside a server-side function,
  refreshes the token, replaces the Vault value, and verifies mailbox access.
- A failed health check marks the connection `expired` with a safe error code,
  so a disconnected provider cannot look healthy in the UI.
- Disconnect clears Arch9's stored credential. Google revocation is requested
  before clearing the credential; Microsoft consent remains manageable from
  the user's Microsoft account because there is no equivalent per-token
  delegated revocation endpoint in this implementation.

## Security boundary

Two new server-only RPCs read or clear the Vault credential. They are revoked
from `public` and granted only to `service_role`; neither the browser nor the
Revo metadata tables receive token values.

## Still deferred

Automated background health checks and refreshes, inbox synchronisation,
message sending, attachments, and provider webhook subscriptions are separate
phases. This phase deliberately runs lifecycle actions only when an authorised
Revo administrator asks for them.
