begin;

create extension if not exists "pgcrypto";

create table if not exists public.platform_revenue_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  commercial_deal_id uuid references public.commercial_deals(id) on delete set null,
  revenue_type text not null,
  amount_cents bigint not null default 0,
  currency text not null default 'ZAR',
  status text not null default 'pending',
  recognised_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists platform_revenue_events_recognised_idx
  on public.platform_revenue_events (status, recognised_at desc);

create index if not exists platform_revenue_events_organisation_idx
  on public.platform_revenue_events (organisation_id, created_at desc);

create table if not exists public.organisation_activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists organisation_activity_events_recent_idx
  on public.organisation_activity_events (occurred_at desc, organisation_id);

create table if not exists public.platform_integration_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  integration_key text not null,
  provider text,
  status text not null,
  severity text not null default 'warning',
  message text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists platform_integration_events_unresolved_idx
  on public.platform_integration_events (status, occurred_at desc)
  where resolved_at is null;

create table if not exists public.platform_activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  event_type text,
  title text not null,
  description text,
  summary text,
  severity text not null default 'info',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists platform_activity_events_recent_idx
  on public.platform_activity_events (occurred_at desc);

alter table public.platform_revenue_events enable row level security;
alter table public.organisation_activity_events enable row level security;
alter table public.platform_integration_events enable row level security;
alter table public.platform_activity_events enable row level security;

grant select, insert, update on public.platform_revenue_events to authenticated;
grant select, insert, update on public.organisation_activity_events to authenticated;
grant select, insert, update on public.platform_integration_events to authenticated;
grant select, insert, update on public.platform_activity_events to authenticated;

commit;
