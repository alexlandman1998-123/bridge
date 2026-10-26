begin;

-- One leased receiving job per connection; checkpoints and credentials remain
-- server-only. A reconfiguration/disconnection fences every in-flight worker.
alter table public.revo_inbox_provider_connections
  add column sync_lease_token uuid,
  add column sync_requested_at timestamptz,
  add column sync_requested_by uuid references public.profiles(id) on delete set null,
  add column sync_attempt_count integer not null default 0 check (sync_attempt_count >= 0),
  add column initial_history_days integer not null default 30 check (initial_history_days in (0,7,30,90));
alter table public.revo_inbox_sync_runs
  add column lease_token uuid,
  add column updated_count integer not null default 0 check (updated_count >= 0);
create unique index shared_inbox_sync_run_lease_key on public.revo_inbox_sync_runs(lease_token) where lease_token is not null;

alter table public.revo_inbox_messages
  add column internet_message_id text,
  add column in_reply_to text,
  add column reference_ids text[] not null default '{}',
  add column provider_is_read boolean,
  add column content_status text not null default 'legacy_preview' check (content_status in ('legacy_preview','complete','body_limited'));
create unique index shared_inbox_message_rfc_key on public.revo_inbox_messages(organisation_id,channel_id,provider_key,internet_message_id)
  where internet_message_id is not null;
alter table public.revo_inbox_messages add constraint shared_inbox_message_attachment_parent unique(id,conversation_id,channel_id,organisation_id);
create table private.shared_inbox_thread_keys (
  organisation_id uuid not null,
  channel_id uuid not null,
  provider_key text not null,
  thread_key text not null,
  conversation_id uuid not null,
  primary key(channel_id,provider_key,thread_key),
  foreign key(conversation_id,channel_id,organisation_id) references public.revo_inbox_conversations(id,channel_id,organisation_id) on delete cascade
);
revoke all on private.shared_inbox_thread_keys from public,anon,authenticated;
grant all on private.shared_inbox_thread_keys to service_role;

create table public.shared_inbox_attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  channel_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  provider_attachment_id text not null check (length(provider_attachment_id) between 1 and 2000),
  filename text not null check (length(filename) between 1 and 500),
  content_type text not null default 'application/octet-stream',
  byte_size bigint not null check (byte_size >= 0),
  content_id text,
  is_inline boolean not null default false,
  state text not null check (state in ('available','too_large','unsupported')),
  object_path text,
  unique(message_id,provider_attachment_id),
  foreign key(message_id,conversation_id,channel_id,organisation_id)
    references public.revo_inbox_messages(id,conversation_id,channel_id,organisation_id) on delete cascade,
  check ((state = 'available' and object_path is not null and byte_size <= 10485760) or (state <> 'available' and object_path is null))
);
create index shared_inbox_attachments_message_idx on public.shared_inbox_attachments(message_id,id);
alter table public.shared_inbox_attachments enable row level security;
revoke all on public.shared_inbox_attachments from public,anon,authenticated;
grant select(id,organisation_id,channel_id,conversation_id,message_id,filename,content_type,byte_size,content_id,is_inline,state) on public.shared_inbox_attachments to authenticated;
grant all on public.shared_inbox_attachments to service_role;
create policy shared_inbox_attachment_read on public.shared_inbox_attachments for select to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'));

insert into storage.buckets(id,name,public,file_size_limit) values('shared-inbox-attachments','shared-inbox-attachments',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;
-- Even installations with older broad Storage policies cannot publish these
-- objects or sign durable URLs. Downloads go through a fresh mailbox read check.
create policy shared_inbox_attachment_objects_private on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'shared-inbox-attachments') with check (bucket_id <> 'shared-inbox-attachments');

create function private.shared_inbox_fence_connection() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status is distinct from old.status then
    new.sync_lease_token := null; new.sync_locked_until := null;
    update public.revo_inbox_channels set connection_status=case when new.status='connected' then 'connected' when new.status='disconnected' then 'disconnected' else 'draft' end
      where id=new.channel_id and organisation_id=new.organisation_id and connection_status<>'paused';
    if new.status = 'connected' then new.next_sync_at := now(); new.sync_attempt_count := 0; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_fence_connection() from public,anon,authenticated;
create trigger shared_inbox_fence_connection before update on public.revo_inbox_provider_connections
for each row execute function private.shared_inbox_fence_connection();

-- All worker RPC implementations live in private. Public wrappers below are
-- callable only by service_role, never by a browser or anonymous request.
create function private.shared_inbox_assert_lease(p_connection uuid,p_token uuid)
returns public.revo_inbox_provider_connections language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;
begin
  select * into c from public.revo_inbox_provider_connections where id=p_connection for update;
  if not found or p_token is null or c.sync_lease_token is distinct from p_token
    or c.sync_locked_until <= clock_timestamp() or c.sync_locked_until is null
    or not (c.status='connected' or (c.provider_key='other_email' and c.status='authorizing'))
    or not private.shared_inbox_permission_for_user(c.organisation_id,c.channel_id,c.connected_by,'manage') then
    raise exception 'mailbox_lease_lost';
  end if;
  return c;
end;
$$;
revoke all on function private.shared_inbox_assert_lease(uuid,uuid) from public,anon,authenticated;

create function private.shared_inbox_claim_mailbox() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype; token uuid := gen_random_uuid(); run_id uuid; checkpoint jsonb;
begin
  select p.* into c from public.revo_inbox_provider_connections p
  join public.revo_inbox_channels ch on ch.id=p.channel_id and ch.organisation_id=p.organisation_id
  where (p.status='connected' or (p.provider_key='other_email' and p.status='authorizing'))
    and ch.connection_status <> 'paused'
    and (p.next_sync_at is null or p.next_sync_at <= clock_timestamp())
    and (p.sync_locked_until is null or p.sync_locked_until <= clock_timestamp())
    and private.shared_inbox_permission_for_user(p.organisation_id,p.channel_id,p.connected_by,'manage')
  order by p.next_sync_at nulls first,p.id for update of p skip locked limit 1;
  if not found then return null; end if;
  update public.revo_inbox_sync_runs set status='failed',error_code='lease_expired',completed_at=clock_timestamp()
    where connection_id=c.id and status='running';
  update public.revo_inbox_provider_connections set sync_lease_token=token,sync_locked_until=clock_timestamp()+interval '180 seconds'
    where id=c.id returning * into c;
  insert into public.revo_inbox_sync_runs(organisation_id,connection_id,requested_by,status,lease_token)
    values(c.organisation_id,c.id,c.sync_requested_by,'running',token) returning id into run_id;
  select cursor_json into checkpoint from private.shared_inbox_sync_state where connection_id=c.id and folder_key='INBOX';
  return jsonb_build_object('connection',to_jsonb(c),'token',token,'runId',run_id,'checkpoint',coalesce(checkpoint,'{}'::jsonb));
end;
$$;
revoke all on function private.shared_inbox_claim_mailbox() from public,anon,authenticated;
grant execute on function private.shared_inbox_claim_mailbox() to service_role;
create function public.shared_inbox_claim_mailbox() returns jsonb
language sql security invoker set search_path='' as $$select private.shared_inbox_claim_mailbox();$$;
revoke all on function public.shared_inbox_claim_mailbox() from public,anon,authenticated;
grant execute on function public.shared_inbox_claim_mailbox() to service_role;

create function private.shared_inbox_renew_mailbox(p_connection uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform private.shared_inbox_assert_lease(p_connection,p_token);
  update public.revo_inbox_provider_connections set sync_locked_until=clock_timestamp()+interval '180 seconds' where id=p_connection;
  return true;
end;
$$;
revoke all on function private.shared_inbox_renew_mailbox(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_renew_mailbox(uuid,uuid) to service_role;
create function public.shared_inbox_renew_mailbox(p_connection uuid,p_token uuid) returns boolean
language sql security invoker set search_path='' as $$select private.shared_inbox_renew_mailbox(p_connection,p_token);$$;
revoke all on function public.shared_inbox_renew_mailbox(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_renew_mailbox(uuid,uuid) to service_role;

create function private.shared_inbox_rotate_mailbox_credential(p_connection uuid,p_token uuid,p_secret jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform private.shared_inbox_assert_lease(p_connection,p_token);
  perform public.revo_store_inbox_connection_credential(p_connection,p_secret);
  return true;
end;
$$;
revoke all on function private.shared_inbox_rotate_mailbox_credential(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_rotate_mailbox_credential(uuid,uuid,jsonb) to service_role;
create function public.shared_inbox_rotate_mailbox_credential(p_connection uuid,p_token uuid,p_secret jsonb) returns boolean
language sql security invoker set search_path='' as $$select private.shared_inbox_rotate_mailbox_credential(p_connection,p_token,p_secret);$$;
revoke all on function public.shared_inbox_rotate_mailbox_credential(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_rotate_mailbox_credential(uuid,uuid,jsonb) to service_role;

create function private.shared_inbox_commit_received(p_connection uuid,p_token uuid,p_message jsonb,p_checkpoint jsonb) returns jsonb
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
    update public.revo_inbox_messages m set recipient_addresses=case when jsonb_array_length(coalesce(p_message->'to','[]'))>0 then array(select jsonb_array_elements_text(p_message->'to')) else array[c.mailbox_address] end,
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
create function public.shared_inbox_commit_received(p_connection uuid,p_token uuid,p_message jsonb,p_checkpoint jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.shared_inbox_commit_received(p_connection,p_token,p_message,p_checkpoint);$$;
revoke all on function public.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_commit_received(uuid,uuid,jsonb,jsonb) to service_role;

create function private.shared_inbox_finish_mailbox(p_connection uuid,p_token uuid,p_pending boolean,p_error text,p_retry_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype; safe_error text; started_at timestamptz;
begin
  c := private.shared_inbox_assert_lease(p_connection,p_token);
  safe_error := case when p_error is null then null when p_error ~ '^[a-z0-9_]{1,80}$' then p_error else 'mailbox_sync_failed' end;
  select created_at into started_at from public.revo_inbox_sync_runs where lease_token=p_token;
  update public.revo_inbox_sync_runs set status=case when safe_error is null then 'completed' else 'failed' end,error_code=safe_error,completed_at=clock_timestamp() where lease_token=p_token;
  update public.revo_inbox_provider_connections set sync_lease_token=null,sync_locked_until=null,last_error_code=safe_error,
    status=case when safe_error in ('imap_auth_failed','imap_host_blocked','oauth_access_revoked','google_delegation_unsupported','mailbox_identity_mismatch') then 'error'
      when status='authorizing' and safe_error is null then 'connected' else status end,
    connected_at=case when safe_error is null then coalesce(connected_at,clock_timestamp()) else connected_at end,
    last_verified_at=case when safe_error is null then clock_timestamp() else last_verified_at end,
    last_sync_at=case when safe_error is null then clock_timestamp() else last_sync_at end,
    sync_attempt_count=case when safe_error is null then 0 else least(sync_attempt_count+1,10) end,
    next_sync_at=case when safe_error is not null then clock_timestamp()+make_interval(secs=>greatest(30,least(3600,coalesce(p_retry_seconds,30*power(2,least(sync_attempt_count,7))::integer))))
      when p_pending or sync_requested_at>started_at then clock_timestamp() else clock_timestamp()+make_interval(mins=>sync_interval_minutes) end,
    sync_requested_at=case when sync_requested_at>started_at then sync_requested_at else null end,
    sync_requested_by=case when sync_requested_at>started_at then sync_requested_by else null end
    where id=c.id;
  if safe_error is not null then update private.shared_inbox_sync_state set last_error_code=safe_error where connection_id=c.id and folder_key='INBOX'; end if;
  return true;
end;
$$;
revoke all on function private.shared_inbox_finish_mailbox(uuid,uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function private.shared_inbox_finish_mailbox(uuid,uuid,boolean,text,integer) to service_role;
create function public.shared_inbox_finish_mailbox(p_connection uuid,p_token uuid,p_pending boolean,p_error text,p_retry_seconds integer) returns boolean
language sql security invoker set search_path='' as $$select private.shared_inbox_finish_mailbox(p_connection,p_token,p_pending,p_error,p_retry_seconds);$$;
revoke all on function public.shared_inbox_finish_mailbox(uuid,uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.shared_inbox_finish_mailbox(uuid,uuid,boolean,text,integer) to service_role;

create function private.shared_inbox_configure_imap(p_organisation_id uuid,p_channel_id uuid,p_actor uuid,p_credential jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ch public.revo_inbox_channels%rowtype; c public.revo_inbox_provider_connections%rowtype;
begin
  if not private.shared_inbox_permission_for_user(p_organisation_id,p_channel_id,p_actor,'manage') then raise exception 'Mailbox management access is required'; end if;
  select * into ch from public.revo_inbox_channels where id=p_channel_id and organisation_id=p_organisation_id and channel='email' and provider_key='other_email' for key share;
  if not found then raise exception 'Choose an IMAP mailbox'; end if;
  -- KEY SHARE holds mailbox identity without reversing the worker's connection
  -- lock order when a live IMAP connection is reconfigured.
  if not private.shared_inbox_permission_for_user(p_organisation_id,p_channel_id,p_actor,'manage') then raise exception 'Mailbox management access is required'; end if;
  if coalesce(p_credential->>'host','') !~ '^[a-zA-Z0-9][a-zA-Z0-9.-]{1,250}\.[a-zA-Z]{2,}$'
    or p_credential->>'port'<>'993' or length(coalesce(p_credential->>'username','')) not between 1 and 500
    or length(coalesce(p_credential->>'password','')) not between 1 and 2000 then raise exception 'Invalid secure IMAP settings'; end if;
  insert into public.revo_inbox_provider_connections(organisation_id,channel_id,provider_key,connection_kind,mailbox_address,status,connected_by,next_sync_at)
    values(p_organisation_id,p_channel_id,'other_email','individual_mailbox',ch.address,'authorizing',p_actor,clock_timestamp())
    on conflict(channel_id) do update set status='authorizing',connected_by=excluded.connected_by,connected_at=null,
      last_error_code=null,next_sync_at=clock_timestamp(),sync_lease_token=null,sync_locked_until=null,sync_attempt_count=0
    returning * into c;
  delete from private.shared_inbox_sync_state where connection_id=c.id;
  perform public.revo_store_inbox_connection_credential(c.id,p_credential||jsonb_build_object('provider','other_email'));
  return jsonb_build_object('status','authorizing','connectionId',c.id);
end;
$$;
revoke all on function private.shared_inbox_configure_imap(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_configure_imap(uuid,uuid,uuid,jsonb) to service_role;
create function public.shared_inbox_configure_imap(p_organisation_id uuid,p_channel_id uuid,p_actor uuid,p_credential jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.shared_inbox_configure_imap(p_organisation_id,p_channel_id,p_actor,p_credential);$$;
revoke all on function public.shared_inbox_configure_imap(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_configure_imap(uuid,uuid,uuid,jsonb) to service_role;

create function private.shared_inbox_request_sync(p_org uuid,p_connection uuid,p_history_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;
begin
  select * into c from public.revo_inbox_provider_connections where id=p_connection and organisation_id=p_org for update;
  if not found or not private.shared_inbox_can_access(p_org,c.channel_id,'manage') then raise exception 'Mailbox management access is required'; end if;
  if exists(select 1 from public.revo_inbox_channels where id=c.channel_id and connection_status='paused') then raise exception 'Resume this mailbox before syncing'; end if;
  if c.status <> 'connected' and not(c.provider_key='other_email' and c.status='authorizing') then raise exception 'Connect the mailbox before syncing'; end if;
  if p_history_days is not null and p_history_days not in(0,7,30,90) then raise exception 'Choose a valid history window'; end if;
  if p_history_days is not null and p_history_days<>c.initial_history_days then
    delete from private.shared_inbox_sync_state where connection_id=c.id;
    update public.revo_inbox_provider_connections set initial_history_days=p_history_days,sync_lease_token=null,sync_locked_until=null where id=c.id;
  end if;
  update public.revo_inbox_provider_connections set sync_requested_at=clock_timestamp(),sync_requested_by=auth.uid(),next_sync_at=clock_timestamp() where id=c.id;
  return jsonb_build_object('status','queued','connectionId',c.id);
end;
$$;
revoke all on function private.shared_inbox_request_sync(uuid,uuid,integer) from public,anon;
grant execute on function private.shared_inbox_request_sync(uuid,uuid,integer) to authenticated;
create function public.shared_inbox_request_sync(p_organisation_id uuid,p_connection_id uuid,p_history_days integer default null)
returns jsonb language sql security invoker set search_path='' as $$select private.shared_inbox_request_sync(p_organisation_id,p_connection_id,p_history_days);$$;
revoke all on function public.shared_inbox_request_sync(uuid,uuid,integer) from public,anon;
grant execute on function public.shared_inbox_request_sync(uuid,uuid,integer) to authenticated;

-- Do not let a historical backfill replace a newer preview, reopen a conversation
-- closed after the message, or increment unread counts for already-read mail.
create or replace function public.revo_inbox_refresh_conversation_state() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.direction in ('inbound','outbound') and new.message_type='message' then
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

-- A bounded, keyset-paginated thread reader avoids loading every full mailbox
-- body into the browser. Attachment object paths are never part of this response.
create function public.shared_inbox_conversation_page(p_organisation_id uuid,p_conversation_id uuid,p_before_time timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  with page as (select m.* from public.revo_inbox_messages m where m.organisation_id=p_organisation_id and m.conversation_id=p_conversation_id
    and (p_before_time is null or (m.occurred_at,m.id)<(p_before_time,p_before_id)) order by m.occurred_at desc,m.id desc limit 21),
  visible as (select * from page order by occurred_at desc,id desc limit 20)
  select jsonb_build_object('hasMore',(select count(*)>20 from page),'messages',coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'conversation_id',m.conversation_id,'direction',m.direction,'message_type',m.message_type,'sender_address',m.sender_address,
    'recipient_addresses',m.recipient_addresses,'subject',m.subject,'body_text',m.body_text,'body_html',m.body_html,'occurred_at',m.occurred_at,
    'content_status',m.content_status,'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'contentType',a.content_type,'size',a.byte_size,'state',a.state,'isInline',a.is_inline) order by a.id)
      from public.shared_inbox_attachments a where a.message_id=m.id),'[]'::jsonb)) order by m.occurred_at,m.id) from visible m),'[]'::jsonb));
$$;
revoke all on function public.shared_inbox_conversation_page(uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.shared_inbox_conversation_page(uuid,uuid,timestamptz,uuid) to authenticated;

create or replace function public.shared_inbox_email_settings(p_organisation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('canCreatePrivate',public.bridge_is_active_member(p_organisation_id),
    'canCreateShared',public.bridge_is_active_member(p_organisation_id) and public.bridge_is_org_admin(p_organisation_id),
    'mailboxes',coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'permissions',public.shared_inbox_mailbox_permissions(c.organisation_id,c.id),
      'connection',case when p.id is null then null else jsonb_build_object('id',p.id,'status',p.status,
        'connectionKind',p.connection_kind,'lastSyncAt',p.last_sync_at,'lastVerifiedAt',p.last_verified_at,'lastErrorCode',p.last_error_code,'initialHistoryDays',p.initial_history_days,'syncPending',(p.sync_requested_at is not null or ((p.status='connected' or (p.provider_key='other_email' and p.status='authorizing')) and (p.next_sync_at is null or p.next_sync_at<=clock_timestamp()))),'syncRunning',p.sync_locked_until>clock_timestamp(),'nextSyncAt',p.next_sync_at) end)
      order by c.created_at,c.id)
      from public.revo_inbox_channels c left join public.revo_inbox_provider_connections p
        on p.channel_id = c.id and p.organisation_id = c.organisation_id
      where c.organisation_id = p_organisation_id and c.channel = 'email'),'[]'::jsonb));
$$;
revoke all on function public.shared_inbox_email_settings(uuid) from public,anon;
grant execute on function public.shared_inbox_email_settings(uuid) to authenticated;


comment on table public.shared_inbox_attachments is 'Mailbox-scoped attachment metadata. File bytes are private and every download rechecks current mailbox access.';
create function private.shared_inbox_disconnect_mailbox(p_org uuid,p_connection uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.revo_inbox_provider_connections%rowtype;
begin
  select * into c from public.revo_inbox_provider_connections where id=p_connection and organisation_id=p_org for update;
  if not found or not private.shared_inbox_permission_for_user(p_org,c.channel_id,p_actor,'manage') then raise exception 'Mailbox management access is required'; end if;
  update public.revo_inbox_provider_connections set status='disconnected',disconnected_at=clock_timestamp(),disconnected_by=p_actor,sync_lease_token=null,sync_locked_until=null,sync_requested_at=null,sync_requested_by=null,last_error_code=null where id=c.id;
  update public.revo_inbox_oauth_states set consumed_at=clock_timestamp() where connection_id=c.id and consumed_at is null;
  perform public.revo_clear_inbox_connection_credential(c.id);
  insert into public.revo_inbox_connection_events(organisation_id,connection_id,actor_user_id,event_type) values(p_org,c.id,p_actor,'disconnected');
  return true;
end;
$$;
revoke all on function private.shared_inbox_disconnect_mailbox(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.shared_inbox_disconnect_mailbox(uuid,uuid,uuid) to service_role;
create function public.shared_inbox_disconnect_mailbox(p_organisation_id uuid,p_connection_id uuid,p_actor uuid) returns boolean
language sql security invoker set search_path='' as $$select private.shared_inbox_disconnect_mailbox(p_organisation_id,p_connection_id,p_actor);$$;
revoke all on function public.shared_inbox_disconnect_mailbox(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_disconnect_mailbox(uuid,uuid,uuid) to service_role;
-- Finish OAuth under the same connection lock as disconnect/receiving. A callback
-- that was already exchanging its code cannot restore a disconnected mailbox.
create function private.shared_inbox_complete_oauth(p_state_hash text,p_account text,p_secret jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.revo_inbox_oauth_states%rowtype; c public.revo_inbox_provider_connections%rowtype;
begin
  select * into s from public.revo_inbox_oauth_states where state_hash=p_state_hash;
  if not found or s.consumed_at is null or s.expires_at<clock_timestamp() then raise exception 'authorization_expired'; end if;
  select * into c from public.revo_inbox_provider_connections where id=s.connection_id for update;
  if c.status<>'authorizing' or exists(select 1 from public.revo_inbox_oauth_states newer where newer.connection_id=c.id and newer.created_at>s.created_at)
    or not private.shared_inbox_permission_for_user(s.organisation_id,c.channel_id,s.requested_by,'manage') then raise exception 'authorization_cancelled'; end if;
  perform public.revo_store_inbox_connection_credential(c.id,p_secret);
  update public.revo_inbox_provider_connections set status='connected',provider_account_id=p_account,
    granted_scopes=regexp_split_to_array(coalesce(p_secret->>'scope',''),'\s+'),connected_by=s.requested_by,connected_at=clock_timestamp(),
    last_verified_at=clock_timestamp(),last_error_code=null,disconnected_at=null,disconnected_by=null where id=c.id;
  return true;
end;
$$;
revoke all on function private.shared_inbox_complete_oauth(text,text,jsonb) from public,anon,authenticated;
grant execute on function private.shared_inbox_complete_oauth(text,text,jsonb) to service_role;
create function public.shared_inbox_complete_oauth(p_state_hash text,p_account text,p_secret jsonb) returns boolean
language sql security invoker set search_path='' as $$select private.shared_inbox_complete_oauth(p_state_hash,p_account,p_secret);$$;
revoke all on function public.shared_inbox_complete_oauth(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inbox_complete_oauth(text,text,jsonb) to service_role;
commit;
