-- Phase 3 intelligence foundation.
-- Stores deterministic signals, predictions, recommendations, reusable identity
-- profiles, benchmark snapshots, and AI-ready document extraction metadata.

create table if not exists public.bridge_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  run_type text not null,
  trigger_event text,
  entity_type text,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  status text not null default 'completed',
  model_version text not null default 'deterministic_v1',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bridge_intelligence_runs_status_check check (status in ('queued', 'running', 'completed', 'failed', 'skipped'))
);
create table if not exists public.bridge_intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  run_id uuid references public.bridge_intelligence_runs(id) on delete set null,
  signal_type text not null,
  signal_key text not null,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  score_delta numeric(8, 2) not null default 0,
  confidence numeric(5, 2) not null default 0.75,
  severity text not null default 'info',
  title text not null,
  explanation text,
  source_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint bridge_intelligence_signals_severity_check check (severity in ('info', 'positive', 'warning', 'critical'))
);
create table if not exists public.buyer_intelligence_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  buyer_lead_id uuid references public.leads(lead_id) on delete cascade,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  buyer_identity_id uuid,
  heat_score numeric(6, 2) not null default 0,
  heat_category text not null default 'Cold',
  readiness_category text not null default 'Unknown',
  intent_summary text,
  risk_summary text,
  last_signal_at timestamptz,
  signals_json jsonb not null default '[]'::jsonb,
  recommendations_json jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, buyer_lead_id)
);
create table if not exists public.transaction_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  buyer_lead_id uuid references public.leads(lead_id) on delete set null,
  risk_score numeric(6, 2) not null default 0,
  registration_probability numeric(6, 2) not null default 0,
  finance_approval_probability numeric(6, 2) not null default 0,
  fall_through_risk numeric(6, 2) not null default 0,
  predicted_close_date date,
  predicted_delay_days integer not null default 0,
  bottlenecks_json jsonb not null default '[]'::jsonb,
  recommendation_keys_json jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.bridge_recommendations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  recommendation_type text not null,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  priority text not null default 'medium',
  status text not null default 'open',
  title text not null,
  rationale text,
  action_key text,
  action_config_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  accepted_at timestamptz,
  dismissed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_recommendations_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint bridge_recommendations_status_check check (status in ('open', 'accepted', 'dismissed', 'expired', 'completed'))
);
create table if not exists public.bridge_identity_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  identity_type text not null default 'buyer',
  primary_email text,
  primary_phone text,
  display_name text,
  fica_status text not null default 'unknown',
  affordability_status text not null default 'unknown',
  reusable_profile_json jsonb not null default '{}'::jsonb,
  verification_json jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.industry_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  benchmark_scope text not null,
  benchmark_key text not null,
  region_key text,
  roleplayer_type text,
  sample_size integer not null default 0,
  metric_value numeric(14, 4),
  percentile_25 numeric(14, 4),
  percentile_50 numeric(14, 4),
  percentile_75 numeric(14, 4),
  period_start date,
  period_end date,
  metadata_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.document_intelligence_extractions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  document_id uuid,
  document_request_id uuid,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  extraction_type text not null,
  extraction_status text not null default 'pending',
  confidence numeric(5, 2) not null default 0,
  extracted_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_intelligence_extractions_status_check check (extraction_status in ('pending', 'processed', 'needs_review', 'approved', 'rejected'))
);
create index if not exists intelligence_runs_org_created_idx on public.bridge_intelligence_runs (organisation_id, created_at desc);
create index if not exists intelligence_runs_entity_idx on public.bridge_intelligence_runs (entity_type, entity_id, created_at desc);
create index if not exists intelligence_signals_org_created_idx on public.bridge_intelligence_signals (organisation_id, created_at desc);
create index if not exists intelligence_signals_lead_idx on public.bridge_intelligence_signals (lead_id, observed_at desc);
create index if not exists intelligence_signals_transaction_idx on public.bridge_intelligence_signals (transaction_id, observed_at desc);
create index if not exists buyer_intelligence_org_score_idx on public.buyer_intelligence_profiles (organisation_id, heat_score desc, computed_at desc);
create index if not exists transaction_intelligence_org_risk_idx on public.transaction_intelligence_snapshots (organisation_id, risk_score desc, computed_at desc);
create index if not exists recommendations_org_status_idx on public.bridge_recommendations (organisation_id, status, priority, created_at desc);
create index if not exists recommendations_lead_idx on public.bridge_recommendations (lead_id, status, created_at desc);
create index if not exists recommendations_transaction_idx on public.bridge_recommendations (transaction_id, status, created_at desc);
create index if not exists bridge_identity_contact_idx on public.bridge_identity_profiles (contact_id);
create index if not exists bridge_identity_email_idx on public.bridge_identity_profiles (lower(primary_email));
create index if not exists industry_benchmark_key_idx on public.industry_benchmark_snapshots (benchmark_scope, benchmark_key, period_end desc);
create index if not exists document_intelligence_entity_idx on public.document_intelligence_extractions (entity_type, entity_id, created_at desc);
drop trigger if exists buyer_intelligence_profiles_set_updated_at on public.buyer_intelligence_profiles;
create trigger buyer_intelligence_profiles_set_updated_at
before update on public.buyer_intelligence_profiles
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists bridge_recommendations_set_updated_at on public.bridge_recommendations;
create trigger bridge_recommendations_set_updated_at
before update on public.bridge_recommendations
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists bridge_identity_profiles_set_updated_at on public.bridge_identity_profiles;
create trigger bridge_identity_profiles_set_updated_at
before update on public.bridge_identity_profiles
for each row
execute function public.bridge_set_updated_at();
drop trigger if exists document_intelligence_extractions_set_updated_at on public.document_intelligence_extractions;
create trigger document_intelligence_extractions_set_updated_at
before update on public.document_intelligence_extractions
for each row
execute function public.bridge_set_updated_at();
alter table if exists public.bridge_intelligence_runs enable row level security;
alter table if exists public.bridge_intelligence_signals enable row level security;
alter table if exists public.buyer_intelligence_profiles enable row level security;
alter table if exists public.transaction_intelligence_snapshots enable row level security;
alter table if exists public.bridge_recommendations enable row level security;
alter table if exists public.bridge_identity_profiles enable row level security;
alter table if exists public.industry_benchmark_snapshots enable row level security;
alter table if exists public.document_intelligence_extractions enable row level security;
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'bridge_intelligence_runs',
    'bridge_intelligence_signals',
    'buyer_intelligence_profiles',
    'transaction_intelligence_snapshots',
    'bridge_recommendations',
    'bridge_identity_profiles',
    'industry_benchmark_snapshots',
    'document_intelligence_extractions'
  ]
  loop
    execute format('drop policy if exists %I_org_members on public.%I', table_name, table_name);
    execute format(
      'create policy %I_org_members on public.%I for all using (
        organisation_id is null or public.bridge_is_active_member(organisation_id)
      ) with check (
        organisation_id is null or public.bridge_is_active_member(organisation_id)
      )',
      table_name,
      table_name
    );
  end loop;
end $$;
grant select, insert, update on public.bridge_intelligence_runs to authenticated;
grant select, insert, update on public.bridge_intelligence_signals to authenticated;
grant select, insert, update on public.buyer_intelligence_profiles to authenticated;
grant select, insert on public.transaction_intelligence_snapshots to authenticated;
grant select, insert, update on public.bridge_recommendations to authenticated;
grant select, insert, update on public.bridge_identity_profiles to authenticated;
grant select, insert on public.industry_benchmark_snapshots to authenticated;
grant select, insert, update on public.document_intelligence_extractions to authenticated;
