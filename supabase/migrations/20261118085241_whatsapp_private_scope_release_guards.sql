begin;
-- Preserve other communication channels under the WhatsApp-only restriction.
alter policy whatsapp_owned_sender_visibility on public.organisation_communication_channels
using (provider is distinct from 'meta' or channel_type is distinct from 'whatsapp'
  or public.whatsapp_sender_access_check(organisation_id,auth.uid(),id,'view'));

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
   where g.organisation_id=p_org and g.channel_id=p_sender and exists(select 1 from public.organisation_communication_channels scope_sender where scope_sender.id=p_sender and scope_sender.whatsapp_access_scope='selected')
    and (g.member_user_id=p_actor or (g.team_id is not null and u.team_id=g.team_id))
    and (p_permission='view' or (p_permission='reply' and g.access_role='responder'))
  )
 end;
$$;

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
 for row in select value from jsonb_array_elements(case when scope='private' then '[]'::jsonb else coalesce(p_fields->'grants','[]') end) loop
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

-- A shared personal number can be assigned to a responder the owner selected.
-- Assignment remains independent of read access and never grants campaign use.
create or replace function public.whatsapp_personal_number_assignment_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.assigned_user_id is not null and not public.whatsapp_sender_access_check(new.organisation_id,new.assigned_user_id,new.channel_id,'reply') then
  raise exception 'The selected agent needs reply access to this WhatsApp number' using errcode='42501';
 end if;
 return new;
end; $$;

create or replace function public.whatsapp_workspace_command_internal(p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_fields jsonb default '{}')
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
   update public.notification_provider_webhook_events e set recovery_attempts=0,recovery_next_at=now() where provider='meta' and signature_verified and processing_status='failed' and(recovery_lease_until is null or recovery_lease_until<now()) and exists(select 1 from jsonb_array_elements(e.payload_json->'entry') en cross join lateral jsonb_array_elements(en->'changes') ch join public.organisation_communication_channels sender on sender.phone_number_id=ch->'value'->'metadata'->>'phone_number_id' where sender.organisation_id=p_org and (sender.owner_user_id is null or sender.owner_user_id=p_actor));
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
   return(select jsonb_build_object('open',count(*) filter(where convo.status='open'),'unavailableOwner',count(*) filter(where convo.assigned_user_id is not null and not exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=convo.assigned_user_id and u.status='active')),'unassigned',count(*) filter(where convo.status='open' and convo.assigned_user_id is null),'overdue',count(*) filter(where convo.status='open' and convo.last_inbound_at>coalesce(convo.last_agent_reply_at,'-infinity') and convo.last_inbound_at<now()-make_interval(mins=>settings.response_minutes) and convo.work_state<>'waiting_on_client' and(convo.work_state<>'snoozed' or convo.snoozed_until<=now())), 'unknownSends',(select count(*) from public.whatsapp_inbox_messages where organisation_id=p_org and public.whatsapp_workspace_visible(p_org,p_actor,conversation_id) and direction='outbound' and delivery_status in ('sending','unknown')), 'failedUpdates',(select count(*) from public.whatsapp_business_app_events where organisation_id=p_org and exists(select 1 from public.organisation_communication_channels visible_sender where visible_sender.id=channel_id and (visible_sender.owner_user_id is null or visible_sender.owner_user_id=p_actor)) and status='failed'),'receivingRecovery',(select count(*) from public.notification_provider_webhook_events e where e.provider='meta' and e.signature_verified and e.processing_status in ('received','failed') and exists(select 1 from jsonb_array_elements(e.payload_json->'entry') en cross join lateral jsonb_array_elements(en->'changes') ch join public.organisation_communication_channels sender on sender.phone_number_id=ch->'value'->'metadata'->>'phone_number_id' where sender.organisation_id=p_org and (sender.owner_user_id is null or sender.owner_user_id=p_actor)))) from public.whatsapp_inbox_conversations convo where convo.organisation_id=p_org and public.whatsapp_workspace_visible(p_org,p_actor,convo.id) and not (convo.last_inbound_at is null and exists(select 1 from public.whatsapp_inbox_messages h where h.conversation_id=convo.id and h.message_origin='history') and not exists(select 1 from public.whatsapp_inbox_messages live where live.conversation_id=convo.id and live.message_origin<>'history')));
  end if;
  return jsonb_build_object('settings',to_jsonb(settings),'availability',(select to_jsonb(a) from public.whatsapp_inbox_agent_state a where organisation_id=p_org and user_id=p_actor));
 end if;
 if p_action='create' then
  if coalesce(p_fields->>'phone','')!~'^[1-9][0-9]{6,14}$' then raise exception 'Enter an international phone number';end if;
  select * into s from public.organisation_communication_channels where id=(p_fields->>'senderId')::uuid and organisation_id=p_org and provider='meta' and channel_type='whatsapp' for update;
  if s.id is null or s.connection_status<>'connected' or not public.whatsapp_sender_access_check(p_org,p_actor,s.id,'reply') then raise exception 'Choose an available business number' using errcode='42501';end if;
  if(select count(*) from public.whatsapp_inbox_conversations where organisation_id=p_org and assigned_by=p_actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Too many new conversations. Try again shortly';end if;
  insert into public.whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,contact_name,assigned_user_id,assigned_by) values(p_org,s.id,p_fields->>'phone',left(coalesce(p_fields->>'name',''),160),p_actor,p_actor) on conflict(channel_id,contact_phone) do nothing returning * into c;
  if c.id is not null then update public.whatsapp_inbox_conversations set assigned_user_id=p_actor,assigned_by=p_actor where id=c.id returning * into c;end if;
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
commit;
