begin;
-- Membership fields own authority. A profile's app role and a home branch do
-- not override an organisation owner's canonical role. Explicit scopes still win.
create or replace function handoff_private.can_manage_recovery(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organisation_users membership
    cross join lateral (
      select to_jsonb(membership) as fields
    ) source
    cross join lateral (
      select lower(coalesce(
        nullif(trim(source.fields->>'workspace_role'), ''),
        nullif(trim(source.fields->>'organisation_role'), ''),
        nullif(trim(source.fields->>'organization_role'), ''),
        nullif(trim(source.fields->>'role'), ''), ''
      )) as role,
      lower(nullif(trim(source.fields->>'scope_level'), '')) as scope,
      lower(nullif(trim(source.fields->>'branch_scope'), '')) as branch_scope
    ) authority
    where membership.organisation_id = p_org and membership.user_id = auth.uid()
      and lower(trim(membership.status)) = 'active'
      and lower(coalesce(nullif(trim(source.fields->>'membership_status'), ''), 'active')) = 'active'
      and authority.role in ('owner', 'admin', 'administrator', 'manager', 'principal', 'hq_manager')
      and case
        when authority.scope is not null then authority.scope in ('workspace_hq', 'organisation', 'organization')
        when authority.branch_scope in ('assigned_branch', 'branch', 'region', 'assigned') then false
        when authority.branch_scope = 'all_branches' then true
        when authority.branch_scope is not null and authority.branch_scope <> 'own' then false
        when authority.role in ('owner', 'admin', 'administrator', 'principal', 'hq_manager') then true
        else false -- A manager needs explicit HQ or all-branches authority.
      end
  );
$$;
revoke all on function handoff_private.can_manage_recovery(uuid) from public, anon, authenticated, service_role;

-- The dashboard uses this same authority decision before loading organisation
-- work. This exposes only the caller's access decision, never membership details.
create or replace function public.bridge_read_organisation_handoff_queue_access(p_organisation_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('success', true, 'organisationId', p_organisation_id,
    'canManage', handoff_private.can_manage_recovery(p_organisation_id));
$$;
revoke all on function public.bridge_read_organisation_handoff_queue_access(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_read_organisation_handoff_queue_access(uuid) to authenticated;
commit;
