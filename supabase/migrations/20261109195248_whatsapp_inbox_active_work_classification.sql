begin;
-- Imported-only chats stay in History. Any live message returns them to work.
create index whatsapp_inbox_live_message_lookup on public.whatsapp_inbox_messages(conversation_id) where message_origin<>'history';
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
  context:=context||jsonb_build_object('canSend',public.whatsapp_staff_is_admin(p_org,p_actor) or coalesce((context->'conversation'->>'assigned_user_id')::uuid=p_actor,false));
 else
  select coalesce(jsonb_agg(c.id),'[]') into visible from public.whatsapp_inbox_conversations c join public.organisation_communication_channels s on s.id=c.channel_id
   where c.organisation_id=p_org and(admin or c.assigned_user_id=p_actor or(c.assigned_user_id is null and s.owner_user_id is null)) and c.id in(select value::uuid from jsonb_array_elements_text(p_known))
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
   where c.organisation_id=p_org and (p_channel is null or c.channel_id=p_channel) and(admin or c.assigned_user_id=p_actor or(c.assigned_user_id is null and s.owner_user_id is null))
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
   where c.organisation_id=p_org and(p_channel is null or c.channel_id=p_channel) and(admin or c.assigned_user_id=p_actor or(c.assigned_user_id is null and s.owner_user_id is null))
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

create or replace function public.whatsapp_workspace_command(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_fields jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin boolean; c public.whatsapp_inbox_conversations%rowtype; s public.organisation_communication_channels%rowtype; settings public.whatsapp_inbox_workspace_settings%rowtype; draft public.whatsapp_inbox_private_work%rowtype; notes jsonb; presence jsonb; target uuid; note public.whatsapp_inbox_notes%rowtype; at timestamptz;
begin
 admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
 if jsonb_typeof(p_fields)<>'object' or length(p_fields::text)>18000 then raise exception 'Inbox command is too large';end if;
 if p_action in ('settings','save_settings','availability','report','retry_receiving') then
  insert into public.whatsapp_inbox_workspace_settings(organisation_id) values(p_org) on conflict do nothing;
  select * into settings from public.whatsapp_inbox_workspace_settings where organisation_id=p_org for update;
  if p_action='retry_receiving' then
   if not admin then raise exception 'Agency management must retry receiving' using errcode='42501';end if;
   update public.notification_provider_webhook_events e set recovery_attempts=0,recovery_next_at=now() where provider='meta' and signature_verified and processing_status='failed' and(recovery_lease_until is null or recovery_lease_until<now()) and exists(select 1 from jsonb_array_elements(e.payload_json->'entry') en cross join lateral jsonb_array_elements(en->'changes') ch join public.organisation_communication_channels sender on sender.phone_number_id=ch->'value'->'metadata'->>'phone_number_id' where sender.organisation_id=p_org);
  elsif p_action='save_settings' then
   if not admin then raise exception 'Agency management must manage inbox settings' using errcode='42501';end if;
   if (p_fields->>'version')::integer is distinct from settings.version then raise exception 'Settings changed. Refresh first' using errcode='40001';end if;
   if length(p_fields::text)>18000 then raise exception 'Settings are too large';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(p_fields->'snippets','[]')) v where jsonb_typeof(v)<>'object' or coalesce(length(v->>'title'),0) not between 1 and 80 or coalesce(length(v->>'body'),0) not between 1 and 4096) then raise exception 'Invalid saved reply';end if;
   update public.whatsapp_inbox_workspace_settings set response_minutes=(p_fields->>'responseMinutes')::integer,auto_assign=coalesce((p_fields->>'autoAssign')::boolean,false),snippets=coalesce(p_fields->'snippets','[]'),retention_days=nullif(p_fields->>'retentionDays','')::integer,retention_review=left(coalesce(p_fields->>'retentionReview',''),1000),version=version+1,updated_at=now() where organisation_id=p_org returning * into settings;
  elsif p_action='availability' then
   at:=nullif(p_fields->>'awayUntil','')::timestamptz;
   if at>now()+interval '90 days' then raise exception 'Choose an absence within 90 days';end if;
   insert into public.whatsapp_inbox_agent_state(organisation_id,user_id,away_until,notify) values(p_org,p_actor,at,coalesce((p_fields->>'notify')::boolean,true)) on conflict(organisation_id,user_id) do update set away_until=excluded.away_until,notify=excluded.notify;
  end if;
  if p_action='report' then
   if not admin then raise exception 'Agency management must view inbox reports' using errcode='42501';end if;
   return(select jsonb_build_object('open',count(*) filter(where convo.status='open'),'unavailableOwner',count(*) filter(where convo.assigned_user_id is not null and not exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=convo.assigned_user_id and u.status='active')),'unassigned',count(*) filter(where convo.status='open' and convo.assigned_user_id is null),'overdue',count(*) filter(where convo.status='open' and convo.last_inbound_at>coalesce(convo.last_agent_reply_at,'-infinity') and convo.last_inbound_at<now()-make_interval(mins=>settings.response_minutes) and convo.work_state<>'waiting_on_client' and(convo.work_state<>'snoozed' or convo.snoozed_until<=now())), 'unknownSends',(select count(*) from public.whatsapp_inbox_messages where organisation_id=p_org and direction='outbound' and delivery_status in ('sending','unknown')), 'failedUpdates',(select count(*) from public.whatsapp_business_app_events where organisation_id=p_org and status='failed'),'receivingRecovery',(select count(*) from public.notification_provider_webhook_events e where e.provider='meta' and e.signature_verified and e.processing_status in ('received','failed') and exists(select 1 from jsonb_array_elements(e.payload_json->'entry') en cross join lateral jsonb_array_elements(en->'changes') ch join public.organisation_communication_channels sender on sender.phone_number_id=ch->'value'->'metadata'->>'phone_number_id' where sender.organisation_id=p_org))) from public.whatsapp_inbox_conversations convo where convo.organisation_id=p_org and not (convo.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=convo.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=convo.id and live.message_origin<>'history')));
  end if;
  return jsonb_build_object('settings',to_jsonb(settings),'availability',(select to_jsonb(a) from public.whatsapp_inbox_agent_state a where organisation_id=p_org and user_id=p_actor));
 end if;
 if p_action='create' then
  if coalesce(p_fields->>'phone','')!~'^[1-9][0-9]{6,14}$' then raise exception 'Enter an international phone number';end if;
  select * into s from public.organisation_communication_channels where id=(p_fields->>'senderId')::uuid and organisation_id=p_org and provider='meta' and channel_type='whatsapp' for update;
  if s.id is null or s.connection_status<>'connected' or(not admin and s.owner_user_id is not null and s.owner_user_id<>p_actor) then raise exception 'Choose an available business number' using errcode='42501';end if;
  if(select count(*) from public.whatsapp_inbox_conversations where organisation_id=p_org and assigned_by=p_actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Too many new conversations. Try again shortly';end if;
  insert into public.whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,contact_name,assigned_user_id,assigned_by) values(p_org,s.id,p_fields->>'phone',left(coalesce(p_fields->>'name',''),160),coalesce(s.owner_user_id,p_actor),p_actor) on conflict(channel_id,contact_phone) do nothing returning * into c;
  if c.id is not null then update public.whatsapp_inbox_conversations set assigned_user_id=coalesce(s.owner_user_id,p_actor),assigned_by=p_actor where id=c.id returning * into c;end if;
  if c.id is null then select * into c from public.whatsapp_inbox_conversations where channel_id=s.id and contact_phone=p_fields->>'phone';end if;
  if not public.whatsapp_workspace_visible(p_org,p_actor,c.id) then raise exception 'This contact is assigned to another agent. Ask management for a handover' using errcode='42501';end if;
  return jsonb_build_object('conversation',to_jsonb(c));
 end if;
 select ch.* into s from public.organisation_communication_channels ch join public.whatsapp_inbox_conversations t on t.channel_id=ch.id where t.id=p_conversation and t.organisation_id=p_org for share of ch;
 select * into c from public.whatsapp_inbox_conversations where id=p_conversation and organisation_id=p_org for update;
 if c.id is null or not public.whatsapp_workspace_visible(p_org,p_actor,c.id) then raise exception 'Conversation not found in your inbox' using errcode='42501';end if;
 if p_action='read' then
  select max(created_at) into at from public.whatsapp_inbox_messages where conversation_id=c.id and organisation_id=p_org and created_at<= (p_fields->>'through')::timestamptz;
  if at is not null then insert into public.whatsapp_inbox_reads(organisation_id,conversation_id,user_id,read_through) values(p_org,c.id,p_actor,at) on conflict(conversation_id,user_id) do update set read_through=greatest(whatsapp_inbox_reads.read_through,excluded.read_through),updated_at=case when excluded.read_through>whatsapp_inbox_reads.read_through then now() else whatsapp_inbox_reads.updated_at end;end if;
  if p_fields->>'notesThrough' is not null then
   select max(created_at) into at from public.whatsapp_inbox_notes where conversation_id=c.id and organisation_id=p_org and created_at<=(p_fields->>'notesThrough')::timestamptz;
   if at is not null then insert into public.whatsapp_inbox_reads(organisation_id,conversation_id,user_id,read_through,notes_read_through) values(p_org,c.id,p_actor,'-infinity',at) on conflict(conversation_id,user_id) do update set notes_read_through=greatest(whatsapp_inbox_reads.notes_read_through,excluded.notes_read_through),updated_at=case when excluded.notes_read_through>coalesce(whatsapp_inbox_reads.notes_read_through,'-infinity') then now() else whatsapp_inbox_reads.updated_at end;end if;
  end if;
 elsif p_action='take' then
  if s.owner_user_id is not null or c.assigned_user_id is not null or (p_fields->>'assignmentVersion')::integer is distinct from c.assignment_version then raise exception 'Conversation ownership changed. Refresh the queue' using errcode='40001';end if;
  update public.whatsapp_inbox_conversations set assigned_user_id=p_actor,assigned_by=p_actor,updated_at=now() where id=c.id;
 elsif p_action in ('state','note','draft','presence','review_send') then
  if not admin and c.assigned_user_id is distinct from p_actor then raise exception 'Assign this conversation to yourself first' using errcode='42501';end if;
  if p_action='review_send' then
   if (p_fields->>'confirmed')::boolean is distinct from true or (p_fields->>'assignmentVersion')::integer is distinct from c.assignment_version then raise exception 'Review the unconfirmed delivery and refresh ownership first';end if;
   update public.whatsapp_inbox_messages set reviewed_at=now(),reviewed_by=p_actor where id=(p_fields->>'messageId')::uuid and organisation_id=p_org and conversation_id=c.id and request_json ? 'kind' and delivery_status in ('sending','unknown') and created_at<now()-interval '90 seconds' and(admin or created_by=p_actor);
   if not found then raise exception 'This attempt is still active or cannot be reviewed by you';end if;
  elsif p_action='state' then
   if (p_fields->>'assignmentVersion')::integer is distinct from c.assignment_version then raise exception 'Assignment changed. Refresh first' using errcode='40001';end if;
   if p_fields->>'state' not in ('active','waiting_on_client','snoozed') then raise exception 'Choose a valid work state';end if;
   at:=nullif(p_fields->>'until','')::timestamptz;
   if p_fields->>'state'='snoozed' and(at is null or at<=now() or at>now()+interval '90 days') then raise exception 'Choose a future follow-up within 90 days';end if;
   update public.whatsapp_inbox_conversations set work_state=p_fields->>'state',snoozed_until=at,updated_at=now() where id=c.id;
  elsif p_action='note' then
   if length(trim(coalesce(p_fields->>'body',''))) not between 1 and 4000 then raise exception 'Write an internal note of up to 4,000 characters';end if;
   if jsonb_array_length(coalesce(p_fields->'mentions','[]'))>20 then raise exception 'Mention up to 20 authorised teammates';end if;
   for target in select value::uuid from jsonb_array_elements_text(coalesce(p_fields->'mentions','[]')) loop
    perform public.whatsapp_staff_is_admin(p_org,target);
    if not public.whatsapp_workspace_visible(p_org,target,c.id) then raise exception 'Mentioned person cannot access this conversation';end if;
   end loop;
   insert into public.whatsapp_inbox_notes(id,organisation_id,conversation_id,created_by,body,mentions) values((p_fields->>'requestId')::uuid,p_org,c.id,p_actor,trim(p_fields->>'body'),array(select value::uuid from jsonb_array_elements_text(coalesce(p_fields->'mentions','[]')))) on conflict(id) do nothing;
   select * into note from public.whatsapp_inbox_notes where id=(p_fields->>'requestId')::uuid;
   if note.organisation_id<>p_org or note.conversation_id<>c.id or note.created_by<>p_actor or note.body<>trim(p_fields->>'body') then raise exception 'Note request already used';end if;
  elsif p_action='draft' then
   select * into draft from public.whatsapp_inbox_private_work where conversation_id=c.id and user_id=p_actor;
   if coalesce(draft.version,0) is distinct from coalesce((p_fields->>'version')::integer,0) then raise exception 'Draft changed in another tab. Reload before saving' using errcode='40001';end if;
   insert into public.whatsapp_inbox_private_work(organisation_id,conversation_id,user_id,body) values(p_org,c.id,p_actor,coalesce(p_fields->>'body','')) on conflict(conversation_id,user_id) do update set body=excluded.body,version=whatsapp_inbox_private_work.version+1,expires_at=now()+interval '30 days',updated_at=now();
  else
   insert into public.whatsapp_inbox_presence values(p_org,c.id,p_actor,coalesce((p_fields->>'composing')::boolean,false),now()+interval '35 seconds') on conflict(conversation_id,user_id) do update set composing=excluded.composing,expires_at=excluded.expires_at;
  end if;
 elsif p_action<>'work' then raise exception 'Unknown inbox command';end if;
 select * into draft from public.whatsapp_inbox_private_work where conversation_id=c.id and user_id=p_actor and expires_at>now();
 select coalesce(jsonb_agg(to_jsonb(n)),'[]') into notes from(select n.id,n.body,n.mentions,n.created_by,n.created_at from public.whatsapp_inbox_notes n where conversation_id=c.id and organisation_id=p_org and(p_action='note' or coalesce((p_fields->>'includeNotes')::boolean,false)) and(p_fields->>'beforeNotesAt' is null or(n.created_at,n.id)<((p_fields->>'beforeNotesAt')::timestamptz,(p_fields->>'beforeNotesId')::uuid)) order by created_at desc,id desc limit 21)n;
 select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'name',trim(concat_ws(' ',u.first_name,u.last_name)),'composing',p.composing)),'[]') into presence from public.whatsapp_inbox_presence p join public.organisation_users u on u.organisation_id=p_org and u.user_id=p.user_id and u.status='active' where p.conversation_id=c.id and p.user_id<>p_actor and p.expires_at>now();
 return jsonb_build_object('draft',to_jsonb(draft),'notes',case when jsonb_array_length(notes)>20 then notes-20 else notes end,'notesNextCursor',case when jsonb_array_length(notes)>20 then jsonb_build_object('at',notes->19->'created_at','id',notes->19->'id') else null end,'presence',presence,'snippets',coalesce((select snippets from public.whatsapp_inbox_workspace_settings where organisation_id=p_org),'[]'));
end; $$;

-- Routing is opt-in and applies only to new shared-number conversations.
-- Route only after a live message exists; imported history must not assign work.
create or replace function public.whatsapp_workspace_route() returns trigger language plpgsql security invoker set search_path='' as $$
declare target uuid; thread public.whatsapp_inbox_conversations%rowtype;
begin
 if new.message_origin='history' or not exists(select 1 from public.whatsapp_inbox_workspace_settings where organisation_id=new.organisation_id and auto_assign) then return new;end if;
 select * into thread from public.whatsapp_inbox_conversations where id=new.conversation_id and organisation_id=new.organisation_id for update;
 if thread.id is null or thread.assigned_user_id is not null or exists(select 1 from public.organisation_communication_channels where id=thread.channel_id and owner_user_id is not null) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text,0));
 select m.user_id into target from public.organisation_users m
 left join public.whatsapp_inbox_agent_state a on a.organisation_id=m.organisation_id and a.user_id=m.user_id
 where m.organisation_id=new.organisation_id and m.status='active' and m.role in ('agent','senior_agent','manager','branch_manager','broker','assistant')
 and(a.away_until is null or a.away_until<=now())
 order by(select count(*) from public.whatsapp_inbox_conversations c where c.organisation_id=new.organisation_id and c.assigned_user_id=m.user_id and c.status='open' and not (c.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=c.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=c.id and live.message_origin<>'history'))),m.user_id limit 1;
 if target is not null then update public.whatsapp_inbox_conversations set assigned_user_id=target,assigned_by=null,updated_at=now() where id=thread.id;end if;
 return new;
end; $$;
drop trigger whatsapp_workspace_route on public.whatsapp_inbox_conversations;
create trigger whatsapp_workspace_route after insert or update of message_origin on public.whatsapp_inbox_messages for each row execute function public.whatsapp_workspace_route();
commit;
