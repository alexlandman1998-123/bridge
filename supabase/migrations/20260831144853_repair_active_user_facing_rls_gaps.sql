begin;

-- Restore only the browser operations that are active in the application.
-- Existing RLS remains enabled and no anonymous access is added outside the
-- token-scoped client notification contract.

create policy appointment_resources_member_read
  on public.appointment_resources
  for select
  to authenticated
  using ((select public.bridge_is_active_member(organisation_id)));

create policy billing_invoices_admin_read
  on public.billing_invoices
  for select
  to authenticated
  using ((select public.bridge_is_org_admin(organisation_id)));

create policy client_portal_notifications_token_read
  on public.client_portal_notifications
  for select
  to anon, authenticated
  using (
    visibility = 'client_visible'
    and (select public.bridge_has_client_portal_token_transaction_access(transaction_id))
    and (
      coalesce(client_portal_token, '') = ''
      or coalesce(client_portal_token, '') = (select public.bridge_client_portal_request_token())
    )
  );

create policy client_portal_notifications_token_create
  on public.client_portal_notifications
  for insert
  to anon, authenticated
  with check (
    visibility = 'client_visible'
    and (select public.bridge_has_client_portal_token_transaction_access(transaction_id))
    and (
      coalesce(client_portal_token, '') = ''
      or coalesce(client_portal_token, '') = (select public.bridge_client_portal_request_token())
    )
  );

create policy client_portal_notifications_token_update
  on public.client_portal_notifications
  for update
  to anon, authenticated
  using (
    visibility = 'client_visible'
    and (select public.bridge_has_client_portal_token_transaction_access(transaction_id))
    and (
      coalesce(client_portal_token, '') = ''
      or coalesce(client_portal_token, '') = (select public.bridge_client_portal_request_token())
    )
  )
  with check (
    visibility = 'client_visible'
    and (select public.bridge_has_client_portal_token_transaction_access(transaction_id))
    and (
      coalesce(client_portal_token, '') = ''
      or coalesce(client_portal_token, '') = (select public.bridge_client_portal_request_token())
    )
  );

create policy organisation_preferred_partners_member_read
  on public.organisation_preferred_partners
  for select
  to authenticated
  using ((select public.bridge_is_active_member(organisation_id)));

create policy transaction_financial_records_participant_read
  on public.transaction_financial_records
  for select
  to authenticated
  using ((select public.bridge_has_transaction_access(transaction_id)));

create policy transaction_financial_records_attorney_create
  on public.transaction_financial_records
  for insert
  to authenticated
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

create policy transaction_financial_records_attorney_update
  on public.transaction_financial_records
  for update
  to authenticated
  using (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  )
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

grant select on public.appointment_resources to authenticated;
grant select on public.billing_invoices to authenticated;
grant select, insert, update on public.client_portal_notifications to anon, authenticated;
grant select on public.organisation_preferred_partners to authenticated;
grant select, insert, update on public.transaction_financial_records to authenticated;

do $$
declare
  missing_policies text[];
  unexpected_delete_policies text[];
begin
  select array_agg(expected.policy_name order by expected.policy_name)
    into missing_policies
    from (
      values
        ('appointment_resources', 'appointment_resources_member_read'),
        ('billing_invoices', 'billing_invoices_admin_read'),
        ('client_portal_notifications', 'client_portal_notifications_token_read'),
        ('client_portal_notifications', 'client_portal_notifications_token_create'),
        ('client_portal_notifications', 'client_portal_notifications_token_update'),
        ('organisation_preferred_partners', 'organisation_preferred_partners_member_read'),
        ('transaction_financial_records', 'transaction_financial_records_participant_read'),
        ('transaction_financial_records', 'transaction_financial_records_attorney_create'),
        ('transaction_financial_records', 'transaction_financial_records_attorney_update')
    ) as expected(table_name, policy_name)
   where not exists (
     select 1
       from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = expected.table_name
        and policy.policyname = expected.policy_name
   );

  if coalesce(cardinality(missing_policies), 0) > 0 then
    raise exception 'Expected additive user-facing RLS policies are missing: %', missing_policies;
  end if;

  select array_agg(policy.tablename || '.' || policy.policyname order by policy.tablename, policy.policyname)
    into unexpected_delete_policies
    from pg_policies policy
   where policy.schemaname = 'public'
     and policy.tablename = any (array[
       'appointment_resources',
       'billing_invoices',
       'client_portal_notifications',
       'organisation_preferred_partners',
       'transaction_financial_records'
     ])
     and policy.cmd = 'DELETE';

  if coalesce(cardinality(unexpected_delete_policies), 0) > 0 then
    raise exception 'This repair must not add or retain browser DELETE policies: %', unexpected_delete_policies;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
