begin;

alter table if exists public.inbound_lead_emails
  add column if not exists provider_event_id text,
  add column if not exists provider_received_at timestamptz,
  add column if not exists webhook_received_at timestamptz,
  add column if not exists webhook_signature_status text,
  add column if not exists webhook_user_agent text,
  add column if not exists normalized_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inbound_lead_emails_webhook_signature_status_check'
      and conrelid = 'public.inbound_lead_emails'::regclass
  ) then
    alter table public.inbound_lead_emails
      add constraint inbound_lead_emails_webhook_signature_status_check
      check (
        webhook_signature_status is null
        or webhook_signature_status in ('shared_secret_valid', 'shared_secret_missing', 'shared_secret_disabled')
      );
  end if;
end;
$$;

create index if not exists inbound_lead_emails_provider_event_idx
  on public.inbound_lead_emails (provider, provider_event_id)
  where provider_event_id is not null and length(trim(provider_event_id)) > 0;

create index if not exists inbound_lead_emails_webhook_received_idx
  on public.inbound_lead_emails (organisation_id, webhook_received_at desc)
  where webhook_received_at is not null;

commit;
