begin;

create extension if not exists "pgcrypto";

create table if not exists public.launch_event_leads (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  full_name text not null,
  phone text not null,
  email text,
  company text,
  interest text not null,
  preferred_window text,
  note text,
  status text not null default 'new',
  source text not null default 'event_qr',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_event_leads_status_check
    check (status in ('new', 'contacted', 'demo_started', 'qualified', 'closed', 'spam')),
  constraint launch_event_leads_source_check
    check (source in ('event_qr', 'manual', 'import')),
  constraint launch_event_leads_interest_check
    check (interest in ('developer', 'agency', 'commercial', 'attorney', 'bond_originator', 'buyer_seller', 'other')),
  constraint launch_event_leads_name_not_blank
    check (length(btrim(full_name)) > 0),
  constraint launch_event_leads_phone_not_blank
    check (length(btrim(phone)) > 0)
);

create index if not exists launch_event_leads_event_created_idx
  on public.launch_event_leads (event_slug, created_at desc);

create index if not exists launch_event_leads_status_idx
  on public.launch_event_leads (status, created_at desc);

create or replace function public.set_launch_event_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_launch_event_leads_updated_at on public.launch_event_leads;
create trigger set_launch_event_leads_updated_at
before update on public.launch_event_leads
for each row
execute function public.set_launch_event_leads_updated_at();

alter table public.launch_event_leads enable row level security;

drop policy if exists "Launch event guests can submit leads" on public.launch_event_leads;
create policy "Launch event guests can submit leads"
  on public.launch_event_leads
  for insert
  to anon, authenticated
  with check (
    event_slug = 'arch9-launch-2026-06-24'
    and status = 'new'
    and source = 'event_qr'
  );

drop policy if exists "Authenticated team can read launch leads" on public.launch_event_leads;
create policy "Authenticated team can read launch leads"
  on public.launch_event_leads
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated team can update launch leads" on public.launch_event_leads;
create policy "Authenticated team can update launch leads"
  on public.launch_event_leads
  for update
  to authenticated
  using (true)
  with check (true);

grant insert on public.launch_event_leads to anon;
grant insert, select, update on public.launch_event_leads to authenticated;

comment on table public.launch_event_leads is
  'Public QR capture table for Arch9 launch event private follow-up requests.';

commit;
