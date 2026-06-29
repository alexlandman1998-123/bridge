begin;

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
