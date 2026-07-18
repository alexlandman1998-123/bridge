begin;

create table if not exists public.seller_document_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid,
  private_listing_id uuid references public.private_listings(id) on delete set null,
  run_mode text not null,
  run_reason text not null,
  status text not null,
  performed_by uuid references auth.users(id) on delete set null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  change_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seller_document_reconciliation_runs_mode_check check (run_mode in ('dry_run', 'apply')),
  constraint seller_document_reconciliation_runs_status_check check (status in ('completed', 'failed'))
);

create index if not exists seller_document_reconciliation_runs_scope_idx
  on public.seller_document_reconciliation_runs(organisation_id, private_listing_id, created_at desc);

alter table public.seller_document_reconciliation_runs enable row level security;
drop policy if exists seller_document_reconciliation_runs_member_select on public.seller_document_reconciliation_runs;
create policy seller_document_reconciliation_runs_member_select
on public.seller_document_reconciliation_runs for select to authenticated
using (organisation_id is not null and public.bridge_is_active_member(organisation_id));

create or replace view public.private_listing_seller_document_operational_readiness_v1
with (security_invoker = true)
as
with document_evidence as (
  select
    requirement.id as requirement_id,
    bool_or(document.status in ('approved', 'completed')) as has_approved_document,
    bool_or(document.status in ('uploaded', 'under_review', 'approved', 'completed')) as has_received_document,
    max(document.uploaded_at) as last_document_at
  from public.private_listing_document_requirements requirement
  left join public.private_listing_documents document
    on document.requirement_id = requirement.id
   and document.private_listing_id = requirement.private_listing_id
  group by requirement.id
), requirement_state as (
  select
    requirement.*,
    coalesce(evidence.has_approved_document, false) or exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = requirement.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = requirement.private_listing_id or canonical.listing_id = requirement.private_listing_id)
        and canonical.status in ('approved', 'completed')
        and canonical.satisfied_by_document_id is not null
    ) as is_satisfied,
    coalesce(evidence.has_received_document, false) as is_received,
    evidence.last_document_at
  from public.private_listing_document_requirements requirement
  left join document_evidence evidence on evidence.requirement_id = requirement.id
  where requirement.is_required and requirement.status <> 'not_applicable'
), requirement_rollup as (
  select
    private_listing_id,
    count(*) as required_count,
    count(*) filter (where is_satisfied) as satisfied_count,
    count(*) filter (where is_received and not is_satisfied) as received_pending_approval_count,
    count(*) filter (where not is_satisfied) as missing_count,
    count(*) filter (where status = 'rejected') as rejected_count,
    count(*) filter (where request_due_date < current_date and not is_received) as overdue_count,
    count(*) filter (
      where document_visibility = 'seller_visible'
        and not is_satisfied
        and (
          status = 'required'
          or requested_at is null
          or nullif(request_dedupe_key, '') is null
          or coalesce(array_length(request_delivery_channels, 1), 0) = 0
        )
    ) as unissued_request_count,
    count(*) filter (where status in ('approved', 'completed') and not is_satisfied) as false_completion_count,
    greatest(max(updated_at), max(last_document_at)) as last_requirement_activity_at
  from requirement_state
  group by private_listing_id
), integrity_rollup as (
  select
    listing.id as private_listing_id,
    count(distinct document.id) filter (
      where document.requirement_id is not null
        and requirement.private_listing_id is distinct from document.private_listing_id
    ) as cross_listing_link_count,
    count(distinct document.id) filter (
      where document.canonical_requirement_instance_id is not null
        and (
          canonical.id is null
          or canonical.context_type <> 'private_listing'
          or (canonical.context_id is distinct from document.private_listing_id
              and canonical.listing_id is distinct from document.private_listing_id)
          or (requirement.id is not null and
              public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key)
                is distinct from public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key))
        )
    ) as canonical_mismatch_count
  from public.private_listings listing
  left join public.private_listing_documents document on document.private_listing_id = listing.id
  left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id
  left join public.document_requirement_instances canonical on canonical.id = document.canonical_requirement_instance_id
  group by listing.id
), readiness as (
  select
    listing.id as private_listing_id,
    listing.organisation_id,
    listing.listing_status,
    listing.seller_onboarding_status,
    coalesce(requirements.required_count, 0)::integer as required_count,
    coalesce(requirements.satisfied_count, 0)::integer as satisfied_count,
    coalesce(requirements.received_pending_approval_count, 0)::integer as received_pending_approval_count,
    coalesce(requirements.missing_count, 0)::integer as missing_count,
    coalesce(requirements.rejected_count, 0)::integer as rejected_count,
    coalesce(requirements.overdue_count, 0)::integer as overdue_count,
    coalesce(requirements.unissued_request_count, 0)::integer as unissued_request_count,
    coalesce(requirements.false_completion_count, 0)::integer as false_completion_count,
    coalesce(integrity.cross_listing_link_count, 0)::integer as cross_listing_link_count,
    coalesce(integrity.canonical_mismatch_count, 0)::integer as canonical_mismatch_count,
    requirements.last_requirement_activity_at,
    case when listing.seller_onboarding_status in ('completed', 'under_review')
      and coalesce(requirements.required_count, 0) = 0 then 1 else 0 end as missing_requirement_matrix_count
  from public.private_listings listing
  left join requirement_rollup requirements on requirements.private_listing_id = listing.id
  left join integrity_rollup integrity on integrity.private_listing_id = listing.id
)
select
  readiness.*,
  (false_completion_count + cross_listing_link_count + canonical_mismatch_count +
    unissued_request_count + missing_requirement_matrix_count)::integer as blocking_issue_count,
  (received_pending_approval_count + rejected_count + overdue_count)::integer as attention_issue_count,
  case
    when cross_listing_link_count > 0 or canonical_mismatch_count > 0 or false_completion_count > 0
      or unissued_request_count > 0 or missing_requirement_matrix_count > 0 then 'blocked'
    when received_pending_approval_count > 0 or rejected_count > 0 or overdue_count > 0 then 'attention'
    else 'healthy'
  end as lifecycle_health,
  case
    when cross_listing_link_count > 0 then 'cross_listing_document_link'
    when canonical_mismatch_count > 0 then 'canonical_requirement_mismatch'
    when false_completion_count > 0 then 'false_completion'
    when missing_requirement_matrix_count > 0 then 'completed_onboarding_without_requirements'
    when unissued_request_count > 0 then 'required_request_not_issued'
    when rejected_count > 0 then 'rejected_document_waiting_for_reupload'
    when overdue_count > 0 then 'seller_document_request_overdue'
    when received_pending_approval_count > 0 then 'uploaded_document_waiting_for_review'
    else null
  end as lifecycle_issue,
  case
    when cross_listing_link_count > 0 or canonical_mismatch_count > 0 then 'repair_document_links'
    when false_completion_count > 0 then 'reconcile_false_completions'
    when missing_requirement_matrix_count > 0 then 'regenerate_requirement_matrix'
    when unissued_request_count > 0 then 'issue_missing_seller_requests'
    when rejected_count > 0 then 'request_replacement_document'
    when overdue_count > 0 then 'escalate_overdue_seller_request'
    when received_pending_approval_count > 0 then 'review_received_seller_document'
    else null
  end as required_action
from readiness;

grant select on public.private_listing_seller_document_operational_readiness_v1 to authenticated;

create or replace function public.bridge_reconcile_seller_document_operations_p0_5(
  p_organisation_id uuid default null,
  p_listing_id uuid default null,
  p_apply boolean default false,
  p_reason text default 'p0_5_operational_reconciliation'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid := p_organisation_id;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_links_repaired integer := 0;
  v_canonical_links_repaired integer := 0;
  v_satisfactions_synced integer := 0;
  v_false_completions_reopened integer := 0;
  v_requests_issued integer := 0;
  v_pending_states_synced integer := 0;
  v_row_count integer := 0;
  v_run_id uuid;
begin
  if p_listing_id is not null then
    select organisation_id into v_organisation_id from public.private_listings where id = p_listing_id;
    if v_organisation_id is null then raise exception 'Seller listing was not found.'; end if;
    if p_organisation_id is not null and p_organisation_id is distinct from v_organisation_id then
      raise exception 'Seller listing does not belong to the requested organisation.';
    end if;
  end if;
  if v_organisation_id is null then raise exception 'Organisation or listing scope is required.'; end if;
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.bridge_is_active_member(v_organisation_id) then
    raise exception 'Active organisation membership is required.';
  end if;
  if p_apply and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Seller document repair apply mode requires the service role.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(readiness) order by readiness.private_listing_id), '[]'::jsonb)
  into v_before
  from public.private_listing_seller_document_operational_readiness_v1 readiness
  where readiness.organisation_id = v_organisation_id
    and (p_listing_id is null or readiness.private_listing_id = p_listing_id);

  if not p_apply then
    return jsonb_build_object(
      'version', 'seller_document_operational_reconciliation_p0_5_v1',
      'mode', 'dry_run', 'mutated', false, 'scope', jsonb_build_object(
        'organisationId', v_organisation_id, 'listingId', p_listing_id
      ), 'before', v_before
    );
  end if;

  update public.private_listing_documents document
  set requirement_id = null, canonical_requirement_instance_id = null
  from public.private_listing_document_requirements requirement, public.private_listings listing
  where document.requirement_id = requirement.id
    and listing.id = document.private_listing_id
    and listing.organisation_id = v_organisation_id
    and (p_listing_id is null or listing.id = p_listing_id)
    and requirement.private_listing_id is distinct from document.private_listing_id;
  get diagnostics v_links_repaired = row_count;

  update public.private_listing_document_requirements requirement
  set canonical_requirement_instance_id = null
  from public.private_listings listing
  where listing.id = requirement.private_listing_id
    and listing.organisation_id = v_organisation_id
    and (p_listing_id is null or listing.id = p_listing_id)
    and requirement.canonical_requirement_instance_id is not null
    and not exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = requirement.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = requirement.private_listing_id or canonical.listing_id = requirement.private_listing_id)
        and public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key)
          = public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
    );
  get diagnostics v_canonical_links_repaired = row_count;

  update public.private_listing_documents document
  set canonical_requirement_instance_id = null
  from public.private_listings listing
  where listing.id = document.private_listing_id
    and listing.organisation_id = v_organisation_id
    and (p_listing_id is null or listing.id = p_listing_id)
    and document.canonical_requirement_instance_id is not null
    and not exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = document.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = document.private_listing_id or canonical.listing_id = document.private_listing_id)
        and (
          document.requirement_id is null
          or exists (
            select 1 from public.private_listing_document_requirements requirement
            where requirement.id = document.requirement_id
              and public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key)
                = public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
          )
        )
    );
  get diagnostics v_row_count = row_count;
  v_canonical_links_repaired := v_canonical_links_repaired + v_row_count;

  with latest_approved as (
    select distinct on (document.requirement_id)
      document.requirement_id, document.id, document.status, document.updated_at
    from public.private_listing_documents document
    join public.private_listings listing on listing.id = document.private_listing_id
    where listing.organisation_id = v_organisation_id
      and (p_listing_id is null or listing.id = p_listing_id)
      and document.requirement_id is not null
      and document.status in ('approved', 'completed')
    order by document.requirement_id, document.uploaded_at desc nulls last, document.created_at desc
  )
  update public.private_listing_document_requirements requirement
  set status = approved.status,
      satisfied_by_document_id = approved.id,
      satisfaction_verified_at = coalesce(approved.updated_at, now()),
      satisfaction_method = 'p0_5_reconciled_approved_exact_link',
      assurance_state = 'satisfied',
      assurance_metadata = coalesce(requirement.assurance_metadata, '{}'::jsonb) ||
        jsonb_build_object('reconciledAt', now(), 'reconciliationVersion', 'p0_5')
  from latest_approved approved
  where requirement.id = approved.requirement_id
    and (requirement.status is distinct from approved.status
      or requirement.satisfied_by_document_id is distinct from approved.id
      or requirement.assurance_state is distinct from 'satisfied');
  get diagnostics v_satisfactions_synced = row_count;

  update public.private_listing_document_requirements requirement
  set status = 'required', satisfied_by_document_id = null, satisfaction_verified_at = null,
      satisfaction_method = null, assurance_state = 'missing',
      assurance_metadata = coalesce(requirement.assurance_metadata, '{}'::jsonb) ||
        jsonb_build_object('falseCompletionReopenedAt', now(), 'reconciliationVersion', 'p0_5')
  from public.private_listings listing
  where listing.id = requirement.private_listing_id
    and listing.organisation_id = v_organisation_id
    and (p_listing_id is null or listing.id = p_listing_id)
    and requirement.status in ('approved', 'completed')
    and not exists (
      select 1 from public.private_listing_documents document
      where document.requirement_id = requirement.id
        and document.private_listing_id = requirement.private_listing_id
        and document.status in ('approved', 'completed')
    )
    and not exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = requirement.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = requirement.private_listing_id or canonical.listing_id = requirement.private_listing_id)
        and canonical.status in ('approved', 'completed')
        and canonical.satisfied_by_document_id is not null
    );
  get diagnostics v_false_completions_reopened = row_count;

  update public.private_listing_document_requirements requirement
  set status = 'required',
      last_request_reason = coalesce(nullif(p_reason, ''), 'p0_5_missing_request_repair')
  from public.private_listings listing
  where listing.id = requirement.private_listing_id
    and listing.organisation_id = v_organisation_id
    and (p_listing_id is null or listing.id = p_listing_id)
    and requirement.is_required
    and requirement.document_visibility = 'seller_visible'
    and requirement.status not in ('approved', 'completed', 'not_applicable', 'uploaded', 'under_review')
    and (requirement.status = 'required' or requirement.requested_at is null
      or nullif(requirement.request_dedupe_key, '') is null
      or coalesce(array_length(requirement.request_delivery_channels, 1), 0) = 0);
  get diagnostics v_requests_issued = row_count;

  with latest_pending as (
    select distinct on (document.requirement_id)
      document.requirement_id, document.id, document.status
    from public.private_listing_documents document
    join public.private_listings listing on listing.id = document.private_listing_id
    where listing.organisation_id = v_organisation_id
      and (p_listing_id is null or listing.id = p_listing_id)
      and document.requirement_id is not null
      and document.status in ('uploaded', 'under_review', 'rejected')
    order by document.requirement_id, document.uploaded_at desc nulls last, document.created_at desc
  )
  update public.private_listing_document_requirements requirement
  set status = pending.status,
      satisfied_by_document_id = null,
      satisfaction_verified_at = null,
      satisfaction_method = null,
      assurance_state = case when pending.status = 'rejected' then 'rejected' else 'received_pending_approval' end,
      assurance_metadata = coalesce(requirement.assurance_metadata, '{}'::jsonb) ||
        jsonb_build_object('reconciledAt', now(), 'documentId', pending.id, 'reconciliationVersion', 'p0_5')
  from latest_pending pending
  where requirement.id = pending.requirement_id
    and requirement.status not in ('approved', 'completed')
    and (requirement.status is distinct from pending.status
      or requirement.assurance_state is distinct from
        case when pending.status = 'rejected' then 'rejected' else 'received_pending_approval' end);
  get diagnostics v_pending_states_synced = row_count;

  select coalesce(jsonb_agg(to_jsonb(readiness) order by readiness.private_listing_id), '[]'::jsonb)
  into v_after
  from public.private_listing_seller_document_operational_readiness_v1 readiness
  where readiness.organisation_id = v_organisation_id
    and (p_listing_id is null or readiness.private_listing_id = p_listing_id);

  insert into public.seller_document_reconciliation_runs (
    organisation_id, private_listing_id, run_mode, run_reason, status, performed_by,
    before_snapshot, after_snapshot, change_counts
  ) values (
    v_organisation_id, p_listing_id, 'apply', coalesce(nullif(p_reason, ''), 'p0_5_operational_reconciliation'),
    'completed', auth.uid(), v_before, v_after, jsonb_build_object(
      'crossListingLinksRepaired', v_links_repaired,
      'canonicalLinksRepaired', v_canonical_links_repaired,
      'satisfactionsSynced', v_satisfactions_synced,
      'falseCompletionsReopened', v_false_completions_reopened,
      'requestsIssued', v_requests_issued,
      'pendingStatesSynced', v_pending_states_synced
    )
  ) returning id into v_run_id;

  return jsonb_build_object(
    'version', 'seller_document_operational_reconciliation_p0_5_v1',
    'mode', 'apply', 'mutated', true, 'runId', v_run_id,
    'scope', jsonb_build_object('organisationId', v_organisation_id, 'listingId', p_listing_id),
    'changes', jsonb_build_object(
      'crossListingLinksRepaired', v_links_repaired,
      'canonicalLinksRepaired', v_canonical_links_repaired,
      'satisfactionsSynced', v_satisfactions_synced,
      'falseCompletionsReopened', v_false_completions_reopened,
      'requestsIssued', v_requests_issued,
      'pendingStatesSynced', v_pending_states_synced
    ), 'before', v_before, 'after', v_after
  );
end;
$$;

revoke all on function public.bridge_reconcile_seller_document_operations_p0_5(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.bridge_reconcile_seller_document_operations_p0_5(uuid, uuid, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
