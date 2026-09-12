begin;

alter table public.email_automation_deliveries
  drop constraint if exists email_automation_deliveries_status_check;
alter table public.email_automation_deliveries
  add constraint email_automation_deliveries_status_check
  check (status in ('queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'suppressed', 'failed')),
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists bounced_at timestamptz;

create table if not exists public.email_automation_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  delivery_id uuid not null references public.email_automation_deliveries(id) on delete cascade,
  provider text not null default 'resend',
  provider_event_id text not null unique,
  event_type text not null check (event_type in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
  url text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists email_automation_delivery_events_delivery_idx on public.email_automation_delivery_events (delivery_id, occurred_at desc);
alter table public.email_automation_delivery_events enable row level security;
grant select on public.email_automation_delivery_events to authenticated;
create policy email_automation_delivery_events_member on public.email_automation_delivery_events for select to authenticated
  using (public.bridge_has_organisation_membership(organisation_id));

create or replace view public.email_automation_delivery_performance
with (security_invoker = true) as
select d.organisation_id, e.journey_id,
  count(*)::integer as recipients,
  count(*) filter (where d.status in ('sent', 'delivered', 'opened', 'clicked'))::integer as sent,
  count(*) filter (where d.status in ('delivered', 'opened', 'clicked'))::integer as delivered,
  count(*) filter (where d.status in ('opened', 'clicked'))::integer as opened,
  count(*) filter (where d.status = 'clicked')::integer as clicked,
  count(*) filter (where d.status = 'bounced')::integer as bounced,
  count(*) filter (where d.status = 'complained')::integer as complained,
  count(*) filter (where d.status = 'failed')::integer as failed
from public.email_automation_deliveries d
join public.email_automation_enrolments e on e.id = d.enrolment_id
group by d.organisation_id, e.journey_id;
grant select on public.email_automation_delivery_performance to authenticated;

commit;
