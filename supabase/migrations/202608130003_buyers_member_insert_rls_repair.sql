begin;

alter table if exists public.buyers
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;

alter table if exists public.buyers enable row level security;

create index if not exists buyers_organisation_lookup_idx
  on public.buyers (organisation_id, lower(email), phone);

drop policy if exists buyers_select_member_scope on public.buyers;
create policy buyers_select_member_scope on public.buyers
for select to authenticated
using (
  organisation_id is not null
  and public.bridge_is_active_member(organisation_id)
);

drop policy if exists buyers_insert_member_scope on public.buyers;
create policy buyers_insert_member_scope on public.buyers
for insert to authenticated
with check (
  organisation_id is not null
  and public.bridge_is_active_member(organisation_id)
);

drop policy if exists buyers_update_member_scope on public.buyers;
create policy buyers_update_member_scope on public.buyers
for update to authenticated
using (
  organisation_id is not null
  and public.bridge_is_active_member(organisation_id)
)
with check (
  organisation_id is not null
  and public.bridge_is_active_member(organisation_id)
);

grant select, insert, update on table public.buyers to authenticated;

notify pgrst, 'reload schema';

commit;
