# Document Generator Final-Mile Phase 2

Date: 2026-07-26

## Objective

Make controlled smoke-test recipients staging-safe. Smoke tests must not send real email, but final delivery must still produce deterministic append-only evidence so the completion path can finish.

## Implementation

Updated:

- `../supabase/functions/send-email/utils/controlledTestRecipient.ts`
- `../supabase/functions/dispatch-final-signed-document/index.ts`

Controlled recipients now include reserved test domains such as:

- `example.com`
- `example.net`
- `example.org`
- `example.test`
- `.test`
- `.invalid`

When the final signed dispatcher sees a controlled recipient, it no longer calls the email provider and no longer records a failed delivery. It records `status='sent'` with a deterministic synthetic provider id:

`suppressed:controlled_test_recipient:<signer-id>`

## Required Truth

Suppressed controlled delivery is considered complete only for controlled test recipients. Real recipients still require provider-accepted email evidence.

## Not Included

This phase does not repair the final signed access resolver. That remains Phase 3.
