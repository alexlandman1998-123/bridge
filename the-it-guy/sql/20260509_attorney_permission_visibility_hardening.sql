begin;

create or replace function public.attorney_user_is_firm_lead(target_firm_id uuid)
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
      and m.role in ('firm_admin', 'director_partner')
  );
$$;

grant execute on function public.attorney_user_is_firm_lead(uuid) to authenticated;

alter table if exists public.transaction_attorney_assignments enable row level security;

drop policy if exists transaction_attorney_assignments_select on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_select on public.transaction_attorney_assignments
for select to authenticated
using (
  (
    primary_attorney_id = auth.uid()
    or secretary_id = auth.uid()
    or admin_handler_id = auth.uid()
  )
  or public.attorney_user_is_firm_lead(firm_id)
);

drop policy if exists transaction_attorney_assignments_write on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_write on public.transaction_attorney_assignments
for all to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_attorney_assignments.transaction_id
      and (
        t.owner_user_id = auth.uid()
        or public.bridge_is_org_admin(t.organisation_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.firm_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_attorney_assignments.transaction_id
      and (
        t.owner_user_id = auth.uid()
        or public.bridge_is_org_admin(t.organisation_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.firm_id)
      )
  )
);

commit;
