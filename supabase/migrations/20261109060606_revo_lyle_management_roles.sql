begin;

-- Revo's Lyle stock/settings are managed by its principal/manager. Viewing,
-- operating leads and reservations retain their existing relationship grants.
create or replace function public.bridge_has_development_relationship_capability(
  target_development_id uuid, requested_capability text
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null and exists (
      select 1
      from public.development_organisation_relationships relationship
      join public.organisation_users membership
        on membership.organisation_id = relationship.organisation_id
      where relationship.development_id = target_development_id
        and relationship.status = 'active'
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and (
          target_development_id <> '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid
          or requested_capability not in ('manage', 'inventory', 'pricing')
          or lower(coalesce(nullif(membership.workspace_role, ''), nullif(membership.organisation_role, ''), membership.role, '')) in ('principal', 'manager')
        )
        and case requested_capability
          when 'view' then relationship.can_view
          when 'operate' then relationship.can_operate
          when 'manage' then relationship.can_manage
          when 'inventory' then relationship.can_manage_inventory
          when 'pricing' then relationship.can_manage_pricing
          when 'reservations' then relationship.can_manage_reservations
          when 'financials' then relationship.can_view_financials
          else false
        end
    ), false
  );
$$;
revoke all on function public.bridge_has_development_relationship_capability(uuid, text) from public, anon;
grant execute on function public.bridge_has_development_relationship_capability(uuid, text) to authenticated;

-- Older developer/token policies must not bypass the Lyle stock boundary.
create policy lyle_stock_insert_boundary on public.units as restrictive for insert to authenticated
with check (development_id <> '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid or public.bridge_can_manage_development_units(development_id));
create policy lyle_stock_update_boundary on public.units as restrictive for update to authenticated
using (development_id <> '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid or public.bridge_can_manage_development_units(development_id))
with check (development_id <> '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid or public.bridge_can_manage_development_units(development_id));
create policy lyle_stock_delete_boundary on public.units as restrictive for delete to authenticated
using (development_id <> '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid or public.bridge_can_manage_development_units(development_id));

-- Agency introduction into The Lyle is a lead operation, not a stock edit.
-- Preserve the existing rules for all other developments and lead variants.
alter policy developer_leads_insert_scoped on public.developer_leads
with check (
  (lead_owner = 'developer' and ownership_model in ('developer_direct','developer_assigned')
    and visibility_state = 'full' and public.bridge_is_active_member(developer_org_id))
  or
  (lead_owner = 'agency' and ownership_model = 'agency_introduced'
    and selling_model = 'agent_led' and visibility_state in ('limited','consent_pending')
    and source_agency_org_id is not null and public.bridge_is_active_member(source_agency_org_id)
    and primary_development_id is not null
    and (
      public.bridge_can_manage_development_record(primary_development_id)
      or (primary_development_id = '39b18f3e-5352-4b73-acdd-014e12f3924c'::uuid
        and source_agency_org_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
        and public.bridge_has_development_relationship_capability(primary_development_id, 'operate'))
    ))
);

commit;
