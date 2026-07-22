begin;

create table if not exists public.development_participants (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role_type text not null,
  participant_name text,
  participant_email text,
  organisation_name text,
  is_primary boolean not null default false,
  can_view boolean not null default true,
  can_create_transactions boolean not null default false,
  assignment_source text not null default 'development_default',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists development_participants_development_id_idx
  on public.development_participants (development_id);
create index if not exists development_participants_user_id_idx
  on public.development_participants (user_id);
create index if not exists development_participants_email_idx
  on public.development_participants (participant_email);

create or replace function public.bridge_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.bridge_has_development_access(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_is_admin() then true
      when exists (
        select 1
        from public.development_participants dp
        where dp.development_id = target_development_id
          and dp.is_active = true
          and dp.can_view = true
          and (
            dp.user_id = auth.uid()
            or lower(coalesce(dp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        join public.transaction_participants tp on tp.transaction_id = t.id
        where t.development_id = target_development_id
          and tp.can_view = true
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      else false
    end
$$;

alter table if exists public.developments
  add column if not exists organisation_id uuid,
  add column if not exists postal_code text;

alter table if exists public.development_profiles
  add column if not exists address text,
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists suburb text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text default 'South Africa',
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

alter table if exists public.development_financials enable row level security;
alter table if exists public.development_participants enable row level security;
alter table if exists public.development_profiles enable row level security;
alter table if exists public.development_documents enable row level security;
alter table if exists public.developments enable row level security;

create or replace function public.bridge_has_development_org_access(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.developments d
    join public.organisation_users ou
      on ou.organisation_id = d.organisation_id
    where d.id = target_development_id
      and d.organisation_id is not null
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
$$;

drop policy if exists developments_select_scoped on public.developments;
create policy developments_select_scoped on public.developments
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(id)
  or public.bridge_has_development_access(id)
);

drop policy if exists developments_insert_scoped on public.developments;
create policy developments_insert_scoped on public.developments
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
);

drop policy if exists developments_update_scoped on public.developments;
create policy developments_update_scoped on public.developments
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(id)
  or public.bridge_has_development_access(id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(id)
  or public.bridge_has_development_access(id)
);

drop policy if exists development_financials_select_scoped on public.development_financials;
create policy development_financials_select_scoped on public.development_financials
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_modify_scoped on public.development_financials;
drop policy if exists development_financials_insert_scoped on public.development_financials;
create policy development_financials_insert_scoped on public.development_financials
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_update_scoped on public.development_financials;
create policy development_financials_update_scoped on public.development_financials
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_delete_scoped on public.development_financials;
create policy development_financials_delete_scoped on public.development_financials
for delete to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_participants_modify_scoped on public.development_participants;

drop policy if exists development_participants_select_scoped on public.development_participants;
create policy development_participants_select_scoped on public.development_participants
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_participants_insert_scoped on public.development_participants;
create policy development_participants_insert_scoped on public.development_participants
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_participants_update_scoped on public.development_participants;
create policy development_participants_update_scoped on public.development_participants
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_participants_delete_scoped on public.development_participants;
create policy development_participants_delete_scoped on public.development_participants
for delete to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_profiles_select_scoped on public.development_profiles;
create policy development_profiles_select_scoped on public.development_profiles
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_profiles_modify_scoped on public.development_profiles;
create policy development_profiles_modify_scoped on public.development_profiles
for all to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_documents_select_scoped on public.development_documents;
create policy development_documents_select_scoped on public.development_documents
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_documents_insert_scoped on public.development_documents;
create policy development_documents_insert_scoped on public.development_documents
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_documents_update_scoped on public.development_documents;
create policy development_documents_update_scoped on public.development_documents
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_documents_delete_scoped on public.development_documents;
create policy development_documents_delete_scoped on public.development_documents
for delete to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
);

notify pgrst, 'reload schema';

commit;
