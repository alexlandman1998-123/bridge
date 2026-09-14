# Arch9 marketing email — Phase 0 readiness

Arch9 operates one central Resend account. Agencies verify their own sending domains in later phases; they do not receive Resend credentials or separate provider accounts.

## One-time provider setup

1. Confirm the Resend account has an active production billing plan and an appropriate sending allowance.
2. Verify the Arch9 platform sender domain in Resend. The configured `ARCH9_RESEND_FROM_EMAIL` (or `RESEND_FROM_EMAIL`) must use that verified domain.
3. Register exactly one enabled webhook at:

   `https://isdowlnollckzvltkasn.supabase.co/functions/v1/resend-webhook`

   Subscribe it to `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, and `email.complained`.
4. Put the webhook's signing secret in the Supabase `RESEND_WEBHOOK_SECRET` secret. Do not put it in browser code, a local committed file, or a support ticket.

## Readiness check

Run the check only in a protected operator environment where the required secrets have already been injected:

```sh
RESEND_BILLING_CONFIRMED=true npm --prefix the-it-guy run check:email-platform-readiness
```

The check calls Resend without printing credentials. It confirms the provider key, verified platform sender domain, registered callback URL, subscribed events, signing-secret match, and that the live callback rejects unsigned requests. It requires an explicit billing confirmation because Resend does not expose billing-plan status through this readiness path.

The check does not send an email or change provider configuration.

## Phase 5 sending approval

Campaign sending is fail-closed until an Arch9 operator has created and approved an `email_sending_policies` row for the organisation. The default cap remains 500 recipients per day and 50 recipients per worker run. Agency administrators can no longer set the approval fields themselves; they can still manage their campaign drafts and sender addresses.
# Phase 7: Executive platform monitoring

The Admin Console’s **Email operations** page includes a protected readiness check for the central Resend account. It verifies the configured sender domain, delivery webhook and required event subscriptions, webhook signing secret, unsigned-webhook protection, and the manual billing acknowledgement. It reports only pass/fail status and never returns provider credentials or signing secrets.
