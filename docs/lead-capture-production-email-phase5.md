# Inbound Lead Email Capture — Retired

Arch9 no longer receives leads through forwarded email. Property24 enquiries use the Property24 API. Website, Meta, and other lead sources use their own active integrations; email aliases at `leads.arch9.co.za` are disabled.

The historical `inbound_lead_emails` and `lead_parse_failures` rows remain available under **Settings → Integrations → Archived Lead Emails**. Existing unmatched messages can still be repaired or linked to a lead. Do not generate new capture addresses or forward enquiries to old aliases.

The retirement removes the membership trigger and alias-creation RPC, disables all aliases, rejects new webhook requests with HTTP 410, removes inbound webhook secrets, and removes the `leads.arch9.co.za` MX and Mailgun SPF records. The main `arch9.co.za` Microsoft 365 MX and outbound Resend configuration remain separate.

If a new inbound-email provider is ever introduced, design and test a new receiving flow before creating DNS records or aliases. The historical migration files are an audit record, not a current setup guide.
