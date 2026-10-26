begin;
alter table public.revo_inbox_messages add column reply_to_addresses text[] not null default '{}';
alter table public.revo_inbox_messages drop constraint revo_inbox_messages_delivery_status_check;
alter table public.revo_inbox_messages add constraint revo_inbox_messages_delivery_status_check check(delivery_status in('queued','sending','sent','delivered','read','received','failed','uncertain','cancelled'));
alter table public.revo_inbox_provider_connections add constraint shared_inbox_connection_sending_identity unique(id,channel_id,organisation_id);
create table public.shared_inbox_outbox (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null,channel_id uuid not null,connection_id uuid not null,
 conversation_id uuid not null,message_id uuid not null,requested_by uuid not null references public.profiles(id),request_id uuid not null,
 status text not null default 'queued' check(status in('queued','preparing','submitting','accepted','failed','uncertain','cancelled')),
 subject text not null,payload_json jsonb not null,rendered_json jsonb not null,lease_token uuid,locked_until timestamptz,
 attempt_count integer not null default 0,error_code text,provider_message_id text,rejected_count integer not null default 0,rejected_addresses text[] not null default '{}',
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(requested_by,request_id),
 foreign key(connection_id,channel_id,organisation_id) references public.revo_inbox_provider_connections(id,channel_id,organisation_id),
 foreign key(message_id,conversation_id,channel_id,organisation_id) references public.revo_inbox_messages(id,conversation_id,channel_id,organisation_id)
);
create index shared_inbox_outbox_ready_idx on public.shared_inbox_outbox(created_at,id) where status in('queued','preparing','submitting');
create index shared_inbox_outbox_mailbox_idx on public.shared_inbox_outbox(organisation_id,channel_id,created_at desc);
alter table public.shared_inbox_outbox enable row level security;
revoke all on public.shared_inbox_outbox from public,anon,authenticated;
grant select(id,organisation_id,channel_id,connection_id,conversation_id,message_id,requested_by,request_id,status,subject,created_at,completed_at,error_code,rejected_count,rejected_addresses) on public.shared_inbox_outbox to authenticated;
grant all on public.shared_inbox_outbox to service_role;
create policy shared_inbox_outbox_read on public.shared_inbox_outbox for select to authenticated using(
 private.shared_inbox_can_access(organisation_id,channel_id,'read') and (requested_by=(select auth.uid()) or private.shared_inbox_can_access(organisation_id,channel_id,'manage')));
create table private.shared_inbox_smtp_credentials(connection_id uuid primary key references public.revo_inbox_provider_connections(id) on delete cascade,vault_secret_id uuid not null,configured_by uuid not null references public.profiles(id));
create table private.shared_inbox_outgoing_files(id uuid primary key,organisation_id uuid not null,channel_id uuid not null,uploaded_by uuid not null references public.profiles(id),
 filename text not null,byte_size integer not null check(byte_size between 0 and 10485760),object_path text not null,outbox_id uuid references public.shared_inbox_outbox(id),created_at timestamptz not null default now(),
 foreign key(channel_id,organisation_id) references public.revo_inbox_channels(id,organisation_id));
revoke all on private.shared_inbox_smtp_credentials,private.shared_inbox_outgoing_files from public,anon,authenticated;
grant all on private.shared_inbox_smtp_credentials,private.shared_inbox_outgoing_files to service_role;
-- Clear the independent SMTP secret along with the receiving credential on disconnect.
create function private.shared_inbox_clear_smtp_on_disconnect() returns trigger language plpgsql security definer set search_path='' as $$
declare k uuid;
begin
 if new.status='disconnected' then
  select vault_secret_id into k from private.shared_inbox_smtp_credentials where connection_id=new.id;
  if k is not null then perform vault.update_secret(k,'{"revoked":true}','inbox_smtp_'||new.id::text,'Disconnected SMTP credential'); end if;
  delete from private.shared_inbox_smtp_credentials where connection_id=new.id;
 end if;
 return new;
end;$$;
revoke all on function private.shared_inbox_clear_smtp_on_disconnect() from public,anon,authenticated;
create trigger shared_inbox_clear_smtp_on_disconnect after update of status on public.revo_inbox_provider_connections for each row execute function private.shared_inbox_clear_smtp_on_disconnect();
create function private.shared_inbox_assert_outgoing(p_job uuid,p_token uuid) returns public.shared_inbox_outbox language plpgsql security definer set search_path='' as $$
declare j public.shared_inbox_outbox%rowtype;c public.revo_inbox_provider_connections%rowtype;
begin
 select * into j from public.shared_inbox_outbox where id=p_job;
 if not found then raise exception 'outgoing_lease_lost'; end if;
 c:=private.shared_inbox_assert_lease(j.connection_id,p_token);
 select * into j from public.shared_inbox_outbox where id=p_job for update;
 if j.status<>'preparing' or j.lease_token is distinct from p_token or j.locked_until<=clock_timestamp() or not private.shared_inbox_permission_for_user(j.organisation_id,j.channel_id,j.requested_by,'send')
 or (c.provider_key='other_email' and not exists(select 1 from private.shared_inbox_smtp_credentials sc where sc.connection_id=c.id and private.shared_inbox_permission_for_user(j.organisation_id,j.channel_id,sc.configured_by,'manage')))
 or exists(select 1 from public.revo_inbox_channels where id=j.channel_id and (connection_status='paused' or lower(address)<>lower(c.mailbox_address))) then raise exception 'outgoing_lease_lost'; end if;
 return j;
end;$$;
revoke all on function private.shared_inbox_assert_outgoing(uuid,uuid) from public,anon,authenticated;
create function private.shared_inbox_configure_smtp(p_org uuid,p_channel uuid,p_actor uuid,p_secret jsonb) returns boolean language plpgsql  security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;k uuid;
begin
 select * into c from public.revo_inbox_provider_connections where organisation_id=p_org and channel_id=p_channel for update;
 if not found or c.provider_key<>'other_email' or c.status<>'connected' or not private.shared_inbox_permission_for_user(p_org,p_channel,p_actor,'manage') then raise exception 'Connected mailbox management access is required'; end if;
 if coalesce(p_secret->>'host','') !~ '^[a-zA-Z0-9][a-zA-Z0-9.-]{1,250}\.[a-zA-Z]{2,}$' or coalesce(p_secret->>'port','') not in('465','587') or length(coalesce(p_secret->>'username','')) not between 1 and 500 or length(coalesce(p_secret->>'password','')) not between 1 and 2000 then raise exception 'Invalid secure SMTP settings'; end if;
 if exists(select 1 from public.shared_inbox_outbox where connection_id=c.id and status in('preparing','submitting') and locked_until>clock_timestamp()) then raise exception 'Wait for this mailbox to finish sending before changing SMTP settings'; end if;
 select vault_secret_id into k from private.shared_inbox_smtp_credentials where connection_id=c.id;
 if k is null then
  k:=vault.create_secret(p_secret::text,'inbox_smtp_'||c.id::text,'Server-only SMTP credential');
  insert into private.shared_inbox_smtp_credentials values(c.id,k,p_actor);
 else
  perform vault.update_secret(k,p_secret::text,'inbox_smtp_'||c.id::text,'Server-only SMTP credential');
  update private.shared_inbox_smtp_credentials set configured_by=p_actor where connection_id=c.id;
 end if;
 return true;
end;
$$;
revoke all on function private.shared_inbox_configure_smtp(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_configure_smtp(uuid,uuid,uuid,jsonb) to service_role;
create function public.shared_inbox_configure_smtp(p_org uuid,p_channel uuid,p_actor uuid,p_secret jsonb) returns boolean language sql  security invoker set search_path='' as $$select private.shared_inbox_configure_smtp(p_org,p_channel,p_actor,p_secret);$$;
revoke all on function public.shared_inbox_configure_smtp(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_configure_smtp(uuid,uuid,uuid,jsonb) to service_role;

create function private.shared_inbox_sending_mailboxes(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'address',ch.address,'displayName',ch.display_name,'providerKey',ch.provider_key,
 'connected',c.status='connected' and ch.connection_status<>'paused','smtpConfigured',exists(select 1 from private.shared_inbox_smtp_credentials sc where sc.connection_id=c.id and private.shared_inbox_permission_for_user(ch.organisation_id,ch.id,sc.configured_by,'manage')),
 'signature',coalesce(s.signature_json,'{}'::jsonb),'signatureRevision',coalesce(s.revision,0),'useForNew',coalesce(s.use_for_new,false),'useForReplies',coalesce(s.use_for_replies,false)) order by ch.is_default desc,ch.created_at,ch.id)
 from public.revo_inbox_channels ch left join public.revo_inbox_provider_connections c on c.channel_id=ch.id and c.organisation_id=ch.organisation_id
 left join public.shared_inbox_mailbox_signatures s on s.channel_id=ch.id and s.organisation_id=ch.organisation_id
 where ch.organisation_id=p_org and ch.channel='email' and private.shared_inbox_can_access(p_org,ch.id,'send')),'[]'::jsonb);
end;
$$;
revoke all on function private.shared_inbox_sending_mailboxes(uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_sending_mailboxes(uuid) to authenticated;
create function public.shared_inbox_sending_mailboxes(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.shared_inbox_sending_mailboxes(p_org);$$;
revoke all on function public.shared_inbox_sending_mailboxes(uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_sending_mailboxes(uuid) to authenticated;

create function private.shared_inbox_register_outgoing_file(p_org uuid,p_channel uuid,p_actor uuid,p_id uuid,p_filename text,p_size integer,p_path text) returns boolean language plpgsql  security definer set search_path='' as $$
begin
 if not private.shared_inbox_permission_for_user(p_org,p_channel,p_actor,'send') then raise exception 'Mailbox send access is required'; end if;
 if p_path<>p_org::text||'/'||p_channel::text||'/outgoing/'||p_id::text or length(p_filename) not between 1 and 500 then raise exception 'Invalid attachment'; end if;
 insert into private.shared_inbox_outgoing_files(id,organisation_id,channel_id,uploaded_by,filename,byte_size,object_path) values(p_id,p_org,p_channel,p_actor,p_filename,p_size,p_path);
 return true;
end;
$$;
revoke all on function private.shared_inbox_register_outgoing_file(uuid,uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function private.shared_inbox_register_outgoing_file(uuid,uuid,uuid,uuid,text,integer,text) to service_role;
create function public.shared_inbox_register_outgoing_file(p_org uuid,p_channel uuid,p_actor uuid,p_id uuid,p_filename text,p_size integer,p_path text) returns boolean language sql  security invoker set search_path='' as $$select private.shared_inbox_register_outgoing_file(p_org,p_channel,p_actor,p_id,p_filename,p_size,p_path);$$;
revoke all on function public.shared_inbox_register_outgoing_file(uuid,uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.shared_inbox_register_outgoing_file(uuid,uuid,uuid,uuid,text,integer,text) to service_role;

create function private.shared_inbox_queue_email(p_org uuid,p_channel uuid,p_actor uuid,p_request uuid,p_payload jsonb,p_rendered jsonb) returns jsonb language plpgsql  security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;ch public.revo_inbox_channels%rowtype;j public.shared_inbox_outbox%rowtype;
 conv uuid;mid uuid:=gen_random_uuid();jid uuid:=gen_random_uuid();parent public.revo_inbox_messages%rowtype;f record;n integer;bytes bigint;refs text[];rfc text;expected_revision integer;
begin
 select * into c from public.revo_inbox_provider_connections where organisation_id=p_org and channel_id=p_channel for update;
 if not found or not private.shared_inbox_permission_for_user(p_org,p_channel,p_actor,'send') then raise exception 'Mailbox send access is required'; end if;
 select * into j from public.shared_inbox_outbox where requested_by=p_actor and request_id=p_request;
 if found then
  if j.organisation_id<>p_org or j.channel_id<>p_channel or j.payload_json<>p_payload then raise exception 'This email request already has different content'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'conversationId',j.conversation_id);
 end if;
 select * into ch from public.revo_inbox_channels where id=p_channel and organisation_id=p_org;
 if c.status<>'connected' or ch.channel<>'email' or ch.connection_status='paused' or lower(c.mailbox_address)<>lower(ch.address) then raise exception 'Connect this mailbox before sending'; end if;
 if not private.shared_inbox_permission_for_user(p_org,p_channel,c.connected_by,'manage') then raise exception 'Reconnect this mailbox with a current manager'; end if;
 if c.provider_key='other_email' and not exists(select 1 from private.shared_inbox_smtp_credentials sc where sc.connection_id=c.id and private.shared_inbox_permission_for_user(p_org,p_channel,sc.configured_by,'manage')) then raise exception 'Configure SMTP before sending'; end if;
 if jsonb_typeof(p_payload)<>'object' or jsonb_array_length(p_payload->'to') not between 1 and 50 or length(coalesce(p_payload->>'subject','')) not between 1 and 500
  or length(btrim(coalesce(p_payload->>'body','')))=0 or octet_length(coalesce(p_rendered->>'text',''))>524288 or octet_length(coalesce(p_rendered->>'html',''))>524288 then raise exception 'Invalid email content'; end if;
 if (p_payload->>'useSignature')::boolean then
  select coalesce(max(revision),0) into expected_revision from public.shared_inbox_mailbox_signatures where channel_id=p_channel and organisation_id=p_org;
  if expected_revision<>coalesce((p_payload->>'signatureRevision')::integer,0) then raise exception 'Signature changed. Reload the composer before sending'; end if;
 end if;
 conv:=nullif(p_payload->>'conversationId','')::uuid;
 if conv is not null then
  if not exists(select 1 from public.revo_inbox_conversations where id=conv and channel_id=p_channel and organisation_id=p_org) then raise exception 'Replies must use the original mailbox'; end if;
  select * into parent from public.revo_inbox_messages where conversation_id=conv and direction in('inbound','outbound') and (direction='inbound' or delivery_status in('sent','delivered','read')) and message_type='message' and (nullif(p_payload->>'replyMessageId','') is null or id=(p_payload->>'replyMessageId')::uuid) order by occurred_at desc,id desc limit 1;
  if nullif(p_payload->>'replyMessageId','') is not null and parent.id is null then raise exception 'Reply message is no longer available'; end if;
  refs:=(coalesce(parent.reference_ids,'{}')||array[parent.internet_message_id]);
 else
  insert into public.revo_inbox_conversations(organisation_id,channel_id,provider_key,contact_address,subject,last_message_at,last_message_preview,created_by)
   values(p_org,p_channel,c.provider_key,p_payload->'to'->>0,p_payload->>'subject',clock_timestamp(),'Email queued',p_actor) returning id into conv;
 end if;
 rfc:='<arch9-'||jid::text||'@'||split_part(ch.address,'@',2)||'>';
 insert into public.revo_inbox_messages(id,organisation_id,conversation_id,channel_id,channel,direction,message_type,provider_key,sender_address,recipient_addresses,subject,body_text,body_html,delivery_status,created_by,internet_message_id,in_reply_to,reference_ids,provider_thread_id,content_status,metadata_json)
 values(mid,p_org,conv,p_channel,'email','outbound','message',c.provider_key,ch.address,array(select jsonb_array_elements_text((p_payload->'to')||(p_payload->'cc'))),p_payload->>'subject',p_rendered->>'text',p_rendered->>'html','queued',p_actor,rfc,parent.internet_message_id,array_remove(coalesce(refs,'{}'),null),case when lower(regexp_replace(coalesce(parent.subject,''),'^(re:\s*)+','','i'))=lower(regexp_replace(p_payload->>'subject','^(re:\s*)+','','i')) then parent.provider_thread_id end,'complete',jsonb_build_object('outboxId',jid));
 insert into public.shared_inbox_outbox(id,organisation_id,channel_id,connection_id,conversation_id,message_id,requested_by,request_id,subject,payload_json,rendered_json)
 values(jid,p_org,p_channel,c.id,conv,mid,p_actor,p_request,p_payload->>'subject',p_payload,p_rendered);
 select count(*),coalesce(sum(byte_size),0) into n,bytes from private.shared_inbox_outgoing_files where id in(select jsonb_array_elements_text(p_payload->'attachmentIds')::uuid)
  and organisation_id=p_org and channel_id=p_channel and uploaded_by=p_actor and outbox_id is null;
 if n<>jsonb_array_length(p_payload->'attachmentIds') or n>10 or bytes>20971520 or (c.provider_key='microsoft_365' and bytes>2097152) then raise exception 'Attachments are unavailable or exceed the email limit'; end if;
 for f in select * from private.shared_inbox_outgoing_files where id in(select jsonb_array_elements_text(p_payload->'attachmentIds')::uuid) for update loop
  update private.shared_inbox_outgoing_files set outbox_id=jid where id=f.id and outbox_id is null;
  if not found then raise exception 'Attachment already used'; end if;
  insert into public.shared_inbox_attachments(organisation_id,channel_id,conversation_id,message_id,provider_attachment_id,filename,content_type,byte_size,state,object_path)
   values(p_org,p_channel,conv,mid,f.id::text,f.filename,'application/octet-stream',f.byte_size,'available',f.object_path);
 end loop;
 -- Persist RFC aliases before a fast self-reply can be imported by receiving.
 insert into private.shared_inbox_thread_keys(organisation_id,channel_id,provider_key,thread_key,conversation_id) values(p_org,p_channel,c.provider_key,'rfc:'||rfc,conv) on conflict do nothing;
 return jsonb_build_object('id',jid,'status','queued','conversationId',conv);
end;
$$;
revoke all on function private.shared_inbox_queue_email(uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_queue_email(uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;
create function public.shared_inbox_queue_email(p_org uuid,p_channel uuid,p_actor uuid,p_request uuid,p_payload jsonb,p_rendered jsonb) returns jsonb language sql  security invoker set search_path='' as $$select private.shared_inbox_queue_email(p_org,p_channel,p_actor,p_request,p_payload,p_rendered);$$;
revoke all on function public.shared_inbox_queue_email(uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_queue_email(uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;

create function private.shared_inbox_outgoing(p_org uuid,p_request uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',id,'requestId',request_id,'channelId',channel_id,'conversationId',conversation_id,'subject',subject,'status',status,'errorCode',error_code,'rejectedCount',rejected_count,'rejectedAddresses',rejected_addresses,'createdAt',created_at) order by created_at desc,id desc),'[]'::jsonb)
from (select id,request_id,channel_id,conversation_id,subject,status,error_code,rejected_count,rejected_addresses,created_at from public.shared_inbox_outbox where organisation_id=p_org and (p_request is null or request_id=p_request) order by created_at desc,id desc limit 50) rows;
$$;
revoke all on function private.shared_inbox_outgoing(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_outgoing(uuid,uuid) to authenticated;
create function public.shared_inbox_outgoing(p_org uuid,p_request uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select private.shared_inbox_outgoing(p_org,p_request);$$;
revoke all on function public.shared_inbox_outgoing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_outgoing(uuid,uuid) to authenticated;

create function private.shared_inbox_outgoing_action(p_org uuid,p_job uuid,p_action text) returns boolean language plpgsql  security definer set search_path='' as $$
declare j public.shared_inbox_outbox%rowtype;
begin
 select * into j from public.shared_inbox_outbox where id=p_job and organisation_id=p_org for update;
 if not found or not private.shared_inbox_can_access(p_org,j.channel_id,'send') or (j.requested_by<>auth.uid() and not private.shared_inbox_can_access(p_org,j.channel_id,'manage')) then raise exception 'Mailbox send access is required'; end if;
 if p_action='cancel' and j.status='queued' then
  update public.shared_inbox_outbox set status='cancelled',completed_at=clock_timestamp() where id=j.id;
  update public.revo_inbox_messages set delivery_status='cancelled' where id=j.message_id;
 elsif p_action='retry' and j.status='failed' then
  update public.shared_inbox_outbox set status='queued',completed_at=null,error_code=null where id=j.id;
  update public.revo_inbox_messages set delivery_status='queued' where id=j.message_id;
 else raise exception 'This email cannot be retried or cancelled in its current state'; end if;
 update public.revo_inbox_conversations set last_message_preview=case p_action when 'cancel' then 'Email cancelled' else 'Email queued' end where id=j.conversation_id and last_inbound_at is null and last_outbound_at is null;
 return true;
end;
$$;
revoke all on function private.shared_inbox_outgoing_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.shared_inbox_outgoing_action(uuid,uuid,text) to authenticated;
create function public.shared_inbox_outgoing_action(p_org uuid,p_job uuid,p_action text) returns boolean language sql  security invoker set search_path='' as $$select private.shared_inbox_outgoing_action(p_org,p_job,p_action);$$;
revoke all on function public.shared_inbox_outgoing_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.shared_inbox_outgoing_action(uuid,uuid,text) to authenticated;

create function private.shared_inbox_claim_outgoing() returns jsonb language plpgsql  security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;j public.shared_inbox_outbox%rowtype;t uuid:=gen_random_uuid();
begin
 select p.* into c from public.revo_inbox_provider_connections p where (p.sync_locked_until is null or p.sync_locked_until<=clock_timestamp())
 and exists(select 1 from public.shared_inbox_outbox o where o.connection_id=p.id and (o.status='queued' or(o.status in('preparing','submitting') and o.locked_until<=clock_timestamp())))
 order by (select min(o.created_at) from public.shared_inbox_outbox o where o.connection_id=p.id and o.status in('queued','preparing','submitting')) for update skip locked limit 1;
 if not found then return null; end if;
 select * into j from public.shared_inbox_outbox where connection_id=c.id and (status='queued' or(status in('preparing','submitting') and locked_until<=clock_timestamp())) order by created_at,id for update skip locked limit 1;
 if j.status='submitting' then
  update public.shared_inbox_outbox set status='uncertain',error_code='provider_confirmation_unknown',completed_at=clock_timestamp() where id=j.id;
  update public.revo_inbox_messages set delivery_status='uncertain' where id=j.message_id;
  return jsonb_build_object('recovered',true);
 end if;
 if c.status<>'connected' or not private.shared_inbox_permission_for_user(j.organisation_id,j.channel_id,j.requested_by,'send') or not private.shared_inbox_permission_for_user(j.organisation_id,j.channel_id,c.connected_by,'manage')
  or exists(select 1 from public.revo_inbox_channels where id=c.channel_id and connection_status='paused') then
  update public.shared_inbox_outbox set status='failed',error_code='mailbox_send_access_changed',completed_at=clock_timestamp() where id=j.id;
  update public.revo_inbox_messages set delivery_status='failed' where id=j.message_id;
  return jsonb_build_object('recovered',true);
 end if;
 update public.revo_inbox_provider_connections set sync_lease_token=t,sync_locked_until=clock_timestamp()+interval '180 seconds' where id=c.id;
 update public.shared_inbox_outbox set status='preparing',lease_token=t,locked_until=clock_timestamp()+interval '180 seconds',attempt_count=attempt_count+1 where id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'connection',to_jsonb(c),'token',t);
end;
$$;
revoke all on function private.shared_inbox_claim_outgoing() from public,anon,authenticated;
grant execute on function private.shared_inbox_claim_outgoing() to service_role;
create function public.shared_inbox_claim_outgoing() returns jsonb language sql  security invoker set search_path='' as $$select private.shared_inbox_claim_outgoing();$$;
revoke all on function public.shared_inbox_claim_outgoing() from public,anon,authenticated;
grant execute on function public.shared_inbox_claim_outgoing() to service_role;

create function private.shared_inbox_prepare_outgoing(p_job uuid,p_token uuid) returns jsonb language plpgsql  security definer set search_path='' as $$
declare j public.shared_inbox_outbox%rowtype;smtp jsonb;c public.revo_inbox_provider_connections%rowtype;
begin
 j:=private.shared_inbox_assert_outgoing(p_job,p_token);
 select * into c from public.revo_inbox_provider_connections where id=j.connection_id;
 if c.provider_key='other_email' then
  select v.decrypted_secret::jsonb into smtp from private.shared_inbox_smtp_credentials s join vault.decrypted_secrets v on v.id=s.vault_secret_id where s.connection_id=c.id and private.shared_inbox_permission_for_user(j.organisation_id,j.channel_id,s.configured_by,'manage');
  if smtp is null then raise exception 'smtp_not_configured'; end if;
 end if;
 update public.shared_inbox_outbox set locked_until=clock_timestamp()+interval '180 seconds' where id=j.id;
 update public.revo_inbox_provider_connections set sync_locked_until=clock_timestamp()+interval '180 seconds' where id=c.id;
 return jsonb_build_object('credential',case when c.provider_key<>'other_email' then public.revo_read_inbox_connection_credential(c.id) end,'smtp',smtp,
 'sender',c.mailbox_address,'message',(select jsonb_build_object('internetMessageId',internet_message_id,'inReplyTo',in_reply_to,'references',reference_ids,'threadId',provider_thread_id) from public.revo_inbox_messages where id=j.message_id),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('filename',filename,'path',object_path,'size',byte_size)) from private.shared_inbox_outgoing_files where outbox_id=j.id),'[]'::jsonb));
end;
$$;
revoke all on function private.shared_inbox_prepare_outgoing(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_prepare_outgoing(uuid,uuid) to service_role;
create function public.shared_inbox_prepare_outgoing(p_job uuid,p_token uuid) returns jsonb language sql  security invoker set search_path='' as $$select private.shared_inbox_prepare_outgoing(p_job,p_token);$$;
revoke all on function public.shared_inbox_prepare_outgoing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_prepare_outgoing(uuid,uuid) to service_role;

create function private.shared_inbox_begin_submission(p_job uuid,p_token uuid) returns boolean language plpgsql  security definer set search_path='' as $$
declare j public.shared_inbox_outbox%rowtype;
begin
 j:=private.shared_inbox_assert_outgoing(p_job,p_token);
 update public.shared_inbox_outbox set status='submitting',locked_until=clock_timestamp()+interval '180 seconds' where id=j.id;
 update public.revo_inbox_messages set delivery_status='sending' where id=j.message_id;
 return true;
end;
$$;
revoke all on function private.shared_inbox_begin_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_begin_submission(uuid,uuid) to service_role;
create function public.shared_inbox_begin_submission(p_job uuid,p_token uuid) returns boolean language sql  security invoker set search_path='' as $$select private.shared_inbox_begin_submission(p_job,p_token);$$;
revoke all on function public.shared_inbox_begin_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_begin_submission(uuid,uuid) to service_role;

create function private.shared_inbox_finish_outgoing(p_job uuid,p_token uuid,p_status text,p_provider_id text,p_thread_id text,p_error text,p_rejected integer,p_rejected_addresses text[] default '{}') returns boolean language plpgsql  security definer set search_path='' as $$
declare j public.shared_inbox_outbox%rowtype;d text;
begin
 -- Recording a known provider receipt remains possible after disconnect or lease
 -- expiry. That truth must not be lost merely because sending access changed.
 perform 1 from public.revo_inbox_provider_connections where id=(select connection_id from public.shared_inbox_outbox where id=p_job) for update;
 select * into j from public.shared_inbox_outbox where id=p_job for update;
 if not found or j.lease_token is distinct from p_token then raise exception 'outgoing_lease_lost'; end if;
 if j.status='accepted' and p_status='accepted' and j.provider_message_id is not distinct from p_provider_id then return true; end if;
 if j.status not in('preparing','submitting','uncertain') then raise exception 'outgoing_lease_lost'; end if;
 if p_status not in('accepted','failed','uncertain') or (p_status='accepted' and j.status='preparing') then raise exception 'Invalid outgoing result'; end if;
 d:=case p_status when 'accepted' then 'sent' else p_status end;
 update public.shared_inbox_outbox set status=p_status,completed_at=clock_timestamp(),provider_message_id=p_provider_id,rejected_count=greatest(0,coalesce(p_rejected,0)),rejected_addresses=array(select value from unnest(coalesce(p_rejected_addresses,'{}')) value where value in(select jsonb_array_elements_text((j.payload_json->'to')||(j.payload_json->'cc')||(j.payload_json->'bcc')))),error_code=case when p_error ~ '^[a-z0-9_]{1,80}$' then p_error when p_error is not null then 'email_send_failed' end where id=j.id;
 update public.revo_inbox_messages set delivery_status=d,provider_message_id=case when p_status='accepted' then p_provider_id else provider_message_id end,
 provider_thread_id=coalesce(nullif(p_thread_id,''),provider_thread_id),occurred_at=case when p_status='accepted' then clock_timestamp() else occurred_at end where id=j.message_id;
 if p_status='accepted' and nullif(p_thread_id,'') is not null then
  insert into private.shared_inbox_thread_keys(organisation_id,channel_id,provider_key,thread_key,conversation_id)
   select organisation_id,channel_id,provider_key,p_thread_id,conversation_id from public.revo_inbox_messages where id=j.message_id on conflict do nothing;
 end if;
 if p_status in('failed','uncertain') then update public.revo_inbox_conversations set last_message_preview=case p_status when 'failed' then 'Email not sent' else 'Email confirmation unavailable' end where id=j.conversation_id and last_inbound_at is null and last_outbound_at is null; end if;
 update public.revo_inbox_provider_connections set sync_lease_token=null,sync_locked_until=null where id=j.connection_id and sync_lease_token=p_token;
 return true;
end;
$$;
revoke all on function private.shared_inbox_finish_outgoing(uuid,uuid,text,text,text,text,integer,text[]) from public,anon,authenticated;
grant execute on function private.shared_inbox_finish_outgoing(uuid,uuid,text,text,text,text,integer,text[]) to service_role;
create function public.shared_inbox_finish_outgoing(p_job uuid,p_token uuid,p_status text,p_provider_id text,p_thread_id text,p_error text,p_rejected integer,p_rejected_addresses text[] default '{}') returns boolean language sql  security invoker set search_path='' as $$select private.shared_inbox_finish_outgoing(p_job,p_token,p_status,p_provider_id,p_thread_id,p_error,p_rejected,p_rejected_addresses);$$;
revoke all on function public.shared_inbox_finish_outgoing(uuid,uuid,text,text,text,text,integer,text[]) from public,anon,authenticated;
grant execute on function public.shared_inbox_finish_outgoing(uuid,uuid,text,text,text,text,integer,text[]) to service_role;
create or replace function public.revo_inbox_refresh_conversation_state() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.message_type='message' and (new.direction='inbound' or (new.direction='outbound' and (new.channel<>'email' or new.delivery_status in('sent','delivered','read')))) then
    update public.revo_inbox_conversations set
      last_message_preview=case when last_message_at is null or new.occurred_at>=last_message_at then left(new.body_text,500) else last_message_preview end,
      last_message_at=greatest(last_message_at,new.occurred_at),
      last_inbound_at=case when new.direction='inbound' then greatest(last_inbound_at,new.occurred_at) else last_inbound_at end,
      last_outbound_at=case when new.direction='outbound' then greatest(last_outbound_at,new.occurred_at) else last_outbound_at end,
      unread_count=unread_count+case when new.direction='inbound' and not coalesce(new.provider_is_read,false) and (last_read_at is null or new.occurred_at>last_read_at) then 1 else 0 end,
      status=case when new.direction='inbound' and status in('closed','spam') and (closed_at is null or new.occurred_at>closed_at) then 'open'
        when new.direction='outbound' and status='open' then 'waiting_on_client' else status end
      where id=new.conversation_id and organisation_id=new.organisation_id;
  end if;
  return new;
end;
$$;
revoke all on function public.revo_inbox_refresh_conversation_state() from public,anon,authenticated;

create trigger shared_inbox_sent_message_state after update of delivery_status on public.revo_inbox_messages for each row when(new.channel='email' and new.delivery_status in('sent','delivered','read') and old.delivery_status not in('sent','delivered','read')) execute function public.revo_inbox_refresh_conversation_state();
create or replace function public.shared_inbox_conversation_page(p_organisation_id uuid,p_conversation_id uuid,p_before_time timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  with page as (select m.* from public.revo_inbox_messages m where m.organisation_id=p_organisation_id and m.conversation_id=p_conversation_id
    and (p_before_time is null or (m.occurred_at,m.id)<(p_before_time,p_before_id)) order by m.occurred_at desc,m.id desc limit 21),
  visible as (select * from page order by occurred_at desc,id desc limit 20)
  select jsonb_build_object('hasMore',(select count(*)>20 from page),'messages',coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'conversation_id',m.conversation_id,'direction',m.direction,'message_type',m.message_type,'sender_address',m.sender_address,
    'recipient_addresses',m.recipient_addresses,'subject',m.subject,'body_text',m.body_text,'body_html',m.body_html,'occurred_at',m.occurred_at,
    'delivery_status',m.delivery_status,'content_status',m.content_status,'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'contentType',a.content_type,'size',a.byte_size,'state',a.state,'isInline',a.is_inline) order by a.id)
      from public.shared_inbox_attachments a where a.message_id=m.id),'[]'::jsonb)) order by m.occurred_at,m.id) from visible m),'[]'::jsonb));
$$;
revoke all on function public.shared_inbox_conversation_page(uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.shared_inbox_conversation_page(uuid,uuid,timestamptz,uuid) to authenticated;


create or replace function private.shared_inbox_commit_received(p_connection uuid,p_token uuid,p_message jsonb,p_checkpoint jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype; v_message_id uuid; v_conversation_id uuid; existed boolean := false; v_thread_key text; alias text; attachment jsonb; latest public.revo_inbox_messages%rowtype;
begin
  c := private.shared_inbox_assert_lease(p_connection,p_token);
  if jsonb_typeof(p_checkpoint) <> 'object' or octet_length(p_checkpoint::text)>100000 then raise exception 'invalid_checkpoint'; end if;
  if p_message->>'skipped'='true' then
    update public.revo_inbox_sync_runs set skipped_count=skipped_count+1 where lease_token=p_token and status='running';
  elsif p_message is not null and p_message <> 'null'::jsonb then
    if jsonb_typeof(p_message)<>'object' or coalesce(p_message->>'providerId','')='' or length(p_message->>'providerId')>2000
      or octet_length(coalesce(p_message->>'bodyText',''))>524288 or octet_length(coalesce(p_message->>'bodyHtml',''))>524288
      or jsonb_array_length(coalesce(p_message->'attachments','[]'))>100 then raise exception 'invalid_received_message'; end if;
    select id,conversation_id into v_message_id,v_conversation_id from public.revo_inbox_messages m
      where m.organisation_id=c.organisation_id and m.channel_id=c.channel_id and m.provider_key=c.provider_key
        and (m.provider_message_id=p_message->>'providerId' or (nullif(p_message->>'internetMessageId','') is not null and m.internet_message_id=p_message->>'internetMessageId'))
      order by (m.provider_message_id=p_message->>'providerId') desc limit 1;
    existed := found;
    if not existed then
      -- Native provider threads win. RFC aliases let IMAP replies arrive before
      -- their parent without creating unrelated conversations by subject alone.
      v_thread_key := coalesce(nullif(p_message->>'threadId',''), 'rfc:' || coalesce(nullif(p_message->'references'->>0,''),nullif(p_message->>'inReplyTo',''),nullif(p_message->>'internetMessageId',''),p_message->>'providerId'));
      select k.conversation_id into v_conversation_id from private.shared_inbox_thread_keys k
        where k.organisation_id=c.organisation_id and k.channel_id=c.channel_id and k.provider_key=c.provider_key
          and k.thread_key=v_thread_key;
      if v_conversation_id is null then
        select v.id into v_conversation_id from public.revo_inbox_conversations v
          where v.organisation_id=c.organisation_id and v.channel_id=c.channel_id and v.provider_key=c.provider_key and v.provider_thread_id=v_thread_key;
      end if;
      if v_conversation_id is null then
        select m.conversation_id into v_conversation_id from public.revo_inbox_messages m
          where m.organisation_id=c.organisation_id and m.channel_id=c.channel_id and m.provider_key=c.provider_key
            and (m.internet_message_id = p_message->>'inReplyTo' or m.internet_message_id in (select jsonb_array_elements_text(coalesce(p_message->'references','[]'))))
          order by m.occurred_at limit 1;
      end if;
      if v_conversation_id is null then
        insert into public.revo_inbox_conversations(organisation_id,channel_id,provider_key,provider_thread_id,contact_name,contact_address,subject,created_by)
          values(c.organisation_id,c.channel_id,c.provider_key,v_thread_key,nullif(p_message->>'senderName',''),coalesce(nullif(p_message->>'senderAddress',''),'unknown@invalid.local'),nullif(p_message->>'subject',''),null)
          returning id into v_conversation_id;
      end if;
      insert into public.revo_inbox_messages(organisation_id,conversation_id,channel_id,channel,direction,message_type,provider_key,provider_message_id,sender_address,recipient_addresses,body_text,delivery_status,occurred_at)
        values(c.organisation_id,v_conversation_id,c.channel_id,'email','inbound','message',c.provider_key,p_message->>'providerId',coalesce(nullif(p_message->>'senderAddress',''),'unknown@invalid.local'),
          case when jsonb_array_length(coalesce(p_message->'to','[]'))>0 then array(select jsonb_array_elements_text(p_message->'to')) else array[c.mailbox_address] end,'','received',coalesce((p_message->>'receivedAt')::timestamptz,now()))
        returning id into v_message_id;
    end if;
    update public.revo_inbox_messages m set reply_to_addresses=array(select jsonb_array_elements_text(coalesce(p_message->'replyTo','[]'))),recipient_addresses=case when jsonb_array_length(coalesce(p_message->'to','[]'))>0 then array(select jsonb_array_elements_text(p_message->'to')) else array[c.mailbox_address] end,
      sender_address=coalesce(nullif(p_message->>'senderAddress',''),m.sender_address),
      subject=nullif(p_message->>'subject',''),body_text=coalesce(p_message->>'bodyText',''),body_html=nullif(p_message->>'bodyHtml',''),
      internet_message_id=nullif(p_message->>'internetMessageId',''),in_reply_to=nullif(p_message->>'inReplyTo',''),
      reference_ids=array(select jsonb_array_elements_text(coalesce(p_message->'references','[]'))),
      provider_thread_id=nullif(p_message->>'threadId',''),provider_is_read=coalesce((p_message->>'isRead')::boolean,false),
      content_status=case when p_message->>'contentStatus'='body_limited' then 'body_limited' else 'complete' end
      where m.id=v_message_id;
    foreach alias in array (array[nullif(p_message->>'threadId',''),case when nullif(p_message->>'internetMessageId','') is not null then 'rfc:'||(p_message->>'internetMessageId') end,
      case when nullif(p_message->>'inReplyTo','') is not null then 'rfc:'||(p_message->>'inReplyTo') end] || array(select 'rfc:'||jsonb_array_elements_text(coalesce(p_message->'references','[]')))) loop
      if alias is not null then insert into private.shared_inbox_thread_keys(organisation_id,channel_id,provider_key,thread_key,conversation_id)
        values(c.organisation_id,c.channel_id,c.provider_key,alias,v_conversation_id) on conflict do nothing; end if;
    end loop;
    for attachment in select * from jsonb_array_elements(coalesce(p_message->'attachments','[]')) loop
      if attachment->>'state'='available' and (attachment->>'objectPath') not like (c.organisation_id::text||'/'||c.channel_id::text||'/%') then raise exception 'invalid_attachment_path'; end if;
      insert into public.shared_inbox_attachments(organisation_id,channel_id,conversation_id,message_id,provider_attachment_id,filename,content_type,byte_size,content_id,is_inline,state,object_path)
        values(c.organisation_id,c.channel_id,v_conversation_id,v_message_id,attachment->>'id',left(coalesce(nullif(attachment->>'filename',''),'attachment'),500),
          coalesce(attachment->>'contentType','application/octet-stream'),(attachment->>'size')::bigint,nullif(attachment->>'contentId',''),coalesce((attachment->>'isInline')::boolean,false),attachment->>'state',nullif(attachment->>'objectPath',''))
        on conflict(message_id,provider_attachment_id) do update set object_path=excluded.object_path,state=excluded.state,byte_size=excluded.byte_size;
    end loop;
    -- Recompute from message times so replay and out-of-order backfill cannot
    -- erase the latest preview or re-open a conversation closed after delivery.
    select m.* into latest from public.revo_inbox_messages m where m.conversation_id=v_conversation_id and m.direction in ('inbound','outbound') and m.message_type='message' order by m.occurred_at desc,m.id desc limit 1;
    update public.revo_inbox_conversations v set last_message_at=latest.occurred_at,last_message_preview=left(latest.body_text,500),
      last_inbound_at=(select max(m.occurred_at) from public.revo_inbox_messages m where m.conversation_id=v.id and m.direction='inbound'),
      unread_count=(select count(*) from public.revo_inbox_messages m where m.conversation_id=v.id and m.direction='inbound' and not coalesce(m.provider_is_read,false) and (v.last_read_at is null or m.occurred_at>v.last_read_at))
      where v.id=v_conversation_id;
    update public.revo_inbox_sync_runs set imported_count=imported_count+case when existed then 0 else 1 end,
      updated_count=updated_count+case when existed then 1 else 0 end where lease_token=p_token and status='running';
  end if;
  insert into private.shared_inbox_sync_state(organisation_id,connection_id,folder_key,cursor_json,last_success_at,last_error_code)
    values(c.organisation_id,c.id,'INBOX',p_checkpoint,clock_timestamp(),null)
    on conflict(connection_id,folder_key) do update set cursor_json=excluded.cursor_json,last_success_at=excluded.last_success_at,last_error_code=null;
  return jsonb_build_object('messageId',v_message_id,'updated',existed);
end;
$$;
revoke all on function private.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) to service_role;
create or replace function public.shared_inbox_commit_received(p_connection uuid,p_token uuid,p_message jsonb,p_checkpoint jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.shared_inbox_commit_received(p_connection,p_token,p_message,p_checkpoint);$$;
revoke all on function public.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) to service_role;


create function public.shared_inbox_reply_context(p_org uuid,p_conversation uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('messageId',m.id,'to',case when m.direction='outbound' then jsonb_build_array((select contact_address from public.revo_inbox_conversations where id=m.conversation_id)) when cardinality(m.reply_to_addresses)>0 then to_jsonb(m.reply_to_addresses) else jsonb_build_array(m.sender_address) end,'subject',m.subject)
 from public.revo_inbox_messages m where m.organisation_id=p_org and m.conversation_id=p_conversation and m.direction in('inbound','outbound') and (m.direction='inbound' or m.delivery_status in('sent','delivered','read')) and m.message_type='message'
 and private.shared_inbox_can_access_conversation(p_org,p_conversation,'send') order by m.occurred_at desc,m.id desc limit 1;
$$;
revoke all on function public.shared_inbox_reply_context(uuid,uuid) from public,anon;
grant execute on function public.shared_inbox_reply_context(uuid,uuid) to authenticated;
commit;
