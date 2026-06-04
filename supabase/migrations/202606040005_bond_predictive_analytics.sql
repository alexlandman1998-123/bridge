create table if not exists public.bond_prediction_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  prediction_type text not null,
  entity_type text not null,
  entity_id text not null,
  score numeric(8,2) not null default 0,
  confidence text not null default 'Medium Confidence',
  recommendation text,
  details jsonb not null default '{}'::jsonb,
  predicted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.bond_risk_scores (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  score numeric(8,2) not null default 0,
  risk_level text not null default 'Low Risk',
  reasons jsonb not null default '[]'::jsonb,
  confidence text not null default 'Medium Confidence',
  recommended_action text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organisation_id, entity_type, entity_id)
);

create table if not exists public.bond_prediction_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  prediction_id uuid references public.bond_prediction_snapshots(id) on delete set null,
  event_type text not null,
  prediction_type text,
  entity_type text not null,
  entity_id text not null,
  previous_value jsonb,
  new_value jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_prediction_feedback (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  prediction_id uuid references public.bond_prediction_snapshots(id) on delete set null,
  expected_outcome text,
  actual_outcome text,
  accuracy numeric(5,2),
  correct boolean,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bond_prediction_snapshots_org_type_idx
  on public.bond_prediction_snapshots (organisation_id, prediction_type, predicted_at desc);

create index if not exists bond_prediction_snapshots_entity_idx
  on public.bond_prediction_snapshots (organisation_id, entity_type, entity_id);

create index if not exists bond_risk_scores_org_level_idx
  on public.bond_risk_scores (organisation_id, risk_level, updated_at desc);

create index if not exists bond_prediction_history_org_event_idx
  on public.bond_prediction_history (organisation_id, event_type, created_at desc);

create index if not exists bond_prediction_feedback_org_created_idx
  on public.bond_prediction_feedback (organisation_id, created_at desc);

alter table public.bond_prediction_snapshots enable row level security;
alter table public.bond_risk_scores enable row level security;
alter table public.bond_prediction_history enable row level security;
alter table public.bond_prediction_feedback enable row level security;

create policy "bond_prediction_snapshots_member_select"
on public.bond_prediction_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

create policy "bond_prediction_snapshots_member_modify"
on public.bond_prediction_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

create policy "bond_risk_scores_member_select"
on public.bond_risk_scores
for select
using (public.bridge_is_active_member(organisation_id));

create policy "bond_risk_scores_member_modify"
on public.bond_risk_scores
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

create policy "bond_prediction_history_member_select"
on public.bond_prediction_history
for select
using (public.bridge_is_active_member(organisation_id));

create policy "bond_prediction_history_member_modify"
on public.bond_prediction_history
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

create policy "bond_prediction_feedback_member_select"
on public.bond_prediction_feedback
for select
using (public.bridge_is_active_member(organisation_id));

create policy "bond_prediction_feedback_member_modify"
on public.bond_prediction_feedback
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
