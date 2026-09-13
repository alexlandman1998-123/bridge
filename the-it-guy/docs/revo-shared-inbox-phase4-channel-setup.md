# Revo shared inbox — phase 4 channel setup

## Outcome

Revo can prepare Email and WhatsApp inbox channels before provider access is
available. Each channel records only:

- Email or WhatsApp;
- the intended provider;
- the public inbox address or business number; and
- an optional internal label and setup status.

The setup UI is at `/revo/inbox/settings` and is protected by the same Revo
extension feature gate as the inbox.

## Security boundary

This phase does not accept, store, display, or transmit provider credentials,
access tokens, refresh tokens, webhook secrets, or raw provider payloads.

Only the existing Revo organisation-admin policy can create or update channel
records. The accompanying migration provides a narrow, authenticated admin RPC
for choosing a default channel atomically; it verifies the exact Revo
organisation and administrator membership before making a change.

## Next phase

After Revo identifies the Email host, implement its provider adapter and OAuth
or service connection server-side. WhatsApp follows with the selected business
provider and webhook verification. Neither connection can be completed from
the browser setup screen.
