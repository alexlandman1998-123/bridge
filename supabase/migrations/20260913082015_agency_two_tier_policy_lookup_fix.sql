begin;
-- Resolve organisation type under a narrowly scoped definer helper. Querying
-- organisations directly in organisation_users RLS recurses through its member policy.
create or replace function public.bridge_agency_management_scope(p_org uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $scope$
select auth.uid() is not null and (
  not exists(select 1 from public.organisations where id=p_org and type='agency')
  or public.bridge_agency_open_operations(p_org)
);
$scope$;
revoke all on function public.bridge_agency_management_scope(uuid) from public,anon;
grant execute on function public.bridge_agency_management_scope(uuid) to authenticated;
do $policies$
declare target text;
begin
  foreach target in array array['organisation_branches','commission_levels','referral_commission_rules','commission_targets','organisation_commission_structures','organisation_user_commission_profiles'] loop
    execute format('alter policy agency_two_tier_insert on public.%I with check (public.bridge_agency_management_scope(organisation_id))',target);
    execute format('alter policy agency_two_tier_update on public.%I using (public.bridge_agency_management_scope(organisation_id)) with check (public.bridge_agency_management_scope(organisation_id))',target);
    execute format('alter policy agency_two_tier_delete on public.%I using (public.bridge_agency_management_scope(organisation_id))',target);
  end loop;
end $policies$;
alter policy agency_two_tier_member_insert on public.organisation_users with check (public.bridge_agency_management_scope(organisation_id));
alter policy agency_two_tier_member_update on public.organisation_users using (public.bridge_agency_management_scope(organisation_id)) with check (public.bridge_agency_management_scope(organisation_id));
alter policy agency_two_tier_member_delete on public.organisation_users using (public.bridge_agency_management_scope(organisation_id));
alter policy agency_two_tier_member_read on public.organisation_users using (public.bridge_agency_management_scope(organisation_id) or user_id=(select auth.uid()));
alter policy agency_two_tier_profile_read on public.organisation_user_commission_profiles using (public.bridge_agency_management_scope(organisation_id) or user_id=(select auth.uid()) or organisation_user_id in (select id from public.organisation_users where user_id=(select auth.uid())));
commit;
