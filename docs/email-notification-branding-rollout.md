# Email Notification Branding Rollout

## Scope

This rollout covers the shared company branding applied to transactional emails sent through `supabase/functions/send-email`.

Converted priority notifications:

- buyer/client onboarding
- seller onboarding and seller portal activation
- seller onboarding submitted
- reservation deposit
- appointment notifications
- buyer offer link
- buyer offer submitted agent notification
- seller offer review
- offer decision notification

## Controls

The central resolver reads rollout controls from Supabase function environment variables:

| Variable | Values | Effect |
| --- | --- | --- |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `enabled` or unset | Full database + payload branding. |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `payload_only` | Uses handler payload/default branding only. Skips database branding reads. |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `disabled` | Uses handler defaults only. Fast rollback for bad tenant data. |
| `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` | comma/space separated UUIDs | Limits database branding reads to listed organisations. Others use payload/default branding. |

Recommended production start:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=enabled
BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS=<pilot-org-id>
```

## Readiness

Apply `supabase/migrations/202607280002_email_notification_branding_readiness.sql` before enabling database branding. Then check:

```sql
select
  organisation_id,
  organisation_name,
  branding_row_present,
  display_name_present,
  logo_present,
  primary_color_present,
  secondary_color_present,
  support_email_present,
  support_phone_present,
  sender_name_present,
  email_branding_ready,
  resolved_email_branding_preview
from public.organisation_email_branding_readiness
order by email_branding_ready asc, organisation_name asc;
```

Minimum go criteria for a pilot organisation:

- `branding_row_present = true`
- `display_name_present = true`
- `primary_color_present = true`
- `secondary_color_present = true`
- `support_email_present = true`
- send one test of each pilot notification type and inspect rendered sender, logo/name, CTA color, support footer, and plain-text fallback.

Logo is recommended but not blocking because the layout has a text/initial fallback.

## Canary Plan

1. Deploy function code and migration to staging.
2. Run the focused suite:

```sh
deno check --config supabase/functions/send-email/deno.json \
  supabase/functions/send-email/services/emailBranding.test.ts \
  supabase/functions/send-email/content/bridgeEmailLayout.test.ts \
  supabase/functions/send-email/content/brandedTemplates.test.ts \
  supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts

deno test --no-check --allow-read \
  supabase/functions/send-email/services/emailBranding.test.ts \
  supabase/functions/send-email/content/bridgeEmailLayout.test.ts \
  supabase/functions/send-email/content/brandedTemplates.test.ts \
  supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts
```

3. Set `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` to one pilot organisation.
4. Send buyer onboarding, seller onboarding, appointment, and offer-link emails for the pilot.
5. Watch provider failures, support replies, and `communication_deliveries` prepared/sent/failed status for 24 hours.
6. Expand the allowlist in small batches.
7. Clear `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` only after readiness is clean for active organisations.

## Rollback

Fast rollback, keeping payload/default branding:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=payload_only
```

Hard rollback to handler defaults:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=disabled
```

No database rollback is normally required. The Phase 8 migration is additive and the resolver tolerates missing branding rows/tables. If a single tenant has bad branding, remove it from `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` or correct the row in `organisation_branding`.

## Post-Rollout Audit

After expansion, run:

```sql
select *
from public.organisation_email_branding_readiness
where email_branding_ready is false
order by organisation_name asc;
```

Any active organisation returned here should be fixed before clearing the allowlist.
