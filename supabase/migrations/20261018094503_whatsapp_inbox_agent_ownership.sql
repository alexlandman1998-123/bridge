begin;

alter table public.organisation_communication_channels
  add column owner_user_id uuid references auth.users(id) on delete restrict,
  add column ownership_changed_by uuid references auth.users(id) on delete set null,
  add column ownership_version integer not null default 1;
alter table public.meta_whatsapp_authorizations
  add column owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.whatsapp_inbox_conversations
  add column assigned_user_id uuid references auth.users(id) on delete set null,
  add column assigned_at timestamptz,
  add column assigned_by uuid references auth.users(id) on delete set null,
  add column assignment_version integer not null default 1,
  add constraint whatsapp_inbox_conversation_org_identity unique(id,organisation_id);
create index whatsapp_inbox_assignee_activity on public.whatsapp_inbox_conversations(organisation_id,assigned_user_id,last_message_at desc);
create index whatsapp_sender_owner on public.organisation_communication_channels(organisation_id,owner_user_id) where owner_user_id is not null;

-- Inbox contents stay behind the authenticated server handler. Browser keys have
-- no direct read/write grant, including the assignment ledger.
create table public.whatsapp_inbox_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  conversation_id uuid not null,
  from_user_id uuid references auth.users(id) on delete set null,
  to_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  assignment_version integer not null,
  created_at timestamptz not null default now(),
  foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id)
);
create index whatsapp_inbox_assignments_conversation on public.whatsapp_inbox_assignments(conversation_id,created_at desc);
alter table public.whatsapp_inbox_assignments enable row level security;
revoke all on public.whatsapp_inbox_assignments from public,anon,authenticated;
grant all on public.whatsapp_inbox_assignments to service_role;

create function public.whatsapp_staff_is_admin(p_org uuid,p_actor uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare member_role text;
begin
  select m.role into member_role from public.organisation_users m
    where m.organisation_id=p_org and m.user_id=p_actor and m.status='active' for share;
  if member_role is null or member_role not in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant') then
    raise exception 'Active staff membership is required' using errcode='42501';
  end if;
  return member_role in ('owner','principal','director','admin','super_admin','developer','agency_admin');
end; $$;

-- Existing agency senders retain campaign capability. A personally owned number
-- cannot become a default automation sender or a bulk campaign sender.
create function public.whatsapp_sender_owner_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.owner_user_id is not null then
    if new.provider<>'meta' or new.channel_type<>'whatsapp' then raise exception 'Only a Meta WhatsApp number can have an inbox owner'; end if;
    if tg_op='INSERT' or new.owner_user_id is distinct from old.owner_user_id then
      perform public.whatsapp_staff_is_admin(new.organisation_id,new.owner_user_id);
      if exists(select 1 from public.whatsapp_campaign_jobs j join public.whatsapp_campaigns c on c.id=j.campaign_id
        where c.sender_id=new.id and j.status in ('queued','running','paused')) or exists(
          select 1 from public.whatsapp_campaigns c join public.whatsapp_campaign_recipients r on r.campaign_id=c.id
            where c.sender_id=new.id and c.status='sending' and r.status in ('queued','processing')) then
        raise exception 'Complete or cancel active campaigns before making this an agent number';
      end if;
    end if;
    new.is_default:=false;
  end if;
  if tg_op='UPDATE' then
    new.ownership_version:=old.ownership_version+case when new.owner_user_id is distinct from old.owner_user_id then 1 else 0 end;
  else new.ownership_version:=1; end if;
  return new;
end; $$;
create trigger whatsapp_sender_owner_guard before insert or update on public.organisation_communication_channels
  for each row execute function public.whatsapp_sender_owner_guard();

create function public.whatsapp_inbox_assignment_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
  if tg_op='INSERT' then
    select c.owner_user_id into owner_id from public.organisation_communication_channels c
      join public.organisation_users m on m.organisation_id=c.organisation_id and m.user_id=c.owner_user_id and m.status='active' and m.role in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant')
      where c.id=new.channel_id and c.organisation_id=new.organisation_id;
    new.assigned_user_id:=owner_id;new.assigned_at:=case when owner_id is null then null else now() end;
    new.assigned_by:=null;new.assignment_version:=1;
  else
    if (new.organisation_id,new.channel_id) is distinct from (old.organisation_id,old.channel_id) then raise exception 'A conversation cannot move to another number or organisation'; end if;
    new.assignment_version:=old.assignment_version+case when new.assigned_user_id is distinct from old.assigned_user_id then 1 else 0 end;
    if new.assigned_user_id is distinct from old.assigned_user_id then new.assigned_at:=now(); end if;
  end if;
  return new;
end; $$;
create trigger whatsapp_inbox_assignment_stamp before insert or update on public.whatsapp_inbox_conversations
  for each row execute function public.whatsapp_inbox_assignment_stamp();
create function public.whatsapp_inbox_assignment_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id then
    insert into public.whatsapp_inbox_assignments(organisation_id,conversation_id,from_user_id,to_user_id,actor_user_id,assignment_version)
      values(new.organisation_id,new.id,old.assigned_user_id,new.assigned_user_id,new.assigned_by,new.assignment_version);
  end if;
  return new;
end; $$;
create trigger whatsapp_inbox_assignment_audit after update on public.whatsapp_inbox_conversations
  for each row execute function public.whatsapp_inbox_assignment_audit();
create function public.whatsapp_sender_transfer_inbox() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    update public.whatsapp_inbox_conversations set assigned_user_id=new.owner_user_id,assigned_by=new.ownership_changed_by,updated_at=now()
      where channel_id=new.id and organisation_id=new.organisation_id and assigned_user_id is distinct from new.owner_user_id;
  end if;
  return new;
end; $$;
create trigger whatsapp_sender_transfer_inbox after update of owner_user_id on public.organisation_communication_channels
  for each row execute function public.whatsapp_sender_transfer_inbox();

-- Credential columns are still excluded from browser grants. This restrictive
-- policy also hides another agent's number from direct metadata queries.
grant select(owner_user_id,ownership_version) on public.organisation_communication_channels to authenticated;
create policy whatsapp_owned_sender_visibility on public.organisation_communication_channels as restrictive for select to authenticated using (
  owner_user_id is null or owner_user_id=(select auth.uid()) or exists(
    select 1 from public.organisation_users m where m.organisation_id=organisation_communication_channels.organisation_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','principal','director','admin','super_admin','developer','agency_admin')
  )
);

create function public.whatsapp_sender_set_owner(p_org uuid,p_actor uuid,p_sender uuid,p_owner uuid,p_version integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype;
begin
  if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management access is required' using errcode='42501'; end if;
  select * into sender from public.organisation_communication_channels where id=p_sender and organisation_id=p_org and provider='meta' and channel_type='whatsapp' for update;
  if sender.id is null then raise exception 'WhatsApp sender not found in this workspace'; end if;
  if p_version is distinct from sender.ownership_version then raise exception 'Number ownership changed. Refresh before saving' using errcode='40001'; end if;
  update public.organisation_communication_channels set owner_user_id=p_owner,ownership_changed_by=p_actor where id=sender.id returning * into sender;
  return jsonb_build_object('saved',true,'ownership_version',sender.ownership_version);
end; $$;

-- Every content operation rechecks current membership and assignment in the same
-- transaction as its read/write. Client supplied user IDs never reach this RPC.
create function public.whatsapp_inbox_request(
  p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,
  p_assignee uuid default null,p_version integer default null,p_message uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare is_admin boolean; thread public.whatsapp_inbox_conversations%rowtype; attachment public.whatsapp_inbox_messages%rowtype; items jsonb; sender_json jsonb;
begin
  is_admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.last_message_at desc),'[]'::jsonb) into items from (
      select * from public.whatsapp_inbox_conversations where organisation_id=p_org and (is_admin or assigned_user_id=p_actor)
        order by last_message_at desc limit 100
    ) c;
    return jsonb_build_object('conversations',items);
  end if;
  if p_action='media' then
    select * into attachment from public.whatsapp_inbox_messages where id=p_message and organisation_id=p_org;
    p_conversation:=attachment.conversation_id;
  end if;
  select * into thread from public.whatsapp_inbox_conversations where id=p_conversation and organisation_id=p_org for update;
  if thread.id is null or not (is_admin or coalesce(thread.assigned_user_id=p_actor,false)) then
    raise exception 'Conversation not found in your inbox' using errcode='42501';
  end if;
  select jsonb_build_object('id',c.id,'display_phone_number',c.display_phone_number,'connection_status',c.connection_status) into sender_json from public.organisation_communication_channels c where c.id=thread.channel_id and c.organisation_id=p_org;
  if p_action='access' then return jsonb_build_object('conversation',to_jsonb(thread),'sender',sender_json); end if;
  if p_action='media' then return jsonb_build_object('channel_id',attachment.channel_id,'media_json',attachment.media_json); end if;
  if p_action='thread' then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.event_at,m.id),'[]'::jsonb) into items from (
      select id,conversation_id,direction,message_type,body_text,media_json,delivery_status,error_message,event_at,created_at,created_by
        from public.whatsapp_inbox_messages where conversation_id=thread.id and organisation_id=p_org order by event_at desc,id desc limit 100
    ) m;
    update public.whatsapp_inbox_conversations set unread_count=0 where id=thread.id;
    return jsonb_build_object('conversation',to_jsonb(thread),'sender',sender_json,'messages',items);
  end if;
  if p_action not in ('assign','open','closed') then raise exception 'Unknown inbox action'; end if;
  if p_version is distinct from thread.assignment_version then raise exception 'Conversation assignment changed. Refresh before continuing' using errcode='40001'; end if;
  if p_action='assign' then
    if not is_admin then raise exception 'Agency management must assign conversations' using errcode='42501'; end if;
    if p_assignee is not null then perform public.whatsapp_staff_is_admin(p_org,p_assignee); end if;
    update public.whatsapp_inbox_conversations set assigned_user_id=p_assignee,assigned_by=p_actor,updated_at=now() where id=thread.id returning * into thread;
  else
    update public.whatsapp_inbox_conversations set status=p_action,updated_at=now() where id=thread.id returning * into thread;
  end if;
  return jsonb_build_object('conversation',to_jsonb(thread));
end; $$;

-- A reassignment between reading a thread and clicking Send cannot bypass access.
create function public.whatsapp_inbox_outbound_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype; is_admin boolean;
begin
  if new.direction<>'outbound' then return new; end if;
  is_admin:=public.whatsapp_staff_is_admin(new.organisation_id,new.created_by);
  select * into thread from public.whatsapp_inbox_conversations where id=new.conversation_id and organisation_id=new.organisation_id for update;
  if thread.id is null or not (is_admin or coalesce(thread.assigned_user_id=new.created_by,false)) then raise exception 'Conversation assignment changed. Refresh your inbox' using errcode='42501'; end if;
  return new;
end; $$;
create trigger whatsapp_inbox_outbound_guard before insert on public.whatsapp_inbox_messages for each row execute function public.whatsapp_inbox_outbound_guard();

-- Protect both enqueue and the last database claim before a worker sends.
create function public.whatsapp_campaign_agency_sender_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' or new.status='processing' then
    perform 1 from public.organisation_communication_channels ch join public.whatsapp_campaigns c on c.sender_id=ch.id
      where c.id=new.campaign_id and ch.owner_user_id is not null;
    if found then raise exception 'Bulk campaigns require an agency number, not an agent number'; end if;
  end if;
  return new;
end; $$;
create trigger whatsapp_campaign_agency_sender_guard before insert or update of status on public.whatsapp_campaign_recipients
  for each row execute function public.whatsapp_campaign_agency_sender_guard();

revoke all on function public.whatsapp_staff_is_admin(uuid,uuid),public.whatsapp_sender_owner_guard(),public.whatsapp_inbox_assignment_stamp(),
  public.whatsapp_inbox_assignment_audit(),public.whatsapp_sender_transfer_inbox(),public.whatsapp_inbox_outbound_guard(),public.whatsapp_campaign_agency_sender_guard(),
  public.whatsapp_sender_set_owner(uuid,uuid,uuid,uuid,integer),public.whatsapp_inbox_request(uuid,uuid,text,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_staff_is_admin(uuid,uuid),public.whatsapp_sender_set_owner(uuid,uuid,uuid,uuid,integer),
  public.whatsapp_inbox_request(uuid,uuid,text,uuid,uuid,integer,uuid) to service_role;
-- SELECT FOR SHARE also needs an UPDATE privilege; no membership row is changed.
grant select,update(user_id) on public.organisation_users to service_role;

commit;
