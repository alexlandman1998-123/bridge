begin;

drop policy if exists transaction_attorney_assignments_select_firm_management
  on public.transaction_attorney_assignments;

create policy transaction_attorney_assignments_select_firm_management
  on public.transaction_attorney_assignments
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1
      from public.attorney_firm_members member
      where member.user_id = auth.uid()
        and member.status = 'active'
        and member.role in ('firm_admin', 'director_partner')
        and member.firm_id = coalesce(
          transaction_attorney_assignments.attorney_firm_id,
          transaction_attorney_assignments.firm_id
        )
    )
  );

notify pgrst, 'reload schema';

commit;
