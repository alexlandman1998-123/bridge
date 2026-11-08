-- Client engagement journal: metadata only, with live source permissions.
begin;
alter table public.agency_client_activity
 add column communication_channel text check(communication_channel in ('email','whatsapp')),
 add column communication_direction text check(communication_direction in ('inbound','outbound')),
 add column conversation_id uuid,
 add column engagement_status text check(engagement_status in ('received','sent','failed','completed','no_answer','recorded'));
create index client_engagement_conversation on public.agency_client_activity(organisation_id,conversation_id,occurred_at desc) where conversation_id is not null;
create index client_identifier_destination on public.agency_client_identifiers(organisation_id,kind,value,client_id);

-- No message bodies, subjects, addresses, attachments or credentials leave here.
create function arch9_client_private.communication_record(p_table text,p_id uuid)
returns table(organisation_id uuid,conversation_id uuid,channel text,direction text,status text,occurred_at timestamptz,actor_id uuid,historical boolean,destinations text[])
language plpgsql stable security definer set search_path='' as $$
begin
 if p_table='revo_inbox_messages' then
  return query select m.organisation_id,m.conversation_id,'email'::text,m.direction,
   case when m.delivery_status='failed' then 'failed' when m.direction='inbound' and m.delivery_status in ('received','sent','delivered','read') then 'received' when m.direction='outbound' and m.delivery_status in ('sent','delivered','read') then 'sent' end,
   m.occurred_at,case when m.direction='outbound' then m.created_by end,false,
   case when m.direction='inbound' then array[lower(btrim(m.sender_address))] else array(select lower(btrim(a)) from unnest(m.recipient_addresses) a) end
  from public.revo_inbox_messages m join public.revo_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id
  where m.id=p_id and m.channel='email' and m.message_type='message' and m.direction in ('inbound','outbound');
 elsif p_table='whatsapp_inbox_messages' then
  return query select m.organisation_id,m.conversation_id,'whatsapp'::text,m.direction,
   case when m.delivery_status='failed' then 'failed' when m.direction='inbound' and m.delivery_status in ('received','sent','delivered','read') then 'received' when m.direction='outbound' and m.delivery_status in ('sent','delivered','read') then 'sent' end,
   m.event_at,case when m.direction='outbound' then m.created_by end,coalesce(to_jsonb(m)->>'message_origin','')='history',array[public.client_normalize_phone(c.contact_phone)]
  from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id and c.channel_id=m.channel_id
  where m.id=p_id and m.direction in ('inbound','outbound')
   and coalesce(to_jsonb(m)->>'revoked_at','')='';
 end if;
end $$;

create function arch9_client_private.communication_targets(p_table text,p_id uuid)
returns table(client_id uuid) language plpgsql stable security definer set search_path='' as $$
declare r record; link record;
begin
 select * into r from arch9_client_private.communication_record(p_table,p_id);
 if not found then return; end if;
 if r.channel='email' then
  return query select distinct coalesce(p.merged_into,p.id) from public.agency_client_identifiers i join public.agency_client_profiles p on p.id=i.client_id and p.organisation_id=i.organisation_id
   where i.organisation_id=r.organisation_id and i.kind='email' and i.value=any(r.destinations);
 else
  select * into link from public.whatsapp_inbox_crm_links l where l.organisation_id=r.organisation_id and l.conversation_id=r.conversation_id;
  if found and (link.lead_id is not null or link.recruitment_lead_id is not null) then
   return query select distinct coalesce(p.merged_into,p.id) from public.agency_client_links l join public.agency_client_profiles p on p.id=l.client_id and p.organisation_id=l.organisation_id
    where l.organisation_id=r.organisation_id and l.source_kind='lead' and l.source_id=link.lead_id;
   return;
  end if;
  -- Shared household numbers never choose an arbitrary person.
  return query with candidates as (
   select distinct coalesce(p.merged_into,p.id) id from public.agency_client_identifiers i join public.agency_client_profiles p on p.id=i.client_id and p.organisation_id=i.organisation_id
    where i.organisation_id=r.organisation_id and i.kind='phone' and i.value=any(r.destinations)
  ) select id from candidates where (select count(*) from candidates)=1;
 end if;
end $$;

create function arch9_client_private.communication_visible(p_table text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r record; assigned uuid; admin boolean; member_role text;
begin
 if auth.uid() is null then return false; end if;
 select * into r from arch9_client_private.communication_record(p_table,p_id);
 if not found or not arch9_client_private.is_member(r.organisation_id) then return false; end if;
 if r.channel='email' then
  return private.shared_inbox_can_access_conversation(r.organisation_id,r.conversation_id,'read');
 end if;
 -- Use the same active staff/admin and assignee gate as the WhatsApp handler.
 -- Read-only equivalent of whatsapp_staff_is_admin: no row locks in RLS.
 select role into member_role from public.organisation_users where organisation_id=r.organisation_id and user_id=auth.uid() and status='active';
 if member_role is null or member_role not in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant') then return false;end if;
 admin:=member_role in ('owner','principal','director','admin','super_admin','developer','agency_admin');
 select assigned_user_id into assigned from public.whatsapp_inbox_conversations where id=r.conversation_id and organisation_id=r.organisation_id;
 return admin or coalesce(assigned=auth.uid(),false);
exception when insufficient_privilege then return false;
end $$;

create function arch9_client_private.communication_event_visible(p_org uuid,p_client uuid,p_table text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select arch9_client_private.communication_visible(p_table,p_id) and exists(
  select 1 from arch9_client_private.communication_targets(p_table,p_id) t join public.agency_client_profiles p on p.id=p_client
   where p.organisation_id=p_org and coalesce(p.merged_into,p.id)=t.client_id)
$$;
revoke all on function arch9_client_private.communication_record(text,uuid),arch9_client_private.communication_targets(text,uuid),arch9_client_private.communication_visible(text,uuid),arch9_client_private.communication_event_visible(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function arch9_client_private.communication_visible(text,uuid),arch9_client_private.communication_event_visible(uuid,uuid,text,uuid) to authenticated;

create policy client_communication_current_access on public.agency_client_activity as restrictive for select to authenticated using(
 origin_table not in ('revo_inbox_messages','whatsapp_inbox_messages') or arch9_client_private.communication_event_visible(organisation_id,client_id,origin_table,origin_id));

create function arch9_client_private.capture_communication(p_table text,p_id uuid,p_historical boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare r record; n integer;
begin
 select * into r from arch9_client_private.communication_record(p_table,p_id);
 if not found or r.status is null then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.organisation_id::text,0));
 insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,actor_id,actor_name,actor_kind,origin_table,origin_id,event_key,occurred_at,historical,communication_channel,communication_direction,conversation_id,engagement_status)
 select r.organisation_id,t.client_id,'interaction','engagement.'||r.channel||'.'||case when r.status='failed' then 'failed' else r.direction end,
  case when r.channel='email' then 'Email' else 'WhatsApp' end||case r.status when 'failed' then ' send failed' when 'received' then ' received' else ' sent' end,
  r.actor_id,arch9_client_private.activity_actor_name(r.actor_id),case when r.status='received' then 'client' when r.actor_id is not null then 'staff' else 'system' end,
  p_table,p_id,'communication:'||p_table||':'||p_id||':'||r.direction||':'||r.status,r.occurred_at,p_historical or r.historical,r.channel,r.direction,r.conversation_id,r.status
 from arch9_client_private.communication_targets(p_table,p_id) t
 where not exists(select 1 from public.agency_client_activity a join public.agency_client_profiles p on p.id=a.client_id where a.organisation_id=r.organisation_id and coalesce(p.merged_into,p.id)=t.client_id and a.event_key='communication:'||p_table||':'||p_id||':'||r.direction||':'||r.status)
 on conflict(organisation_id,client_id,event_key) do nothing;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function arch9_client_private.capture_communication(text,uuid,boolean) from public,anon,authenticated;

create function arch9_client_private.communication_capture_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform arch9_client_private.capture_communication(tg_table_name,new.id);return new;end $$;
create trigger client_email_engagement after insert or update on public.revo_inbox_messages for each row execute function arch9_client_private.communication_capture_trigger();
create trigger client_whatsapp_engagement after insert or update on public.whatsapp_inbox_messages for each row execute function arch9_client_private.communication_capture_trigger();

create function arch9_client_private.replay_client_destination(p_org uuid,p_kind text,p_value text) returns void
language plpgsql security definer set search_path='' as $$
declare message_id uuid;
begin
 if p_kind='email' then
  for message_id in select id from public.revo_inbox_messages m where m.organisation_id=p_org and m.channel='email' and (lower(btrim(m.sender_address))=p_value or exists(select 1 from unnest(m.recipient_addresses) a where lower(btrim(a))=p_value)) loop
   perform arch9_client_private.capture_communication('revo_inbox_messages',message_id,true);
  end loop;
 elsif p_kind='phone' then
  for message_id in select m.id from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id where c.organisation_id=p_org and public.client_normalize_phone(c.contact_phone)=p_value loop
   perform arch9_client_private.capture_communication('whatsapp_inbox_messages',message_id,true);
  end loop;
 end if;
end $$;
create function arch9_client_private.communication_identity_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare ident record; lead_key uuid;
begin
 if tg_table_name='agency_client_identifiers' then
  perform arch9_client_private.replay_client_destination(new.organisation_id,new.kind,new.value);
 elsif tg_table_name='agency_client_links' then
  if new.source_kind='lead' then
   for ident in select m.id from public.whatsapp_inbox_messages m join public.whatsapp_inbox_crm_links l on l.conversation_id=m.conversation_id and l.organisation_id=m.organisation_id where l.organisation_id=new.organisation_id and l.lead_id=new.source_id loop perform arch9_client_private.capture_communication('whatsapp_inbox_messages',ident.id,true);end loop;
  end if;
 elsif tg_table_name='agency_client_profiles' then
  if new.merged_into is not null and new.merged_into is distinct from old.merged_into then
   for ident in select * from public.agency_client_identifiers where client_id=new.merged_into loop perform arch9_client_private.replay_client_destination(ident.organisation_id,ident.kind,ident.value); end loop;
  end if;
 else
  if tg_op='DELETE' then lead_key:=old.conversation_id; else lead_key:=new.conversation_id; end if;
  for ident in select id from public.whatsapp_inbox_messages where conversation_id=lead_key loop perform arch9_client_private.capture_communication('whatsapp_inbox_messages',ident.id,true); end loop;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger client_engagement_identifier after insert or update of client_id on public.agency_client_identifiers for each row execute function arch9_client_private.communication_identity_trigger();
create trigger client_engagement_source_link after insert or update on public.agency_client_links for each row execute function arch9_client_private.communication_identity_trigger();
create trigger client_engagement_merge after update of merged_into on public.agency_client_profiles for each row execute function arch9_client_private.communication_identity_trigger();
create trigger client_engagement_wa_link after insert or update or delete on public.whatsapp_inbox_crm_links for each row execute function arch9_client_private.communication_identity_trigger();
revoke all on function arch9_client_private.communication_capture_trigger(),arch9_client_private.communication_identity_trigger(),arch9_client_private.replay_client_destination(uuid,text,text) from public,anon,authenticated;

-- Backfill is explicit, per organisation and previewable. No provider calls.
create function public.client_engagement_backfill(p_org uuid,p_apply boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item record; candidates integer:=0; inserted integer:=0;
begin
 for item in select 'revo_inbox_messages' kind,id from public.revo_inbox_messages where organisation_id=p_org union all select 'whatsapp_inbox_messages',id from public.whatsapp_inbox_messages where organisation_id=p_org loop
  if exists(select 1 from arch9_client_private.communication_targets(item.kind,item.id)) and exists(select 1 from arch9_client_private.communication_record(item.kind,item.id) where status is not null) then
   candidates:=candidates+1;
   if p_apply then inserted:=inserted+arch9_client_private.capture_communication(item.kind,item.id,true); end if;
  end if;
 end loop;
 return jsonb_build_object('candidates',candidates,'inserted',inserted);
end $$;
revoke all on function public.client_engagement_backfill(uuid,boolean) from public,anon,authenticated;
grant execute on function public.client_engagement_backfill(uuid,boolean),arch9_client_private.communication_record(text,uuid),arch9_client_private.communication_targets(text,uuid),arch9_client_private.capture_communication(text,uuid,boolean) to service_role;

create function arch9_client_private.log_client_engagement(p_client_id uuid,p_request_id uuid,p_type text,p_detail text,p_occurred_at timestamptz,p_outcome text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.agency_client_profiles; v_id uuid; v_existing public.agency_client_activity;
begin
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into; end if;
  if c.id is null or auth.uid() is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
  if p_outcome is null or not ((p_type='note' and p_outcome='recorded') or (p_type='call' and p_outcome in ('completed','no_answer')) or (p_type in ('email','message','meeting') and p_outcome='completed')) then raise exception 'Choose a valid interaction outcome.' using errcode='22023'; end if;
  if p_request_id is null or p_type is null or p_type not in ('call','note','email','message','meeting')
    or length(trim(coalesce(p_detail,''))) not between 1 and 4000 or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'Choose an interaction type, details and a valid occurrence time.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.organisation_id::text,0));
  -- A merge may finish while this request waits for the agency lock. Resolve
  -- and authorize again before saving against the current profile.
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into; end if;
  if c.id is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
  select * into v_existing from public.agency_client_activity where organisation_id=c.organisation_id and origin_table='manual' and event_key='manual:'||p_request_id;
  if v_existing.id is not null then
    if not exists(select 1 from public.agency_client_profiles p where p.id=v_existing.client_id and coalesce(p.merged_into,p.id)=c.id)
      or v_existing.actor_id is distinct from auth.uid() or v_existing.event_type is distinct from 'interaction.'||p_type
      or v_existing.engagement_status is distinct from p_outcome or v_existing.detail is distinct from trim(p_detail) or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'This request ID already records another interaction.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,detail,actor_id,actor_name,actor_kind,origin_table,origin_id,event_key,occurred_at,engagement_status)
    values(c.organisation_id,c.id,'interaction','interaction.'||p_type,initcap(p_type)||' logged',trim(p_detail),auth.uid(),arch9_client_private.activity_actor_name(auth.uid()),'staff','manual',p_request_id,'manual:'||p_request_id,p_occurred_at,p_outcome)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.agency_client_activity where organisation_id=c.organisation_id and client_id=c.id and event_key='manual:'||p_request_id;
    if v_existing.actor_id is distinct from auth.uid() or v_existing.event_type is distinct from 'interaction.'||p_type or v_existing.engagement_status is distinct from p_outcome or v_existing.detail is distinct from trim(p_detail) or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'This request ID already records another interaction.' using errcode='22023'; end if;
    v_id:=v_existing.id;
  end if;
  return v_id;
end;
$$;
revoke all on function arch9_client_private.log_client_engagement(uuid,uuid,text,text,timestamptz,text) from public,anon;
grant execute on function arch9_client_private.log_client_engagement(uuid,uuid,text,text,timestamptz,text) to authenticated;
create function public.client_log_engagement(p_client_id uuid,p_request_id uuid,p_type text,p_detail text,p_occurred_at timestamptz,p_outcome text) returns uuid
language sql security invoker set search_path='' as $$ select arch9_client_private.log_client_engagement(p_client_id,p_request_id,p_type,p_detail,p_occurred_at,p_outcome) $$;
revoke all on function public.client_log_engagement(uuid,uuid,text,text,timestamptz,text) from public,anon;
grant execute on function public.client_log_engagement(uuid,uuid,text,text,timestamptz,text) to authenticated;

-- Preserve all existing professional-note/document/campaign origin permissions.
alter function arch9_client_private.activity_origin_visible(text,uuid) rename to activity_origin_visible_before_communications;
create function arch9_client_private.activity_origin_visible(p_table text,p_id uuid) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_table in ('revo_inbox_messages','whatsapp_inbox_messages') then return arch9_client_private.communication_visible(p_table,p_id);end if;
 return arch9_client_private.activity_origin_visible_before_communications(p_table,p_id);
end $$;
revoke all on function arch9_client_private.activity_origin_visible(text,uuid) from public,anon;
grant execute on function arch9_client_private.activity_origin_visible(text,uuid) to authenticated;
alter policy agency_client_activity_read on public.agency_client_activity using (
 arch9_client_private.can_read_client(client_id)
 and (source_kind is null or arch9_client_private.source_visible(organisation_id,source_kind,source_id))
 and arch9_client_private.activity_origin_visible(origin_table,origin_id));

create function arch9_client_private.communication_successful(p_table text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select arch9_client_private.communication_visible(p_table,p_id) and exists(select 1 from arch9_client_private.communication_record(p_table,p_id) where status in ('sent','received'))
$$;
revoke all on function arch9_client_private.communication_successful(text,uuid) from public,anon;
grant execute on function arch9_client_private.communication_successful(text,uuid) to authenticated;
create function arch9_client_private.activity_is_contact(a public.agency_client_activity) returns boolean
language sql stable security invoker set search_path='' as $$
 select a.occurred_at<=now() and case
  when a.origin_table in ('revo_inbox_messages','whatsapp_inbox_messages') then a.engagement_status in ('sent','received') and arch9_client_private.communication_successful(a.origin_table,a.origin_id)
  when a.origin_table='manual' then a.event_type in ('interaction.call','interaction.email','interaction.message','interaction.meeting') and coalesce(a.engagement_status,'completed')='completed'
  when a.origin_table='lead_activities' then exists(select 1 from public.lead_activities l where l.activity_id=a.origin_id and lower(l.activity_type) in ('call','phone call','email','whatsapp','meeting','viewing') and lower(l.outcome) in ('contacted','connected','sent','delivered','completed','replied'))
  when a.event_type='campaign.response' then true
  else false end
$$;
revoke all on function arch9_client_private.activity_is_contact(public.agency_client_activity) from public,anon;
grant execute on function arch9_client_private.activity_is_contact(public.agency_client_activity) to authenticated;

create function public.client_contacted_at(p_org uuid,p_contact uuid) returns timestamptz
language sql stable security invoker set search_path='' as $$
 select max(a.occurred_at) from public.agency_client_links l join public.agency_client_profiles p on p.id=l.client_id and p.organisation_id=l.organisation_id
 join public.agency_client_profiles h on h.organisation_id=p.organisation_id and coalesce(h.merged_into,h.id)=coalesce(p.merged_into,p.id)
 join public.agency_client_activity a on a.client_id=h.id and a.organisation_id=h.organisation_id
 where l.organisation_id=p_org and l.source_kind='contact' and l.source_id=p_contact and arch9_client_private.can_read_client(coalesce(p.merged_into,p.id)) and arch9_client_private.source_visible(p_org,'contact',p_contact)
 and arch9_client_private.activity_origin_visible(a.origin_table,a.origin_id)
 and (a.origin_table not in ('revo_inbox_messages','whatsapp_inbox_messages') or arch9_client_private.communication_event_visible(a.organisation_id,a.client_id,a.origin_table,a.origin_id))
 and arch9_client_private.activity_is_contact(a)
$$;
revoke all on function public.client_contacted_at(uuid,uuid) from public,anon;
grant execute on function public.client_contacted_at(uuid,uuid) to authenticated;

create function arch9_client_private.communication_context(p_table text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r record; assigned uuid; state text;
begin
 if not arch9_client_private.communication_visible(p_table,p_id) then return null;end if;
 select * into r from arch9_client_private.communication_record(p_table,p_id);
 if r.channel='email' then select assigned_user_id,status into assigned,state from public.revo_inbox_conversations where id=r.conversation_id and organisation_id=r.organisation_id;
 else select assigned_user_id,status into assigned,state from public.whatsapp_inbox_conversations where id=r.conversation_id and organisation_id=r.organisation_id;end if;
 if not exists(select 1 from public.organisation_users u where u.organisation_id=r.organisation_id and u.user_id=assigned and lower(coalesce(u.membership_status,u.status,'')) in ('active','accepted')) then assigned:=null;end if;
 return jsonb_build_object('id',r.conversation_id,'channel',r.channel,'assignedUserId',assigned,'assignedName',arch9_client_private.activity_actor_name(assigned),'status',state);
end $$;
revoke all on function arch9_client_private.communication_context(text,uuid) from public,anon;
grant execute on function arch9_client_private.communication_context(text,uuid) to authenticated;

create function public.client_engagement_summary(p_org uuid,p_client uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare target uuid; threads jsonb; last_contact jsonb; followups integer;
begin
 select coalesce(merged_into,id) into target from public.agency_client_profiles where organisation_id=p_org and id=p_client;
 if target is null or not arch9_client_private.can_read_client(target) then raise exception 'Client access required.' using errcode='42501';end if;
 select jsonb_build_object('at',a.occurred_at,'actorId',a.actor_id,'actorName',a.actor_name,'channel',a.communication_channel,'direction',a.communication_direction) into last_contact
 from public.agency_client_activity a join public.agency_client_profiles p on p.id=a.client_id and p.organisation_id=a.organisation_id
 where a.organisation_id=p_org and coalesce(p.merged_into,p.id)=target and arch9_client_private.activity_is_contact(a) order by a.occurred_at desc,a.id desc limit 1;
 with visible as (
  select distinct on(a.conversation_id) a.* from public.agency_client_activity a join public.agency_client_profiles p on p.id=a.client_id and p.organisation_id=a.organisation_id
  where a.organisation_id=p_org and coalesce(p.merged_into,p.id)=target and a.conversation_id is not null and a.occurred_at<=now()
  order by a.conversation_id,a.occurred_at desc,a.id desc
 ), contexts as (
  select arch9_client_private.communication_context(origin_table,origin_id)||jsonb_build_object('lastActivityAt',occurred_at,'lastStatus',engagement_status) context from visible
 ) select coalesce(jsonb_agg(context order by context->>'lastActivityAt' desc),'[]') into threads from(select context from contexts where context is not null order by context->>'lastActivityAt' desc limit 20) bounded;
 select count(*)::integer into followups from public.tasks t where t.organisation_id=p_org and lower(coalesce(t.status,'')) not in ('completed','done','cancelled','closed','archived','deleted') and exists(
  select 1 from public.agency_client_links l where l.client_id=target and l.organisation_id=p_org and ((l.source_kind='lead' and l.source_id=t.lead_id) or(l.source_kind in ('transaction_buyer','transaction_seller') and l.source_id=t.transaction_id)));
 return jsonb_build_object('lastContact',last_contact,'conversations',threads,'pendingFollowUps',followups,'visibleOnly',true);
end $$;
revoke all on function public.client_engagement_summary(uuid,uuid) from public,anon;
grant execute on function public.client_engagement_summary(uuid,uuid) to authenticated;

-- The presentation deduplicates one message addressed to two later-merged aliases.
create or replace function public.agency_client_activity_page(p_client_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_category text default null,p_limit integer default 51)
returns setof public.agency_client_activity language sql stable security invoker set search_path='' as $$
 with entries as (
  select distinct on(a.origin_table,a.origin_id,a.event_key) a.* from public.agency_client_profiles requested
  join public.agency_client_profiles p on coalesce(p.merged_into,p.id)=coalesce(requested.merged_into,requested.id) and p.organisation_id=requested.organisation_id
  join public.agency_client_activity a on a.client_id=p.id and a.organisation_id=p.organisation_id
  where requested.id=p_client_id and (p_category is null or a.category=p_category)
  order by a.origin_table,a.origin_id,a.event_key,a.occurred_at desc,a.id desc
 ) select * from entries a where ((p_before_at is null and p_before_id is null) or(a.occurred_at,a.id)<(p_before_at,p_before_id))
 order by a.occurred_at desc,a.id desc limit greatest(1,least(coalesce(p_limit,51),101));
$$;
create or replace function public.agency_client_activity_latest(p_organisation_id uuid)
returns table(client_id uuid,last_activity_at timestamptz) language sql stable security invoker set search_path='' as $$
 select coalesce(p.merged_into,p.id),max(a.occurred_at) from public.agency_client_activity a join public.agency_client_profiles p on p.id=a.client_id and p.organisation_id=a.organisation_id
 where a.organisation_id=p_organisation_id and a.occurred_at<=now() group by coalesce(p.merged_into,p.id)
$$;

create or replace function public.marketing_audience_crm_members(p_org uuid,p_definition jsonb,p_subscription uuid default null)
returns table(contact_id uuid,name text,email text,phone text,role text,stage text,area text,owner_id uuid,last_contacted_at timestamptz,email_id uuid,whatsapp_id uuid,email_reason text,whatsapp_reason text,recent boolean)
language sql stable security invoker set search_path='' as $$
 with candidates as (
  select c.contact_id,coalesce(nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),'Unnamed contact') name,lower(trim(c.email)) email,
    public.client_normalize_phone(c.phone) phone,l.lead_id,
    lower(coalesce(nullif(l.lead_category,''),c.contact_type,'')) role,coalesce(l.stage,'') stage,
    coalesce(to_jsonb(l)->>'area_interest','') area,coalesce(l.assigned_user_id,l.assigned_agent_id,c.assigned_agent_id) owner_id,
    coalesce(lower(l.status),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') or coalesce(lower(l.stage),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') closed,
    em.id email_id,em.is_valid_email,coalesce(public.client_tags_for_contact(c.organisation_id,c.contact_id),em.tags,'{}') tags,l.budget,
    wm.id whatsapp_id,wm.consent_status wa_consent,wm.opted_out_at,wm.consent_at,
    pref.marketing_consent_status email_consent,pref.unsubscribed_at,
    exists(select 1 from public.email_suppressions s where s.organisation_id=p_org and s.email=lower(trim(c.email))) suppressed,
    exists(select 1 from public.contact_email_subscriptions s join public.email_subscription_types t on t.id=s.subscription_type_id and t.organisation_id=s.organisation_id and t.is_active where s.organisation_id=p_org and s.email=lower(trim(c.email)) and s.subscription_type_id=p_subscription and s.status='subscribed') subscribed,
    greatest(
      public.client_contacted_at(c.organisation_id,c.contact_id),
      (select max(a.activity_date) from public.lead_activities a join public.leads al on al.lead_id=a.lead_id and al.organisation_id=a.organisation_id where a.organisation_id=p_org and al.contact_id=c.contact_id and arch9_client_private.source_visible(p_org,'lead',al.lead_id) and a.activity_date<=now() and lower(a.activity_type) in ('call','phone call','email','whatsapp','meeting','viewing') and lower(a.outcome) in ('contacted','connected','sent','delivered','completed','replied')),
      (select max(r.sent_at) from public.email_campaign_recipients r where r.organisation_id=p_org and r.sent_at<=now() and r.email=lower(trim(c.email))),
      (select max(r.sent_at) from public.whatsapp_campaign_recipients r where r.organisation_id=p_org and r.sent_at<=now() and public.client_normalize_phone(r.phone)=public.client_normalize_phone(c.phone))
    ) direct_last_contacted_at,
    to_jsonb(array_remove(array[lower(c.contact_type),lower(l.lead_category)],null)) roles
  from public.contacts c left join public.leads l on l.contact_id=c.contact_id and l.organisation_id=c.organisation_id and coalesce(l.lead_domain,'agency')='agency' and arch9_client_private.source_visible(p_org,'lead',l.lead_id)
  left join public.email_marketing_contacts em on em.organisation_id=c.organisation_id and em.email=lower(trim(c.email))
  left join public.contact_marketing_preferences pref on pref.organisation_id=c.organisation_id and pref.email=lower(trim(c.email))
  left join public.whatsapp_marketing_contacts wm on wm.organisation_id=c.organisation_id and wm.phone=public.client_normalize_phone(c.phone)
  where c.organisation_id=p_org and arch9_client_private.source_visible(p_org,'contact',c.contact_id) and auth.uid() is not null and public.bridge_is_active_member(p_org)
    and (not exists(select 1 from public.leads other where other.contact_id=c.contact_id and other.organisation_id=p_org and coalesce(other.lead_domain,'agency')<>'agency') or l.lead_id is not null)
 ), contacted as (
  select c.*,greatest(
    max(direct_last_contacted_at) over(partition by coalesce(nullif(email,''),contact_id::text)),
    max(direct_last_contacted_at) over(partition by coalesce(nullif(phone,''),contact_id::text))
  ) last_contacted_at from candidates c
 ), matched as (
  select distinct on(c.contact_id) c.* from contacted c
  where (not (p_definition->>'excludeClosed')::boolean or not c.closed)
    and public.marketing_audience_matches(jsonb_build_object('role',c.roles,'stage',c.stage,'area',array[c.area],'owner',c.owner_id,'tags',c.tags,'budget',c.budget),p_definition)
  order by c.contact_id,c.lead_id nulls last
 ), reasoned as (
  select m.*,
   case when not public.email_campaign_can_send(p_org) then 'Email sending access required'
     when nullif(m.email,'') is null then 'No email address'
     when m.email_id is null or not coalesce(m.is_valid_email,false) then 'Not a valid email marketing contact'
     when m.suppressed then 'Email suppressed'
     when m.email_consent is distinct from 'opted_in' or m.unsubscribed_at is not null then 'Email permission not recorded'
     when p_subscription is null then 'Choose an email subscription category'
     when not m.subscribed then 'Not subscribed to this category' else null end er,
   case when m.phone !~ '^[1-9][0-9]{7,14}$' then 'Use an international phone number'
     when m.whatsapp_id is null then 'Not a WhatsApp marketing contact'
     when m.wa_consent is distinct from 'opted_in' or m.opted_out_at is not null or m.consent_at is null or m.consent_at>now() then 'WhatsApp permission not recorded' else null end wr,
   m.last_contacted_at >= now()-make_interval(days=>case when (p_definition->>'quietDays')::integer=0 then 7 else (p_definition->>'quietDays')::integer end) recent
  from matched m
 )
 select r.contact_id,r.name,r.email,r.phone,r.role,r.stage,r.area,r.owner_id,r.last_contacted_at,r.email_id,r.whatsapp_id,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.er end,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.wr end,
   coalesce(r.recent,false)
 from reasoned r;
$$;

-- Request/clock latency within five minutes does not make fresh intake historical.
create or replace function arch9_client_private.client_attribution_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='leads' then
    perform arch9_client_private.capture_client_attribution(new.lead_id);
  elsif tg_table_name='agency_client_links' then
    if new.source_kind='lead' then
      perform arch9_client_private.capture_client_attribution(new.source_id,exists(select 1 from public.leads where lead_id=new.source_id and created_at<transaction_timestamp()-interval '5 minutes'));
    end if;
  elsif new.lead_id is not null then perform arch9_client_private.capture_client_attribution(new.lead_id); end if;
  return new;
end;
$$;
-- Existing messages/history are not backfilled by this migration.
commit;
