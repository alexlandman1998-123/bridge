begin;
alter table public.email_campaigns add column if not exists experiment_json jsonb not null default '{}'::jsonb;
create table if not exists public.email_campaign_experiments (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null unique references public.email_campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  metric text not null default 'open_rate' check (metric in ('open_rate','click_rate')),
  sample_percent smallint not null default 20 check (sample_percent between 10 and 50),
  status text not null default 'draft' check (status in ('draft','running','winner_selected','completed')),
  created_at timestamptz not null default now()
);
alter table public.email_campaign_experiments enable row level security;
grant select,insert,update on public.email_campaign_experiments to authenticated;
create policy email_campaign_experiments_member on public.email_campaign_experiments for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
commit;
