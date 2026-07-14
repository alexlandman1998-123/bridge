select jsonb_pretty(jsonb_build_object(
  'demo_all_policy_count', (
    select count(*) from pg_policies
    where schemaname = 'public'
      and policyname like '%!_demo!_all' escape '!'
  ),
  'unrestricted_baseline_policy_count', (
    select count(*) from pg_policies
    where schemaname = 'public'
      and policyname in (
        'Allow all read buyers', 'Allow all write buyers',
        'Allow all read documents', 'Allow all write documents',
        'Allow all read notes', 'Allow all write notes',
        'Allow all read units', 'Allow all write units'
      )
  ),
  'replacement_policy_counts', (
    select jsonb_object_agg(required.table_name, (
      select count(*) from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = required.table_name
        and policy.policyname not like '%!_demo!_all' escape '!'
    ))
    from (values
      ('document_groups'),
      ('document_request_groups'),
      ('document_requirements'),
      ('document_templates'),
      ('firm_memberships'),
      ('firms'),
      ('transaction_issue_overrides')
    ) required(table_name)
  ),
  'rls_disabled_tables', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'document_groups','document_request_groups','document_requirements',
        'document_templates','firm_memberships','firms','transaction_issue_overrides'
      ])
      and not c.relrowsecurity
  ),
  'legacy_firm_helper_exists', to_regprocedure(
    'public.bridge_has_legacy_firm_membership(uuid,boolean)'
  ) is not null
)) as verification;
