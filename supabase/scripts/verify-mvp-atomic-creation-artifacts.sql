-- Live-catalog verification for the atomic MVP transaction-creation migration.
with expected_functions(function_name, signature) as (
  values
    ('bridge_seed_mvp_transaction_participants', 'public.bridge_seed_mvp_transaction_participants(uuid,jsonb)'),
    ('bridge_seed_mvp_transaction_documents', 'public.bridge_seed_mvp_transaction_documents(uuid,jsonb)'),
    ('bridge_seed_mvp_transaction_workflow_lanes', 'public.bridge_seed_mvp_transaction_workflow_lanes(uuid,uuid,jsonb)'),
    ('bridge_create_mvp_transaction', 'public.bridge_create_mvp_transaction(jsonb)'),
    ('bridge_create_mvp_transaction_operator_fallback', 'public.bridge_create_mvp_transaction_operator_fallback(jsonb,text)')
), function_catalog as (
  select
    expected_functions.function_name,
    expected_functions.signature,
    to_regprocedure(expected_functions.signature) as procedure_oid
  from expected_functions
), function_grants as (
  select
    procedure_oid,
    coalesce(role_name.rolname, 'PUBLIC') as grantee,
    privilege.privilege_type,
    privilege.is_grantable
  from function_catalog
  join pg_proc procedure on procedure.oid = function_catalog.procedure_oid
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  left join pg_roles role_name on role_name.oid = privilege.grantee
)
select jsonb_build_object(
  'idempotency_index_exists', to_regclass('public.transactions_mvp_creation_idempotency_uidx') is not null,
  'participant_requirements_table_exists', to_regclass('public.transaction_participant_requirements') is not null,
  'manual_fallback_audit_table_exists', to_regclass('public.mvp_transaction_creation_fallback_audit') is not null,
  'functions', coalesce((
    select jsonb_object_agg(function_name, procedure_oid is not null)
    from function_catalog
  ), '{}'::jsonb),
  'execute_grants', coalesce((
    select jsonb_object_agg(signature, grants)
    from (
      select signature, coalesce(jsonb_agg(jsonb_build_object(
        'grantee', grantee,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) order by grantee, privilege_type) filter (where grantee is not null), '[]'::jsonb) as grants
      from function_catalog
      left join function_grants using (procedure_oid)
      group by signature
    ) grant_rows
  ), '{}'::jsonb)
) as atomic_creation_artifacts;
