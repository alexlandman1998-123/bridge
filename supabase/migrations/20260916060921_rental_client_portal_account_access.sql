begin;

-- Account access is intentionally separate from the existing public-link tables.
-- Those links remain supported while agencies transition clients to sign-in.
create table if not exists public.rental_client_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid,
  audience text not null check (audience in ('tenant', 'landlord')),
  tenancy_id uuid references public.rental_tenancies(id) on delete cascade,
  property_id uuid references public.rental_properties(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (audience = 'tenant' and tenancy_id is not null and property_id is null)
    or (audience = 'landlord' and tenancy_id is null and property_id is not null)
  )
);

create table if not exists public.rental_client_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('tenant', 'landlord')),
  tenancy_id uuid references public.rental_tenancies(id) on delete cascade,
  property_id uuid references public.rental_properties(id) on delete cascade,
  invitation_id uuid references public.rental_client_portal_invitations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  check (
    (audience = 'tenant' and tenancy_id is not null and property_id is null)
    or (audience = 'landlord' and tenancy_id is null and property_id is not null)
  )
);

create unique index if not exists rental_client_portal_memberships_tenant_unique
  on public.rental_client_portal_memberships(user_id, tenancy_id)
  where audience = 'tenant';
create unique index if not exists rental_client_portal_memberships_landlord_unique
  on public.rental_client_portal_memberships(user_id, property_id)
  where audience = 'landlord';
create index if not exists rental_client_portal_invitations_lookup_idx
  on public.rental_client_portal_invitations(token_hash, expires_at)
  where accepted_at is null and revoked_at is null;
create index if not exists rental_client_portal_memberships_user_idx
  on public.rental_client_portal_memberships(user_id, status);

create or replace function public.rental_client_portal_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rental_client_portal_invitations_touch on public.rental_client_portal_invitations;
create trigger trg_rental_client_portal_invitations_touch
  before update on public.rental_client_portal_invitations
  for each row execute function public.rental_client_portal_touch();
drop trigger if exists trg_rental_client_portal_memberships_touch on public.rental_client_portal_memberships;
create trigger trg_rental_client_portal_memberships_touch
  before update on public.rental_client_portal_memberships
  for each row execute function public.rental_client_portal_touch();

alter table public.rental_client_portal_invitations enable row level security;
alter table public.rental_client_portal_memberships enable row level security;
revoke all on public.rental_client_portal_invitations, public.rental_client_portal_memberships from anon, authenticated;
grant select on public.rental_client_portal_memberships to authenticated;

create policy rental_client_portal_memberships_self_read
  on public.rental_client_portal_memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- Agencies can create a single-use activation link from their existing staff UI.
-- The returned raw token must be sent through the approved communications channel
-- and is intentionally never stored in the database.
create or replace function public.rental_client_portal_create_invitation(
  p_audience text,
  p_email text,
  p_tenancy_id uuid default null,
  p_property_id uuid default null,
  p_expires_in_days integer default 14
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_organisation_id uuid;
  v_branch_id uuid;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null
    or p_audience not in ('tenant', 'landlord')
    or length(btrim(coalesce(p_email, ''))) = 0
    or p_expires_in_days not between 1 and 30 then
    raise exception 'A valid client invitation is required.';
  end if;

  if p_audience = 'tenant' and p_tenancy_id is not null and p_property_id is null then
    select tenancy.organisation_id, property.branch_id into v_organisation_id, v_branch_id
    from public.rental_tenancies tenancy
    join public.rental_properties property on property.id = tenancy.property_id
    where tenancy.id = p_tenancy_id
      and public.rental_branch_access(property.organisation_id, property.branch_id);
  elsif p_audience = 'landlord' and p_property_id is not null and p_tenancy_id is null then
    select property.organisation_id, property.branch_id into v_organisation_id, v_branch_id
    from public.rental_properties property
    where property.id = p_property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id);
  else
    raise exception 'Choose one valid rental relationship for this invitation.';
  end if;

  if v_organisation_id is null then raise exception 'Not authorized to invite this client.'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + make_interval(days => p_expires_in_days);

  insert into public.rental_client_portal_invitations (
    organisation_id, branch_id, audience, tenancy_id, property_id, email, token_hash, expires_at, created_by
  ) values (
    v_organisation_id, v_branch_id, p_audience, p_tenancy_id, p_property_id, lower(btrim(p_email)),
    encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires_at, auth.uid()
  ) returning id into v_invitation_id;

  return jsonb_build_object('invitation_id', v_invitation_id, 'token', v_token, 'expires_at', v_expires_at);
end;
$$;

-- The raw invitation token is never selectable. An authenticated person can only
-- activate an unexpired, non-revoked invitation addressed to their auth email.
create or replace function public.rental_client_portal_accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.rental_client_portal_invitations%rowtype;
  v_email text;
  v_membership_id uuid;
begin
  if auth.uid() is null or length(btrim(coalesce(p_token, ''))) < 24 then
    raise exception 'This invitation cannot be accepted.';
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'This invitation cannot be accepted.';
  end if;

  select * into v_invitation
  from public.rental_client_portal_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found or lower(v_invitation.email) <> v_email then
    raise exception 'This invitation is invalid, expired, or addressed to a different email address.';
  end if;

  if v_invitation.audience = 'tenant' then
    insert into public.rental_client_portal_memberships (
      organisation_id, branch_id, user_id, audience, tenancy_id, invitation_id
    ) values (
      v_invitation.organisation_id, v_invitation.branch_id, auth.uid(), 'tenant', v_invitation.tenancy_id, v_invitation.id
    )
    on conflict (user_id, tenancy_id) where audience = 'tenant'
    do update set status = 'active', revoked_at = null, revoked_by = null, invitation_id = excluded.invitation_id, updated_at = now()
    returning id into v_membership_id;
  else
    insert into public.rental_client_portal_memberships (
      organisation_id, branch_id, user_id, audience, property_id, invitation_id
    ) values (
      v_invitation.organisation_id, v_invitation.branch_id, auth.uid(), 'landlord', v_invitation.property_id, v_invitation.id
    )
    on conflict (user_id, property_id) where audience = 'landlord'
    do update set status = 'active', revoked_at = null, revoked_by = null, invitation_id = excluded.invitation_id, updated_at = now()
    returning id into v_membership_id;
  end if;

  update public.rental_client_portal_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invitation.id;

  return jsonb_build_object('membership_id', v_membership_id, 'audience', v_invitation.audience);
end;
$$;

create or replace function public.rental_client_portal_revoke_membership(p_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_membership public.rental_client_portal_memberships%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_membership from public.rental_client_portal_memberships where id = p_membership_id for update;
  if not found or not public.rental_branch_access(v_membership.organisation_id, v_membership.branch_id) then
    raise exception 'Not authorized';
  end if;
  update public.rental_client_portal_memberships
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where id = v_membership.id;
end;
$$;

revoke all on function public.rental_client_portal_touch() from public, anon, authenticated;
revoke all on function public.rental_client_portal_create_invitation(text, text, uuid, uuid, integer) from public, anon;
revoke all on function public.rental_client_portal_accept_invitation(text) from public, anon;
revoke all on function public.rental_client_portal_revoke_membership(uuid) from public, anon;
grant execute on function public.rental_client_portal_create_invitation(text, text, uuid, uuid, integer) to authenticated;
grant execute on function public.rental_client_portal_accept_invitation(text) to authenticated;
grant execute on function public.rental_client_portal_revoke_membership(uuid) to authenticated;

commit;
