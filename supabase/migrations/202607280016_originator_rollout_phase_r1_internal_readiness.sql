create table if not exists public.transaction_bond_originator_internal_readiness_reports (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid references public.transaction_bond_application_export_packages(id) on delete cascade,
  governance_report_id uuid references public.transaction_bond_application_governance_reports(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete restrict,
  report_version text not null default 'phase-r1-originator-internal-readiness-v1',
  status text not null default 'blocked' check (
    status in ('ready', 'attention_required', 'blocked')
  ),
  readiness_report_json jsonb not null default '{}'::jsonb,
  checklist_json jsonb not null default '[]'::jsonb,
  issue_summary_json jsonb not null default '[]'::jsonb,
  required_migration_keys_json jsonb not null default '[]'::jsonb,
  required_regression_keys_json jsonb not null default '[]'::jsonb,
  reporting_only boolean not null default true check (reporting_only = true),
  sensitive_payload_included boolean not null default false check (sensitive_payload_included = false),
  no_automatic_bank_submission boolean not null default true check (no_automatic_bank_submission = true),
  live_delivery_enabled boolean not null default false check (live_delivery_enabled = false),
  bank_workflow_unchanged boolean not null default true check (bank_workflow_unchanged = true),
  offer_workflow_mutation_deferred boolean not null default true check (offer_workflow_mutation_deferred = true),
  grant_workflow_mutation_deferred boolean not null default true check (grant_workflow_mutation_deferred = true),
  idempotency_key text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_report_id uuid references public.transaction_bond_originator_internal_readiness_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists transaction_bond_originator_internal_readiness_reports_idempotency_idx
  on public.transaction_bond_originator_internal_readiness_reports (export_package_id, idempotency_key)
  where export_package_id is not null and idempotency_key is not null;

create index if not exists transaction_bond_originator_internal_readiness_reports_transaction_idx
  on public.transaction_bond_originator_internal_readiness_reports (transaction_id, status, generated_at desc)
  where transaction_id is not null;

create index if not exists transaction_bond_originator_internal_readiness_reports_export_idx
  on public.transaction_bond_originator_internal_readiness_reports (export_package_id, status, generated_at desc)
  where export_package_id is not null;

alter table public.transaction_bond_originator_internal_readiness_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_internal_readiness_reports'
      and policyname = 'bond_originator_internal_readiness_reports_service_only'
  ) then
    create policy bond_originator_internal_readiness_reports_service_only
      on public.transaction_bond_originator_internal_readiness_reports
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_internal_readiness_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_internal_readiness_report on public.transaction_bond_originator_internal_readiness_reports;
create trigger trg_touch_bond_originator_internal_readiness_report
  before update on public.transaction_bond_originator_internal_readiness_reports
  for each row execute function public.bridge_touch_bond_originator_internal_readiness_report();

create or replace function public.bridge_bond_originator_internal_readiness_view(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.transaction_bond_originator_internal_readiness_reports%rowtype;
begin
  if p_transaction_id is null then
    return null;
  end if;

  if auth.role() <> 'service_role' and not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.';
  end if;

  select *
  into v_report
  from public.transaction_bond_originator_internal_readiness_reports readiness_report
  where readiness_report.transaction_id = p_transaction_id
    and readiness_report.superseded_at is null
  order by readiness_report.generated_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_report.id,
    'export_package_id', v_report.export_package_id,
    'governance_report_id', v_report.governance_report_id,
    'transaction_id', v_report.transaction_id,
    'submission_id', v_report.submission_id,
    'report_version', v_report.report_version,
    'status', v_report.status,
    'generated_at', v_report.generated_at,
    'check_count', jsonb_array_length(v_report.checklist_json),
    'issue_count', jsonb_array_length(v_report.issue_summary_json),
    'issues', v_report.issue_summary_json,
    'reportingOnly', v_report.reporting_only,
    'sensitivePayloadIncluded', v_report.sensitive_payload_included,
    'noAutomaticBankSubmission', v_report.no_automatic_bank_submission,
    'liveDeliveryEnabled', v_report.live_delivery_enabled,
    'bankWorkflowUnchanged', v_report.bank_workflow_unchanged,
    'rolloutBoundary', jsonb_build_object(
      'phase', 'R1',
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'lenderDecisionExternal', true,
      'automaticBankSubmission', false,
      'liveOobaDelivery', false
    )
  );
end;
$$;

revoke all on function public.bridge_bond_originator_internal_readiness_view(uuid) from public;
grant execute on function public.bridge_bond_originator_internal_readiness_view(uuid) to authenticated;

comment on table public.transaction_bond_originator_internal_readiness_reports is
  'Phase R1 internal readiness evidence before introducing bond originators. Reports are service-generated, observational and do not enable originator access or bank delivery.';
comment on column public.transaction_bond_originator_internal_readiness_reports.readiness_report_json is
  'Full internal readiness report. It must not contain raw tokens, public URLs, storage paths, sensitive applicant payload bodies or bank/originator credentials.';
comment on function public.bridge_bond_originator_internal_readiness_view(uuid) is
  'Phase R1 metadata-only readiness view for authorized transaction users. It reports internal readiness without exposing payloads and without enabling live OOBA delivery or bank workflow mutation.';
