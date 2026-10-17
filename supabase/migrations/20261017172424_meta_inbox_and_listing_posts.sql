begin;

-- Provider credentials are only read or written by authenticated server handlers.
alter table public.organisation_communication_channels add column token_ciphertext text;
alter table public.organisation_communication_channels add constraint communication_channel_org_identity unique (id, organisation_id);
create unique index communication_channel_connected_phone on public.organisation_communication_channels(phone_number_id)
  where provider='meta' and channel_type='whatsapp' and connection_status='connected';
revoke all on public.organisation_communication_channels from public, anon, authenticated;
grant select (id,organisation_id,branch_id,provider,channel_type,waba_id,phone_number_id,meta_business_id,
  display_phone_number,business_display_name,connection_status,verification_status,is_default,
  connected_at,disconnected_at,last_error_message,last_checked_at,created_by,created_at,updated_at)
  on public.organisation_communication_channels to authenticated;
grant all on public.organisation_communication_channels to service_role;

alter table public.meta_lead_ads_connections add column granted_scopes text[] not null default '{}';
alter table public.meta_lead_ads_connections add column page_tasks text[] not null default '{}';
alter table public.meta_lead_ads_connections add constraint meta_page_org_identity unique(id,organisation_id);

create table public.meta_whatsapp_authorizations (
  state_hash text primary key,
  organisation_id uuid not null references public.organisations(id),
  requested_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  exchange_claimed_at timestamptz,
  token_ciphertext text,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index meta_whatsapp_authorizations_expiry on public.meta_whatsapp_authorizations(expires_at);

create table public.whatsapp_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  channel_id uuid not null,
  contact_phone text not null check(contact_phone ~ '^[1-9][0-9]{6,14}$'),
  contact_name text not null default '',
  status text not null default 'open' check(status in ('open','closed')),
  unread_count integer not null default 0 check(unread_count>=0),
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,contact_phone),
  unique(id,organisation_id,channel_id),
  foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id)
);
create index whatsapp_inbox_conversations_org_activity on public.whatsapp_inbox_conversations(organisation_id,last_message_at desc);

create table public.whatsapp_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  conversation_id uuid not null,
  channel_id uuid not null,
  provider_message_id text,
  direction text not null check(direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body_text text not null default '' check(length(body_text)<=16000),
  media_json jsonb not null default '{}'::jsonb,
  delivery_status text not null check(delivery_status in ('received','sending','sent','delivered','read','failed','unknown')),
  error_message text,
  event_at timestamptz not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,provider_message_id),
  foreign key(conversation_id,organisation_id,channel_id) references public.whatsapp_inbox_conversations(id,organisation_id,channel_id)
);
create index whatsapp_inbox_messages_conversation on public.whatsapp_inbox_messages(organisation_id,conversation_id,event_at desc,id);

alter table public.private_listings add constraint meta_listing_org_identity unique(id,organisation_id);
create table public.meta_listing_posts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  listing_id uuid not null,
  connection_id uuid not null,
  snapshot_json jsonb not null,
  status text not null default 'draft' check(status in ('draft','publishing','published','failed','unknown')),
  provider_post_id text,
  public_url text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  foreign key(connection_id,organisation_id) references public.meta_lead_ads_connections(id,organisation_id),
  foreign key(listing_id,organisation_id) references public.private_listings(id,organisation_id)
);
create index meta_listing_posts_listing on public.meta_listing_posts(organisation_id,listing_id,created_at desc);

alter table public.meta_whatsapp_authorizations enable row level security;
alter table public.whatsapp_inbox_conversations enable row level security;
alter table public.whatsapp_inbox_messages enable row level security;
alter table public.meta_listing_posts enable row level security;
revoke all on public.meta_whatsapp_authorizations,public.whatsapp_inbox_conversations,public.whatsapp_inbox_messages,public.meta_listing_posts from public,anon,authenticated;
grant all on public.meta_whatsapp_authorizations,public.whatsapp_inbox_conversations,public.whatsapp_inbox_messages,public.meta_listing_posts to service_role;

-- This ingestion boundary is service-only and resolves the tenant from the signed
-- provider identity. Neither tenant IDs nor contact IDs come from the payload.
create function public.whatsapp_inbox_receive(
  p_phone_id text,p_waba_id text,p_from text,p_message_id text,p_at timestamptz,
  p_body text,p_type text,p_media jsonb,p_name text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.organisation_communication_channels%rowtype; v_id uuid; v_message uuid;
begin
  select * into c from public.organisation_communication_channels
    where phone_number_id=p_phone_id and waba_id=p_waba_id and provider='meta' and channel_type='whatsapp' and connection_status='connected';
  if c.id is null then return null; end if;
  if p_from !~ '^[1-9][0-9]{6,14}$' or nullif(p_message_id,'') is null or p_at is null then raise exception 'Invalid inbound WhatsApp identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||c.id::text||':'||p_from,0));
  insert into public.whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,contact_name)
    values(c.organisation_id,c.id,p_from,left(coalesce(p_name,''),160))
    on conflict(channel_id,contact_phone) do nothing;
  select id into v_id from public.whatsapp_inbox_conversations where channel_id=c.id and contact_phone=p_from for update;
  insert into public.whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,provider_message_id,direction,message_type,body_text,media_json,delivery_status,event_at)
    values(c.organisation_id,v_id,c.id,p_message_id,'inbound',left(coalesce(p_type,'text'),32),left(coalesce(p_body,''),16000),coalesce(p_media,'{}'::jsonb),'received',p_at)
    on conflict(channel_id,provider_message_id) do nothing returning id into v_message;
  if v_message is not null then
    update public.whatsapp_inbox_conversations set
      contact_name=case when nullif(p_name,'') is not null then left(p_name,160) else contact_name end,
      status='open',unread_count=unread_count+1,
      last_inbound_at=greatest(last_inbound_at,p_at),
      last_message_preview=case when last_message_at is null or p_at>=last_message_at then left(coalesce(nullif(p_body,''),'['||p_type||']'),240) else last_message_preview end,
      last_message_at=greatest(last_message_at,p_at),updated_at=now() where id=v_id;
  end if;
  return v_id;
end $$;

create function public.whatsapp_inbox_status(p_phone_id text,p_waba_id text,p_message_id text,p_callback text,p_status text,p_at timestamptz,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_inbox_messages%rowtype; c public.organisation_communication_channels%rowtype; v_uuid uuid; v_rank integer; v_old integer;
begin
  if p_status not in ('sent','delivered','read','failed') or nullif(p_message_id,'') is null then return false; end if;
  select * into c from public.organisation_communication_channels where phone_number_id=p_phone_id and waba_id=p_waba_id and provider='meta' and channel_type='whatsapp';
  if c.id is null then return false; end if;
  if p_callback ~ '^arch9-inbox:[0-9a-fA-F-]{36}$' then
    begin v_uuid:=substr(p_callback,13)::uuid; exception when invalid_text_representation then return false; end;
  end if;
  select * into m from public.whatsapp_inbox_messages where channel_id=c.id and organisation_id=c.organisation_id and direction='outbound'
    and (provider_message_id=p_message_id or (id=v_uuid and provider_message_id is null)) for update;
  if m.id is null then return false; end if;
  v_rank:=case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_old:=case m.delivery_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  update public.whatsapp_inbox_messages set provider_message_id=p_message_id,
    delivery_status=case when (p_status='failed' and v_old<2) or (p_status<>'failed' and v_rank>=v_old) then p_status else delivery_status end,
    error_message=case when p_status='failed' and v_old<2 then left(p_error,500) when p_status<>'failed' and v_rank>=v_old then null else error_message end,
    updated_at=now() where id=m.id;
  return true;
end $$;
revoke all on function public.whatsapp_inbox_receive(text,text,text,text,timestamptz,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.whatsapp_inbox_status(text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.whatsapp_inbox_receive(text,text,text,text,timestamptz,text,text,jsonb,text) to service_role;
grant execute on function public.whatsapp_inbox_status(text,text,text,text,text,timestamptz,text) to service_role;

commit;
