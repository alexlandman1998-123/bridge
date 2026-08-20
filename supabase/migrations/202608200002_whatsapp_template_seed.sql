begin;

-- Seed global WhatsApp template mappings used by the Phase 1 sender path.
-- Replace `provider_template_name` values with approved Meta template names in each deployment.
insert into public.notification_templates (
  organisation_id,
  channel,
  provider,
  event_key,
  internal_key,
  provider_template_name,
  language_code,
  status,
  is_default,
  source,
  metadata_json
)
select
  null,
  'whatsapp',
  'meta',
  values.event_key,
  values.internal_key,
  values.provider_template_name,
  coalesce(values.language_code, 'en_US'),
  coalesce(values.status, 'disabled'),
  coalesce(values.is_default, false),
  coalesce(values.source, 'whatsapp_seed'),
  jsonb_build_object('origin', '202608200002_whatsapp_template_seed')
from (
  values
    ('lead.created', 'lead_created', 'arch9_lead_created_v1', 'disabled', true),
    ('lead.enquiry_received', 'lead_enquiry_received', 'arch9_lead_enquiry_received_v1', 'disabled', false)
) as values(event_key, internal_key, provider_template_name, status, is_default)
  where to_regclass('public.notification_templates') is not null
  and not exists (
    select 1
    from public.notification_templates existing
    where existing.channel = 'whatsapp'
      and existing.provider = 'meta'
      and existing.organisation_id is null
      and (
        existing.internal_key = values.internal_key
        or existing.event_key = values.event_key
      )
  )
;

commit;
