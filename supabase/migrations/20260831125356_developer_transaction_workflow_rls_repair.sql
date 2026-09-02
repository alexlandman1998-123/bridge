begin;

alter table if exists public.transaction_workflow_steps enable row level security;

drop policy if exists transaction_workflow_steps_org_member_select
  on public.transaction_workflow_steps;
create policy transaction_workflow_steps_org_member_select
  on public.transaction_workflow_steps
  for select
  to authenticated
  using (public.bridge_can_access_transaction_org_member(transaction_id));

drop policy if exists transaction_workflow_steps_org_member_insert
  on public.transaction_workflow_steps;
create policy transaction_workflow_steps_org_member_insert
  on public.transaction_workflow_steps
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_org_member(transaction_id));

drop policy if exists transaction_workflow_steps_org_member_update
  on public.transaction_workflow_steps;
create policy transaction_workflow_steps_org_member_update
  on public.transaction_workflow_steps
  for update
  to authenticated
  using (public.bridge_can_access_transaction_org_member(transaction_id))
  with check (public.bridge_can_access_transaction_org_member(transaction_id));

grant select, insert, update on public.transaction_workflow_steps to authenticated;

notify pgrst, 'reload schema';

commit;
