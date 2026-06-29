# Lead Capture Production Email Setup

Phase 5 turns Arch9 lead capture into a production inbound-email flow.

## Runtime Environment

Set these on the Supabase Edge Function environment:

| Variable | Required | Value |
| --- | --- | --- |
| `INBOUND_LEAD_EMAIL_WEBHOOK_SECRET` | Yes | Long random shared secret sent by the email provider as `x-arch9-inbound-secret`. |
| `INBOUND_LEAD_EMAIL_REQUIRE_SECRET` | Yes | `true` in production. |
| `INBOUND_LEAD_EMAIL_ALLOWED_PROVIDERS` | No | Comma-separated allowlist, for example `mailgun,sendgrid,postmark,resend,amazon-ses`. |

The webhook URL is:

```text
https://<supabase-project-ref>.functions.supabase.co/inbound-lead-email
```

## DNS

Use `leads.arch9.co.za` as the inbound capture domain.

| Type | Host | Value |
| --- | --- | --- |
| MX | `leads.arch9.co.za` | Provider inbound MX host, priority `10`. |
| TXT | `leads.arch9.co.za` | Provider domain verification or SPF value. |
| CNAME/TXT | `selector._domainkey.leads.arch9.co.za` | Provider DKIM target or token. |
| TXT | `_dmarc.leads.arch9.co.za` | `v=DMARC1; p=none; rua=mailto:dmarc@arch9.co.za` during rollout. |

## Provider Webhook Contract

The Edge Function accepts JSON or form webhook payloads from common inbound providers and normalizes them into:

- `provider`
- `providerMessageId`
- `providerEventId`
- `fromEmail`
- `fromName`
- `replyToEmail`
- `toAddresses`
- `ccAddresses`
- `subject`
- `textBody`
- `htmlBody`
- `providerReceivedAt`
- `webhookReceivedAt`

Supported provider shapes:

- Mailgun-style inbound routes
- SendGrid inbound parse
- Postmark inbound
- Resend inbound
- Amazon SES/SNS-style payloads
- Generic JSON/form payloads

## Rollout Checks

1. Deploy migrations through `202606290013_lead_capture_alias_backfill_repair.sql`.
2. Deploy `supabase/functions/inbound-lead-email`.
3. Set the Edge Function env vars above.
4. Configure the provider inbound route to send `x-arch9-inbound-secret`.
5. Point MX for `leads.arch9.co.za` to the provider.
6. Send test emails to one generated alias per source.
7. Confirm rows land in `inbound_lead_emails` with `webhook_signature_status = shared_secret_valid`.
8. Confirm failed, unmatched, and low-confidence rows appear in the Lead Capture Review Queue.
