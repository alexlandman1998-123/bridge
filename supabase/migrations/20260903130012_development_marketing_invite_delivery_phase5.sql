begin;

-- Phase 5 deliberately keeps Marketing Hub invitations separate from the
-- developer_partner_relationships / organisation_partners operational graph.
-- A token can only activate the already-scoped marketing access row.
create table if not exists public.development_marketing_invites (
  id uuid primary key default gen_random_uuid(),
  marketing_access_id uuid not null unique references public.development_marketing_access(id) on delete cascade,
  invite_token text not null unique,
  invitee_email text not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_marketing_invites_email_check
    check (invitee_email = lower(btrim(invitee_email)))
);

create index if not exists development_marketing_invites_pending_email_idx
  on public.development_marketing_invites (invitee_email, expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.development_marketing_invites enable row level security;
revoke all on table public.development_marketing_invites from anon, authenticated;

create or replace function public.bridge_touch_development_marketing_invite_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_development_marketing_invites_updated_at on public.development_marketing_invites;
create trigger trg_development_marketing_invites_updated_at
before update on public.development_marketing_invites
for each row execute function public.bridge_touch_development_marketing_invite_updated_at();

create or replace function public.bridge_prepare_development_marketing_invite(target_marketing_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.development_marketing_access%rowtype;
  v_development_name text;
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before preparing a marketing invitation.' using errcode = '42501';
  end if;

  select * into v_access
  from public.development_marketing_access
  where id = target_marketing_access_id
  for update;

  if not found then
    raise exception 'Marketing access invitation not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_can_manage_development_record(v_access.development_id) then
    raise exception 'Only the development team can invite marketing collaborators.' using errcode = '42501';
  end if;
  if v_access.invitee_email is null then
    raise exception 'This marketing access row is already connected to an organisation or user.' using errcode = '22023';
  end if;
  if v_access.status in ('revoked', 'expired') then
    raise exception 'This marketing access invitation is no longer active.' using errcode = '22023';
  end if;
  if v_access.status = 'active' then
    raise exception 'This marketing access invitation has already been accepted.' using errcode = '22023';
  end if;

  select name into v_development_name from public.developments where id = v_access.development_id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.development_marketing_invites (
    marketing_access_id, invite_token, invitee_email, sent_at, expires_at, revoked_at, accepted_at
  ) values (
    v_access.id, v_token, lower(v_access.invitee_email), now(), v_expires_at, null, null
  )
  on conflict (marketing_access_id) do update set
    invite_token = excluded.invite_token,
    invitee_email = excluded.invitee_email,
    sent_at = excluded.sent_at,
    expires_at = excluded.expires_at,
    revoked_at = null,
    accepted_at = null;

  return jsonb_build_object(
    'token', v_token,
    'inviteeEmail', lower(v_access.invitee_email),
    'accessRole', v_access.access_role,
    'developmentName', coalesce(v_development_name, 'Development'),
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.bridge_get_development_marketing_invite(target_invite_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'developmentName', development.name,
    'accessRole', access_row.access_role,
    'expiresAt', invite.expires_at,
    'status', case
      when invite.revoked_at is not null or access_row.status = 'revoked' then 'revoked'
      when invite.accepted_at is not null or access_row.status = 'active' then 'accepted'
      when invite.expires_at <= now() or access_row.status = 'expired' then 'expired'
      else 'pending'
    end
  )
  from public.development_marketing_invites invite
  join public.development_marketing_access access_row on access_row.id = invite.marketing_access_id
  join public.developments development on development.id = access_row.development_id
  where invite.invite_token = trim(target_invite_token)
  limit 1;
$$;

create or replace function public.bridge_accept_development_marketing_invite(target_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.development_marketing_invites%rowtype;
  v_access public.development_marketing_access%rowtype;
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_development_name text;
begin
  if (select auth.uid()) is null or v_email = '' then
    raise exception 'Sign in with the invited email before accepting this invitation.' using errcode = '42501';
  end if;

  select * into v_invite
  from public.development_marketing_invites
  where invite_token = trim(target_invite_token)
  for update;
  if not found then
    raise exception 'Marketing invitation not found.' using errcode = 'P0002';
  end if;

  select * into v_access
  from public.development_marketing_access
  where id = v_invite.marketing_access_id
  for update;
  if v_invite.revoked_at is not null or v_access.status = 'revoked' then
    raise exception 'This marketing invitation has been revoked.' using errcode = '22023';
  end if;
  if v_invite.expires_at <= now() or v_access.status = 'expired' then
    raise exception 'This marketing invitation has expired.' using errcode = '22023';
  end if;
  if v_invite.accepted_at is not null or v_access.status = 'active' then
    raise exception 'This marketing invitation has already been accepted.' using errcode = '22023';
  end if;
  if lower(v_invite.invitee_email) <> v_email then
    raise exception 'Sign in with the invited email address to accept this marketing invitation.' using errcode = '42501';
  end if;

  update public.development_marketing_access
  set user_id = (select auth.uid()), status = 'active', accepted_at = now(), expires_at = null, revoked_at = null
  where id = v_access.id;
  update public.development_marketing_invites
  set accepted_at = now()
  where id = v_invite.id;
  select name into v_development_name from public.developments where id = v_access.development_id;

  return jsonb_build_object('developmentName', coalesce(v_development_name, 'Development'), 'accessRole', v_access.access_role);
end;
$$;

revoke all on function public.bridge_prepare_development_marketing_invite(uuid) from public, anon;
revoke all on function public.bridge_get_development_marketing_invite(text) from public;
revoke all on function public.bridge_accept_development_marketing_invite(text) from public, anon;
revoke all on function public.bridge_touch_development_marketing_invite_updated_at() from public, anon, authenticated;
grant execute on function public.bridge_prepare_development_marketing_invite(uuid) to authenticated;
grant execute on function public.bridge_get_development_marketing_invite(text) to anon, authenticated;
grant execute on function public.bridge_accept_development_marketing_invite(text) to authenticated;

notify pgrst, 'reload schema';
commit;
