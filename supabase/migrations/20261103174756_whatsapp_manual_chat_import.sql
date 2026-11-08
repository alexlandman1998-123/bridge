-- Historical text imports never create a provider reply window or marketing consent.
create table public.whatsapp_manual_chat_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  channel_id uuid not null,
  actor_id uuid not null,
  contact_phone text not null,
  source_fingerprint text not null,
  options jsonb not null,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key(channel_id,organisation_id) references public.organisation_communication_channels(id,organisation_id),
  unique(channel_id,contact_phone,source_fingerprint)
);
alter table public.whatsapp_manual_chat_imports enable row level security;
revoke all on public.whatsapp_manual_chat_imports from public,anon,authenticated;
grant all on public.whatsapp_manual_chat_imports to service_role;
create index whatsapp_manual_import_org_idx on public.whatsapp_manual_chat_imports(organisation_id,created_at);

create function public.whatsapp_manual_chat_import(p_org uuid,p_actor uuid,p_sender uuid,p_contact text,p_name text,p_fingerprint text,p_options jsonb,p_messages jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; receipt public.whatsapp_manual_chat_imports%rowtype;
  row jsonb; stamp timestamptz; thread_id uuid; message_id uuid; native_count integer; imported integer:=0; duplicates integer:=0;
begin
  if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'An organisation administrator must import chat history' using errcode='42501'; end if;
  select * into sender from public.organisation_communication_channels where id=p_sender and organisation_id=p_org and provider='meta' and channel_type='whatsapp' and connection_status='connected' and onboarding_mode='coexistence' for share;
  if sender.id is null then raise exception 'Choose a connected WhatsApp Business app number in this organisation'; end if;
  if p_contact is null or p_contact !~ '^[1-9][0-9]{6,14}$' or p_contact=regexp_replace(coalesce(sender.display_phone_number,''),'[^0-9]','','g') then raise exception 'Choose the customer’s international phone number'; end if;
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_options) is distinct from 'object' or jsonb_typeof(p_messages) is distinct from 'array' then raise exception 'Invalid chat export'; end if;
  if jsonb_array_length(p_messages) not between 1 and 500 then raise exception 'Import between 1 and 500 messages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||sender.id::text||':'||p_contact,0));
  select * into receipt from public.whatsapp_manual_chat_imports where channel_id=p_sender and contact_phone=p_contact and source_fingerprint=p_fingerprint;
  if receipt.id is not null then
    if receipt.options<>p_options then raise exception 'This file was already imported with different date or participant settings'; end if;
    select id into thread_id from public.whatsapp_inbox_conversations where channel_id=p_sender and contact_phone=p_contact;
    return jsonb_build_object('imported',0,'duplicates',jsonb_array_length(p_messages),'conversationId',thread_id,'importId',receipt.id);
  end if;
  insert into public.whatsapp_manual_chat_imports(organisation_id,channel_id,actor_id,contact_phone,source_fingerprint,options) values(p_org,p_sender,p_actor,p_contact,p_fingerprint,p_options) returning * into receipt;
  for row in select value from jsonb_array_elements(p_messages) loop
    stamp:=(row->>'at')::timestamptz;
    if stamp is null or stamp<'2000-01-01'::timestamptz or stamp>now()+interval '1 minute' or coalesce(row->>'direction','') not in ('inbound','outbound') or coalesce(row->>'precision','') not in ('minute','second') or coalesce(row->>'key','') !~ '^[a-f0-9]{64}$' or length(coalesce(row->>'body','')) not between 1 and 16000 or coalesce((row->>'occurrence')::integer,0) not between 1 and 500 then raise exception 'Invalid exported message'; end if;
    if exists(select 1 from public.whatsapp_inbox_messages where channel_id=p_sender and provider_message_id='arch9-export:'||(row->>'key')) then duplicates:=duplicates+1; continue; end if;
    select count(*) into native_count from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id
      where m.channel_id=p_sender and c.contact_phone=p_contact and m.direction=row->>'direction' and m.body_text=row->>'body' and not(m.media_json ? 'manualImport')
      and m.event_at>=date_trunc(row->>'precision',stamp) and m.event_at<date_trunc(row->>'precision',stamp)+case when row->>'precision'='minute' then interval '1 minute' else interval '1 second' end;
    if native_count>=(row->>'occurrence')::integer then duplicates:=duplicates+1; continue; end if;
    message_id:=public.whatsapp_business_app_ingest(sender.phone_number_id,sender.waba_id,p_contact,'arch9-export:'||(row->>'key'),stamp,row->>'direction','text',row->>'body',jsonb_build_object('manualImport',jsonb_build_object('id',receipt.id,'precision',row->>'precision','occurrence',(row->>'occurrence')::integer)),left(p_name,160),'history','sent');
    if message_id is null then raise exception 'The WhatsApp connection changed. Refresh and try again'; end if;
    imported:=imported+1;
  end loop;
  select id into thread_id from public.whatsapp_inbox_conversations where channel_id=p_sender and contact_phone=p_contact;
  update public.whatsapp_manual_chat_imports set imported_count=imported,duplicate_count=duplicates where id=receipt.id;
  return jsonb_build_object('imported',imported,'duplicates',duplicates,'conversationId',thread_id,'importId',receipt.id);
end; $$;
revoke all on function public.whatsapp_manual_chat_import(uuid,uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_manual_chat_import(uuid,uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

-- A later provider delivery replaces one matching exported observation, retaining
-- the authoritative Meta message ID and any real attachment/delivery metadata.
create index whatsapp_manual_message_lookup on public.whatsapp_inbox_messages(conversation_id,direction,event_at) where media_json ? 'manualImport';
create function public.whatsapp_reconcile_manual_import() returns trigger language plpgsql security invoker set search_path='' as $$
declare prior uuid;
begin
  if new.media_json ? 'manualImport' or nullif(new.provider_message_id,'') is null then return new; end if;
  select m.id into prior from public.whatsapp_inbox_messages m
    where m.conversation_id=new.conversation_id and m.organisation_id=new.organisation_id and m.channel_id=new.channel_id
      and m.media_json ? 'manualImport' and m.direction=new.direction and m.body_text=new.body_text
      and new.event_at>=date_trunc(coalesce(m.media_json->'manualImport'->>'precision','second'),m.event_at)
      and new.event_at<date_trunc(coalesce(m.media_json->'manualImport'->>'precision','second'),m.event_at)+case when m.media_json->'manualImport'->>'precision'='minute' then interval '1 minute' else interval '1 second' end
    order by m.event_at,(m.media_json->'manualImport'->>'occurrence')::integer,m.id limit 1 for update;
  if prior is not null then
    delete from public.whatsapp_inbox_messages where id=prior;
    update public.whatsapp_inbox_conversations set content_version=content_version+1 where id=new.conversation_id and organisation_id=new.organisation_id;
  end if;
  return new;
end; $$;
revoke all on function public.whatsapp_reconcile_manual_import() from public,anon,authenticated;
grant execute on function public.whatsapp_reconcile_manual_import() to service_role;
create trigger whatsapp_reconcile_manual_import after insert on public.whatsapp_inbox_messages for each row execute function public.whatsapp_reconcile_manual_import();
