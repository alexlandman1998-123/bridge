begin;

-- transaction_commissions was originally exposed to anon without RLS. Keep
-- service_role behaviour unchanged, but make browser access membership and
-- assignment aware.
alter table if exists public.transaction_commissions enable row level security;

revoke all on table public.transaction_commissions from anon;
grant select, insert, update, delete on table public.transaction_commissions to authenticated;

drop policy if exists transaction_commissions_agent_select on public.transaction_commissions;
create policy transaction_commissions_agent_select
on public.transaction_commissions
for select
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and (
      assigned_agent_id = (select auth.uid())
      or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(public.bridge_current_email(), ''))
    )
  )
);

drop policy if exists transaction_commissions_admin_insert on public.transaction_commissions;
create policy transaction_commissions_admin_insert
on public.transaction_commissions
for insert
to authenticated
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists transaction_commissions_admin_update on public.transaction_commissions;
create policy transaction_commissions_admin_update
on public.transaction_commissions
for update
to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists transaction_commissions_admin_delete on public.transaction_commissions;
create policy transaction_commissions_admin_delete
on public.transaction_commissions
for delete
to authenticated
using (public.bridge_is_org_admin(organisation_id));

create index if not exists transaction_commissions_assigned_agent_id_idx
  on public.transaction_commissions (assigned_agent_id)
  where assigned_agent_id is not null;

create index if not exists transaction_commissions_assigned_agent_email_lower_idx
  on public.transaction_commissions (lower(assigned_agent_email))
  where assigned_agent_email is not null;

notify pgrst, 'reload schema';

commit;
