-- Home Seekers FIC training completion records. This module is intentionally
-- scoped to the Home Seekers organisation until it is promoted to a reusable
-- compliance-training product.
create table if not exists public.home_seekers_fic_training_results (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score >= 0),
  total_questions integer not null check (total_questions > 0),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create index if not exists home_seekers_fic_training_results_org_completed_idx
  on public.home_seekers_fic_training_results (organisation_id, completed_at desc);

alter table public.home_seekers_fic_training_results enable row level security;

revoke all on table public.home_seekers_fic_training_results from anon;
grant select, insert, update on table public.home_seekers_fic_training_results to authenticated;

create or replace function public.home_seekers_fic_training_is_enabled(p_organisation_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisations organisation
    where organisation.id = p_organisation_id
      and lower(trim(coalesce(organisation.name, ''))) = 'home seekers'
  );
$$;

create or replace function public.home_seekers_fic_training_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_seekers_fic_training_results_touch_updated_at on public.home_seekers_fic_training_results;
create trigger home_seekers_fic_training_results_touch_updated_at
before update on public.home_seekers_fic_training_results
for each row execute function public.home_seekers_fic_training_touch_updated_at();

create policy home_seekers_fic_training_results_select
on public.home_seekers_fic_training_results
for select to authenticated
using (
  public.home_seekers_fic_training_is_enabled(organisation_id)
  and (
    user_id = (select auth.uid())
    or public.bridge_is_org_admin(organisation_id)
  )
);

create policy home_seekers_fic_training_results_insert_self
on public.home_seekers_fic_training_results
for insert to authenticated
with check (
  public.home_seekers_fic_training_is_enabled(organisation_id)
  and public.bridge_is_active_member(organisation_id)
  and user_id = (select auth.uid())
);

create policy home_seekers_fic_training_results_update_self
on public.home_seekers_fic_training_results
for update to authenticated
using (
  public.home_seekers_fic_training_is_enabled(organisation_id)
  and user_id = (select auth.uid())
)
with check (
  public.home_seekers_fic_training_is_enabled(organisation_id)
  and public.bridge_is_active_member(organisation_id)
  and user_id = (select auth.uid())
);

comment on table public.home_seekers_fic_training_results is
  'Completion and score records for the Home Seekers FIC training module.';
