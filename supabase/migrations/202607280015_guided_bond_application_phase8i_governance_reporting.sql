create table if not exists public.transaction_bond_application_governance_reports (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid not null references public.transaction_bond_application_submissions(id) on delete restrict,
  report_version text not null default 'phase-8i-governance-report-v1',
  status text not null default 'clear' check (
    status in ('clear', 'attention_required', 'blocked')
  ),
  report_json jsonb not null default '{}'::jsonb,
  blocker_summary_json jsonb not null default '[]'::jsonb,
  warning_summary_json jsonb not null default '[]'::jsonb,
  source_snapshot_hash text not null,
  canonical_hash text not null,
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
  superseded_by_report_id uuid references public.transaction_bond_application_governance_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists transaction_bond_application_governance_reports_idempotency_idx
  on public.transaction_bond_application_governance_reports (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_application_governance_reports_export_idx
  on public.transaction_bond_application_governance_reports (export_package_id, status, generated_at desc);

create index if not exists transaction_bond_application_governance_reports_transaction_idx
  on public.transaction_bond_application_governance_reports (transaction_id, generated_at desc);

create index if not exists transaction_bond_application_governance_reports_submission_idx
  on public.transaction_bond_application_governance_reports (submission_id, status);

alter table public.transaction_bond_application_governance_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_governance_reports'
      and policyname = 'bond_application_governance_reports_service_only'
  ) then
    create policy bond_application_governance_reports_service_only
      on public.transaction_bond_application_governance_reports
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_application_governance_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_application_governance_report on public.transaction_bond_application_governance_reports;
create trigger trg_touch_bond_application_governance_report
  before update on public.transaction_bond_application_governance_reports
  for each row execute function public.bridge_touch_bond_application_governance_report();

create or replace function public.bridge_bond_application_governance_report_view(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.transaction_bond_application_governance_reports%rowtype;
begin
  if p_transaction_id is null then
    return null;
  end if;

  if auth.role() <> 'service_role' and not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.';
  end if;

  select *
  into v_report
  from public.transaction_bond_application_governance_reports governance_report
  where governance_report.transaction_id = p_transaction_id
    and governance_report.superseded_at is null
  order by governance_report.generated_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_report.id,
    'export_package_id', v_report.export_package_id,
    'transaction_id', v_report.transaction_id,
    'submission_id', v_report.submission_id,
    'report_version', v_report.report_version,
    'status', v_report.status,
    'generated_at', v_report.generated_at,
    'blocker_count', jsonb_array_length(v_report.blocker_summary_json),
    'warning_count', jsonb_array_length(v_report.warning_summary_json),
    'blocker_summary', v_report.blocker_summary_json,
    'warning_summary', v_report.warning_summary_json,
    'reportingOnly', v_report.reporting_only,
    'sensitivePayloadIncluded', v_report.sensitive_payload_included,
    'noAutomaticBankSubmission', v_report.no_automatic_bank_submission,
    'liveDeliveryEnabled', v_report.live_delivery_enabled,
    'bankWorkflowUnchanged', v_report.bank_workflow_unchanged,
    'offerWorkflowMutationDeferred', v_report.offer_workflow_mutation_deferred,
    'grantWorkflowMutationDeferred', v_report.grant_workflow_mutation_deferred,
    'decisionBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'lenderDecisionExternal', true
    )
  );
end;
$$;

revoke all on function public.bridge_bond_application_governance_report_view(uuid) from public;
grant execute on function public.bridge_bond_application_governance_report_view(uuid) to authenticated;

comment on table public.transaction_bond_application_governance_reports is
  'Phase 8I service-generated governance and reporting evidence for originator intake, recipient formats, blockers and workflow-safety controls. Reports are observational only.';
comment on column public.transaction_bond_application_governance_reports.report_json is
  'Full governance report generated by trusted services. It must not contain raw tokens, public URLs, storage paths, sensitive payload bodies or internal delivery credentials.';
comment on function public.bridge_bond_application_governance_report_view(uuid) is
  'Phase 8I metadata-only governance report view for authorized transaction users. It reports readiness and blockers without exposing payload bodies or enabling live delivery.';
