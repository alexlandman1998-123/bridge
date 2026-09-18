begin;

-- A completed supplier request is an immutable evidence record.  Keep the
-- customer-facing definition, UAT cost evidence and the sanitised supplier
-- response together so future viewing/PDF delivery never needs to re-query
-- the supplier (and therefore cannot spend credits again).
alter table public.knowledge_factory_report_results
  add column report_snapshot_version text not null default 'legacy-v1'
    check (length(btrim(report_snapshot_version)) between 3 and 80),
  add column report_definition_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(report_definition_snapshot) = 'object'),
  add column cost_validation_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cost_validation_snapshot) = 'object'),
  add column request_context_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_context_snapshot) = 'object'),
  add column opportunity_signals jsonb not null default '{}'::jsonb
    check (jsonb_typeof(opportunity_signals) = 'object');

comment on column public.knowledge_factory_report_results.report_snapshot_version is
  'Version of the Arch9-owned report snapshot/rendering contract.';
comment on column public.knowledge_factory_report_results.report_definition_snapshot is
  'Immutable customer-facing package definition that was approved when this report was requested.';
comment on column public.knowledge_factory_report_results.cost_validation_snapshot is
  'The complete-query UAT cost-validation evidence used by the commercial preflight.';
comment on column public.knowledge_factory_report_results.request_context_snapshot is
  'Non-sensitive report provenance retained for rendering: package, purpose and confirmed selling price.';
comment on column public.knowledge_factory_report_results.opportunity_signals is
  'Arch9-derived canvassing indicators calculated only from the saved sanitised report data.';

commit;
