-- Replace legacy demo-wide RLS policies with scoped production policies.
--
-- This migration deliberately preserves table grants. Supabase API access
-- requires both grants and RLS; revoking grants here would break legitimate
-- portal and authenticated workflows before RLS has a chance to evaluate.

begin;

create or replace function public.bridge_has_legacy_firm_membership(
  target_firm_id uuid,
  require_admin boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.firm_memberships membership
      where membership.firm_id = target_firm_id
        and membership.user_id = auth.uid()
        and lower(coalesce(membership.status, '')) = 'active'
        and (
          not require_admin
          or lower(coalesce(membership.role, '')) in ('firm_admin', 'lead_attorney')
        )
    );
$$;

revoke all on function public.bridge_has_legacy_firm_membership(uuid, boolean)
  from public, anon;
grant execute on function public.bridge_has_legacy_firm_membership(uuid, boolean)
  to authenticated, service_role;

-- Static document taxonomy is readable by portal users, but only platform
-- administrators can change the global catalogue.
drop policy if exists document_groups_select_scoped on public.document_groups;
create policy document_groups_select_scoped
on public.document_groups
for select
to anon, authenticated
using (
  is_enabled = true
  and (is_client_visible = true or auth.uid() is not null)
);

drop policy if exists document_groups_admin_insert on public.document_groups;
create policy document_groups_admin_insert
on public.document_groups
for insert
to authenticated
with check (public.bridge_is_admin());

drop policy if exists document_groups_admin_update on public.document_groups;
create policy document_groups_admin_update
on public.document_groups
for update
to authenticated
using (public.bridge_is_admin())
with check (public.bridge_is_admin());

drop policy if exists document_groups_admin_delete on public.document_groups;
create policy document_groups_admin_delete
on public.document_groups
for delete
to authenticated
using (public.bridge_is_admin());

drop policy if exists document_templates_select_scoped on public.document_templates;
create policy document_templates_select_scoped
on public.document_templates
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.document_groups document_group
    where document_group.key = document_templates.group_key
      and document_group.is_enabled = true
      and (document_group.is_client_visible = true or auth.uid() is not null)
  )
);

drop policy if exists document_templates_admin_insert on public.document_templates;
create policy document_templates_admin_insert
on public.document_templates
for insert
to authenticated
with check (public.bridge_is_admin());

drop policy if exists document_templates_admin_update on public.document_templates;
create policy document_templates_admin_update
on public.document_templates
for update
to authenticated
using (public.bridge_is_admin())
with check (public.bridge_is_admin());

drop policy if exists document_templates_admin_delete on public.document_templates;
create policy document_templates_admin_delete
on public.document_templates
for delete
to authenticated
using (public.bridge_is_admin());

-- Development document requirements are visible to the relevant workspace or
-- token-scoped portal. Only organisation/development administrators may edit.
drop policy if exists document_requirements_select_scoped on public.document_requirements;
create policy document_requirements_select_scoped
on public.document_requirements
for select
to anon, authenticated
using (
  development_id is null
  or public.bridge_is_admin()
  or public.bridge_has_development_org_access(development_id)
  or public.bridge_has_development_access(development_id)
  or public.bridge_has_request_development_token_access(development_id)
  or exists (
    select 1
    from public.transactions transaction_record
    where transaction_record.development_id = document_requirements.development_id
      and public.bridge_has_external_workspace_transaction_access(transaction_record.id)
  )
);

drop policy if exists document_requirements_insert_scoped on public.document_requirements;
create policy document_requirements_insert_scoped
on public.document_requirements
for insert
to authenticated
with check (
  development_id is not null
  and (
    public.bridge_is_admin()
    or public.bridge_has_development_org_access(development_id)
  )
);

drop policy if exists document_requirements_update_scoped on public.document_requirements;
create policy document_requirements_update_scoped
on public.document_requirements
for update
to authenticated
using (
  development_id is not null
  and (
    public.bridge_is_admin()
    or public.bridge_has_development_org_access(development_id)
  )
)
with check (
  development_id is not null
  and (
    public.bridge_is_admin()
    or public.bridge_has_development_org_access(development_id)
  )
);

drop policy if exists document_requirements_delete_scoped on public.document_requirements;
create policy document_requirements_delete_scoped
on public.document_requirements
for delete
to authenticated
using (
  development_id is not null
  and (
    public.bridge_is_admin()
    or public.bridge_has_development_org_access(development_id)
  )
);

-- Request-group reads follow the same transaction and token scopes as the
-- document request/document tables. Mutations remain internal-only.
drop policy if exists document_request_groups_select_scoped on public.document_request_groups;
create policy document_request_groups_select_scoped
on public.document_request_groups
for select
to anon, authenticated
using (
  public.bridge_has_transaction_access(transaction_id)
  or public.bridge_can_access_transaction_spine(transaction_id)
  or public.bridge_has_external_workspace_transaction_access(transaction_id)
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
  or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_request_transaction_token_access(transaction_id)
);

drop policy if exists document_request_groups_insert_scoped on public.document_request_groups;
create policy document_request_groups_insert_scoped
on public.document_request_groups
for insert
to authenticated
with check (public.bridge_can_view_internal_transaction_content(transaction_id));

drop policy if exists document_request_groups_update_scoped on public.document_request_groups;
create policy document_request_groups_update_scoped
on public.document_request_groups
for update
to authenticated
using (public.bridge_can_view_internal_transaction_content(transaction_id))
with check (public.bridge_can_view_internal_transaction_content(transaction_id));

drop policy if exists document_request_groups_delete_scoped on public.document_request_groups;
create policy document_request_groups_delete_scoped
on public.document_request_groups
for delete
to authenticated
using (public.bridge_can_view_internal_transaction_content(transaction_id));

-- Legacy firm directory rows contain no public portal data. Authenticated users
-- can resolve firm names; membership details remain firm-scoped.
drop policy if exists firms_authenticated_select on public.firms;
create policy firms_authenticated_select
on public.firms
for select
to authenticated
using (true);

drop policy if exists firms_admin_insert on public.firms;
create policy firms_admin_insert
on public.firms
for insert
to authenticated
with check (public.bridge_is_admin());

drop policy if exists firms_firm_admin_update on public.firms;
create policy firms_firm_admin_update
on public.firms
for update
to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(id, true)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(id, true)
);

drop policy if exists firms_firm_admin_delete on public.firms;
create policy firms_firm_admin_delete
on public.firms
for delete
to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(id, true)
);

drop policy if exists firm_memberships_select_scoped on public.firm_memberships;
create policy firm_memberships_select_scoped
on public.firm_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(firm_id, false)
);

drop policy if exists firm_memberships_admin_insert on public.firm_memberships;
create policy firm_memberships_admin_insert
on public.firm_memberships
for insert
to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(firm_id, true)
);

drop policy if exists firm_memberships_admin_update on public.firm_memberships;
create policy firm_memberships_admin_update
on public.firm_memberships
for update
to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(firm_id, true)
)
with check (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(firm_id, true)
);

drop policy if exists firm_memberships_admin_delete on public.firm_memberships;
create policy firm_memberships_admin_delete
on public.firm_memberships
for delete
to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_has_legacy_firm_membership(firm_id, true)
);

-- Issue overrides are internal operational records scoped to their transaction.
drop policy if exists transaction_issue_overrides_select_scoped on public.transaction_issue_overrides;
create policy transaction_issue_overrides_select_scoped
on public.transaction_issue_overrides
for select
to authenticated
using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_issue_overrides_insert_scoped on public.transaction_issue_overrides;
create policy transaction_issue_overrides_insert_scoped
on public.transaction_issue_overrides
for insert
to authenticated
with check (public.bridge_can_view_internal_transaction_content(transaction_id));

drop policy if exists transaction_issue_overrides_update_scoped on public.transaction_issue_overrides;
create policy transaction_issue_overrides_update_scoped
on public.transaction_issue_overrides
for update
to authenticated
using (public.bridge_can_view_internal_transaction_content(transaction_id))
with check (public.bridge_can_view_internal_transaction_content(transaction_id));

drop policy if exists transaction_issue_overrides_delete_scoped on public.transaction_issue_overrides;
create policy transaction_issue_overrides_delete_scoped
on public.transaction_issue_overrides
for delete
to authenticated
using (public.bridge_can_view_internal_transaction_content(transaction_id));

-- Remove every legacy demo-wide policy after all missing replacement scopes
-- above exist. Other affected tables already have scoped production policies.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '%!_demo!_all' escape '!'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- These baseline policies are not named *_demo_all but have the same
-- unrestricted effect. Each table already has scoped replacement policies.
drop policy if exists "Allow all read buyers" on public.buyers;
drop policy if exists "Allow all write buyers" on public.buyers;
drop policy if exists "Allow all read documents" on public.documents;
drop policy if exists "Allow all write documents" on public.documents;
drop policy if exists "Allow all read notes" on public.notes;
drop policy if exists "Allow all write notes" on public.notes;
drop policy if exists "Allow all read units" on public.units;
drop policy if exists "Allow all write units" on public.units;

do $$
declare
  finding_count integer;
begin
  select count(*) into finding_count
  from pg_policies
  where schemaname = 'public'
    and policyname like '%!_demo!_all' escape '!';

  if finding_count <> 0 then
    raise exception 'legacy demo-wide policies remain after Phase 1 hardening: %', finding_count;
  end if;

  select count(*) into finding_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'Allow all read buyers', 'Allow all write buyers',
      'Allow all read documents', 'Allow all write documents',
      'Allow all read notes', 'Allow all write notes',
      'Allow all read units', 'Allow all write units'
    );

  if finding_count <> 0 then
    raise exception 'unrestricted baseline policies remain after Phase 1 hardening: %', finding_count;
  end if;

  select count(*) into finding_count
  from (values
    ('document_groups'),
    ('document_request_groups'),
    ('document_requirements'),
    ('document_templates'),
    ('firm_memberships'),
    ('firms'),
    ('transaction_issue_overrides')
  ) required(table_name)
  where not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = required.table_name
  );

  if finding_count <> 0 then
    raise exception 'Phase 1 replacement policies are missing for % legacy tables', finding_count;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
