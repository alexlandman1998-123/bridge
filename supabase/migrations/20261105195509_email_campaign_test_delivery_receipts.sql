begin;

-- Server-only intent receipts survive browser reloads and function restarts.
-- No message bodies or provider credentials are retained here.
create table public.email_campaign_test_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  sender_identity_id uuid not null references public.email_sender_identities(id),
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','uncertain')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, actor_id, request_key),
  check ((status = 'accepted') = (provider_message_id is not null))
);
alter table public.email_campaign_test_receipts enable row level security;
revoke all on public.email_campaign_test_receipts from public, anon, authenticated;
grant select, insert, update on public.email_campaign_test_receipts to service_role;

create function public.email_campaign_test_claim(p_organisation_id uuid, p_actor_id uuid, p_identity_id uuid, p_key text, p_hash text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare receipt public.email_campaign_test_receipts; inserted_id uuid;
begin
  if p_actor_id is null or not exists(select 1 from public.email_sender_identities where id=p_identity_id and organisation_id=p_organisation_id) then
    raise exception 'Invalid test sender scope.' using errcode='42501';
  end if;
  insert into public.email_campaign_test_receipts(organisation_id,actor_id,sender_identity_id,request_key,payload_hash)
    values(p_organisation_id,p_actor_id,p_identity_id,p_key,p_hash)
    on conflict (organisation_id,actor_id,request_key) do nothing returning id into inserted_id;
  select * into strict receipt from public.email_campaign_test_receipts
    where organisation_id=p_organisation_id and actor_id=p_actor_id and request_key=p_key for update;
  if receipt.payload_hash<>p_hash or receipt.sender_identity_id<>p_identity_id then
    return jsonb_build_object('action','conflict');
  end if;
  if inserted_id is not null then return jsonb_build_object('action','send','id',receipt.id); end if;
  -- Rejected is recorded only before any provider request. Retrying after a
  -- policy/quota pause is safe and reuses the same reservation and provider key.
  if receipt.status='rejected' then
    update public.email_campaign_test_receipts set status='pending',updated_at=now() where id=receipt.id;
    return jsonb_build_object('action','send','id',receipt.id);
  end if;
  -- Pending/uncertain intents never trigger another provider submission, even
  -- after the provider's finite idempotency window has expired.
  return jsonb_build_object('action',receipt.status,'id',receipt.id,'providerMessageId',receipt.provider_message_id);
end $$;

create function public.email_campaign_test_complete(p_organisation_id uuid,p_actor_id uuid,p_id uuid,p_status text,p_provider_message_id text default null)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  if p_status not in ('accepted','rejected','uncertain') or (p_status='accepted')<>(nullif(trim(p_provider_message_id),'') is not null) then
    raise exception 'Invalid test receipt outcome.';
  end if;
  update public.email_campaign_test_receipts set status=p_status,provider_message_id=p_provider_message_id,updated_at=now()
    where id=p_id and organisation_id=p_organisation_id and actor_id=p_actor_id and status='pending';
  return found;
end $$;
revoke all on function public.email_campaign_test_claim(uuid,uuid,uuid,text,text), public.email_campaign_test_complete(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_campaign_test_claim(uuid,uuid,uuid,text,text), public.email_campaign_test_complete(uuid,uuid,uuid,text,text) to service_role;

commit;
