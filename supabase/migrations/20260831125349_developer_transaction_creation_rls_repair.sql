begin;

alter table if exists public.onboarding_form_data enable row level security;
alter table if exists public.transaction_subprocesses enable row level security;
alter table if exists public.transaction_subprocess_steps enable row level security;

drop policy if exists onboarding_form_data_select_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_select_transaction_spine_scope
  on public.onboarding_form_data
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists onboarding_form_data_insert_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_insert_transaction_spine_scope
  on public.onboarding_form_data
  for insert
  to authenticated
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists onboarding_form_data_update_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_update_transaction_spine_scope
  on public.onboarding_form_data
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

drop policy if exists transaction_subprocesses_developer_creation_scope
  on public.transaction_subprocesses;
create policy transaction_subprocesses_developer_creation_scope
  on public.transaction_subprocesses
  for all
  to authenticated
  using (
    process_type in ('finance', 'transfer', 'bond', 'attorney', 'cancellation')
    and public.bridge_can_access_transaction_org_member(transaction_id)
  )
  with check (
    process_type in ('finance', 'transfer', 'bond', 'attorney', 'cancellation')
    and public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_subprocess_steps_developer_creation_scope
  on public.transaction_subprocess_steps;
create policy transaction_subprocess_steps_developer_creation_scope
  on public.transaction_subprocess_steps
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and public.bridge_can_access_transaction_org_member(lane.transaction_id)
    )
  )
  with check (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and public.bridge_can_access_transaction_org_member(lane.transaction_id)
    )
  );

grant select, insert, update on public.onboarding_form_data to authenticated;
grant select, insert, update on public.transaction_subprocesses to authenticated;
grant select, insert, update on public.transaction_subprocess_steps to authenticated;

notify pgrst, 'reload schema';

commit;
