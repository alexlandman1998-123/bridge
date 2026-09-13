begin;

-- Phase 2A accepts property enquiries as conversations without treating each
-- channel as a separate inbox. This procedure is service-role only; public
-- clients cannot submit or inspect provider receipts.

alter table public.revo_inbox_channels
  drop constraint revo_inbox_channels_channel_check;
alter table public.revo_inbox_channels
  add constraint revo_inbox_channels_channel_check
  check (channel in ('email', 'whatsapp', 'website', 'property24', 'private_property'));

alter table public.revo_inbox_messages
  drop constraint revo_inbox_messages_channel_check;
alter table public.revo_inbox_messages
  add constraint revo_inbox_messages_channel_check
  check (channel in ('email', 'whatsapp', 'website', 'property24', 'private_property'));

create table private.revo_inbox_ingestion_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_channel text not null check (source_channel in ('website', 'property24', 'private_property')),
  external_reference text not null,
  conversation_id uuid not null references public.revo_inbox_conversations(id) on delete cascade,
  received_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  unique (organisation_id, source_channel, external_reference)
);

revoke all on table private.revo_inbox_ingestion_receipts from public;

create or replace function public.revo_ingest_external_enquiry(
  p_organisation_id uuid,
  p_source_channel text,
  p_external_reference text,
  p_contact_name text,
  p_contact_address text,
  p_subject text default null,
  p_message_body text default '',
  p_listing_id uuid default null,
  p_lead_id uuid default null,
  p_assigned_user_id uuid default null,
  p_received_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns table (conversation_id uuid, created boolean, assigned_user_id uuid)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source text := lower(btrim(coalesce(p_source_channel, '')));
  v_reference text := btrim(coalesce(p_external_reference, ''));
  v_address text := lower(btrim(coalesce(p_contact_address, '')));
  v_channel_id uuid;
  v_conversation_id uuid;
  v_existing_receipt uuid;
  v_assignee uuid := p_assigned_user_id;
begin
  if p_organisation_id <> '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid then
    raise exception 'revo_only';
  end if;
  if v_source not in ('website', 'property24', 'private_property') or v_reference = '' then
    raise exception 'invalid_external_enquiry';
  end if;
  if v_address = '' then
    v_address := concat('unidentified+', replace(v_reference, ' ', '-'), '@inbound.revo.local');
  end if;

  select conversation_id into v_existing_receipt
  from private.revo_inbox_ingestion_receipts
  where organisation_id = p_organisation_id and source_channel = v_source and external_reference = v_reference;
  if v_existing_receipt is not null then
    return query select v_existing_receipt, false, null::uuid;
    return;
  end if;

  if v_assignee is not null and not exists (
    select 1 from public.organisation_users
    where organisation_id = p_organisation_id and user_id = v_assignee and status = 'active'
  ) then
    v_assignee := null;
  end if;

  insert into public.revo_inbox_channels (
    organisation_id, channel, provider_key, address, display_name, connection_status, metadata_json
  ) values (
    p_organisation_id, v_source, 'arch9_ingestion', concat('source:', v_source), initcap(replace(v_source, '_', ' ')), 'connected', '{"system":true}'::jsonb
  ) on conflict (organisation_id, channel, lower(address)) do update
    set updated_at = now()
  returning id into v_channel_id;

  insert into public.revo_inbox_conversations (
    organisation_id, channel_id, provider_key, provider_thread_id, contact_name, contact_address,
    subject, status, assigned_user_id, last_message_at, last_inbound_at, last_message_preview, metadata_json
  ) values (
    p_organisation_id, v_channel_id, 'arch9_ingestion', v_reference, nullif(btrim(p_contact_name), ''), v_address,
    nullif(btrim(p_subject), ''), 'waiting_on_us', v_assignee, p_received_at, p_received_at, left(coalesce(p_message_body, ''), 500),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('sourceChannel', v_source, 'externalReference', v_reference)
  ) on conflict (organisation_id, channel_id, provider_key, provider_thread_id) do update
    set last_message_at = excluded.last_message_at,
        last_inbound_at = excluded.last_inbound_at,
        last_message_preview = excluded.last_message_preview,
        unread_count = public.revo_inbox_conversations.unread_count + 1,
        assigned_user_id = coalesce(public.revo_inbox_conversations.assigned_user_id, excluded.assigned_user_id)
  returning id, assigned_user_id into v_conversation_id, v_assignee;

  insert into public.revo_inbox_messages (
    organisation_id, conversation_id, channel, direction, message_type, provider_key, provider_message_id,
    provider_thread_id, sender_address, recipient_addresses, subject, body_text, delivery_status, occurred_at, metadata_json
  ) values (
    p_organisation_id, v_conversation_id, v_source, 'inbound', 'message', 'arch9_ingestion', concat(v_source, ':', v_reference),
    v_reference, v_address, array[concat('source:', v_source)], nullif(btrim(p_subject), ''), coalesce(p_message_body, ''), 'received', p_received_at, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (organisation_id, provider_key, provider_message_id) do nothing;

  if p_listing_id is not null then
    insert into public.revo_inbox_associations (organisation_id, conversation_id, entity_type, entity_id, is_primary)
    values (p_organisation_id, v_conversation_id, 'listing', p_listing_id, true)
    on conflict (conversation_id, entity_type, entity_id) do update set is_primary = true;
  end if;
  if p_lead_id is not null then
    insert into public.revo_inbox_associations (organisation_id, conversation_id, entity_type, entity_id, is_primary)
    values (p_organisation_id, v_conversation_id, 'lead', p_lead_id, true)
    on conflict (conversation_id, entity_type, entity_id) do update set is_primary = true;
  end if;

  insert into private.revo_inbox_ingestion_receipts (organisation_id, source_channel, external_reference, conversation_id, metadata_json)
  values (p_organisation_id, v_source, v_reference, v_conversation_id, coalesce(p_metadata, '{}'::jsonb));

  return query select v_conversation_id, true, v_assignee;
end;
$$;

revoke all on function public.revo_ingest_external_enquiry(uuid, text, text, text, text, text, text, uuid, uuid, uuid, timestamptz, jsonb) from public;

comment on function public.revo_ingest_external_enquiry is
  'Service-role-only ingestion boundary for Website, Property24 and Private Property enquiries. The caller must supply a validated listing owner when available.';

commit;
