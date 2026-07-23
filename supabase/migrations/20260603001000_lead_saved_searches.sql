create table if not exists public.lead_saved_searches (
  saved_search_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  requirement_id uuid references public.lead_requirements(requirement_id) on delete set null,
  search_name text not null,
  active boolean not null default true,
  consent_given boolean not null default false,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  frequency text not null default 'manual_only',
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_saved_searches_frequency_check
    check (frequency in ('daily', 'weekly', 'manual_only'))
);

create index if not exists lead_saved_searches_org_idx
  on public.lead_saved_searches (organisation_id, created_at desc);

create index if not exists lead_saved_searches_lead_idx
  on public.lead_saved_searches (lead_id, active, updated_at desc);

create index if not exists lead_saved_searches_requirement_idx
  on public.lead_saved_searches (requirement_id);

create index if not exists lead_saved_searches_active_idx
  on public.lead_saved_searches (organisation_id, active, frequency);

create index if not exists lead_saved_searches_last_sent_idx
  on public.lead_saved_searches (organisation_id, last_sent_at desc);

create unique index if not exists lead_saved_searches_name_guard
  on public.lead_saved_searches (organisation_id, lead_id, coalesce(requirement_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(search_name));

create unique index if not exists lead_saved_searches_upsert_guard
  on public.lead_saved_searches (organisation_id, lead_id, requirement_id, search_name);

alter table public.lead_saved_searches enable row level security;

drop policy if exists lead_saved_searches_select_member on public.lead_saved_searches;
create policy lead_saved_searches_select_member
  on public.lead_saved_searches
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_saved_searches_insert_member on public.lead_saved_searches;
create policy lead_saved_searches_insert_member
  on public.lead_saved_searches
  for insert
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_saved_searches.lead_id
        and l.organisation_id = lead_saved_searches.organisation_id
    )
    and (
      lead_saved_searches.requirement_id is null
      or exists (
        select 1
        from public.lead_requirements lr
        where lr.requirement_id = lead_saved_searches.requirement_id
          and lr.lead_id = lead_saved_searches.lead_id
          and lr.organisation_id = lead_saved_searches.organisation_id
      )
    )
  );

drop policy if exists lead_saved_searches_update_member on public.lead_saved_searches;
create policy lead_saved_searches_update_member
  on public.lead_saved_searches
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_saved_searches.lead_id
        and l.organisation_id = lead_saved_searches.organisation_id
    )
    and (
      lead_saved_searches.requirement_id is null
      or exists (
        select 1
        from public.lead_requirements lr
        where lr.requirement_id = lead_saved_searches.requirement_id
          and lr.lead_id = lead_saved_searches.lead_id
          and lr.organisation_id = lead_saved_searches.organisation_id
      )
    )
  );
