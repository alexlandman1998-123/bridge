create extension if not exists "pgcrypto";
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create table if not exists public.attorney_firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  vat_number text,
  website text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  country text not null default 'South Africa',
  logo_url text,
  primary_colour text,
  secondary_colour text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true
);
create table if not exists public.attorney_firm_departments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  name text not null,
  department_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_departments_department_type_check
    check (department_type in ('transfer', 'bond', 'admin', 'management'))
);
create table if not exists public.attorney_firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid references public.attorney_firm_departments(id) on delete set null,
  role text not null,
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_members_role_check
    check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney')),
  constraint attorney_firm_members_status_check
    check (status in ('invited', 'active', 'suspended', 'removed')),
  constraint attorney_firm_members_firm_user_unique unique (firm_id, user_id)
);
create table if not exists public.attorney_firm_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  email text not null,
  role text not null,
  department_id uuid references public.attorney_firm_departments(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  token text unique not null,
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_invitations_role_check
    check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney')),
  constraint attorney_firm_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'cancelled'))
);
alter table if exists public.profiles
  add column if not exists primary_attorney_firm_id uuid references public.attorney_firms(id) on delete set null;
alter table if exists public.profiles
  add column if not exists attorney_role text;
alter table public.profiles drop constraint if exists profiles_attorney_role_check;
alter table public.profiles
  add constraint profiles_attorney_role_check
  check (
    attorney_role is null
    or attorney_role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney')
  );
create index if not exists attorney_firms_created_by_idx
  on public.attorney_firms (created_by);
create index if not exists attorney_firm_departments_firm_idx
  on public.attorney_firm_departments (firm_id);
create unique index if not exists attorney_firm_departments_firm_department_type_unique_idx
  on public.attorney_firm_departments (firm_id, department_type);
create index if not exists attorney_firm_members_firm_status_idx
  on public.attorney_firm_members (firm_id, status, role);
create index if not exists attorney_firm_members_user_idx
  on public.attorney_firm_members (user_id, status);
create index if not exists attorney_firm_invitations_firm_status_idx
  on public.attorney_firm_invitations (firm_id, status, created_at desc);
create unique index if not exists attorney_firm_invitations_firm_email_pending_unique_idx
  on public.attorney_firm_invitations (firm_id, lower(email))
  where status = 'pending';
create or replace function public.seed_default_attorney_departments()
returns trigger
language plpgsql
as $$
begin
  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (new.id, 'Transfer Department', 'transfer', true),
    (new.id, 'Bond Department', 'bond', true),
    (new.id, 'Admin Department', 'admin', true),
    (new.id, 'Management', 'management', true)
  on conflict (firm_id, department_type) do nothing;

  return new;
end;
$$;
drop trigger if exists trg_attorney_firms_seed_departments on public.attorney_firms;
create trigger trg_attorney_firms_seed_departments
after insert on public.attorney_firms
for each row
execute function public.seed_default_attorney_departments();
create or replace function public.ensure_last_attorney_firm_admin()
returns trigger
language plpgsql
as $$
declare
  admin_count bigint;
  target_firm_id uuid;
begin
  target_firm_id := coalesce(old.firm_id, new.firm_id);

  if tg_op = 'DELETE' then
    if old.role = 'firm_admin' and old.status = 'active' then
      select count(*) into admin_count
      from public.attorney_firm_members
      where firm_id = old.firm_id
        and role = 'firm_admin'
        and status = 'active'
        and id <> old.id;

      if admin_count <= 0 then
        raise exception 'A firm must always have at least one active firm_admin.';
      end if;
    end if;

    return old;
  end if;

  if old.role = 'firm_admin' and old.status = 'active' and not (new.role = 'firm_admin' and new.status = 'active') then
    select count(*) into admin_count
    from public.attorney_firm_members
    where firm_id = target_firm_id
      and role = 'firm_admin'
      and status = 'active'
      and id <> old.id;

    if admin_count <= 0 then
      raise exception 'A firm must always have at least one active firm_admin.';
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_attorney_firm_members_ensure_admin on public.attorney_firm_members;
create trigger trg_attorney_firm_members_ensure_admin
before update or delete on public.attorney_firm_members
for each row
execute function public.ensure_last_attorney_firm_admin();
drop trigger if exists trg_attorney_firms_updated_at on public.attorney_firms;
create trigger trg_attorney_firms_updated_at
before update on public.attorney_firms
for each row
execute function public.set_updated_at_timestamp();
drop trigger if exists trg_attorney_firm_departments_updated_at on public.attorney_firm_departments;
create trigger trg_attorney_firm_departments_updated_at
before update on public.attorney_firm_departments
for each row
execute function public.set_updated_at_timestamp();
drop trigger if exists trg_attorney_firm_members_updated_at on public.attorney_firm_members;
create trigger trg_attorney_firm_members_updated_at
before update on public.attorney_firm_members
for each row
execute function public.set_updated_at_timestamp();
drop trigger if exists trg_attorney_firm_invitations_updated_at on public.attorney_firm_invitations;
create trigger trg_attorney_firm_invitations_updated_at
before update on public.attorney_firm_invitations
for each row
execute function public.set_updated_at_timestamp();
create or replace function public.attorney_user_is_active_member(target_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;
create or replace function public.attorney_user_is_firm_admin(target_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'firm_admin'
  );
$$;
grant execute on function public.attorney_user_is_active_member(uuid) to authenticated;
grant execute on function public.attorney_user_is_firm_admin(uuid) to authenticated;
alter table public.attorney_firms enable row level security;
alter table public.attorney_firm_departments enable row level security;
alter table public.attorney_firm_members enable row level security;
alter table public.attorney_firm_invitations enable row level security;
drop policy if exists attorney_firms_select_member on public.attorney_firms;
create policy attorney_firms_select_member on public.attorney_firms
for select to authenticated
using (public.attorney_user_is_active_member(id));
drop policy if exists attorney_firms_insert_creator on public.attorney_firms;
create policy attorney_firms_insert_creator on public.attorney_firms
for insert to authenticated
with check (created_by = auth.uid());
drop policy if exists attorney_firms_update_admin on public.attorney_firms;
create policy attorney_firms_update_admin on public.attorney_firms
for update to authenticated
using (public.attorney_user_is_firm_admin(id))
with check (public.attorney_user_is_firm_admin(id));
drop policy if exists attorney_firm_departments_select_member on public.attorney_firm_departments;
create policy attorney_firm_departments_select_member on public.attorney_firm_departments
for select to authenticated
using (public.attorney_user_is_active_member(firm_id));
drop policy if exists attorney_firm_departments_manage_admin on public.attorney_firm_departments;
create policy attorney_firm_departments_manage_admin on public.attorney_firm_departments
for all to authenticated
using (public.attorney_user_is_firm_admin(firm_id))
with check (public.attorney_user_is_firm_admin(firm_id));
drop policy if exists attorney_firm_members_select_member on public.attorney_firm_members;
create policy attorney_firm_members_select_member on public.attorney_firm_members
for select to authenticated
using (public.attorney_user_is_active_member(firm_id));
drop policy if exists attorney_firm_members_manage_admin on public.attorney_firm_members;
create policy attorney_firm_members_manage_admin on public.attorney_firm_members
for all to authenticated
using (public.attorney_user_is_firm_admin(firm_id))
with check (public.attorney_user_is_firm_admin(firm_id));
drop policy if exists attorney_firm_invitations_select_admin on public.attorney_firm_invitations;
create policy attorney_firm_invitations_select_admin on public.attorney_firm_invitations
for select to authenticated
using (
  public.attorney_user_is_firm_admin(firm_id)
  or (
    status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
drop policy if exists attorney_firm_invitations_insert_admin on public.attorney_firm_invitations;
create policy attorney_firm_invitations_insert_admin on public.attorney_firm_invitations
for insert to authenticated
with check (public.attorney_user_is_firm_admin(firm_id));
drop policy if exists attorney_firm_invitations_update_admin on public.attorney_firm_invitations;
create policy attorney_firm_invitations_update_admin on public.attorney_firm_invitations
for update to authenticated
using (public.attorney_user_is_firm_admin(firm_id))
with check (public.attorney_user_is_firm_admin(firm_id));
drop policy if exists attorney_firm_invitations_accept_self on public.attorney_firm_invitations;
create policy attorney_firm_invitations_accept_self on public.attorney_firm_invitations
for update to authenticated
using (
  status = 'pending'
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and (expires_at is null or expires_at > now())
)
with check (
  status in ('pending', 'accepted', 'expired')
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
grant select, insert, update, delete on public.attorney_firms to authenticated;
grant select, insert, update, delete on public.attorney_firm_departments to authenticated;
grant select, insert, update, delete on public.attorney_firm_members to authenticated;
grant select, insert, update, delete on public.attorney_firm_invitations to authenticated;
