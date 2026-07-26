begin;

do $$
declare
  v_canonical_org_id uuid := 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a';
  v_duplicate_org_id uuid := '719140a0-683c-4052-a687-33ce1221f5dc';
begin
  update public.organisations
     set status = 'active',
         updated_at = now(),
         settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
           'canonicalWorkspaceLock', jsonb_build_object(
             'canonicalFor', 'produktive',
             'lockedAt', now(),
             'reason', 'canonical_active_workspace_with_live_listings'
           )
         )
   where id = v_canonical_org_id;

  update public.organisations
     set status = 'archived',
         discovery_visibility = 'hidden',
         updated_at = now(),
         settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
           'retiredDuplicateOf', v_canonical_org_id,
           'canonicalWorkspaceLock', jsonb_build_object(
             'canonicalFor', 'produktive',
             'lockedTo', v_canonical_org_id,
             'lockedAt', now(),
             'reason', 'duplicate_retired_no_live_records'
           )
         )
   where id = v_duplicate_org_id;

  update public.organisation_users
     set status = 'deactivated',
         membership_status = 'deactivated',
         updated_at = now()
   where organisation_id = v_duplicate_org_id
     and coalesce(membership_status, status) in ('active', 'pending', 'invited');

  if to_regclass('public.user_workspace_preferences') is not null then
    update public.user_workspace_preferences preference
       set active_workspace_id = v_canonical_org_id,
           active_workspace_source = 'system_recovery',
           updated_at = now()
     where preference.active_workspace_id = v_duplicate_org_id
       and exists (
         select 1
           from public.organisation_users membership
          where membership.user_id = preference.user_id
            and membership.organisation_id = v_canonical_org_id
            and coalesce(membership.membership_status, membership.status) = 'active'
       );

    update public.user_workspace_preferences
       set active_workspace_id = null,
           active_workspace_source = 'system_recovery',
           updated_at = now()
     where active_workspace_id = v_duplicate_org_id;
  end if;
end;
$$;

commit;
