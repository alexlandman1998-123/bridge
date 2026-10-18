begin;
alter table public.meta_whatsapp_authorizations add column coexistence boolean not null default false;
alter table public.organisation_communication_channels
  add column onboarding_mode text not null default 'cloud_api' check(onboarding_mode in ('cloud_api','coexistence')),
  add column business_app_session uuid,
  add column business_app_connected_at timestamptz,
  add column business_app_history_progress integer not null default 0 check(business_app_history_progress between 0 and 100),
  add column business_app_history_state text not null default 'none' check(business_app_history_state in ('none','receiving','complete','declined','failed')),
  add column business_app_contacts_received_at timestamptz,
  add column business_app_state_at timestamptz;
alter table public.whatsapp_inbox_conversations add column content_version bigint not null default 0,add column contact_name_source text not null default 'profile' check(contact_name_source in ('profile','business_app'));
alter table public.whatsapp_inbox_messages
  add column message_origin text not null default 'cloud_api' check(message_origin in ('cloud_api','business_app','history')),
  add column live_received boolean not null default false,
  add column edited_at timestamptz,
  add column revoked_at timestamptz;
update public.whatsapp_inbox_messages set live_received=true where direction='inbound';

create table public.whatsapp_business_app_requests (
  channel_id uuid not null,organisation_id uuid not null references public.organisations(id),session_id uuid not null,
  sync_type text not null check(sync_type in ('history','smb_app_state_sync')),
  status text not null check(status in ('processing','requested','unknown','failed')),
  created_by uuid references auth.users(id) on delete set null,provider_request_id text,error_message text,created_at timestamptz not null default now(),
  primary key(channel_id,session_id,sync_type),
  foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id)
);
create index whatsapp_business_app_requests_org on public.whatsapp_business_app_requests(organisation_id);
create index whatsapp_business_app_requests_actor on public.whatsapp_business_app_requests(created_by);
create table public.whatsapp_business_app_contacts (
  channel_id uuid not null,organisation_id uuid not null references public.organisations(id),phone text not null,
  name text not null default '',removed boolean not null default false,event_at timestamptz not null,
  primary key(channel_id,phone),foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id)
);
create index whatsapp_business_app_contacts_org on public.whatsapp_business_app_contacts(organisation_id);
create table public.whatsapp_business_app_events (
  id uuid primary key default gen_random_uuid(),channel_id uuid not null,organisation_id uuid not null references public.organisations(id),session_id uuid not null,
  event_hash text not null check(event_hash ~ '^[0-9a-f]{64}$'),field text not null check(field in ('history','smb_app_state_sync','smb_message_echoes','messages')),
  payload_json jsonb not null,cursor_position integer not null default 0,status text not null default 'queued' check(status in ('queued','processing','processed','failed','cancelled')),
  attempts integer not null default 0,lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),last_error text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(channel_id,session_id,event_hash),foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id)
);
create index whatsapp_business_app_events_due on public.whatsapp_business_app_events(next_attempt_at,created_at) where status in ('queued','processing');
create index whatsapp_business_app_events_channel on public.whatsapp_business_app_events(organisation_id,channel_id,session_id,status);
create table public.whatsapp_business_app_mutations (
  channel_id uuid not null,organisation_id uuid not null references public.organisations(id),original_message_id text not null,
  contact_phone text not null,direction text not null check(direction in ('inbound','outbound')),action text not null check(action in ('edit','revoke')),
  event_at timestamptz not null,message_type text not null,body_text text not null default '',media_json jsonb not null default '{}',
  primary key(channel_id,original_message_id),foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id)
);
create index whatsapp_business_app_mutations_org on public.whatsapp_business_app_mutations(organisation_id);

-- Imports are provider observations, never a new staff send. Browser roles have
-- no table writes or executable import functions.
create or replace function public.whatsapp_inbox_outbound_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype; admin boolean;
begin
  if new.direction<>'outbound' then return new; end if;
  if new.created_by is null and new.message_origin in ('business_app','history') and nullif(new.provider_message_id,'') is not null then
    perform 1 from public.organisation_communication_channels where id=new.channel_id and organisation_id=new.organisation_id and onboarding_mode='coexistence' and connection_status='connected';
    if found then return new; end if;
    raise exception 'Phone app import requires a connected coexistence number';
  end if;
  admin:=public.whatsapp_staff_is_admin(new.organisation_id,new.created_by);
  select * into thread from public.whatsapp_inbox_conversations where id=new.conversation_id and organisation_id=new.organisation_id for update;
  if thread.id is null or not (admin or coalesce(thread.assigned_user_id=new.created_by,false)) then raise exception 'Conversation assignment changed. Refresh your inbox' using errcode='42501'; end if;
  return new;
end; $$;

create function public.whatsapp_business_app_apply_mutation(p_channel uuid,p_message text) returns void language plpgsql security invoker set search_path='' as $$
declare mutation public.whatsapp_business_app_mutations%rowtype; message public.whatsapp_inbox_messages%rowtype; changed boolean:=false;
begin
  select * into mutation from public.whatsapp_business_app_mutations where channel_id=p_channel and original_message_id=p_message;
  if mutation.original_message_id is null then return; end if;
  select m.* into message from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id
    where m.channel_id=p_channel and m.provider_message_id=p_message and c.contact_phone=mutation.contact_phone and m.direction=mutation.direction for update of m;
  if message.id is null then return; end if;
  if mutation.action='revoke' then
    update public.whatsapp_inbox_messages set revoked_at=mutation.event_at,body_text='',media_json='{}',updated_at=now() where id=message.id and revoked_at is null;changed:=found;
  elsif message.revoked_at is null and mutation.event_at>coalesce(message.edited_at,'-infinity') then
    update public.whatsapp_inbox_messages set body_text=mutation.body_text,message_type=mutation.message_type,media_json=case when mutation.media_json='{}'::jsonb and mutation.message_type=message.message_type then media_json else mutation.media_json end,edited_at=mutation.event_at,updated_at=now() where id=message.id;changed:=found;
  end if;
  if not changed then return; end if;
  update public.whatsapp_inbox_conversations set content_version=content_version+1 where id=message.conversation_id;
  if message.id=(select id from public.whatsapp_inbox_messages where conversation_id=message.conversation_id and organisation_id=message.organisation_id order by event_at desc,id desc limit 1) then
    update public.whatsapp_inbox_conversations set last_message_preview=case when mutation.action='revoke' then '[Message deleted]' else left(coalesce(nullif(mutation.body_text,''),'['||mutation.message_type||']'),240) end where id=message.conversation_id;
  end if;
end; $$;

create function public.whatsapp_business_app_ingest(p_phone_id text,p_waba_id text,p_contact text,p_message_id text,p_at timestamptz,p_direction text,p_type text,p_body text,p_media jsonb,p_name text,p_source text,p_status text default 'sent')
returns uuid language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; thread public.whatsapp_inbox_conversations%rowtype; prior public.whatsapp_inbox_messages%rowtype; saved public.whatsapp_inbox_messages%rowtype;
  contact public.whatsapp_business_app_contacts%rowtype; live boolean; first_live boolean; label text; label_source text; old_rank integer; new_rank integer; origin text;
begin
  select * into sender from public.organisation_communication_channels where phone_number_id=p_phone_id and waba_id=p_waba_id and provider='meta' and channel_type='whatsapp' and connection_status='connected' for share;
  if sender.id is null then return null; end if;
  if p_source not in ('cloud_api','business_app','history') or p_direction not in ('inbound','outbound') or (p_source='cloud_api' and p_direction<>'inbound') or (p_source='business_app' and p_direction<>'outbound') then raise exception 'Invalid message observation'; end if;
  if p_source<>'cloud_api' and sender.onboarding_mode<>'coexistence' then return null; end if;
  if p_contact !~ '^[1-9][0-9]{6,14}$' or nullif(p_message_id,'') is null or length(p_message_id)>500 or p_at is null or p_at>now()+interval '1 minute' then return null; end if;
  live:=p_source='cloud_api' and p_direction='inbound' and (sender.onboarding_mode<>'coexistence' or p_at>=coalesce(date_trunc('second',sender.business_app_connected_at),'-infinity'));
  origin:=case when p_source='cloud_api' and sender.onboarding_mode='coexistence' and not live then 'history' else p_source end;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||sender.id::text||':'||p_contact,0));
  select * into contact from public.whatsapp_business_app_contacts where channel_id=sender.id and phone=p_contact;
  label:=case when contact.phone is not null and not contact.removed then contact.name else left(coalesce(p_name,''),160) end;
  label_source:=case when contact.phone is not null and not contact.removed then 'business_app' else 'profile' end;
  insert into public.whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,contact_name,contact_name_source) values(sender.organisation_id,sender.id,p_contact,label,label_source) on conflict(channel_id,contact_phone) do nothing;
  select * into thread from public.whatsapp_inbox_conversations where channel_id=sender.id and contact_phone=p_contact for update;
  select * into prior from public.whatsapp_inbox_messages where channel_id=sender.id and provider_message_id=p_message_id for update;
  if prior.id is not null and (prior.conversation_id<>thread.id or prior.direction<>p_direction) then return null; end if;
  first_live:=live and not coalesce(prior.live_received,false);
  old_rank:=case prior.delivery_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  new_rank:=case lower(p_status) when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  if prior.id is null then
    insert into public.whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,provider_message_id,direction,message_type,body_text,media_json,delivery_status,event_at,message_origin,live_received)
      values(sender.organisation_id,thread.id,sender.id,p_message_id,p_direction,left(p_type,32),left(coalesce(p_body,''),16000),coalesce(p_media,'{}'),case when p_direction='inbound' then 'received' when lower(p_status) in ('sent','delivered','read','failed') then lower(p_status) else 'sent' end,p_at,origin,live) returning * into saved;
  else
    update public.whatsapp_inbox_messages set
      message_type=case when message_type='media_placeholder' and p_type<>'media_placeholder' and revoked_at is null then left(p_type,32) else message_type end,
      body_text=case when message_type='media_placeholder' and p_type<>'media_placeholder' and revoked_at is null and edited_at is null then left(coalesce(p_body,''),16000) else body_text end,
      media_json=case when revoked_at is null and nullif(p_media->>'id','') is not null and (message_type='media_placeholder' or (message_origin='history' and nullif(media_json->>'id','') is null and message_type=p_type)) then coalesce(p_media,'{}') else media_json end,
      live_received=live_received or live,
      message_origin=case when message_origin='history' and origin<>'history' then origin else message_origin end,
      delivery_status=case when p_direction='outbound' and new_rank>old_rank then lower(p_status) else delivery_status end,updated_at=now()
      where id=prior.id returning * into saved;
  end if;
  perform public.whatsapp_business_app_apply_mutation(sender.id,p_message_id);
  select * into saved from public.whatsapp_inbox_messages where id=saved.id;
  update public.whatsapp_inbox_conversations set
    contact_name=case when nullif(label,'') is not null and (contact_name_source<>'business_app' or label_source='business_app') then label else contact_name end,
    contact_name_source=case when nullif(label,'') is not null and (contact_name_source<>'business_app' or label_source='business_app') then label_source else contact_name_source end,
    status=case when first_live then 'open' else status end,unread_count=unread_count+case when first_live then 1 else 0 end,
    last_inbound_at=case when first_live then greatest(last_inbound_at,p_at) else last_inbound_at end,
    last_message_preview=case when last_message_at is null or p_at>=last_message_at then case when saved.revoked_at is not null then '[Message deleted]' else left(coalesce(nullif(saved.body_text,''),'['||saved.message_type||']'),240) end else last_message_preview end,
    last_message_at=greatest(last_message_at,p_at),content_version=content_version+case when (prior.id is null and (origin='history' or p_at<thread.last_message_at)) or (prior.id is not null and ((prior.message_type='media_placeholder' and saved.message_type<>'media_placeholder') or (nullif(prior.media_json->>'id','') is null and nullif(saved.media_json->>'id','') is not null))) then 1 else 0 end,updated_at=now() where id=thread.id;
  return thread.id;
end; $$;
create or replace function public.whatsapp_inbox_receive(p_phone_id text,p_waba_id text,p_from text,p_message_id text,p_at timestamptz,p_body text,p_type text,p_media jsonb,p_name text)
returns uuid language sql security invoker set search_path='' as $$ select public.whatsapp_business_app_ingest(p_phone_id,p_waba_id,p_from,p_message_id,p_at,'inbound',p_type,p_body,p_media,p_name,'cloud_api','received'); $$;

create function public.whatsapp_business_app_contact(p_phone_id text,p_waba_id text,p_contact text,p_name text,p_removed boolean,p_at timestamptz) returns boolean language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; changed boolean;
begin
  select * into sender from public.organisation_communication_channels where phone_number_id=p_phone_id and waba_id=p_waba_id and onboarding_mode='coexistence' and connection_status='connected' and provider='meta' and channel_type='whatsapp' for update;
  if sender.id is null or p_contact !~ '^[1-9][0-9]{6,14}$' or p_at is null or p_at>now()+interval '1 minute' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||sender.id::text||':'||p_contact,0));
  insert into public.whatsapp_business_app_contacts(channel_id,organisation_id,phone,name,removed,event_at) values(sender.id,sender.organisation_id,p_contact,case when p_removed then '' else left(p_name,160) end,p_removed,p_at)
    on conflict(channel_id,phone) do update set name=excluded.name,removed=excluded.removed,event_at=excluded.event_at
      where excluded.event_at>whatsapp_business_app_contacts.event_at or (excluded.event_at=whatsapp_business_app_contacts.event_at and excluded.removed and not whatsapp_business_app_contacts.removed);
  changed:=found;
  if changed then update public.whatsapp_inbox_conversations set contact_name=case when p_removed then '' else left(p_name,160) end,contact_name_source=case when p_removed then 'profile' else 'business_app' end
    where channel_id=sender.id and contact_phone=p_contact and (not p_removed or contact_name_source='business_app'); end if;
  update public.organisation_communication_channels set business_app_contacts_received_at=greatest(business_app_contacts_received_at,p_at) where id=sender.id;
  return changed;
end; $$;

create function public.whatsapp_business_app_mutate(p_phone_id text,p_waba_id text,p_contact text,p_direction text,p_original text,p_at timestamptz,p_action text,p_type text,p_body text,p_media jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype;
begin
  select * into sender from public.organisation_communication_channels where phone_number_id=p_phone_id and waba_id=p_waba_id and onboarding_mode='coexistence' and connection_status='connected' and provider='meta' and channel_type='whatsapp' for share;
  if sender.id is null or p_contact !~ '^[1-9][0-9]{6,14}$' or p_action not in ('edit','revoke') or nullif(p_original,'') is null or length(p_original)>500 or p_at is null or p_at>now()+interval '1 minute' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||sender.id::text||':'||p_contact,0));
  insert into public.whatsapp_business_app_mutations(channel_id,organisation_id,original_message_id,contact_phone,direction,action,event_at,message_type,body_text,media_json)
    values(sender.id,sender.organisation_id,p_original,p_contact,p_direction,p_action,p_at,left(p_type,32),left(coalesce(p_body,''),16000),coalesce(p_media,'{}'))
    on conflict(channel_id,original_message_id) do update set action=excluded.action,event_at=excluded.event_at,message_type=excluded.message_type,body_text=excluded.body_text,media_json=excluded.media_json
      where whatsapp_business_app_mutations.contact_phone=excluded.contact_phone and whatsapp_business_app_mutations.direction=excluded.direction and whatsapp_business_app_mutations.action<>'revoke'
        and (excluded.action='revoke' or excluded.event_at>whatsapp_business_app_mutations.event_at);
  perform public.whatsapp_business_app_apply_mutation(sender.id,p_original);
  return true;
end; $$;

create function public.whatsapp_business_app_enqueue(p_phone_id text,p_waba_id text,p_field text,p_payload jsonb,p_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype;
begin
  select * into sender from public.organisation_communication_channels where phone_number_id=p_phone_id and waba_id=p_waba_id and onboarding_mode='coexistence' and business_app_session is not null and connection_status='connected' and provider='meta' and channel_type='whatsapp' for share;
  if sender.id is null then return false; end if;
  -- JSONB adds whitespace; allow its expansion of a bounded 12 MB HTTP body.
  if octet_length(p_payload::text)>25165824 then raise exception 'Phone app update is too large'; end if;
  insert into public.whatsapp_business_app_events(channel_id,organisation_id,session_id,event_hash,field,payload_json) values(sender.id,sender.organisation_id,sender.business_app_session,p_hash,p_field,p_payload) on conflict(channel_id,session_id,event_hash) do nothing;
  return true;
end; $$;

-- Authorizations and number ownership are committed together after provider
-- verification. A suspended member or competing workspace cannot win the save.
create function public.whatsapp_finish_authorization(p_org uuid,p_actor uuid,p_state text,p_waba text,p_phone text,p_metadata jsonb,p_encrypted text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin boolean; session public.meta_whatsapp_authorizations%rowtype; sender public.organisation_communication_channels%rowtype; foreign_org uuid; mode text; at timestamptz;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select * into session from public.meta_whatsapp_authorizations where state_hash=p_state and organisation_id=p_org and requested_by=p_actor and consumed_at is null and expires_at>now() and token_ciphertext is not null for update;
  if session.state_hash is null then raise exception 'WhatsApp authorization expired. Start the connection again'; end if;
  if p_phone !~ '^[0-9]{1,32}$' or p_waba !~ '^[0-9]{1,32}$' or nullif(p_encrypted,'') is null then raise exception 'Invalid verified WhatsApp assets'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-number:'||p_phone,0));
  select organisation_id into foreign_org from public.organisation_communication_channels where phone_number_id=p_phone and provider='meta' and channel_type='whatsapp' and connection_status='connected' and organisation_id<>p_org;
  if foreign_org is not null then raise exception 'This phone number is already connected to another workspace'; end if;
  select * into sender from public.organisation_communication_channels where organisation_id=p_org and phone_number_id=p_phone and provider='meta' and channel_type='whatsapp' for update;
  if not admin and (session.owner_user_id is distinct from p_actor or (sender.id is not null and sender.owner_user_id is distinct from p_actor)) then raise exception 'An administrator must transfer an existing agency or agent number'; end if;
  if session.owner_user_id is not null then perform public.whatsapp_staff_is_admin(p_org,session.owner_user_id); end if;
  mode:=case when session.coexistence then 'coexistence' else 'cloud_api' end;
  at:=(p_metadata->>'at')::timestamptz;
  if session.coexistence and (p_metadata->>'is_on_biz_app' is distinct from 'true' or p_metadata->>'platform_type' is distinct from 'CLOUD_API') then raise exception 'Meta has not confirmed the phone app connection'; end if;
  if sender.id is null then
    insert into public.organisation_communication_channels(organisation_id,owner_user_id,ownership_changed_by,provider,channel_type,waba_id,phone_number_id,display_phone_number,business_display_name,connection_status,verification_status,meta_access_token,token_ciphertext,connected_at,created_by,onboarding_mode,business_app_session,business_app_connected_at)
      values(p_org,session.owner_user_id,p_actor,'meta','whatsapp',p_waba,p_phone,p_metadata->>'display_phone_number',p_metadata->>'business_display_name',p_metadata->>'connection_status',p_metadata->>'verification_status','',p_encrypted,at,p_actor,mode,case when session.coexistence then gen_random_uuid() else null end,case when session.coexistence then at else null end) returning * into sender;
  else
    update public.organisation_communication_channels set owner_user_id=session.owner_user_id,ownership_changed_by=p_actor,waba_id=p_waba,display_phone_number=p_metadata->>'display_phone_number',business_display_name=p_metadata->>'business_display_name',connection_status=p_metadata->>'connection_status',verification_status=p_metadata->>'verification_status',meta_access_token='',token_ciphertext=p_encrypted,connected_at=at,created_by=p_actor,last_error_message=null,onboarding_mode=mode,business_app_session=case when session.coexistence then gen_random_uuid() else null end,business_app_connected_at=case when session.coexistence then at else null end,business_app_history_progress=0,business_app_history_state='none',business_app_contacts_received_at=null,business_app_state_at=null where id=sender.id returning * into sender;
  end if;
  if session.coexistence then update public.whatsapp_inbox_conversations set last_inbound_at=null where channel_id=sender.id; end if;
  update public.meta_whatsapp_authorizations set consumed_at=now(),token_ciphertext=null where state_hash=session.state_hash;
  return jsonb_build_object('sender',to_jsonb(sender));
end; $$;

create function public.whatsapp_business_app_claim_request(p_org uuid,p_actor uuid,p_sender uuid,p_version integer,p_type text,p_session uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; admin boolean; prior public.whatsapp_business_app_requests%rowtype;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select * into sender from public.organisation_communication_channels where id=p_sender and organisation_id=p_org for update;
  if sender.id is null or not (admin or coalesce(sender.owner_user_id=p_actor,false)) then raise exception 'You can manage only your own WhatsApp number' using errcode='42501'; end if;
  if p_version is distinct from sender.ownership_version or sender.onboarding_mode<>'coexistence' or sender.connection_status<>'connected' or sender.business_app_session is null or sender.business_app_session is distinct from p_session then raise exception 'Refresh the connected phone app number before syncing'; end if;
  if p_type not in ('history','smb_app_state_sync') then raise exception 'Invalid phone app sync request'; end if;
  select * into prior from public.whatsapp_business_app_requests where channel_id=sender.id and session_id=sender.business_app_session and sync_type=p_type;
  if prior.channel_id is not null then return jsonb_build_object('claimed',false,'status',prior.status); end if;
  if sender.business_app_connected_at is null or sender.business_app_connected_at<now()-interval '24 hours' then raise exception 'The initial sync period expired. Reconnect this number through Meta'; end if;
  insert into public.whatsapp_business_app_requests(channel_id,organisation_id,session_id,sync_type,status,created_by) values(sender.id,p_org,sender.business_app_session,p_type,'processing',p_actor);
  return jsonb_build_object('claimed',true);
end; $$;

create function public.whatsapp_business_app_status(p_org uuid,p_actor uuid,p_sender uuid,p_retry boolean default false,p_version integer default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; admin boolean; requests jsonb; pending bigint; failed bigint; history text;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select * into sender from public.organisation_communication_channels where id=p_sender and organisation_id=p_org for share;
  if sender.id is null or not (admin or coalesce(sender.owner_user_id=p_actor,false)) then raise exception 'You can manage only your own WhatsApp number' using errcode='42501'; end if;
  if p_retry then
    if sender.connection_status<>'connected' or sender.onboarding_mode<>'coexistence' or p_version is distinct from sender.ownership_version then raise exception 'Refresh before retrying saved updates'; end if;
    update public.whatsapp_business_app_events set status='queued',attempts=0,lease_token=null,lease_until=null,next_attempt_at=now(),last_error=null where channel_id=sender.id and session_id=sender.business_app_session and status='failed';
  end if;
  select coalesce(jsonb_object_agg(sync_type,jsonb_build_object('status',status,'requestId',provider_request_id)),'{}') into requests from public.whatsapp_business_app_requests where channel_id=sender.id and session_id=sender.business_app_session;
  select count(*) filter(where status in ('queued','processing')),count(*) filter(where status='failed') into pending,failed from public.whatsapp_business_app_events where channel_id=sender.id and session_id=sender.business_app_session;
  history:=case when sender.business_app_history_state='complete' and pending>0 then 'receiving' when failed>0 then 'failed' when sender.business_app_history_state<>'none' then sender.business_app_history_state
    when requests->'history'->>'status'='requested' then 'requested' when requests->'history'->>'status' in ('processing','unknown') then 'unconfirmed' when requests->'history'->>'status'='failed' then 'failed' else 'not_started' end;
  return jsonb_build_object('history',history,'progress',sender.business_app_history_progress,'contactsReceivedAt',sender.business_app_contacts_received_at,'pendingUpdates',pending,'failedUpdates',failed,'requests',requests);
end; $$;

create function public.whatsapp_business_app_account(p_waba_id text,p_phone text,p_event text,p_at timestamptz,p_reason text default '') returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_at is null or p_at>now()+interval '1 minute' or p_event not in ('PARTNER_REMOVED','ACCOUNT_OFFBOARDED','ACCOUNT_RECONNECTED') then return 0; end if;
  update public.organisation_communication_channels set
    connection_status=case when p_event='ACCOUNT_RECONNECTED' then connection_status else 'disconnected' end,
    token_ciphertext=case when p_event='ACCOUNT_RECONNECTED' then token_ciphertext else null end,
    meta_access_token=case when p_event='ACCOUNT_RECONNECTED' then meta_access_token else '' end,
    is_default=case when p_event='ACCOUNT_RECONNECTED' then is_default else false end,
    business_app_state_at=p_at,last_error_message=case when p_event='ACCOUNT_RECONNECTED' then case when connection_status<>'connected' then 'Complete Meta authorization again to restore phone app sync.' else last_error_message end else 'WhatsApp Business app disconnected. Reconnect through Meta.' end
    where waba_id=p_waba_id and provider='meta' and channel_type='whatsapp' and onboarding_mode='coexistence'
      and (nullif(p_phone,'') is null or regexp_replace(display_phone_number,'[^0-9]','','g')=p_phone)
      and p_at>=coalesce(date_trunc('second',business_app_connected_at),'-infinity') and (p_at>coalesce(business_app_state_at,'-infinity') or (p_at=business_app_state_at and p_event<>'ACCOUNT_RECONNECTED' and connection_status='connected'));
  get diagnostics changed=row_count;return changed;
end; $$;

create function public.whatsapp_business_app_claim_event() returns setof public.whatsapp_business_app_events language plpgsql security invoker set search_path='' as $$
declare event_id uuid;
begin
  update public.whatsapp_business_app_events e set status='cancelled',payload_json='{}',lease_token=null,lease_until=null where e.status in ('queued','processing') and exists(
    select 1 from public.organisation_communication_channels c where c.id=e.channel_id and (c.connection_status<>'connected' or c.business_app_session is distinct from e.session_id));
  select e.id into event_id from public.whatsapp_business_app_events e join public.organisation_communication_channels c on c.id=e.channel_id and c.organisation_id=e.organisation_id and c.business_app_session=e.session_id
    where e.status in ('queued','processing') and e.next_attempt_at<=now() and (e.lease_until is null or e.lease_until<now()) and c.connection_status='connected' and c.onboarding_mode='coexistence'
    order by e.created_at,e.id limit 1 for update of e skip locked;
  if event_id is null then return; end if;
  return query update public.whatsapp_business_app_events set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() where id=event_id returning *;
end; $$;

create function public.whatsapp_business_app_process(p_id uuid,p_token uuid,p_items jsonb,p_next integer,p_done boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.whatsapp_business_app_events%rowtype; sender public.organisation_communication_channels%rowtype; item jsonb;
begin
  select c.* into sender from public.organisation_communication_channels c join public.whatsapp_business_app_events e on e.channel_id=c.id where e.id=p_id for update of c;
  select * into job from public.whatsapp_business_app_events where id=p_id for update;
  if job.id is null or job.status<>'processing' or job.lease_token is distinct from p_token or job.lease_until<=now() then return false; end if;
  if sender.connection_status<>'connected' or sender.business_app_session is distinct from job.session_id then
    update public.whatsapp_business_app_events set status='cancelled',payload_json='{}',lease_token=null,lease_until=null where id=job.id;return false;
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 or p_next<>job.cursor_position+jsonb_array_length(p_items) then raise exception 'Invalid sync checkpoint'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind'='message' then
      perform public.whatsapp_business_app_ingest(sender.phone_number_id,sender.waba_id,item->>'contact',item->>'id',(item->>'at')::timestamptz,item->>'direction',item->>'type',item->>'body',item->'media',item->>'name',item->>'source',item->>'status');
    elsif item->>'kind'='contact' then
      perform public.whatsapp_business_app_contact(sender.phone_number_id,sender.waba_id,item->>'contact',item->>'name',(item->>'removed')::boolean,(item->>'at')::timestamptz);
    elsif item->>'kind'='mutation' then
      perform public.whatsapp_business_app_mutate(sender.phone_number_id,sender.waba_id,item->>'contact',item->>'direction',item->>'original',(item->>'at')::timestamptz,item->>'action',item->>'type',item->>'body',item->'media');
    elsif item->>'kind'='progress' then
      update public.organisation_communication_channels set business_app_history_progress=greatest(business_app_history_progress,(item->>'progress')::integer),business_app_history_state=case when business_app_history_state in ('declined','failed') then business_app_history_state when (item->>'progress')::integer=100 then 'complete' when business_app_history_state='complete' then business_app_history_state else 'receiving' end where id=sender.id;
    elsif item->>'kind'='history_error' then
      update public.organisation_communication_channels set business_app_history_state=case when item->>'code'='2593109' then 'declined' else 'failed' end where id=sender.id;
    else raise exception 'Unsupported saved phone app update'; end if;
  end loop;
  update public.whatsapp_business_app_events set cursor_position=p_next,status=case when p_done then 'processed' else 'queued' end,payload_json=case when p_done then '{}'::jsonb else payload_json end,attempts=0,lease_token=null,lease_until=null,next_attempt_at=now(),last_error=null,updated_at=now() where id=job.id;
  return true;
end; $$;
create function public.whatsapp_business_app_fail(p_id uuid,p_token uuid) returns void language plpgsql security invoker set search_path='' as $$
begin update public.whatsapp_business_app_events set status=case when attempts>=5 then 'failed' else 'queued' end,next_attempt_at=now()+interval '30 seconds'*least(16,power(2,attempts)::integer),lease_token=null,lease_until=null,last_error='Saved phone app update could not be processed.',updated_at=now() where id=p_id and lease_token=p_token and status='processing';end; $$;

-- Include provenance and deletion state without exposing the send intent.
create or replace function public.whatsapp_inbox_page(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_before_at timestamptz default null,p_before_id uuid default null,p_search text default '',p_known jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin boolean; context jsonb; items jsonb; cursor jsonb; total bigint; visible jsonb;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  if (p_before_at is null)<>(p_before_id is null) then raise exception 'Invalid history cursor'; end if;
  if length(coalesce(p_search,''))>120 then raise exception 'Search is too long'; end if;
  if p_action='notifications' then
    select coalesce(sum(unread_count),0) into total from public.whatsapp_inbox_conversations where organisation_id=p_org and (admin or assigned_user_id=p_actor);
    return jsonb_build_object('unreadCount',total);
  elsif p_action='list' then
    select coalesce(jsonb_agg(id),'[]') into visible from public.whatsapp_inbox_conversations where organisation_id=p_org and (admin or assigned_user_id=p_actor) and id in (select value::uuid from jsonb_array_elements_text(p_known));
    select coalesce(jsonb_agg(to_jsonb(c) order by c.page_at desc,c.id desc),'[]') into items from (
      select c.*,coalesce(c.last_message_at,c.created_at) page_at from public.whatsapp_inbox_conversations c where c.organisation_id=p_org and (admin or c.assigned_user_id=p_actor)
        and (coalesce(p_search,'')='' or position(lower(p_search) in lower(c.contact_name||' '||c.contact_phone||' '||coalesce(c.last_message_preview,'')))>0)
        and (p_before_at is null or (coalesce(c.last_message_at,c.created_at),c.id)<(p_before_at,p_before_id)) order by coalesce(c.last_message_at,c.created_at) desc,c.id desc limit 51
    ) c;
  elsif p_action='thread' then
    context:=public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
    select coalesce(jsonb_agg(to_jsonb(m) order by m.page_at desc,m.id desc),'[]') into items from (
      select id,conversation_id,direction,message_type,body_text,media_json,delivery_status,error_message,event_at,created_at,created_by,template_json,message_origin,edited_at,revoked_at,event_at page_at from public.whatsapp_inbox_messages where organisation_id=p_org and conversation_id=p_conversation
        and (p_before_at is null or (event_at,id)<(p_before_at,p_before_id)) order by event_at desc,id desc limit 51
    ) m;
    if p_before_at is null then update public.whatsapp_inbox_conversations set unread_count=0 where id=p_conversation and organisation_id=p_org; end if;
  else raise exception 'Unknown history action'; end if;
  if jsonb_array_length(items)>50 then cursor:=jsonb_build_object('at',items->49->'page_at','id',items->49->'id');items:=items-50; end if;
  return coalesce(context,'{}')||jsonb_build_object(case when p_action='list' then 'conversations' else 'messages' end,items,'nextCursor',cursor,'visibleIds',visible);
end; $$;

alter table public.whatsapp_business_app_requests enable row level security;
alter table public.whatsapp_business_app_contacts enable row level security;
alter table public.whatsapp_business_app_events enable row level security;
alter table public.whatsapp_business_app_mutations enable row level security;
revoke all on public.whatsapp_business_app_requests,public.whatsapp_business_app_contacts,public.whatsapp_business_app_events,public.whatsapp_business_app_mutations from public,anon,authenticated;
grant all on public.whatsapp_business_app_requests,public.whatsapp_business_app_contacts,public.whatsapp_business_app_events,public.whatsapp_business_app_mutations to service_role;
revoke all on function public.whatsapp_finish_authorization(uuid,uuid,text,text,text,jsonb,text),public.whatsapp_business_app_apply_mutation(uuid,text),public.whatsapp_business_app_ingest(text,text,text,text,timestamptz,text,text,text,jsonb,text,text,text),public.whatsapp_business_app_contact(text,text,text,text,boolean,timestamptz),public.whatsapp_business_app_mutate(text,text,text,text,text,timestamptz,text,text,text,jsonb),public.whatsapp_business_app_enqueue(text,text,text,jsonb,text),public.whatsapp_business_app_claim_request(uuid,uuid,uuid,integer,text,uuid),public.whatsapp_business_app_status(uuid,uuid,uuid,boolean,integer),public.whatsapp_business_app_account(text,text,text,timestamptz,text),public.whatsapp_business_app_claim_event(),public.whatsapp_business_app_process(uuid,uuid,jsonb,integer,boolean),public.whatsapp_business_app_fail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_finish_authorization(uuid,uuid,text,text,text,jsonb,text),public.whatsapp_business_app_apply_mutation(uuid,text),public.whatsapp_business_app_ingest(text,text,text,text,timestamptz,text,text,text,jsonb,text,text,text),public.whatsapp_business_app_contact(text,text,text,text,boolean,timestamptz),public.whatsapp_business_app_mutate(text,text,text,text,text,timestamptz,text,text,text,jsonb),public.whatsapp_business_app_enqueue(text,text,text,jsonb,text),public.whatsapp_business_app_claim_request(uuid,uuid,uuid,integer,text,uuid),public.whatsapp_business_app_status(uuid,uuid,uuid,boolean,integer),public.whatsapp_business_app_account(text,text,text,timestamptz,text),public.whatsapp_business_app_claim_event(),public.whatsapp_business_app_process(uuid,uuid,jsonb,integer,boolean),public.whatsapp_business_app_fail(uuid,uuid) to service_role;

create schema if not exists private;
create function private.run_whatsapp_business_app_worker() returns jsonb language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; headers jsonb; request_id bigint;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  if not exists(select 1 from public.whatsapp_business_app_events where status in ('queued','processing') and next_attempt_at<=now()) then return jsonb_build_object('scheduled',false,'reason','no_saved_updates'); end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
  headers:=jsonb_build_object('Content-Type','application/json','apikey',service_key);
  if left(service_key,10)<>'sb_secret_' then headers:=headers||jsonb_build_object('Authorization','Bearer '||service_key); end if;
  select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/whatsapp-business-app-worker',headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
  return jsonb_build_object('scheduled',true,'request_id',request_id);
end; $$;
revoke all on function private.run_whatsapp_business_app_worker() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.run_whatsapp_business_app_worker() to service_role;
do $$ begin
  if to_regclass('cron.job') is not null then perform cron.schedule('whatsapp-business-app-worker','* * * * *','select private.run_whatsapp_business_app_worker();');
  else raise notice 'Enable pg_cron and pg_net, then schedule private.run_whatsapp_business_app_worker() every minute.'; end if;
end; $$;
commit;
