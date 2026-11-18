begin;

-- A sender is private to its owner by default. Company numbers are principal-only
-- until a principal explicitly grants access or opts into workspace-wide access.
alter table public.organisation_communication_channels
  add column if not exists whatsapp_access_scope text not null default 'selected'
  check (whatsapp_access_scope in ('private','selected','workspace'));
update public.organisation_communication_channels
set whatsapp_access_scope=case when owner_user_id is null then 'selected' else 'private' end
where provider='meta' and channel_type='whatsapp';

create table if not exists public.whatsapp_sender_access_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  channel_id uuid not null references public.organisation_communication_channels(id) on delete cascade,
  member_user_id uuid,
  team_id uuid,
  access_role text not null check (access_role in ('viewer','responder')),
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  constraint whatsapp_sender_grant_target check ((member_user_id is null) <> (team_id is null))
);
create unique index if not exists whatsapp_sender_grant_member_unique on public.whatsapp_sender_access_grants(channel_id,member_user_id) where member_user_id is not null;
create unique index if not exists whatsapp_sender_grant_team_unique on public.whatsapp_sender_access_grants(channel_id,team_id) where team_id is not null;
create index if not exists whatsapp_sender_grant_member_lookup on public.whatsapp_sender_access_grants(organisation_id,member_user_id,channel_id) where member_user_id is not null;
create index if not exists whatsapp_sender_grant_team_lookup on public.whatsapp_sender_access_grants(organisation_id,team_id,channel_id) where team_id is not null;
alter table public.whatsapp_sender_access_grants enable row level security;
revoke all on public.whatsapp_sender_access_grants from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_sender_access_grants to service_role;

create or replace function public.whatsapp_sender_access_check(p_org uuid,p_actor uuid,p_sender uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select case
  when current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and auth.uid() is distinct from p_actor then false
  when not exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=p_actor and u.status='active') then false
  when not exists(select 1 from public.organisation_communication_channels s where s.id=p_sender and s.organisation_id=p_org and s.provider='meta' and s.channel_type='whatsapp') then false
  when p_permission='campaign' then public.whatsapp_staff_is_admin(p_org,p_actor) and exists(select 1 from public.organisation_communication_channels s where s.id=p_sender and s.organisation_id=p_org and s.owner_user_id is null)
  when exists(select 1 from public.organisation_communication_channels s where s.id=p_sender and s.organisation_id=p_org and s.owner_user_id=p_actor) then p_permission in ('view','reply','manage')
  when p_permission in ('view','manage') and exists(select 1 from public.organisation_communication_channels s where s.id=p_sender and s.organisation_id=p_org and s.owner_user_id is null and public.whatsapp_staff_is_admin(p_org,p_actor)) then true
  when exists(select 1 from public.organisation_communication_channels s where s.id=p_sender and s.organisation_id=p_org and s.whatsapp_access_scope='workspace' and (s.owner_user_id is null or s.owner_user_id<>p_actor)) then p_permission in ('view','reply')
  else exists(
   select 1 from public.whatsapp_sender_access_grants g
   left join public.organisation_users u on u.organisation_id=p_org and u.user_id=p_actor and u.status='active'
   where g.organisation_id=p_org and g.channel_id=p_sender
    and (g.member_user_id=p_actor or (g.team_id is not null and u.team_id=g.team_id))
    and (p_permission='view' or (p_permission='reply' and g.access_role='responder'))
  )
 end;
$$;
revoke all on function public.whatsapp_sender_access_check(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.whatsapp_sender_access_check(uuid,uuid,uuid,text) to authenticated,service_role;

drop policy if exists whatsapp_owned_sender_visibility on public.organisation_communication_channels;
create policy whatsapp_owned_sender_visibility on public.organisation_communication_channels as restrictive for select to authenticated
using (public.whatsapp_sender_access_check(organisation_id,auth.uid(),id,'view'));

create or replace function public.whatsapp_sender_access_request(p_org uuid,p_actor uuid,p_sender uuid,p_action text,p_fields jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.organisation_communication_channels%rowtype; admin boolean; scope text; row jsonb; target uuid; team uuid; role_name text; users jsonb; teams jsonb; grants jsonb;
begin
 admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
 select * into s from public.organisation_communication_channels where id=p_sender and organisation_id=p_org and provider='meta' and channel_type='whatsapp' for update;
 if s.id is null then raise exception 'WhatsApp number not found' using errcode='42501'; end if;
 if s.owner_user_id is null then
  if not admin then raise exception 'Only principals can manage a company number' using errcode='42501'; end if;
 elsif s.owner_user_id<>p_actor then
  raise exception 'Only the number owner can manage its sharing' using errcode='42501';
 end if;
 if p_action='get' then
  select coalesce(jsonb_agg(jsonb_build_object('userId',u.user_id,'name',trim(concat_ws(' ',u.first_name,u.last_name)),'email',u.email,'teamId',u.team_id) order by u.first_name,u.last_name),'[]') into users
   from public.organisation_users u where u.organisation_id=p_org and u.status='active';
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name),'[]') into teams from public.commercial_teams t where t.organisation_id=p_org and t.status='active';
  select coalesce(jsonb_agg(jsonb_build_object('userId',g.member_user_id,'teamId',g.team_id,'role',g.access_role)),'[]') into grants from public.whatsapp_sender_access_grants g where g.organisation_id=p_org and g.channel_id=p_sender;
  return jsonb_build_object('scope',s.whatsapp_access_scope,'users',users,'teams',teams,'grants',grants);
 elsif p_action<>'save' then raise exception 'Unknown sender access action'; end if;
 scope:=coalesce(p_fields->>'scope','selected');
 if scope not in ('private','selected','workspace') then raise exception 'Choose a valid access setting'; end if;
 if scope='workspace' and coalesce((p_fields->>'confirmWorkspace')::boolean,false) is not true then raise exception 'Confirm that everyone in the organisation may access this number'; end if;
 if scope='private' and s.owner_user_id is null then raise exception 'Company numbers must be shared with selected people or the whole workspace'; end if;
 delete from public.whatsapp_sender_access_grants where organisation_id=p_org and channel_id=p_sender;
 for row in select value from jsonb_array_elements(coalesce(p_fields->'grants','[]')) loop
  target:=nullif(row->>'userId','')::uuid; team:=nullif(row->>'teamId','')::uuid; role_name:=coalesce(row->>'role','viewer');
  if (target is null)=(team is null) or role_name not in ('viewer','responder') then raise exception 'Invalid number access grant'; end if;
  if target is not null and not exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=target and u.status='active') then raise exception 'Selected user is not an active organisation member'; end if;
  if team is not null and not exists(select 1 from public.commercial_teams t where t.organisation_id=p_org and t.id=team and t.status='active') then raise exception 'Selected team is not an active team in this organisation'; end if;
  if target is not null then insert into public.whatsapp_sender_access_grants(organisation_id,channel_id,member_user_id,access_role,granted_by) values(p_org,p_sender,target,role_name,p_actor);
  else insert into public.whatsapp_sender_access_grants(organisation_id,channel_id,team_id,access_role,granted_by) values(p_org,p_sender,team,role_name,p_actor); end if;
 end loop;
 update public.organisation_communication_channels set whatsapp_access_scope=scope where id=p_sender and organisation_id=p_org;
 return jsonb_build_object('scope',scope,'saved',true);
end; $$;

create or replace function public.whatsapp_sender_access_reset_on_transfer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.owner_user_id is distinct from old.owner_user_id then
  update public.organisation_communication_channels set whatsapp_access_scope=case when new.owner_user_id is null then 'selected' else 'private' end where id=new.id;
  delete from public.whatsapp_sender_access_grants where channel_id=new.id;
 end if;
 return new;
end; $$;
create trigger whatsapp_sender_access_reset_on_transfer after update of owner_user_id on public.organisation_communication_channels
for each row execute function public.whatsapp_sender_access_reset_on_transfer();
revoke all on function public.whatsapp_sender_access_reset_on_transfer() from public,anon,authenticated;
grant execute on function public.whatsapp_sender_access_reset_on_transfer() to service_role;
revoke all on function public.whatsapp_sender_access_request(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_sender_access_request(uuid,uuid,uuid,text,jsonb) to service_role;

-- All conversation reads use the sender grants, including mentions and counters.
create or replace function public.whatsapp_workspace_visible(p_org uuid,p_actor uuid,p_conversation uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.whatsapp_inbox_conversations c
 join public.organisation_communication_channels s on s.id=c.channel_id and s.organisation_id=c.organisation_id
 where c.id=p_conversation and c.organisation_id=p_org
  and public.whatsapp_sender_access_check(p_org,p_actor,s.id,'view'));
$$;

-- Keep the existing command implementation, but remove workspace settings from
-- agent responses and require sender reply permission before taking a thread.
alter function public.whatsapp_workspace_command(uuid,uuid,text,uuid,jsonb) rename to whatsapp_workspace_command_internal;
create function public.whatsapp_workspace_command(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_fields jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; admin boolean; sender uuid;
begin
 admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
 if p_action in ('save_settings','report','retry_receiving') and not admin then raise exception 'This inbox control is restricted to principals' using errcode='42501'; end if;
 if p_action='settings' and not admin then
  result:=public.whatsapp_workspace_command_internal(p_org,p_actor,'settings',p_conversation,p_fields);
  return jsonb_build_object('availability',result->'availability');
 end if;
 if p_action in ('take','create') then
  if p_action='create' then sender:=nullif(p_fields->>'senderId','')::uuid;
  else select channel_id into sender from public.whatsapp_inbox_conversations where id=p_conversation and organisation_id=p_org; end if;
  if sender is null or not public.whatsapp_sender_access_check(p_org,p_actor,sender,'reply') then raise exception 'You need reply access to this WhatsApp number' using errcode='42501'; end if;
 end if;
 if p_action='state' and not admin then raise exception 'Only principals can change workspace conversation state' using errcode='42501'; end if;
 result:=public.whatsapp_workspace_command_internal(p_org,p_actor,p_action,p_conversation,p_fields);
 if not admin then result:=result-'snippets'; end if;
 return result;
end; $$;
revoke all on function public.whatsapp_workspace_command_internal(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_workspace_command_internal(uuid,uuid,text,uuid,jsonb) to service_role;
revoke all on function public.whatsapp_workspace_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_workspace_command(uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.whatsapp_inbox_outbound_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype;
begin
 if new.direction<>'outbound' then return new; end if;
 select * into thread from public.whatsapp_inbox_conversations where id=new.conversation_id and organisation_id=new.organisation_id for update;
 if thread.id is null or not public.whatsapp_sender_access_check(new.organisation_id,new.created_by,thread.channel_id,'reply') or thread.assigned_user_id is distinct from new.created_by then
  raise exception 'Conversation assignment changed or your number access is read-only. Refresh your inbox.' using errcode='42501';
 end if;
 return new;
end; $$;

create or replace function public.whatsapp_workspace_route() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
 if new.assigned_user_id is not null or not exists(select 1 from public.whatsapp_inbox_workspace_settings where organisation_id=new.organisation_id and auto_assign) then return new;end if;
 if exists(select 1 from public.organisation_communication_channels where id=new.channel_id and owner_user_id is not null) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text,0));
 select m.user_id into target from public.organisation_users m
 left join public.whatsapp_inbox_agent_state a on a.organisation_id=m.organisation_id and a.user_id=m.user_id
 where m.organisation_id=new.organisation_id and m.status='active' and m.role in ('agent','senior_agent','manager','branch_manager','broker','assistant')
  and public.whatsapp_sender_access_check(new.organisation_id,m.user_id,new.channel_id,'reply')
  and (a.away_until is null or a.away_until<=now())
 order by (select count(*) from public.whatsapp_inbox_conversations c where c.organisation_id=new.organisation_id and c.assigned_user_id=m.user_id and c.status='open'),m.user_id limit 1;
 if target is not null then update public.whatsapp_inbox_conversations set assigned_user_id=target,assigned_by=null,updated_at=now() where id=new.id;end if;
 return new;
end; $$;

commit;

-- Scope queues and conversation actions to explicit sender grants.
create or replace function public.whatsapp_workspace_page(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,
 p_before_at timestamptz default null,p_before_id uuid default null,p_search text default '',p_known jsonb default '[]',p_view text default 'all',p_channel uuid default null,p_versions jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb; context jsonb; cursor jsonb; visible jsonb; totals jsonb; admin boolean; mention_count bigint; mention_thread uuid; mention_view text; cache_rows jsonb;
begin
 admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
 if length(p_search)>120 or jsonb_array_length(p_known)>1000 or (p_before_at is null)<>(p_before_id is null) then raise exception 'Invalid inbox page';end if;
 if p_action='thread' then
  context:=public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.page_at desc,m.id desc),'[]') into items from (
   select id,conversation_id,direction,message_type,body_text,media_json,delivery_status,error_message,event_at,created_at,created_by,template_json,message_origin,edited_at,revoked_at,reviewed_at,request_json ? 'kind' manual_send,event_at page_at
   from public.whatsapp_inbox_messages where organisation_id=p_org and conversation_id=p_conversation
   and(p_before_at is null or(event_at,id)<(p_before_at,p_before_id)) order by event_at desc,id desc limit 51)m;
  context:=context||jsonb_build_object('canSend',public.whatsapp_sender_access_check(p_org,p_actor,(context->'conversation'->>'channel_id')::uuid,'reply') and (public.whatsapp_staff_is_admin(p_org,p_actor) or coalesce((context->'conversation'->>'assigned_user_id')::uuid=p_actor,false)));
 else
  select coalesce(jsonb_agg(c.id),'[]') into visible from public.whatsapp_inbox_conversations c join public.organisation_communication_channels s on s.id=c.channel_id
   where c.organisation_id=p_org and public.whatsapp_sender_access_check(p_org,p_actor,s.id,'view') and c.id in(select value::uuid from jsonb_array_elements_text(p_known))
   and(p_channel is null or c.channel_id=p_channel)
   and(p_search='' or position(lower(p_search) in lower(c.contact_name||' '||c.contact_phone||' '||c.last_message_preview))>0 or exists(select 1 from public.whatsapp_inbox_messages m where m.conversation_id=c.id and m.organisation_id=p_org and to_tsvector('simple',m.body_text) @@ websearch_to_tsquery('simple',p_search)))
   and(case p_view
    when 'closed' then c.status='closed'
    when 'history' then c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history')
    when 'snoozed' then c.status='open' and c.work_state='snoozed' and c.snoozed_until>now()
    when 'waiting_on_client' then c.status='open' and c.work_state='waiting_on_client'
    else c.status='open' and not(c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history'))
     and(case p_view when 'mine' then c.assigned_user_id=p_actor when 'unassigned' then c.assigned_user_id is null when 'team' then s.owner_user_id is null
      when 'waiting_on_us' then c.last_inbound_at>coalesce(c.last_agent_reply_at,'-infinity') and c.work_state<>'waiting_on_client' else c.work_state<>'snoozed' or c.snoozed_until<=now() end) end);
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into cache_rows from(
   select c.*,greatest(c.updated_at,r.updated_at) cache_version,s.owner_user_id is null shared_number,
    c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history') historical,
    (select count(*) from public.whatsapp_inbox_messages m left join public.whatsapp_inbox_reads r on r.conversation_id=m.conversation_id and r.user_id=p_actor where m.conversation_id=c.id and m.direction='inbound' and m.message_origin<>'history' and m.created_at>coalesce(r.read_through,'-infinity')) actor_unread_count
   from public.whatsapp_inbox_conversations c join public.organisation_communication_channels s on s.id=c.channel_id
   left join public.whatsapp_inbox_reads r on r.conversation_id=c.id and r.user_id=p_actor
   where c.id in(select value::uuid from jsonb_array_elements_text(visible)) and greatest(c.updated_at,r.updated_at) is distinct from nullif(p_versions->>c.id::text,'')::timestamptz)c;
  with scoped as (
   select c.*,s.owner_user_id,
   (select count(*) from public.whatsapp_inbox_messages m where m.conversation_id=c.id and m.organisation_id=p_org and m.direction='inbound' and m.message_origin<>'history' and m.created_at>coalesce(r.read_through,'-infinity')) unread,
   c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history') historical
   from public.whatsapp_inbox_conversations c join public.organisation_communication_channels s on s.id=c.channel_id
   left join public.whatsapp_inbox_reads r on r.conversation_id=c.id and r.user_id=p_actor
   where c.organisation_id=p_org and (p_channel is null or c.channel_id=p_channel) and public.whatsapp_sender_access_check(p_org,p_actor,s.id,'view')
   and(p_search='' or position(lower(p_search) in lower(c.contact_name||' '||c.contact_phone||' '||c.last_message_preview))>0
    or exists(select 1 from public.whatsapp_inbox_messages m where m.conversation_id=c.id and m.organisation_id=p_org and to_tsvector('simple',m.body_text) @@ websearch_to_tsquery('simple',p_search)))
  ) select jsonb_build_object('all',count(*) filter(where status='open' and not historical and(work_state<>'snoozed' or snoozed_until<=now())),
   'mine',count(*) filter(where assigned_user_id=p_actor and status='open' and not historical),
   'unassigned',count(*) filter(where assigned_user_id is null and status='open' and not historical),
   'team',count(*) filter(where owner_user_id is null and status='open' and not historical),
   'waiting_on_us',count(*) filter(where status='open' and not historical and last_inbound_at>coalesce(last_agent_reply_at,'-infinity') and work_state<>'waiting_on_client'),
   'waiting_on_client',count(*) filter(where status='open' and work_state='waiting_on_client'),
   'snoozed',count(*) filter(where status='open' and work_state='snoozed' and snoozed_until>now()),
   'history',count(*) filter(where historical),'closed',count(*) filter(where status='closed'),
   'unread',coalesce(sum(unread),0)) into totals from scoped;
  if p_action='notifications' then
   if exists(select 1 from public.whatsapp_inbox_agent_state where organisation_id=p_org and user_id=p_actor and not notify) then return jsonb_build_object('unreadCount',0,'mentionCount',0,'counts',totals);end if;
   select count(*) into mention_count from public.whatsapp_inbox_notes n left join public.whatsapp_inbox_reads r on r.conversation_id=n.conversation_id and r.user_id=p_actor where n.organisation_id=p_org and p_actor=any(n.mentions) and n.created_at>coalesce(r.notes_read_through,'-infinity') and public.whatsapp_workspace_visible(p_org,p_actor,n.conversation_id);
   select n.conversation_id,case when c.status='closed' then 'closed' when c.work_state='snoozed' and c.snoozed_until>now() then 'snoozed' when c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history') then 'history' else 'all' end into mention_thread,mention_view from public.whatsapp_inbox_notes n join public.whatsapp_inbox_conversations c on c.id=n.conversation_id left join public.whatsapp_inbox_reads r on r.conversation_id=n.conversation_id and r.user_id=p_actor where n.organisation_id=p_org and p_actor=any(n.mentions) and n.created_at>coalesce(r.notes_read_through,'-infinity') and public.whatsapp_workspace_visible(p_org,p_actor,n.conversation_id) order by n.created_at desc,n.id desc limit 1;
   return jsonb_build_object('unreadCount',totals->'unread','mentionCount',mention_count,'notificationConversationId',mention_thread,'notificationView',mention_view,'counts',totals);
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.page_at desc,c.id desc),'[]') into items from(
   select c.*,greatest(c.updated_at,r.updated_at) cache_version,coalesce(c.last_message_at,c.created_at) page_at,
    (select count(*) from public.whatsapp_inbox_messages m left join public.whatsapp_inbox_reads r on r.conversation_id=m.conversation_id and r.user_id=p_actor
     where m.conversation_id=c.id and m.organisation_id=p_org and m.direction='inbound' and m.message_origin<>'history' and m.created_at>coalesce(r.read_through,'-infinity')) as actor_unread_count,
    c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history') historical,
    s.owner_user_id is null shared_number
   from public.whatsapp_inbox_conversations c join public.organisation_communication_channels s on s.id=c.channel_id
   left join public.whatsapp_inbox_reads r on r.conversation_id=c.id and r.user_id=p_actor
   where c.organisation_id=p_org and(p_channel is null or c.channel_id=p_channel) and public.whatsapp_sender_access_check(p_org,p_actor,s.id,'view')
   and(p_before_at is null or(coalesce(c.last_message_at,c.created_at),c.id)<(p_before_at,p_before_id))
   and(p_search='' or position(lower(p_search) in lower(c.contact_name||' '||c.contact_phone||' '||c.last_message_preview))>0 or exists(select 1 from public.whatsapp_inbox_messages m where m.conversation_id=c.id and m.organisation_id=p_org and to_tsvector('simple',m.body_text) @@ websearch_to_tsquery('simple',p_search)))
   and(case p_view
    when 'closed' then c.status='closed'
    when 'history' then c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history')
    when 'snoozed' then c.status='open' and c.work_state='snoozed' and c.snoozed_until>now()
    when 'waiting_on_client' then c.status='open' and c.work_state='waiting_on_client'
    else c.status='open' and not(c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history'))
     and(case p_view when 'mine' then c.assigned_user_id=p_actor when 'unassigned' then c.assigned_user_id is null when 'team' then s.owner_user_id is null
      when 'waiting_on_us' then c.last_inbound_at>coalesce(c.last_agent_reply_at,'-infinity') and c.work_state<>'waiting_on_client' else c.work_state<>'snoozed' or c.snoozed_until<=now() end) end)
   order by coalesce(c.last_message_at,c.created_at) desc,c.id desc limit 51)c;
 end if;
 if jsonb_array_length(items)>50 then cursor:=jsonb_build_object('at',items->49->'page_at','id',items->49->'id');items:=items-50;end if;
 return coalesce(context,'{}')||jsonb_build_object(case when p_action='thread' then 'messages' else 'conversations' end,items,'nextCursor',cursor,'visibleIds',visible,'counts',totals,'cachedConversations',cache_rows);
end; $$;
