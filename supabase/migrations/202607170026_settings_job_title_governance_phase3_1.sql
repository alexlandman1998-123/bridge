begin;

alter table if exists public.organisation_users
  add column if not exists job_title text;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_job_title_check;

alter table if exists public.organisation_users
  add constraint organisation_users_job_title_check
  check (
    job_title is null
    or job_title in (
      'organisation_owner',
      'principal',
      'director',
      'partner',
      'administrator',
      'branch_manager',
      'sales_manager',
      'development_manager',
      'team_lead',
      'senior_agent',
      'property_practitioner',
      'agent',
      'transaction_coordinator',
      'listing_coordinator',
      'admin_coordinator',
      'assistant',
      'attorney',
      'conveyancer',
      'paralegal',
      'bond_originator',
      'bond_consultant',
      'processor',
      'consultant'
    )
  );

create or replace function public.bridge_job_title_label(p_job_title text)
returns text
language sql
immutable
set search_path = public
as $$
  select case nullif(trim(coalesce(p_job_title, '')), '')
    when 'organisation_owner' then 'Organisation Owner'
    when 'principal' then 'Principal'
    when 'director' then 'Director'
    when 'partner' then 'Partner'
    when 'administrator' then 'Administrator'
    when 'branch_manager' then 'Branch Manager'
    when 'sales_manager' then 'Sales Manager'
    when 'development_manager' then 'Development Manager'
    when 'team_lead' then 'Team Lead'
    when 'senior_agent' then 'Senior Agent'
    when 'property_practitioner' then 'Property Practitioner'
    when 'agent' then 'Agent'
    when 'transaction_coordinator' then 'Transaction Coordinator'
    when 'listing_coordinator' then 'Listing Coordinator'
    when 'admin_coordinator' then 'Admin Coordinator'
    when 'assistant' then 'Assistant'
    when 'attorney' then 'Attorney'
    when 'conveyancer' then 'Conveyancer'
    when 'paralegal' then 'Paralegal'
    when 'bond_originator' then 'Bond Originator'
    when 'bond_consultant' then 'Bond Consultant'
    when 'processor' then 'Processor'
    when 'consultant' then 'Consultant'
    else null
  end;
$$;

update public.organisation_users
set job_title = case lower(trim(coalesce(workspace_role, organisation_role, role, '')))
  when 'owner' then 'organisation_owner'
  when 'principal' then 'principal'
  when 'director' then 'director'
  when 'partner' then 'partner'
  when 'admin' then 'administrator'
  when 'admin_staff' then 'administrator'
  when 'branch_manager' then 'branch_manager'
  when 'manager' then 'branch_manager'
  when 'sales_manager' then 'sales_manager'
  when 'development_manager' then 'development_manager'
  when 'team_lead' then 'team_lead'
  when 'senior_agent' then 'senior_agent'
  when 'sales_agent' then 'property_practitioner'
  when 'agent' then 'agent'
  when 'transaction_coordinator' then 'transaction_coordinator'
  when 'listing_coordinator' then 'listing_coordinator'
  when 'admin_coordinator' then 'admin_coordinator'
  when 'assistant' then 'assistant'
  when 'attorney' then 'attorney'
  when 'conveyancer' then 'conveyancer'
  when 'paralegal' then 'paralegal'
  when 'bond_originator' then 'bond_originator'
  when 'processor' then 'processor'
  when 'consultant' then 'consultant'
  else null
end
where job_title is null;

create or replace function public.bridge_guard_organisation_user_job_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
begin
  if tg_op = 'INSERT' and new.job_title is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.job_title is not distinct from old.job_title then
    return new;
  end if;

  v_organisation_id := case when tg_op = 'INSERT' then new.organisation_id else old.organisation_id end;

  if auth.uid() is null or not exists (
    select 1
    from public.organisation_users actor
    where actor.organisation_id = v_organisation_id
      and actor.user_id = auth.uid()
      and coalesce(actor.membership_status, actor.status) = 'active'
      and lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.role, ''))) = 'owner'
  ) then
    raise exception 'Only the organisation owner can change job titles.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bridge_guard_organisation_user_job_title on public.organisation_users;
create trigger trg_bridge_guard_organisation_user_job_title
before update of job_title on public.organisation_users
for each row
execute function public.bridge_guard_organisation_user_job_title();

drop trigger if exists trg_bridge_guard_organisation_user_job_title_insert on public.organisation_users;
create trigger trg_bridge_guard_organisation_user_job_title_insert
before insert on public.organisation_users
for each row
execute function public.bridge_guard_organisation_user_job_title();

create or replace function public.bridge_sync_organisation_user_job_title_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.job_title is distinct from old.job_title then
    update public.profiles
    set title = public.bridge_job_title_label(new.job_title),
        updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_organisation_user_job_title_to_profile on public.organisation_users;
create trigger trg_bridge_sync_organisation_user_job_title_to_profile
after update of job_title on public.organisation_users
for each row
execute function public.bridge_sync_organisation_user_job_title_to_profile();

with preferred_membership as (
  select distinct on (organisation_user.user_id)
    organisation_user.user_id,
    organisation_user.job_title
  from public.organisation_users organisation_user
  where organisation_user.user_id is not null
    and coalesce(organisation_user.membership_status, organisation_user.status) = 'active'
    and organisation_user.job_title is not null
  order by organisation_user.user_id,
           organisation_user.active_workspace_selected_at desc nulls last,
           organisation_user.updated_at desc nulls last,
           organisation_user.created_at desc
)
update public.profiles profile
set title = public.bridge_job_title_label(member.job_title),
    updated_at = now()
from preferred_membership member
where member.user_id = profile.id
  and public.bridge_job_title_label(member.job_title) is distinct from profile.title;

create or replace function public.bridge_set_organisation_user_job_title(
  p_membership_id uuid,
  p_job_title text
)
returns public.organisation_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.organisation_users%rowtype;
  v_job_title text := nullif(trim(coalesce(p_job_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_target
  from public.organisation_users
  where id = p_membership_id;

  if v_target.id is null then
    raise exception 'Organisation user not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organisation_users actor
    where actor.organisation_id = v_target.organisation_id
      and actor.user_id = auth.uid()
      and coalesce(actor.membership_status, actor.status) = 'active'
      and lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.role, ''))) = 'owner'
  ) then
    raise exception 'Only the organisation owner can change job titles.' using errcode = '42501';
  end if;

  update public.organisation_users
  set job_title = v_job_title,
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  return v_target;
end;
$$;

revoke all on function public.bridge_set_organisation_user_job_title(uuid, text) from public;
revoke all on function public.bridge_set_organisation_user_job_title(uuid, text) from anon;
grant execute on function public.bridge_set_organisation_user_job_title(uuid, text) to authenticated;

create index if not exists organisation_users_job_title_idx
  on public.organisation_users (organisation_id, job_title)
  where job_title is not null;

commit;
