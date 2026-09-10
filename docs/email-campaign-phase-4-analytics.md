# Arch9 Email Campaigns — Phase 4: Analytics and recipient activity

Phase 4 turns provider events into operational campaign intelligence.

## Included

- Per-recipient activity report, searchable by contact name, address and delivery status.
- Link performance with raw click count and unique-recipient count.
- An opaque public tracking redirect that validates both campaign link and recipient tokens before recording activity and issuing a `302` redirect.
- Campaign link records never store the recipient’s email in a click URL.
- Existing Resend webhook events remain idempotent through `provider_event_id`; tracked redirect clicks use an Arch9 event id for each actual redirect.

## Configuration when the freeze is lifted

Deploy `email-campaign-track` with `verify_jwt = false`. It is intentionally public because recipients are outside the app, but it accepts only opaque campaign/recipient token pairs and redirects only to a stored `http` or `https` target. Configure Resend open/click tracking for the sending domain if provider-level telemetry is desired; Arch9 reporting treats opens as indicative, not an exact engagement measure.
