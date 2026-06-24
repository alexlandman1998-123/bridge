begin;

create extension if not exists "pgcrypto";

create table if not exists public.launch_event_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null default 'arch9-launch-2026-06-24',
  event_name text not null default 'Arch9 Launch',
  action text not null,
  source text not null default 'launch_concierge_success',
  share_link text not null,
  page_url text,
  referrer text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint launch_event_referral_clicks_action_check
    check (action in ('whatsapp', 'copy_link')),
  constraint launch_event_referral_clicks_source_check
    check (source in ('launch_concierge_success'))
);

create index if not exists launch_event_referral_clicks_event_created_idx
  on public.launch_event_referral_clicks (event_slug, created_at desc);

create index if not exists launch_event_referral_clicks_action_idx
  on public.launch_event_referral_clicks (action, created_at desc);

alter table public.launch_event_referral_clicks enable row level security;

drop policy if exists "Launch guests can count referral clicks" on public.launch_event_referral_clicks;
create policy "Launch guests can count referral clicks"
  on public.launch_event_referral_clicks
  for insert
  to anon, authenticated
  with check (
    event_slug = 'arch9-launch-2026-06-24'
    and source = 'launch_concierge_success'
    and action in ('whatsapp', 'copy_link')
  );

drop policy if exists "Authenticated team can read referral clicks" on public.launch_event_referral_clicks;
create policy "Authenticated team can read referral clicks"
  on public.launch_event_referral_clicks
  for select
  to authenticated
  using (true);

grant insert on public.launch_event_referral_clicks to anon;
grant insert, select on public.launch_event_referral_clicks to authenticated;

comment on table public.launch_event_referral_clicks is
  'Referral action click counter for the Arch9 launch concierge success screen.';

commit;
