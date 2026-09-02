-- Agency admins have principal-equivalent operational access, but must not
-- access confidential commission structures or agent commission profiles.

drop policy if exists organisation_commission_structures_member_select on public.organisation_commission_structures;
create policy organisation_commission_structures_member_select on public.organisation_commission_structures
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);

drop policy if exists organisation_commission_structures_admin_write on public.organisation_commission_structures;
create policy organisation_commission_structures_admin_insert on public.organisation_commission_structures
for insert to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);
create policy organisation_commission_structures_admin_update on public.organisation_commission_structures
for update to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
)
with check (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);
create policy organisation_commission_structures_admin_delete on public.organisation_commission_structures
for delete to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);

drop policy if exists organisation_user_commission_profiles_member_select on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_member_select on public.organisation_user_commission_profiles
for select to authenticated
using (
  lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
  and (
    public.bridge_is_org_admin(organisation_id)
    or user_id = auth.uid()
    or lower(coalesce(email_address, '')) = lower(coalesce(public.bridge_current_email(), ''))
  )
);

drop policy if exists organisation_user_commission_profiles_admin_write on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_admin_insert on public.organisation_user_commission_profiles
for insert to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);
create policy organisation_user_commission_profiles_admin_update on public.organisation_user_commission_profiles
for update to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
)
with check (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);
create policy organisation_user_commission_profiles_admin_delete on public.organisation_user_commission_profiles
for delete to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  and lower(coalesce(public.bridge_current_workspace_role(organisation_id), '')) <> 'admin'
);
