begin;

create or replace function public.bridge_status_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-status-token');
$$;

create or replace function public.bridge_can_access_transaction_org_member(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions tx
    where tx.id = target_transaction_id
      and tx.organisation_id is not null
      and public.bridge_is_active_member(tx.organisation_id)
  );
$$;

create or replace function public.bridge_has_status_token_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_status_links link
    where link.transaction_id = target_transaction_id
      and link.is_active is true
      and link.token = public.bridge_status_request_token()
  );
$$;

alter table if exists public.transactions enable row level security;
alter table if exists public.transaction_status_links enable row level security;
alter table if exists public.transaction_onboarding enable row level security;

drop policy if exists transactions_select_status_token_scope
  on public.transactions;
create policy transactions_select_status_token_scope
  on public.transactions
  for select
  to anon, authenticated
  using (public.bridge_has_status_token_transaction_access(id));

drop policy if exists transaction_status_links_select_portal_scope
  on public.transaction_status_links;
drop policy if exists transaction_status_links_select_token_scope
  on public.transaction_status_links;
create policy transaction_status_links_select_token_scope
  on public.transaction_status_links
  for select
  to anon, authenticated
  using (
    is_active is true
    and token = public.bridge_status_request_token()
  );

drop policy if exists transaction_status_links_select_portal_scope
  on public.transaction_status_links;
create policy transaction_status_links_select_portal_scope
  on public.transaction_status_links
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_status_links_insert_transaction_spine_scope
  on public.transaction_status_links;
create policy transaction_status_links_insert_transaction_spine_scope
  on public.transaction_status_links
  for insert
  to authenticated
  with check (
    is_active is true
    and (
      public.bridge_can_access_transaction_spine(transaction_id)
      or public.bridge_can_access_transaction_org_member(transaction_id)
    )
  );

drop policy if exists transaction_status_links_update_transaction_spine_scope
  on public.transaction_status_links;
create policy transaction_status_links_update_transaction_spine_scope
  on public.transaction_status_links
  for update
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  )
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_onboarding_select_portal_scope
  on public.transaction_onboarding;
drop policy if exists transaction_onboarding_select_token_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_select_token_scope
  on public.transaction_onboarding
  for select
  to anon, authenticated
  using (
    is_active is true
    and token = public.bridge_onboarding_request_token()
  );

drop policy if exists transaction_onboarding_select_portal_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_select_portal_scope
  on public.transaction_onboarding
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_onboarding_insert_transaction_spine_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_insert_transaction_spine_scope
  on public.transaction_onboarding
  for insert
  to authenticated
  with check (
    is_active is true
    and (
      public.bridge_can_access_transaction_spine(transaction_id)
      or public.bridge_can_access_transaction_org_member(transaction_id)
    )
  );

drop policy if exists transaction_onboarding_update_transaction_spine_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_update_transaction_spine_scope
  on public.transaction_onboarding
  for update
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  )
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

grant execute on function public.bridge_status_request_token() to anon, authenticated;
grant execute on function public.bridge_can_access_transaction_org_member(uuid) to authenticated;
grant execute on function public.bridge_has_status_token_transaction_access(uuid) to anon, authenticated;

grant select on public.transactions to anon, authenticated;
grant select on public.transaction_status_links to anon, authenticated;
grant insert, update on public.transaction_status_links to authenticated;

grant select on public.transaction_onboarding to anon, authenticated;
grant insert, update on public.transaction_onboarding to authenticated;

notify pgrst, 'reload schema';

commit;
