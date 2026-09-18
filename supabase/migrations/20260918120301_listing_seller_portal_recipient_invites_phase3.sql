create table if not exists public.private_listing_seller_portal_recipient_invites (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  seller_onboarding_id uuid not null references public.private_listing_seller_onboarding(id) on delete cascade,
  signing_session_id uuid not null references public.private_listing_mandate_signing_sessions(id) on delete cascade,
  signing_group_id uuid,
  recipient_name text not null,
  recipient_email text not null,
  recipient_role text not null default 'Seller',
  invite_token_hash text not null,
  expires_at timestamptz not null,
  sent_at timestamptz,
  opened_at timestamptz,
  consumed_at timestamptz,
  status text not null default 'prepared' check (status in ('prepared', 'sent', 'failed', 'opened', 'consumed', 'revoked', 'expired')),
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signing_session_id)
);

create unique index if not exists private_listing_seller_portal_recipient_invites_token_hash_uidx
  on public.private_listing_seller_portal_recipient_invites (invite_token_hash);
create index if not exists private_listing_seller_portal_recipient_invites_listing_idx
  on public.private_listing_seller_portal_recipient_invites (private_listing_id, status, created_at desc);

alter table public.private_listing_seller_portal_recipient_invites enable row level security;
revoke all on table public.private_listing_seller_portal_recipient_invites from public, anon, authenticated;

-- Add recipient links to the existing token resolver. The underlying portal
-- workspace remains listing-scoped, while the invitation itself is signer- and
-- recipient-specific.
create or replace function public.bridge_resolve_private_listing_seller_portal_token(p_token text)
returns table (
  onboarding_id uuid,
  legacy_token text,
  stable_portal_token text,
  token_kind text,
  token_valid boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select nullif(trim(coalesce(p_token, '')), '') as token,
      case when nullif(trim(coalesce(p_token, '')), '') is null then null
        else encode(digest(trim(p_token), 'sha256'), 'hex') end as token_hash
  ), candidates as (
    select onboarding.id as onboarding_id, onboarding.token as legacy_token,
      onboarding.seller_portal_token as stable_portal_token,
      case when onboarding.seller_portal_token = input.token then 'stable'
        when onboarding.token = input.token then 'legacy' else 'invite' end as token_kind,
      case when onboarding.seller_portal_token = input.token then true
        when onboarding.token = input.token then true
        else onboarding.seller_portal_invite_consumed_at is null
          and onboarding.seller_portal_invite_expires_at is not null
          and onboarding.seller_portal_invite_expires_at > now() end as token_valid,
      1 as priority
    from input join public.private_listing_seller_onboarding onboarding
      on onboarding.seller_portal_token = input.token
      or onboarding.token = input.token
      or onboarding.seller_portal_invite_token_hash = input.token_hash
    union all
    select onboarding.id, onboarding.token, onboarding.seller_portal_token,
      'recipient_invite',
      recipient.consumed_at is null and recipient.expires_at > now()
        and recipient.status not in ('revoked', 'expired'),
      2
    from input
    join public.private_listing_seller_portal_recipient_invites recipient
      on recipient.invite_token_hash = input.token_hash
    join public.private_listing_seller_onboarding onboarding
      on onboarding.id = recipient.seller_onboarding_id
  )
  select onboarding_id, legacy_token, stable_portal_token, token_kind, token_valid
  from candidates
  order by priority
  limit 1;
$$;

revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text)
  from public, anon, authenticated;

create or replace function public.bridge_list_completed_listing_seller_portal_recipients(
  p_signing_session_id uuid
)
returns table (signing_session_id uuid, signer_name text, signer_email text, signer_role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
begin
  select * into v_session from public.private_listing_mandate_signing_sessions
  where id = p_signing_session_id;
  if not found or v_session.status <> 'signed' then
    raise exception 'A completed signing session is required.';
  end if;
  if v_session.signing_group_id is not null and exists (
    select 1 from public.private_listing_mandate_signing_sessions
    where signing_group_id = v_session.signing_group_id and status <> 'signed'
  ) then
    raise exception 'The signing group is not complete.';
  end if;

  return query
  select session.id, session.signer_name, lower(session.signer_email),
    coalesce(nullif(trim((session.signing_pack_snapshot -> 'signers' -> 0 ->> 'role')), ''), 'Seller')
  from public.private_listing_mandate_signing_sessions session
  where (v_session.signing_group_id is not null and session.signing_group_id = v_session.signing_group_id)
     or (v_session.signing_group_id is null and session.id = v_session.id)
  order by session.created_at;
end;
$$;

create or replace function public.bridge_prepare_listing_seller_portal_recipient_invite(
  p_signing_session_id uuid,
  p_invite_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_workspace jsonb;
  v_onboarding_id uuid;
  v_invite public.private_listing_seller_portal_recipient_invites%rowtype;
begin
  if nullif(trim(coalesce(p_invite_token_hash, '')), '') is null or p_expires_at <= now() then
    raise exception 'A valid recipient invitation token and expiry are required.';
  end if;
  v_workspace := public.bridge_prepare_listing_seller_portal_workspace(p_signing_session_id);
  if coalesce((v_workspace ->> 'prepared')::boolean, false) is not true then
    raise exception 'The Seller Portal workspace is not ready.';
  end if;

  select * into v_session from public.private_listing_mandate_signing_sessions
  where id = p_signing_session_id and status = 'signed';
  if not found then raise exception 'A completed signing session is required.'; end if;
  select id into v_onboarding_id from public.private_listing_seller_onboarding
  where private_listing_id = v_session.private_listing_id;

  insert into public.private_listing_seller_portal_recipient_invites (
    private_listing_id, seller_onboarding_id, signing_session_id, signing_group_id,
    recipient_name, recipient_email, recipient_role, invite_token_hash, expires_at, status
  ) values (
    v_session.private_listing_id, v_onboarding_id, v_session.id, v_session.signing_group_id,
    v_session.signer_name, lower(v_session.signer_email), 'Seller', p_invite_token_hash, p_expires_at, 'prepared'
  ) on conflict (signing_session_id) do update
    set invite_token_hash = excluded.invite_token_hash, expires_at = excluded.expires_at,
        status = 'prepared', delivery_error = null, sent_at = null, updated_at = now()
    where public.private_listing_seller_portal_recipient_invites.status in ('failed', 'expired', 'revoked')
  returning * into v_invite;

  if not found then
    select * into v_invite from public.private_listing_seller_portal_recipient_invites
    where signing_session_id = v_session.id;
  end if;
  return jsonb_build_object('inviteId', v_invite.id, 'recipientName', v_invite.recipient_name,
    'recipientEmail', v_invite.recipient_email, 'expiresAt', v_invite.expires_at,
    'alreadyPrepared', v_invite.status <> 'prepared');
end;
$$;

create or replace function public.bridge_record_listing_seller_portal_recipient_invite_delivery(
  p_invite_id uuid,
  p_sent boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_invite public.private_listing_seller_portal_recipient_invites%rowtype;
begin
  update public.private_listing_seller_portal_recipient_invites
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else sent_at end,
      delivery_error = case when p_sent then null else nullif(left(trim(coalesce(p_error, '')), 1000), '') end,
      updated_at = now()
  where id = p_invite_id
  returning * into v_invite;
  if not found then raise exception 'Seller portal recipient invitation was not found.'; end if;
  return jsonb_build_object('id', v_invite.id, 'status', v_invite.status, 'sentAt', v_invite.sent_at);
end;
$$;

revoke all on function public.bridge_list_completed_listing_seller_portal_recipients(uuid), public.bridge_prepare_listing_seller_portal_recipient_invite(uuid, text, timestamptz), public.bridge_record_listing_seller_portal_recipient_invite_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.bridge_list_completed_listing_seller_portal_recipients(uuid), public.bridge_prepare_listing_seller_portal_recipient_invite(uuid, text, timestamptz), public.bridge_record_listing_seller_portal_recipient_invite_delivery(uuid, boolean, text)
  to service_role;
