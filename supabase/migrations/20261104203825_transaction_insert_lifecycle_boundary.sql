-- Browser creation cannot bypass the registration/closeout UPDATE gates.
-- Internal administrators retain their explicit historical-import authority;
-- server-side imports retain the existing trusted database-owner bypass.
create policy transaction_insert_lifecycle_boundary on public.transactions
as restrictive for insert to authenticated
with check (
 public.bridge_current_profile_role()='internal_admin'
 or (
  registered_at is null and completed_at is null and archived_at is null
  and registered_by_user_id is null
  and lower(btrim(coalesce(lifecycle_state,'active'))) not in ('registered','completed','archived','cancelled')
  and lower(btrim(coalesce(stage,''))) not in ('registered','completed','archived','cancelled')
  and lower(btrim(coalesce(current_main_stage,'')))<>'reg'
 )
);
