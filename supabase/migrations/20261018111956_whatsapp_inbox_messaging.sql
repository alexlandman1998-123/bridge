begin;
alter table public.whatsapp_inbox_messages add column request_json jsonb,add column template_json jsonb;
create index whatsapp_inbox_history_page on public.whatsapp_inbox_messages(organisation_id,conversation_id,event_at desc,id desc);
create index whatsapp_inbox_list_page on public.whatsapp_inbox_conversations(organisation_id,(coalesce(last_message_at,created_at)) desc,id desc);
create index whatsapp_inbox_unread on public.whatsapp_inbox_conversations(organisation_id,assigned_user_id,last_message_at desc) where unread_count>0;

create function public.whatsapp_inbox_page(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_before_at timestamptz default null,p_before_id uuid default null,p_search text default '',p_known jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin boolean; context jsonb; items jsonb; cursor jsonb; total bigint; visible jsonb;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  if (p_before_at is null)<>(p_before_id is null) then raise exception 'Invalid history cursor'; end if;
  if length(coalesce(p_search,''))>120 then raise exception 'Search is too long'; end if;
  if p_action='notifications' then
    select coalesce(sum(unread_count),0) into total from public.whatsapp_inbox_conversations where organisation_id=p_org and (admin or assigned_user_id=p_actor);
    select coalesce(jsonb_agg(to_jsonb(c)),'[]') into items from (
      select id,contact_name,unread_count,last_message_at from public.whatsapp_inbox_conversations where organisation_id=p_org and (admin or assigned_user_id=p_actor) and unread_count>0 order by last_message_at desc,id desc limit 5
    ) c;
    return jsonb_build_object('unreadCount',total,'conversations',items);
  elsif p_action='list' then
    select coalesce(jsonb_agg(id),'[]') into visible from public.whatsapp_inbox_conversations where organisation_id=p_org and (admin or assigned_user_id=p_actor)
      and id in (select value::uuid from jsonb_array_elements_text(p_known));
    select coalesce(jsonb_agg(to_jsonb(c) order by c.page_at desc,c.id desc),'[]') into items from (
      select c.*,coalesce(c.last_message_at,c.created_at) page_at from public.whatsapp_inbox_conversations c
      where c.organisation_id=p_org and (admin or c.assigned_user_id=p_actor)
        and (coalesce(p_search,'')='' or position(lower(p_search) in lower(c.contact_name||' '||c.contact_phone||' '||coalesce(c.last_message_preview,'')))>0)
        and (p_before_at is null or (coalesce(c.last_message_at,c.created_at),c.id)<(p_before_at,p_before_id))
      order by coalesce(c.last_message_at,c.created_at) desc,c.id desc limit 51
    ) c;
  elsif p_action='thread' then
    context:=public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
    select coalesce(jsonb_agg(to_jsonb(m) order by m.page_at desc,m.id desc),'[]') into items from (
      select id,conversation_id,direction,message_type,body_text,media_json,delivery_status,error_message,event_at,created_at,created_by,template_json,event_at page_at
      from public.whatsapp_inbox_messages where organisation_id=p_org and conversation_id=p_conversation
        and (p_before_at is null or (event_at,id)<(p_before_at,p_before_id)) order by event_at desc,id desc limit 51
    ) m;
    if p_before_at is null then update public.whatsapp_inbox_conversations set unread_count=0 where id=p_conversation and organisation_id=p_org; end if;
  else raise exception 'Unknown history action'; end if;
  if jsonb_array_length(items)>50 then cursor:=jsonb_build_object('at',items->49->'page_at','id',items->49->'id');items:=items-50; end if;
  return coalesce(context,'{}')||jsonb_build_object(case when p_action='list' then 'conversations' else 'messages' end,items,'nextCursor',cursor,'visibleIds',visible);
end; $$;

create table public.whatsapp_inbox_permissions (
  conversation_id uuid primary key,organisation_id uuid not null references public.organisations(id),
  status text not null check(status in ('opted_in','opted_out')),source text,consent_at timestamptz,opted_out_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,version integer not null default 1,
  foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id),
  check(status<>'opted_in' or (nullif(trim(source),'') is not null and consent_at is not null and (opted_out_at is null or consent_at>opted_out_at)))
);
create index whatsapp_inbox_permissions_org on public.whatsapp_inbox_permissions(organisation_id);
create index whatsapp_inbox_permissions_recorder on public.whatsapp_inbox_permissions(recorded_by);
create table public.whatsapp_inbox_permission_events (
  id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),conversation_id uuid not null,
  snapshot jsonb not null,created_at timestamptz not null default now(),
  foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id)
);
create index whatsapp_inbox_permission_events_thread on public.whatsapp_inbox_permission_events(conversation_id,created_at desc);
create index whatsapp_inbox_permission_events_org on public.whatsapp_inbox_permission_events(organisation_id,created_at desc);
create function public.whatsapp_inbox_permission_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into public.whatsapp_inbox_permission_events(organisation_id,conversation_id,snapshot) values(new.organisation_id,new.conversation_id,to_jsonb(new));return new;end; $$;
create trigger whatsapp_inbox_permission_audit after insert or update on public.whatsapp_inbox_permissions for each row execute function public.whatsapp_inbox_permission_audit();
create function public.whatsapp_inbox_permission(p_org uuid,p_actor uuid,p_conversation uuid,p_action text default 'read',p_version integer default null,p_assignment_version integer default null,p_source text default null,p_consent_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare context jsonb; current_permission public.whatsapp_inbox_permissions%rowtype;
begin
  context:=public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
  select * into current_permission from public.whatsapp_inbox_permissions where conversation_id=p_conversation and organisation_id=p_org for update;
  if p_action<>'read' then
    if p_action not in ('save','revoke') then raise exception 'Unknown permission action'; end if;
    if p_assignment_version is distinct from (context->'conversation'->>'assignment_version')::integer or p_version is distinct from coalesce(current_permission.version,0) then raise exception 'Permission or assignment changed. Refresh before saving' using errcode='40001'; end if;
    if p_action='save' and (nullif(trim(p_source),'') is null or length(p_source)>1000 or p_consent_at is null or p_consent_at>now() or p_consent_at<=coalesce(current_permission.opted_out_at,'-infinity')) then raise exception 'Record when and how this person agreed, after their last opt-out'; end if;
    insert into public.whatsapp_inbox_permissions(conversation_id,organisation_id,status,source,consent_at,opted_out_at,recorded_by,version)
      values(p_conversation,p_org,case when p_action='save' then 'opted_in' else 'opted_out' end,case when p_action='save' then trim(p_source) else current_permission.source end,
        case when p_action='save' then p_consent_at else current_permission.consent_at end,case when p_action='revoke' then now() else current_permission.opted_out_at end,p_actor,coalesce(current_permission.version,0)+1)
      on conflict(conversation_id) do update set status=excluded.status,source=excluded.source,consent_at=excluded.consent_at,opted_out_at=excluded.opted_out_at,recorded_by=excluded.recorded_by,version=excluded.version returning * into current_permission;
  end if;
  return jsonb_build_object('permission',case when current_permission.conversation_id is null then null else to_jsonb(current_permission) end);
end; $$;

create function public.whatsapp_inbox_optout(p_phone_id text,p_waba_id text,p_from text,p_at timestamptz) returns boolean language plpgsql security invoker set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype;
begin
  select c.* into thread from public.whatsapp_inbox_conversations c join public.organisation_communication_channels ch on ch.id=c.channel_id and ch.organisation_id=c.organisation_id
    where ch.phone_number_id=p_phone_id and ch.waba_id=p_waba_id and ch.provider='meta' and ch.channel_type='whatsapp' and ch.connection_status='connected' and c.contact_phone=p_from for update of c;
  if thread.id is null then return false; end if;
  insert into public.whatsapp_inbox_permissions(conversation_id,organisation_id,status,opted_out_at) values(thread.id,thread.organisation_id,'opted_out',p_at)
    on conflict(conversation_id) do update set status='opted_out',opted_out_at=excluded.opted_out_at,recorded_by=null,version=whatsapp_inbox_permissions.version+1
    where excluded.opted_out_at>=coalesce(whatsapp_inbox_permissions.consent_at,'-infinity') and excluded.opted_out_at>coalesce(whatsapp_inbox_permissions.opted_out_at,'-infinity');
  return found;
end; $$;

create table public.whatsapp_inbox_uploads (
  id uuid primary key,organisation_id uuid not null references public.organisations(id),conversation_id uuid not null,channel_id uuid not null,
  created_by uuid not null references auth.users(id),intent_json jsonb not null,status text not null default 'uploading' check(status in ('uploading','ready','failed','unknown')),
  provider_media_id text,mime_type text not null,filename text not null,ownership_version integer not null,
  expires_at timestamptz not null default now()+interval '1 day',created_at timestamptz not null default now(),
  foreign key(conversation_id,organisation_id,channel_id) references public.whatsapp_inbox_conversations(id,organisation_id,channel_id)
);
create index whatsapp_inbox_uploads_thread on public.whatsapp_inbox_uploads(organisation_id,conversation_id);
create index whatsapp_inbox_uploads_creator on public.whatsapp_inbox_uploads(created_by);
create function public.whatsapp_inbox_claim(
  p_org uuid,p_actor uuid,p_conversation uuid,p_request uuid,p_intent jsonb,p_assignment_version integer,p_sender_version integer,
  p_upload boolean default false,p_type text default null,p_body text default '',p_media jsonb default '{}',p_upload_id uuid default null,p_template jsonb default null,p_at timestamptz default now()
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; thread public.whatsapp_inbox_conversations%rowtype;
  message public.whatsapp_inbox_messages%rowtype; upload public.whatsapp_inbox_uploads%rowtype; permission public.whatsapp_inbox_permissions%rowtype; optout timestamptz;
begin
  perform public.whatsapp_staff_is_admin(p_org,p_actor);
  select ch.* into sender from public.organisation_communication_channels ch join public.whatsapp_inbox_conversations c on c.channel_id=ch.id and c.organisation_id=ch.organisation_id
    where c.id=p_conversation and c.organisation_id=p_org for share of ch;
  perform public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
  select * into thread from public.whatsapp_inbox_conversations where id=p_conversation and organisation_id=p_org;
  if p_upload then
    select * into upload from public.whatsapp_inbox_uploads where id=p_request;
    if upload.id is not null then
      if upload.organisation_id<>p_org or upload.conversation_id<>thread.id or upload.created_by<>p_actor or upload.intent_json<>p_intent then raise exception 'This upload identifier was already used'; end if;
      return jsonb_build_object('claimed',false,'upload',to_jsonb(upload));
    end if;
  else
    select * into message from public.whatsapp_inbox_messages where id=p_request;
    if message.id is not null then
      if message.organisation_id<>p_org or message.conversation_id<>thread.id or message.created_by<>p_actor or message.request_json is distinct from p_intent then raise exception 'This message identifier was already used'; end if;
      return jsonb_build_object('claimed',false,'message',to_jsonb(message));
    end if;
  end if;
  if sender.connection_status<>'connected' or sender.provider<>'meta' or sender.channel_type<>'whatsapp' then raise exception 'Reconnect this WhatsApp number before sending'; end if;
  if sender.ownership_version is distinct from p_sender_version or thread.assignment_version is distinct from p_assignment_version then raise exception 'Number ownership or conversation assignment changed. Refresh before sending' using errcode='40001'; end if;
  if p_upload then
    insert into public.whatsapp_inbox_uploads(id,organisation_id,conversation_id,channel_id,created_by,intent_json,mime_type,filename,ownership_version)
      values(p_request,p_org,thread.id,sender.id,p_actor,p_intent,p_intent->>'mimeType',p_intent->>'filename',sender.ownership_version) returning * into upload;
    return jsonb_build_object('claimed',true,'upload',to_jsonb(upload));
  end if;
  if p_type not in ('text','image','document','template') then raise exception 'Unsupported inbox message type'; end if;
  if p_type<>'template' and (thread.last_inbound_at is null or thread.last_inbound_at<=p_at-interval '24 hours' or thread.last_inbound_at>p_at+interval '1 minute') then raise exception 'The 24-hour reply window has closed. Use an approved template'; end if;
  if p_type='template' then
    select * into permission from public.whatsapp_inbox_permissions where conversation_id=thread.id and organisation_id=p_org for share;
    select coalesce(opted_out_at,updated_at) into optout from public.whatsapp_marketing_contacts where organisation_id=p_org and phone=thread.contact_phone and consent_status='opted_out' for share;
    if permission.status is distinct from 'opted_in' or permission.consent_at is null or permission.consent_at<=coalesce(optout,'-infinity') then raise exception 'Record current WhatsApp message permission before sending a template'; end if;
  end if;
  if p_upload_id is not null then
    select * into upload from public.whatsapp_inbox_uploads where id=p_upload_id and organisation_id=p_org and conversation_id=thread.id and channel_id=sender.id and created_by=p_actor for share;
    if upload.id is null or upload.status<>'ready' or upload.expires_at<=p_at or upload.ownership_version<>sender.ownership_version or p_media->>'id' is distinct from upload.provider_media_id then raise exception 'Choose a current attachment uploaded for this conversation'; end if;
  elsif p_type in ('image','document') then raise exception 'Choose a conversation attachment'; end if;
  insert into public.whatsapp_inbox_messages(id,organisation_id,conversation_id,channel_id,direction,message_type,body_text,media_json,template_json,request_json,delivery_status,event_at,created_by)
    values(p_request,p_org,thread.id,sender.id,'outbound',p_type,left(p_body,16000),p_media,p_template,p_intent,'sending',p_at,p_actor) returning * into message;
  return jsonb_build_object('claimed',true,'message',to_jsonb(message));
end; $$;

alter table public.whatsapp_inbox_permissions enable row level security;
alter table public.whatsapp_inbox_permission_events enable row level security;
alter table public.whatsapp_inbox_uploads enable row level security;
revoke all on public.whatsapp_inbox_permissions,public.whatsapp_inbox_permission_events,public.whatsapp_inbox_uploads from public,anon,authenticated;
grant all on public.whatsapp_inbox_permissions,public.whatsapp_inbox_permission_events,public.whatsapp_inbox_uploads to service_role;
-- FOR SHARE requires a column UPDATE privilege; consent records are not changed.
grant select,update(id) on public.whatsapp_marketing_contacts to service_role;
revoke all on function public.whatsapp_inbox_permission_audit(),public.whatsapp_inbox_page(uuid,uuid,text,uuid,timestamptz,uuid,text,jsonb),
  public.whatsapp_inbox_permission(uuid,uuid,uuid,text,integer,integer,text,timestamptz),public.whatsapp_inbox_optout(text,text,text,timestamptz),
  public.whatsapp_inbox_claim(uuid,uuid,uuid,uuid,jsonb,integer,integer,boolean,text,text,jsonb,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_inbox_page(uuid,uuid,text,uuid,timestamptz,uuid,text,jsonb),
  public.whatsapp_inbox_permission(uuid,uuid,uuid,text,integer,integer,text,timestamptz),public.whatsapp_inbox_optout(text,text,text,timestamptz),
  public.whatsapp_inbox_claim(uuid,uuid,uuid,uuid,jsonb,integer,integer,boolean,text,text,jsonb,uuid,jsonb,timestamptz) to service_role;
commit;
