begin;
drop policy if exists attorney_firm_departments_select_member on public.attorney_firm_departments;
create policy attorney_firm_departments_select_member on public.attorney_firm_departments
for select to authenticated
using (
  public.attorney_user_is_active_member(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = firm_id
      and f.created_by = auth.uid()
  )
);
drop policy if exists attorney_firm_departments_manage_admin on public.attorney_firm_departments;
create policy attorney_firm_departments_manage_admin on public.attorney_firm_departments
for all to authenticated
using (
  public.attorney_user_is_firm_admin(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = firm_id
      and f.created_by = auth.uid()
  )
)
with check (
  public.attorney_user_is_firm_admin(firm_id)
  or exists (
    select 1
    from public.attorney_firms f
    where f.id = firm_id
      and f.created_by = auth.uid()
  )
);
commit;
