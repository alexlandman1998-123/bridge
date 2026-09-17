begin;

-- A report result can create one, and only one, canvassing prospect. This
-- ledger is independent of free-form prospect notes, so duplicate conversion
-- protection remains reliable when a prospect is later edited.
create table public.knowledge_factory_report_canvassing_conversions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  report_result_id uuid not null unique references public.knowledge_factory_report_results(id) on delete restrict,
  prospect_id uuid references public.canvassing_prospects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'ready' check (status in ('ready', 'converting', 'converted', 'failed')),
  error_code text,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_report_canvassing_conversions_completion_check check (
    (status = 'converted' and prospect_id is not null and converted_at is not null)
    or (status <> 'converted' and prospect_id is null and converted_at is null)
  )
);

create index knowledge_factory_report_canvassing_conversions_org_created_idx
  on public.knowledge_factory_report_canvassing_conversions (organisation_id, created_at desc);
create index knowledge_factory_report_canvassing_conversions_prospect_idx
  on public.knowledge_factory_report_canvassing_conversions (prospect_id)
  where prospect_id is not null;

alter table public.knowledge_factory_report_canvassing_conversions enable row level security;
revoke all on public.knowledge_factory_report_canvassing_conversions from anon, authenticated;
grant select on public.knowledge_factory_report_canvassing_conversions to authenticated;

create policy knowledge_factory_report_canvassing_conversions_read
on public.knowledge_factory_report_canvassing_conversions for select to authenticated
using (
  created_by = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

comment on table public.knowledge_factory_report_canvassing_conversions is 'Phase 4 conversion ledger for creating one seller prospect from one completed Knowledge Factory report. Contact details must be entered by an agent; supplier identity data is not auto-copied into a prospect.';

commit;
