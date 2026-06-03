create table if not exists public.lead_recommendations (
  recommendation_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  lead_id uuid not null,
  contact_id uuid null,
  assigned_agent_id uuid null,
  recommendation_type text not null,
  title text not null,
  description text null,
  priority text not null default 'medium',
  status text not null default 'pending',
  source_event text null,
  due_date timestamptz null,
  task_id uuid null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  dismissed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint lead_recommendations_status_check
    check (status in ('pending', 'accepted', 'completed', 'dismissed', 'expired')),
  constraint lead_recommendations_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent'))
);

create index if not exists lead_recommendations_org_idx
  on public.lead_recommendations (organisation_id, created_at desc);

create index if not exists lead_recommendations_lead_idx
  on public.lead_recommendations (lead_id, status, due_date);

create index if not exists lead_recommendations_agent_idx
  on public.lead_recommendations (assigned_agent_id, status, due_date);

create index if not exists lead_recommendations_type_idx
  on public.lead_recommendations (organisation_id, recommendation_type, status);

create index if not exists lead_recommendations_status_idx
  on public.lead_recommendations (organisation_id, status, due_date);

create index if not exists lead_recommendations_due_date_idx
  on public.lead_recommendations (organisation_id, due_date);

create unique index if not exists lead_recommendations_open_event_guard
  on public.lead_recommendations (
    organisation_id,
    lead_id,
    recommendation_type,
    coalesce(source_event, ''),
    coalesce((metadata ->> 'eventId'), '')
  )
  where status in ('pending', 'accepted');

alter table public.lead_recommendations enable row level security;

drop policy if exists lead_recommendations_select_member on public.lead_recommendations;
create policy lead_recommendations_select_member
  on public.lead_recommendations
  for select
  using (bridge_is_active_member(organisation_id));

drop policy if exists lead_recommendations_insert_member on public.lead_recommendations;
create policy lead_recommendations_insert_member
  on public.lead_recommendations
  for insert
  with check (
    bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_recommendations.lead_id
        and l.organisation_id = lead_recommendations.organisation_id
    )
  );

drop policy if exists lead_recommendations_update_member on public.lead_recommendations;
create policy lead_recommendations_update_member
  on public.lead_recommendations
  for update
  using (bridge_is_active_member(organisation_id))
  with check (
    bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_recommendations.lead_id
        and l.organisation_id = lead_recommendations.organisation_id
    )
  );
