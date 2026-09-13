# Revo inbox — phase 5 inbound-sync foundation

Phase 5 adds the durable data boundary for inbound provider imports:

- provider/thread identifiers on conversations, allowing one stable Arch9
  conversation per provider email thread;
- the existing provider message ID uniqueness becomes the duplicate guard for
  message import retries; and
- an append-only, Revo-scoped sync-run record with imported/skipped counts and
  safe error codes.

No browser role can write sync-run records. The subsequent provider worker
uses the server-only Vault reader introduced in Phase 4 and writes only
normalised messages, never raw OAuth or provider payloads.

This migration is intentionally a data foundation only. Live Microsoft/Google
message retrieval, retries, attachments, outbound mail, and scheduling remain
separate implementation work.
