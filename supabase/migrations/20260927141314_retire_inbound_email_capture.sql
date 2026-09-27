begin;

-- Keep the messages and review queue for historical repairs, but stop creating
-- addresses and make every previously published address inactive.
drop trigger if exists trg_bridge_auto_create_agent_lead_capture_aliases
  on public.organisation_users;
drop function if exists public.bridge_auto_create_agent_lead_capture_aliases();

update public.lead_capture_aliases
set status = 'disabled',
    metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
      jsonb_build_object(
        'retired_at', now(),
        'retirement_reason', 'inbound_email_capture_retired'
      )
where status <> 'disabled';

alter table public.lead_capture_aliases
  add constraint lead_capture_aliases_retired_check
  check (status <> 'active');

drop policy if exists lead_capture_aliases_insert_member_or_admin
  on public.lead_capture_aliases;
revoke insert on public.lead_capture_aliases from public, anon, authenticated;
revoke execute on function public.bridge_create_lead_capture_alias(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
drop function if exists public.bridge_create_lead_capture_alias(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
);

-- Outbound email is sent through Resend. There are no Mailgun delivery rows.
alter table public.communication_deliveries
  drop constraint if exists communication_deliveries_provider_check;
alter table public.communication_deliveries
  add constraint communication_deliveries_provider_check
  check (provider in ('sendgrid', 'twilio', 'meta', 'internal', 'resend'));

commit;
