begin;

create or replace function public.report_attorney_matter_number_backfill(
  p_attorney_firm_id uuid default null,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  transaction_id uuid,
  attorney_firm_id uuid,
  lane text,
  legacy_reference text,
  assignment_ids uuid[],
  assignment_count bigint,
  existing_matter_file_id uuid,
  existing_provisional_reference text,
  existing_filing_reference text,
  classification text,
  issue_codes text[],
  can_backfill boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with expanded_assignments as (
    select
      assignment.id as assignment_id,
      assignment.transaction_id,
      coalesce(assignment.attorney_firm_id, assignment.firm_id) as attorney_firm_id,
      expanded_lane.lane,
      nullif(btrim(transaction.matter_number), '') as legacy_reference
    from public.transaction_attorney_assignments assignment
    join public.transactions transaction
      on transaction.id = assignment.transaction_id
    left join lateral (
      select unnest(
        case assignment.assignment_type
          when 'transfer' then array['transfer']::text[]
          when 'bond' then array['bond']::text[]
          when 'cancellation' then array['cancellation']::text[]
          when 'transfer_and_bond' then array['transfer', 'bond']::text[]
          else array[null::text]
        end
      ) as lane
    ) expanded_lane on true
    where coalesce(assignment.status, 'active') = 'active'
      and coalesce(assignment.assignment_status, 'active') = 'active'
      and (
        p_attorney_firm_id is null
        or coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_attorney_firm_id
      )
  ),
  grouped_candidates as (
    select
      expanded.transaction_id,
      expanded.attorney_firm_id,
      expanded.lane,
      max(expanded.legacy_reference) as legacy_reference,
      array_agg(distinct expanded.assignment_id) as assignment_ids,
      count(distinct expanded.assignment_id) as assignment_count
    from expanded_assignments expanded
    group by expanded.transaction_id, expanded.attorney_firm_id, expanded.lane
  ),
  candidate_context as (
    select
      candidate.*,
      matter_file.id as existing_matter_file_id,
      matter_file.provisional_reference as existing_provisional_reference,
      matter_file.filing_reference as existing_filing_reference,
      (
        select count(distinct duplicate.transaction_id)
        from grouped_candidates duplicate
        where duplicate.attorney_firm_id = candidate.attorney_firm_id
          and candidate.legacy_reference is not null
          and lower(duplicate.legacy_reference) = lower(candidate.legacy_reference)
      ) as duplicate_reference_count,
      (
        select count(distinct linked_firm.attorney_firm_id)
        from grouped_candidates linked_firm
        where linked_firm.transaction_id = candidate.transaction_id
          and linked_firm.lane is not distinct from candidate.lane
      ) as firm_count_for_lane
    from grouped_candidates candidate
    left join public.attorney_matter_files matter_file
      on matter_file.transaction_id = candidate.transaction_id
     and matter_file.attorney_firm_id = candidate.attorney_firm_id
     and matter_file.lane = candidate.lane
  ),
  classified as (
    select
      context.*,
      array_remove(array[
        case when context.attorney_firm_id is null then 'missing_firm' end,
        case when context.lane is null then 'unsupported_lane' end,
        case when context.legacy_reference is null then 'missing_legacy_reference' end,
        case when context.duplicate_reference_count > 1 then 'duplicate_reference_within_firm' end,
        case
          when context.existing_matter_file_id is not null
            and context.legacy_reference is not null
            and not (
              lower(coalesce(context.existing_provisional_reference, '')) = lower(coalesce(context.legacy_reference, ''))
              or lower(coalesce(context.existing_filing_reference, '')) = lower(coalesce(context.legacy_reference, ''))
            )
          then 'existing_matter_file_conflict'
        end,
        case when context.firm_count_for_lane > 1 then 'multiple_firms_for_lane' end
      ]::text[], null) as issue_codes
    from candidate_context context
  )
  select
    candidate.transaction_id,
    candidate.attorney_firm_id,
    candidate.lane,
    candidate.legacy_reference,
    candidate.assignment_ids,
    candidate.assignment_count,
    candidate.existing_matter_file_id,
    candidate.existing_provisional_reference,
    candidate.existing_filing_reference,
    case
      when candidate.existing_matter_file_id is not null
        and candidate.legacy_reference is not null
        and (
          lower(coalesce(candidate.existing_provisional_reference, '')) = lower(coalesce(candidate.legacy_reference, ''))
          or lower(coalesce(candidate.existing_filing_reference, '')) = lower(coalesce(candidate.legacy_reference, ''))
        )
      then 'already_backfilled'
      when candidate.attorney_firm_id is not null
        and candidate.lane is not null
        and candidate.legacy_reference is not null
        and candidate.duplicate_reference_count <= 1
        and candidate.existing_matter_file_id is null
      then 'ready'
      else 'manual_review'
    end as classification,
    candidate.issue_codes,
    (
      candidate.attorney_firm_id is not null
      and candidate.lane is not null
      and candidate.legacy_reference is not null
      and candidate.duplicate_reference_count <= 1
      and candidate.existing_matter_file_id is null
    ) as can_backfill
  from classified candidate
  order by candidate.attorney_firm_id nulls last, candidate.transaction_id, candidate.lane nulls last
  limit p_limit
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.report_attorney_matter_number_backfill(uuid, integer, integer) is
  'Read-only Phase 3 report. Classifies active attorney assignment files before any backfill is applied.';

revoke all on function public.report_attorney_matter_number_backfill(uuid, integer, integer) from public;
revoke all on function public.report_attorney_matter_number_backfill(uuid, integer, integer) from authenticated;
grant execute on function public.report_attorney_matter_number_backfill(uuid, integer, integer) to service_role;

create or replace function public.summarize_attorney_matter_number_backfill(
  p_attorney_firm_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'ready', count(*) filter (where report.classification = 'ready'),
    'alreadyBackfilled', count(*) filter (where report.classification = 'already_backfilled'),
    'manualReview', count(*) filter (where report.classification = 'manual_review'),
    'missingFirm', count(*) filter (where 'missing_firm' = any(report.issue_codes)),
    'unsupportedLane', count(*) filter (where 'unsupported_lane' = any(report.issue_codes)),
    'missingLegacyReference', count(*) filter (where 'missing_legacy_reference' = any(report.issue_codes)),
    'duplicateReferenceWithinFirm', count(*) filter (where 'duplicate_reference_within_firm' = any(report.issue_codes)),
    'existingMatterFileConflict', count(*) filter (where 'existing_matter_file_conflict' = any(report.issue_codes)),
    'multipleFirmsForLane', count(*) filter (where 'multiple_firms_for_lane' = any(report.issue_codes))
  )
  from public.report_attorney_matter_number_backfill(p_attorney_firm_id, null, 0) report;
$$;

comment on function public.summarize_attorney_matter_number_backfill(uuid) is
  'Complete Phase 3 backfill counts, unaffected by the report preview limit.';

revoke all on function public.summarize_attorney_matter_number_backfill(uuid) from public;
revoke all on function public.summarize_attorney_matter_number_backfill(uuid) from authenticated;
grant execute on function public.summarize_attorney_matter_number_backfill(uuid) to service_role;

create or replace function public.apply_attorney_matter_number_backfill(
  p_attorney_firm_id uuid default null,
  p_limit integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_new_matter_file_id uuid;
  v_attempted integer := 0;
  v_inserted integer := 0;
  v_raced_or_skipped integer := 0;
  v_sequence_rows integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'The attorney matter-number backfill requires the service role.' using errcode = '42501';
  end if;
  if p_limit is not null and p_limit < 1 then
    raise exception 'Backfill limit must be a positive integer.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attorney-matter-number-phase3-backfill', 0));

  for v_candidate in
    select report.*
    from public.report_attorney_matter_number_backfill(p_attorney_firm_id, null, 0) report
    where report.can_backfill
    order by report.attorney_firm_id, report.transaction_id, report.lane
    limit p_limit
  loop
    v_attempted := v_attempted + 1;
    v_new_matter_file_id := null;

    update public.transactions transaction
    set platform_reference = 'A9-' || upper(replace(transaction.id::text, '-', ''))
    where transaction.id = v_candidate.transaction_id
      and transaction.platform_reference is null;

    insert into public.attorney_matter_files (
      transaction_id,
      attorney_firm_id,
      lane,
      provisional_reference,
      reference_status
    )
    values (
      v_candidate.transaction_id,
      v_candidate.attorney_firm_id,
      v_candidate.lane,
      v_candidate.legacy_reference,
      'provisional'
    )
    on conflict (transaction_id, attorney_firm_id, lane) do nothing
    returning id into v_new_matter_file_id;

    if v_new_matter_file_id is null then
      v_raced_or_skipped := v_raced_or_skipped + 1;
      continue;
    end if;

    insert into public.attorney_matter_reference_history (
      attorney_matter_file_id,
      previous_reference,
      new_reference,
      change_type,
      change_reason,
      changed_by
    )
    values (
      v_new_matter_file_id,
      null,
      v_candidate.legacy_reference,
      'backfilled',
      'Phase 3 migration from transactions.matter_number',
      null
    );

    v_inserted := v_inserted + 1;
  end loop;

  -- Reconcile the default sequence with legacy MAT-YYYY-NNNNNN values. This
  -- prevents the first newly generated reference from reusing a migrated one.
  with parsed_references as (
    select
      matter_file.attorney_firm_id,
      parsed.parts[1]::integer as sequence_year,
      parsed.parts[2]::bigint as sequence_value
    from public.attorney_matter_files matter_file
    cross join lateral (
      select regexp_match(matter_file.provisional_reference, '^MAT-([0-9]{4})-([0-9]+)$') as parts
    ) parsed
    where parsed.parts is not null
      and (p_attorney_firm_id is null or matter_file.attorney_firm_id = p_attorney_firm_id)
  ),
  maximum_sequences as (
    select
      parsed.attorney_firm_id,
      parsed.sequence_year,
      max(parsed.sequence_value) as last_value
    from parsed_references parsed
    group by parsed.attorney_firm_id, parsed.sequence_year
  )
  insert into public.attorney_matter_reference_sequences (
    attorney_firm_id,
    lane,
    sequence_year,
    last_value
  )
  select
    maximum.attorney_firm_id,
    'all',
    maximum.sequence_year,
    maximum.last_value
  from maximum_sequences maximum
  on conflict (attorney_firm_id, lane, sequence_year)
  do update
    set last_value = greatest(
          public.attorney_matter_reference_sequences.last_value,
          excluded.last_value
        ),
        updated_at = now();

  get diagnostics v_sequence_rows = row_count;

  return jsonb_build_object(
    'mode', 'applied',
    'attempted', v_attempted,
    'inserted', v_inserted,
    'racedOrSkipped', v_raced_or_skipped,
    'sequenceRowsReconciled', v_sequence_rows,
    'firmId', p_attorney_firm_id,
    'limit', p_limit
  );
end;
$$;

comment on function public.apply_attorney_matter_number_backfill(uuid, integer) is
  'Service-role-only, idempotent Phase 3 backfill. It inserts ready rows, records aliases, and reconciles legacy MAT sequences.';

revoke all on function public.apply_attorney_matter_number_backfill(uuid, integer) from public;
revoke all on function public.apply_attorney_matter_number_backfill(uuid, integer) from authenticated;
grant execute on function public.apply_attorney_matter_number_backfill(uuid, integer) to service_role;

notify pgrst, 'reload schema';

commit;
