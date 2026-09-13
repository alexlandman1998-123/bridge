# Revo inbox connection core — phase 1

## Outcome

This phase creates the durable connection model used by both Microsoft 365 and
Google Workspace. It is designed for mailbox-by-mailbox consent:

- an agent connects only their own mailbox; or
- an owner or IT-authorised delegate connects one shared mailbox such as
  `enquiries@`.

There is no organisation-wide mailbox permission, Microsoft application
permission, or Google domain-wide delegation in this design.

## Data boundary

The public connection registry stores only safe operational metadata: provider,
mailbox address, connection type, health state, consent actor, timestamps and
sanitised error codes. It does not contain OAuth codes, access tokens, refresh
tokens, client secrets, or raw provider responses.

The server-only `private.revo_inbox_connection_credentials` table maps a
connection to a Supabase Vault secret identifier. Future provider callback and
token-refresh functions run server-side and are the only code allowed to read
or write credentials.

## Included migration

`20260913080232_revo_inbox_connection_core.sql` adds the provider connection
registry, consent/health event ledger, server-only credential map, indexes and
Revo-only RLS read policies. Browser users cannot insert, update, or access
credential records.

## Deliberately deferred

The next phases implement provider-specific OAuth endpoints, token exchange,
Vault writes, message sync, sending, and disconnect/revocation. This phase
does not contact Microsoft or Google and cannot request mailbox access.
