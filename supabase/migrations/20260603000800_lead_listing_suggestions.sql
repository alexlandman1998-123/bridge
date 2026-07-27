create table if not exists public.lead_listing_suggestions (
  suggestion_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  requirement_id uuid not null references public.lead_requirements(requirement_id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  score numeric,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  generated_by text not null default 'system',
  generated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint lead_listing_suggestions_status_check
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'converted')),
  constraint lead_listing_suggestions_score_check
    check (score is null or (score >= 0 and score <= 100)),
  constraint lead_listing_suggestions_unique_pair
    unique (lead_id, requirement_id, listing_id)
);

create index if not exists lead_listing_suggestions_org_idx
  on public.lead_listing_suggestions (organisation_id, generated_at desc);

create index if not exists lead_listing_suggestions_lead_idx
  on public.lead_listing_suggestions (lead_id, status, generated_at desc);

create index if not exists lead_listing_suggestions_requirement_idx
  on public.lead_listing_suggestions (requirement_id, status, generated_at desc);

create index if not exists lead_listing_suggestions_listing_idx
  on public.lead_listing_suggestions (listing_id, status, generated_at desc);

create index if not exists lead_listing_suggestions_score_idx
  on public.lead_listing_suggestions (organisation_id, score desc);

create index if not exists lead_listing_suggestions_status_idx
  on public.lead_listing_suggestions (organisation_id, status, generated_at desc);

create index if not exists lead_listing_suggestions_generated_idx
  on public.lead_listing_suggestions (organisation_id, generated_at desc);

alter table public.lead_listing_suggestions enable row level security;

drop policy if exists lead_listing_suggestions_select_member on public.lead_listing_suggestions;
create policy lead_listing_suggestions_select_member
  on public.lead_listing_suggestions
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_listing_suggestions_insert_member on public.lead_listing_suggestions;
create policy lead_listing_suggestions_insert_member
  on public.lead_listing_suggestions
  for insert
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_listing_suggestions.lead_id
        and l.organisation_id = lead_listing_suggestions.organisation_id
    )
    and exists (
      select 1
      from public.lead_requirements r
      where r.requirement_id = lead_listing_suggestions.requirement_id
        and r.lead_id = lead_listing_suggestions.lead_id
        and r.organisation_id = lead_listing_suggestions.organisation_id
    )
    and exists (
      select 1
      from public.private_listings pl
      where pl.id = lead_listing_suggestions.listing_id
        and pl.organisation_id = lead_listing_suggestions.organisation_id
    )
  );

drop policy if exists lead_listing_suggestions_update_member on public.lead_listing_suggestions;
create policy lead_listing_suggestions_update_member
  on public.lead_listing_suggestions
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_listing_suggestions.lead_id
        and l.organisation_id = lead_listing_suggestions.organisation_id
    )
    and exists (
      select 1
      from public.lead_requirements r
      where r.requirement_id = lead_listing_suggestions.requirement_id
        and r.lead_id = lead_listing_suggestions.lead_id
        and r.organisation_id = lead_listing_suggestions.organisation_id
    )
    and exists (
      select 1
      from public.private_listings pl
      where pl.id = lead_listing_suggestions.listing_id
        and pl.organisation_id = lead_listing_suggestions.organisation_id
    )
  );
