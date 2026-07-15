-- Phase 0 attorney three-role readiness report.
-- Read-only: safe to run repeatedly against the linked Supabase project.

with non_demo_transactions as (
  select
    transaction_record.id,
    lower(coalesce(transaction_record.finance_type, '')) as finance_type,
    coalesce(transaction_record.seller_has_existing_bond, false) as seller_has_existing_bond
  from public.transactions transaction_record
  where coalesce(transaction_record.is_demo_data, false) = false
),
required_roles as (
  select transaction_record.id as transaction_id, role_definition.role_type, role_definition.lane_key
  from non_demo_transactions transaction_record
  cross join lateral (
    values
      ('transfer_attorney'::text, 'transfer'::text, true),
      ('bond_attorney'::text, 'bond'::text, transaction_record.finance_type in ('bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan', 'hybrid', 'cash_and_bond', 'partial_bond', 'combination')),
      ('cancellation_attorney'::text, 'cancellation'::text, transaction_record.seller_has_existing_bond)
  ) as role_definition(role_type, lane_key, is_required)
  where role_definition.is_required
),
role_catalog as (
  select *
  from (values
    ('transfer_attorney'::text),
    ('bond_attorney'::text),
    ('cancellation_attorney'::text)
  ) as role(role_type)
),
lane_coverage as (
  select distinct
    subprocess.transaction_id,
    coalesce(
      subprocess.attorney_role,
      case subprocess.process_type
        when 'transfer' then 'transfer_attorney'
        when 'bond' then 'bond_attorney'
        when 'cancellation' then 'cancellation_attorney'
      end
    ) as attorney_role
  from public.transaction_subprocesses subprocess
  join non_demo_transactions transaction_record on transaction_record.id = subprocess.transaction_id
  where coalesce(subprocess.attorney_role, subprocess.process_type) in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'transfer', 'bond', 'cancellation')
    and coalesce(subprocess.status, '') <> 'not_required'
),
assignment_coverage as (
  select distinct assignment.transaction_id, assignment.attorney_role
  from public.transaction_attorney_assignments assignment
  join non_demo_transactions transaction_record on transaction_record.id = assignment.transaction_id
  where assignment.attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    and coalesce(assignment.assignment_status, assignment.status, '') not in ('removed', '')
),
role_player_coverage as (
  select distinct role_player.transaction_id, role_player.role_type
  from public.transaction_role_players role_player
  join non_demo_transactions transaction_record on transaction_record.id = role_player.transaction_id
  where role_player.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    and coalesce(role_player.is_demo_data, false) = false
),
role_coverage as (
  select
    role.role_type,
    count(required.transaction_id)::integer as required_transaction_count,
    count(lane.transaction_id)::integer as lane_count,
    count(assignment.transaction_id)::integer as assignment_count,
    count(role_player.transaction_id)::integer as role_player_count,
    coalesce(round(100.0 * count(assignment.transaction_id) / nullif(count(required.transaction_id), 0), 1), 0) as assignment_coverage_percent
  from role_catalog role
  left join required_roles required on required.role_type = role.role_type
  left join lane_coverage lane
    on lane.transaction_id = required.transaction_id and lane.attorney_role = required.role_type
  left join assignment_coverage assignment
    on assignment.transaction_id = required.transaction_id and assignment.attorney_role = required.role_type
  left join role_player_coverage role_player
    on role_player.transaction_id = required.transaction_id and role_player.role_type = required.role_type
  group by role.role_type
)
select
  (select count(*)::integer from non_demo_transactions) as non_demo_transactions,
  (select count(*)::integer from public.attorney_firms where is_active = true) as active_attorney_firms,
  (select count(*)::integer from public.attorney_firm_members where status = 'active') as active_attorney_firm_members,
  to_regclass('public.transaction_legal_role_appointments') is not null as legal_role_appointments_table_exists,
  to_regclass('public.legal_role_coordination_assurance_v1') is not null as legal_role_assurance_view_exists,
  (
    select count(*)::integer
    from supabase_migrations.schema_migrations migration
    where migration.version in ('202607150008', '202607150009', '202607150010', '202607150011', '202607150012', '202607150013')
  ) as legal_role_migrations_applied,
  (
    select jsonb_agg(to_jsonb(role_summary) order by role_summary.role_type)
    from role_coverage role_summary
  ) as role_coverage;
