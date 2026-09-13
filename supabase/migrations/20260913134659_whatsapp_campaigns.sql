begin;

-- Campaign writes go through the authenticated Edge Function. Browser roles have
-- read-only, organisation-scoped access and cannot forge delivery or consent state.
create table public.whatsapp_marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  consent_status text not null default 'unknown' check (consent_status in ('unknown','opted_in','opted_out')),
  consent_source text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, phone), unique (organisation_id, id),
  check (consent_status <> 'opted_in' or (length(trim(consent_source)) > 0 and consent_source is not null and consent_at is not null and opted_out_at is null))
);
create table public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  sender_id uuid references public.organisation_communication_channels(id) on delete set null,
  template jsonb not null default '{}'::jsonb,
  parameter_values jsonb not null default '{}'::jsonb,
  contact_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','sending')),
  revision integer not null default 1,
  phone_number_id text,
  waba_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organisation_id, id),
  check (cardinality(contact_ids) <= 500),
  check (jsonb_typeof(template) = 'object' and jsonb_typeof(parameter_values) = 'object')
);
create index whatsapp_campaigns_org_updated_idx on public.whatsapp_campaigns(organisation_id, updated_at desc);
create table public.whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  campaign_id uuid not null,
  contact_id uuid not null,
  full_name text not null,
  phone text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','read','failed','unknown','skipped')),
  provider_message_id text unique,
  error_message text,
  consent_snapshot jsonb not null,
  attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, campaign_id) references public.whatsapp_campaigns(organisation_id, id) on delete cascade,
  foreign key (organisation_id, contact_id) references public.whatsapp_marketing_contacts(organisation_id, id),
  unique (campaign_id, phone)
);
create index whatsapp_campaign_recipients_queue_idx on public.whatsapp_campaign_recipients(campaign_id,status);
create index whatsapp_campaign_recipients_org_idx on public.whatsapp_campaign_recipients(organisation_id);
alter table public.whatsapp_marketing_contacts enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;
create policy whatsapp_contacts_read on public.whatsapp_marketing_contacts for select to authenticated using (public.bridge_is_active_member(organisation_id));
create policy whatsapp_campaigns_read on public.whatsapp_campaigns for select to authenticated using (public.bridge_is_active_member(organisation_id));
create policy whatsapp_recipients_read on public.whatsapp_campaign_recipients for select to authenticated using (public.bridge_is_active_member(organisation_id));
revoke all on public.whatsapp_marketing_contacts, public.whatsapp_campaigns, public.whatsapp_campaign_recipients from anon, authenticated;
grant select on public.whatsapp_marketing_contacts, public.whatsapp_campaigns, public.whatsapp_campaign_recipients to authenticated;
grant all on public.whatsapp_marketing_contacts, public.whatsapp_campaigns, public.whatsapp_campaign_recipients to service_role;

create view public.whatsapp_campaign_performance with (security_invoker = true) as
select c.*, count(r.id)::integer as recipients,
  count(r.id) filter (where r.status in ('sent','delivered','read'))::integer as accepted,
  count(r.id) filter (where r.delivered_at is not null or r.read_at is not null)::integer as delivered,
  count(r.id) filter (where r.read_at is not null)::integer as read,
  count(r.id) filter (where r.status = 'failed')::integer as failed,
  count(r.id) filter (where r.status = 'skipped')::integer as skipped,
  count(r.id) filter (where r.status = 'unknown' or (r.status = 'processing' and r.attempted_at < now() - interval '2 minutes'))::integer as uncertain,
  count(r.id) filter (where r.status = 'queued')::integer as queued,
  case when c.status = 'draft' then 'draft'
    when count(r.id) filter (where r.status = 'queued' or (r.status = 'processing' and r.attempted_at >= now() - interval '2 minutes')) > 0 then 'sending'
    when count(r.id) filter (where r.status in ('unknown','processing')) > 0 then 'needs_attention'
    when count(r.id) filter (where r.status in ('failed','skipped')) = count(r.id) then 'failed'
    when count(r.id) filter (where r.status in ('failed','skipped')) > 0 then 'partial'
    else 'sent' end as display_status
from public.whatsapp_campaigns c left join public.whatsapp_campaign_recipients r on r.campaign_id = c.id group by c.id;
grant select on public.whatsapp_campaign_performance to authenticated, service_role;

-- Transactional queue preparation. Only the server may call this after loading
-- the current approved template from the sender's own WABA and validating values.
create function public.whatsapp_campaign_prepare(p_id uuid, p_org uuid, p_revision integer, p_template jsonb, p_messages jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare c public.whatsapp_campaigns; ch public.organisation_communication_channels; person public.whatsapp_marketing_contacts; item jsonb;
begin
  select * into c from public.whatsapp_campaigns where id = p_id and organisation_id = p_org for update;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status <> 'draft' then return c.id; end if;
  if c.revision <> p_revision then raise exception 'Campaign changed. Reload before sending.'; end if;
  select * into ch from public.organisation_communication_channels where id = c.sender_id and organisation_id = p_org and connection_status = 'connected' and channel_type = 'whatsapp' and provider = 'meta';
  if not found then raise exception 'Connect a WhatsApp sender first.'; end if;
  if p_template->>'status' <> 'APPROVED' or p_template->>'status' is null then raise exception 'Template is not approved.'; end if;
  if cardinality(c.contact_ids) = 0 or jsonb_array_length(p_messages) <> cardinality(c.contact_ids) then raise exception 'Select eligible recipients.'; end if;
  for item in select value from jsonb_array_elements(p_messages) loop
    select * into person from public.whatsapp_marketing_contacts where organisation_id = p_org and id = (item->>'contact_id')::uuid and id = any(c.contact_ids) for share;
    if not found or person.consent_status <> 'opted_in' or person.opted_out_at is not null then raise exception 'Audience consent changed. Review your recipients.'; end if;
    if item->'payload'->>'to' is distinct from person.phone then raise exception 'Recipient phone changed. Review your recipients.'; end if;
    insert into public.whatsapp_campaign_recipients(organisation_id,campaign_id,contact_id,full_name,phone,payload,consent_snapshot)
      values(p_org,c.id,person.id,person.full_name,person.phone,item->'payload',jsonb_build_object('source',person.consent_source,'at',person.consent_at));
  end loop;
  update public.whatsapp_campaigns set status = 'sending', template = p_template, phone_number_id = ch.phone_number_id, waba_id = ch.waba_id,
    sent_at = now(), updated_at = now(), revision = revision + 1 where id = c.id;
  return c.id;
end $$;

-- Claim once before making the external request. A crashed/uncertain attempt is
-- never returned to the queue; operators see it as needing attention.
create function public.whatsapp_campaign_claim(p_id uuid, p_org uuid)
returns setof public.whatsapp_campaign_recipients language plpgsql security invoker set search_path = public as $$
declare r public.whatsapp_campaign_recipients; person public.whatsapp_marketing_contacts;
begin
  select * into r from public.whatsapp_campaign_recipients where id = p_id and organisation_id = p_org and status = 'queued' for update;
  if not found then return; end if;
  select * into person from public.whatsapp_marketing_contacts where id = r.contact_id and organisation_id = p_org for share;
  if person.consent_status <> 'opted_in' or person.opted_out_at is not null or person.phone <> r.phone then
    update public.whatsapp_campaign_recipients set status = 'skipped', error_message = 'Recipient consent or phone changed.', updated_at = now() where id = r.id;
    return;
  end if;
  return query update public.whatsapp_campaign_recipients set status = 'processing', attempted_at = now(), updated_at = now() where id = r.id returning *;
end $$;

-- Handles duplicate and out-of-order callbacks, including callbacks arriving
-- before the HTTP send response has been recorded. Phone ID + WABA bind the event.
create function public.whatsapp_campaign_status(p_message_id text, p_callback text, p_phone_id text, p_waba_id text, p_status text, p_at timestamptz, p_error text default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare r public.whatsapp_campaign_recipients; next_status text;
begin
  if p_status not in ('sent','delivered','read','failed') or nullif(p_message_id,'') is null then return false; end if;
  select recipient.* into r from public.whatsapp_campaign_recipients recipient join public.whatsapp_campaigns c on c.id = recipient.campaign_id
    where (recipient.provider_message_id = p_message_id or ('arch9-wa:' || recipient.id::text = p_callback and recipient.status not in ('queued','skipped')))
      and c.phone_number_id = p_phone_id and c.waba_id = p_waba_id for update of recipient;
  if not found then return false; end if;
  if r.provider_message_id is not null and r.provider_message_id <> p_message_id then return false; end if;
  next_status := case when r.read_at is not null or p_status = 'read' then 'read'
    when r.delivered_at is not null or p_status = 'delivered' then 'delivered'
    when r.status = 'failed' and p_status = 'sent' then 'failed' else p_status end;
  update public.whatsapp_campaign_recipients set status = next_status, provider_message_id = p_message_id,
    sent_at = coalesce(sent_at, case when p_status <> 'failed' then p_at end),
    delivered_at = coalesce(delivered_at, case when p_status in ('delivered','read') then p_at end),
    read_at = coalesce(read_at, case when p_status = 'read' then p_at end),
    failed_at = coalesce(failed_at, case when p_status = 'failed' then p_at end),
    error_message = case when next_status = 'failed' then coalesce(p_error,error_message) else null end, updated_at = now() where id = r.id;
  return true;
end $$;
revoke all on function public.whatsapp_campaign_prepare(uuid,uuid,integer,jsonb,jsonb), public.whatsapp_campaign_claim(uuid,uuid), public.whatsapp_campaign_status(text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.whatsapp_campaign_prepare(uuid,uuid,integer,jsonb,jsonb), public.whatsapp_campaign_claim(uuid,uuid), public.whatsapp_campaign_status(text,text,text,text,text,timestamptz,text) to service_role;
commit;
