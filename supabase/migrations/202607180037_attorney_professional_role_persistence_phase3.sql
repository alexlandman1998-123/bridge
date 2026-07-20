begin;

alter table if exists public.attorney_firm_members
  add column if not exists professional_role text,
  add column if not exists practice_qualifications text[] not null default '{}'::text[],
  add column if not exists organisation_user_id uuid references public.organisation_users(id) on delete set null;

alter table if exists public.attorney_firm_invitations
  add column if not exists professional_role text,
  add column if not exists practice_qualifications text[] not null default '{}'::text[];

alter table if exists public.organisation_users
  add column if not exists attorney_professional_role text,
  add column if not exists attorney_practice_qualifications text[] not null default '{}'::text[],
  add column if not exists attorney_compatibility_role text,
  add column if not exists attorney_firm_member_id uuid references public.attorney_firm_members(id) on delete set null;

create or replace function public.bridge_normalize_attorney_professional_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(role_value, '')))
    when 'firm_admin' then 'firm_admin'
    when 'director_partner' then 'director_partner'
    when 'attorney_conveyancer' then 'attorney_conveyancer'
    when 'transfer_attorney' then 'attorney_conveyancer'
    when 'bond_attorney' then 'attorney_conveyancer'
    when 'candidate_attorney' then 'candidate_attorney'
    when 'conveyancing_secretary' then 'conveyancing_secretary'
    when 'admin_staff' then 'admin_staff'
    when 'reception_scheduling' then 'reception_scheduling'
    when 'viewer' then 'viewer'
    else 'viewer'
  end;
$$;

create or replace function public.bridge_normalize_attorney_practice_qualifications(
  role_value text,
  qualification_values text[] default '{}'::text[]
)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when cardinality(coalesce(qualification_values, '{}'::text[])) > 0 then coalesce((
      select array_agg(distinct normalized order by normalized)
      from (
        select case lower(trim(value))
          when 'transfer_attorney' then 'transfer'
          when 'bond_attorney' then 'bond'
          when 'cancellation_attorney' then 'cancellation'
          else lower(trim(value))
        end as normalized
        from unnest(qualification_values) as value
      ) candidates
      where normalized in ('transfer', 'bond', 'cancellation')
    ), '{}'::text[])
    when lower(trim(coalesce(role_value, ''))) = 'transfer_attorney' then array['transfer']::text[]
    when lower(trim(coalesce(role_value, ''))) = 'bond_attorney' then array['bond']::text[]
    else '{}'::text[]
  end;
$$;

create or replace function public.bridge_attorney_professional_to_compatibility_role(
  professional_role_value text,
  qualification_values text[] default '{}'::text[]
)
returns text
language sql
immutable
set search_path = public
as $$
  select case public.bridge_normalize_attorney_professional_role(professional_role_value)
    when 'attorney_conveyancer' then case
      when 'transfer' = any(public.bridge_normalize_attorney_practice_qualifications(null, qualification_values)) then 'transfer_attorney'
      when 'cancellation' = any(public.bridge_normalize_attorney_practice_qualifications(null, qualification_values)) then 'transfer_attorney'
      when 'bond' = any(public.bridge_normalize_attorney_practice_qualifications(null, qualification_values)) then 'bond_attorney'
      else 'viewer'
    end
    else public.bridge_normalize_attorney_professional_role(professional_role_value)
  end;
$$;

create or replace function public.bridge_attorney_role_to_organisation_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(role_value, '')))
    when 'firm_admin' then 'owner'
    when 'director_partner' then 'partner'
    when 'attorney_conveyancer' then 'attorney'
    when 'transfer_attorney' then 'attorney'
    when 'bond_attorney' then 'attorney'
    when 'candidate_attorney' then 'attorney'
    when 'conveyancing_secretary' then 'admin_staff'
    when 'reception_scheduling' then 'admin_staff'
    when 'admin_staff' then 'admin_staff'
    else 'viewer'
  end;
$$;

update public.attorney_firm_members
set
  professional_role = public.bridge_normalize_attorney_professional_role(coalesce(professional_role, role)),
  practice_qualifications = public.bridge_normalize_attorney_practice_qualifications(role, practice_qualifications)
where professional_role is null
   or professional_role is distinct from public.bridge_normalize_attorney_professional_role(professional_role)
   or practice_qualifications is distinct from public.bridge_normalize_attorney_practice_qualifications(role, practice_qualifications);

update public.attorney_firm_invitations
set
  professional_role = public.bridge_normalize_attorney_professional_role(coalesce(professional_role, role)),
  practice_qualifications = public.bridge_normalize_attorney_practice_qualifications(role, practice_qualifications)
where professional_role is null
   or professional_role is distinct from public.bridge_normalize_attorney_professional_role(professional_role)
   or practice_qualifications is distinct from public.bridge_normalize_attorney_practice_qualifications(role, practice_qualifications);

alter table if exists public.attorney_firm_members
  alter column professional_role set default 'viewer',
  alter column professional_role set not null;

alter table if exists public.attorney_firm_invitations
  alter column professional_role set default 'viewer',
  alter column professional_role set not null;

alter table if exists public.attorney_firm_members
  drop constraint if exists attorney_firm_members_role_check,
  drop constraint if exists attorney_firm_members_professional_role_check,
  drop constraint if exists attorney_firm_members_practice_qualifications_check;

alter table if exists public.attorney_firm_members
  add constraint attorney_firm_members_role_check
    check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney', 'viewer')),
  add constraint attorney_firm_members_professional_role_check
    check (professional_role in ('firm_admin', 'director_partner', 'attorney_conveyancer', 'candidate_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'viewer')),
  add constraint attorney_firm_members_practice_qualifications_check
    check (practice_qualifications <@ array['transfer', 'bond', 'cancellation']::text[]);

alter table if exists public.attorney_firm_invitations
  drop constraint if exists attorney_firm_invitations_role_check,
  drop constraint if exists attorney_firm_invitations_professional_role_check,
  drop constraint if exists attorney_firm_invitations_practice_qualifications_check;

alter table if exists public.attorney_firm_invitations
  add constraint attorney_firm_invitations_role_check
    check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney', 'viewer')),
  add constraint attorney_firm_invitations_professional_role_check
    check (professional_role in ('firm_admin', 'director_partner', 'attorney_conveyancer', 'candidate_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'viewer')),
  add constraint attorney_firm_invitations_practice_qualifications_check
    check (practice_qualifications <@ array['transfer', 'bond', 'cancellation']::text[]);

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_attorney_professional_role_check,
  drop constraint if exists organisation_users_attorney_practice_qualifications_check,
  drop constraint if exists organisation_users_attorney_compatibility_role_check;

alter table if exists public.organisation_users
  add constraint organisation_users_attorney_professional_role_check
    check (attorney_professional_role is null or attorney_professional_role in ('firm_admin', 'director_partner', 'attorney_conveyancer', 'candidate_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'viewer')),
  add constraint organisation_users_attorney_practice_qualifications_check
    check (attorney_practice_qualifications <@ array['transfer', 'bond', 'cancellation']::text[]),
  add constraint organisation_users_attorney_compatibility_role_check
    check (attorney_compatibility_role is null or attorney_compatibility_role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney', 'viewer'));

alter table if exists public.profiles
  drop constraint if exists profiles_attorney_role_check;
alter table if exists public.profiles
  add constraint profiles_attorney_role_check
  check (
    attorney_role is null
    or attorney_role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney', 'viewer')
  );

create or replace function public.bridge_sync_attorney_professional_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.professional_role := public.bridge_normalize_attorney_professional_role(
    case
      when new.professional_role is null then new.role
      when new.professional_role = 'viewer' and coalesce(new.role, 'viewer') <> 'viewer' then new.role
      else new.professional_role
    end
  );
  new.practice_qualifications := public.bridge_normalize_attorney_practice_qualifications(new.role, new.practice_qualifications);
  new.role := public.bridge_attorney_professional_to_compatibility_role(new.professional_role, new.practice_qualifications);
  return new;
end;
$$;

drop trigger if exists attorney_firm_members_sync_professional_profile on public.attorney_firm_members;
create trigger attorney_firm_members_sync_professional_profile
before insert or update of role, professional_role, practice_qualifications
on public.attorney_firm_members
for each row execute function public.bridge_sync_attorney_professional_profile();

drop trigger if exists attorney_firm_invitations_sync_professional_profile on public.attorney_firm_invitations;
create trigger attorney_firm_invitations_sync_professional_profile
before insert or update of role, professional_role, practice_qualifications
on public.attorney_firm_invitations
for each row execute function public.bridge_sync_attorney_professional_profile();

create or replace function public.bridge_link_attorney_member_to_organisation_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_user_id is not null and not exists (
    select 1
    from public.attorney_firms af
    join public.organisation_users ou on ou.organisation_id = af.organisation_id
    where af.id = new.firm_id
      and ou.id = new.organisation_user_id
      and ou.user_id = new.user_id
  ) then
    new.organisation_user_id := null;
  end if;

  if new.organisation_user_id is null then
    select ou.id
    into new.organisation_user_id
    from public.attorney_firms af
    join public.organisation_users ou on ou.organisation_id = af.organisation_id
    where af.id = new.firm_id
      and ou.user_id = new.user_id
    order by ou.created_at asc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists attorney_firm_members_link_organisation_user on public.attorney_firm_members;
create trigger attorney_firm_members_link_organisation_user
before insert or update of firm_id, user_id, organisation_user_id
on public.attorney_firm_members
for each row execute function public.bridge_link_attorney_member_to_organisation_user();

update public.attorney_firm_members afm
set organisation_user_id = ou.id
from public.attorney_firms af
join public.organisation_users ou on ou.organisation_id = af.organisation_id
where af.id = afm.firm_id
  and ou.user_id = afm.user_id
  and afm.organisation_user_id is distinct from ou.id;

update public.organisation_users ou
set
  attorney_professional_role = afm.professional_role,
  attorney_practice_qualifications = afm.practice_qualifications,
  attorney_compatibility_role = afm.role,
  attorney_firm_member_id = afm.id,
  updated_at = now()
from public.attorney_firm_members afm
where afm.organisation_user_id = ou.id;

create or replace function public.bridge_sync_attorney_profile_to_organisation_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_user_id is not null then
    update public.organisation_users
    set
      attorney_professional_role = new.professional_role,
      attorney_practice_qualifications = new.practice_qualifications,
      attorney_compatibility_role = new.role,
      attorney_firm_member_id = new.id,
      updated_at = now()
    where id = new.organisation_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists attorney_firm_members_sync_organisation_extension on public.attorney_firm_members;
create trigger attorney_firm_members_sync_organisation_extension
after insert or update of role, professional_role, practice_qualifications, organisation_user_id
on public.attorney_firm_members
for each row execute function public.bridge_sync_attorney_profile_to_organisation_user();

create or replace function public.bridge_link_organisation_user_to_attorney_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if new.user_id is null then
    return new;
  end if;

  select afm.id
  into v_member_id
  from public.attorney_firms af
  join public.attorney_firm_members afm on afm.firm_id = af.id
  where af.organisation_id = new.organisation_id
    and afm.user_id = new.user_id
  order by afm.created_at asc
  limit 1;

  if v_member_id is not null then
    update public.attorney_firm_members
    set organisation_user_id = new.id,
        updated_at = now()
    where id = v_member_id
      and organisation_user_id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists organisation_users_link_attorney_member_extension on public.organisation_users;
create trigger organisation_users_link_attorney_member_extension
after insert or update of organisation_id, user_id
on public.organisation_users
for each row execute function public.bridge_link_organisation_user_to_attorney_member();

create index if not exists attorney_firm_members_professional_role_idx
  on public.attorney_firm_members (firm_id, professional_role, status);
create index if not exists attorney_firm_members_practice_qualifications_idx
  on public.attorney_firm_members using gin (practice_qualifications);
create index if not exists attorney_firm_members_organisation_user_idx
  on public.attorney_firm_members (organisation_user_id)
  where organisation_user_id is not null;
create index if not exists organisation_users_attorney_professional_role_idx
  on public.organisation_users (organisation_id, attorney_professional_role, status)
  where attorney_professional_role is not null;

revoke all on function public.bridge_sync_attorney_professional_profile() from public, anon, authenticated;
revoke all on function public.bridge_link_attorney_member_to_organisation_user() from public, anon, authenticated;
revoke all on function public.bridge_sync_attorney_profile_to_organisation_user() from public, anon, authenticated;
revoke all on function public.bridge_link_organisation_user_to_attorney_member() from public, anon, authenticated;

comment on column public.attorney_firm_members.role is
  'Phase 3 compatibility role. Authorization remains compatible until the professional-role cutover; write through the professional profile fields.';
comment on column public.attorney_firm_members.professional_role is
  'Canonical attorney firm professional role, independent of matter-lane assignment and practice qualification.';
comment on column public.attorney_firm_members.practice_qualifications is
  'Qualified attorney practice lanes. These do not grant matter access without an active transaction assignment.';
comment on column public.organisation_users.attorney_professional_role is
  'Attorney-specific membership extension mirrored from attorney_firm_members; generic workspace role remains separate.';

commit;
