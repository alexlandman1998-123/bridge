begin;

create or replace function public.get_attorney_matter_numbering_readiness(
  p_attorney_firm_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  if p_attorney_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;

  if auth.role() is distinct from 'service_role'
    and (
      auth.uid() is null
      or not public.attorney_user_is_firm_lead(p_attorney_firm_id)
    )
  then
    raise exception 'Only firm administrators and directors can assess matter-number readiness.' using errcode = '42501';
  end if;

  with expanded_assignments as (
    select distinct
      assignment.transaction_id,
      coalesce(assignment.attorney_firm_id, assignment.firm_id) as attorney_firm_id,
      expanded_lane.lane
    from public.transaction_attorney_assignments assignment
    cross join lateral (
      select unnest(
        case assignment.assignment_type
          when 'transfer' then array['transfer']::text[]
          when 'bond' then array['bond']::text[]
          when 'cancellation' then array['cancellation']::text[]
          when 'transfer_and_bond' then array['transfer', 'bond']::text[]
          else array[]::text[]
        end
      ) as lane
    ) expanded_lane
    where coalesce(assignment.status, 'active') = 'active'
      and coalesce(assignment.assignment_status, 'active') = 'active'
      and coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_attorney_firm_id
  ),
  expected_files as (
    select
      expanded.transaction_id,
      expanded.attorney_firm_id,
      expanded.lane,
      matter_file.id as matter_file_id,
      matter_file.reference_status,
      matter_file.provisional_reference,
      matter_file.filing_reference,
      nullif(btrim(transaction.platform_reference), '') as platform_reference,
      nullif(btrim(transaction.matter_number), '') as legacy_matter_number,
      nullif(btrim(transaction.transaction_reference), '') as transaction_reference
    from expanded_assignments expanded
    join public.transactions transaction on transaction.id = expanded.transaction_id
    left join public.attorney_matter_files matter_file
      on matter_file.transaction_id = expanded.transaction_id
     and matter_file.attorney_firm_id = expanded.attorney_firm_id
     and matter_file.lane = expanded.lane
  ),
  effective_references as (
    select
      matter_file.id,
      lower(nullif(btrim(coalesce(matter_file.filing_reference, matter_file.provisional_reference)), '')) as effective_reference
    from public.attorney_matter_files matter_file
    where matter_file.attorney_firm_id = p_attorney_firm_id
  ),
  duplicate_references as (
    select reference.effective_reference
    from effective_references reference
    where reference.effective_reference is not null
    group by reference.effective_reference
    having count(*) > 1
  ),
  metrics as (
    select
      count(*)::bigint as expected_file_count,
      count(*) filter (where expected.matter_file_id is not null)::bigint as covered_file_count,
      count(*) filter (where expected.matter_file_id is null)::bigint as missing_file_count,
      count(*) filter (where expected.reference_status = 'confirmed')::bigint as confirmed_file_count,
      count(*) filter (where expected.matter_file_id is not null and expected.reference_status <> 'confirmed')::bigint as provisional_file_count,
      count(*) filter (
        where expected.platform_reference is null
          and expected.legacy_matter_number is null
          and expected.transaction_reference is null
      )::bigint as unresolved_platform_reference_count,
      count(*) filter (
        where expected.matter_file_id is not null
          and (
            (expected.reference_status = 'confirmed' and expected.filing_reference is null)
            or (expected.reference_status <> 'confirmed' and expected.filing_reference is not null)
          )
      )::bigint as invalid_reference_state_count,
      count(*) filter (
        where expected.matter_file_id is not null
          and coalesce(expected.filing_reference, expected.provisional_reference) is not null
          and not exists (
            select 1
            from public.attorney_matter_reference_history history
            where history.attorney_matter_file_id = expected.matter_file_id
          )
      )::bigint as history_gap_count
    from expected_files expected
  ),
  firm_metrics as (
    select
      count(*) filter (
        where not exists (
          select 1
          from expected_files expected
          where expected.matter_file_id = matter_file.id
        )
      )::bigint as orphan_file_count,
      (select count(*)::bigint from duplicate_references) as duplicate_reference_group_count
    from public.attorney_matter_files matter_file
    where matter_file.attorney_firm_id = p_attorney_firm_id
  ),
  assessment as (
    select
      metrics.*,
      firm_metrics.*,
      case
        when metrics.unresolved_platform_reference_count > 0
          or metrics.invalid_reference_state_count > 0
          or firm_metrics.duplicate_reference_group_count > 0
        then 'BLOCKED'
        when metrics.missing_file_count > 0 or metrics.history_gap_count > 0
        then 'NEEDS_BACKFILL'
        when firm_metrics.orphan_file_count > 0
        then 'READY_WITH_WARNINGS'
        else 'READY'
      end as readiness_status
    from metrics
    cross join firm_metrics
  )
  select jsonb_build_object(
    'firmId', p_attorney_firm_id,
    'assessedAt', now(),
    'status', assessment.readiness_status,
    'releaseReady', assessment.readiness_status in ('READY', 'READY_WITH_WARNINGS'),
    'strictReleaseReady', assessment.readiness_status = 'READY',
    'coveragePercent', case
      when assessment.expected_file_count = 0 then 100
      else round((assessment.covered_file_count::numeric / assessment.expected_file_count::numeric) * 100, 2)
    end,
    'expectedFileCount', assessment.expected_file_count,
    'coveredFileCount', assessment.covered_file_count,
    'missingFileCount', assessment.missing_file_count,
    'confirmedFileCount', assessment.confirmed_file_count,
    'provisionalFileCount', assessment.provisional_file_count,
    'unresolvedPlatformReferenceCount', assessment.unresolved_platform_reference_count,
    'duplicateReferenceGroupCount', assessment.duplicate_reference_group_count,
    'invalidReferenceStateCount', assessment.invalid_reference_state_count,
    'historyGapCount', assessment.history_gap_count,
    'orphanFileCount', assessment.orphan_file_count,
    'issueCodes', array_remove(array[
      case when assessment.missing_file_count > 0 then 'missing_matter_files' end,
      case when assessment.unresolved_platform_reference_count > 0 then 'unresolved_platform_references' end,
      case when assessment.duplicate_reference_group_count > 0 then 'duplicate_effective_references' end,
      case when assessment.invalid_reference_state_count > 0 then 'invalid_reference_states' end,
      case when assessment.history_gap_count > 0 then 'missing_reference_history' end,
      case when assessment.orphan_file_count > 0 then 'orphan_matter_files' end
    ]::text[], null)
  )
  into v_report
  from assessment;

  return v_report;
end;
$$;

comment on function public.get_attorney_matter_numbering_readiness(uuid) is
  'Phase 7 read-only rollout assessment for firm matter-number coverage, uniqueness, state integrity, and audit history.';

revoke all on function public.get_attorney_matter_numbering_readiness(uuid) from public;
grant execute on function public.get_attorney_matter_numbering_readiness(uuid) to authenticated;
grant execute on function public.get_attorney_matter_numbering_readiness(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
