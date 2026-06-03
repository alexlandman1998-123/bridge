begin;

create table if not exists public.lead_listing_interests (
  interest_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  source text not null default 'manual',
  status text not null default 'interested',
  match_score numeric,
  match_reasons jsonb not null default '[]'::jsonb,
  notes text,
  is_original_enquiry boolean not null default false,
  is_agent_selected boolean not null default false,
  is_system_suggested boolean not null default false,
  dismissed_at timestamptz,
  viewed_at timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_listing_interests_status_check check (
    status in (
      'interested',
      'suggested',
      'shortlisted',
      'sent',
      'viewed',
      'viewing_scheduled',
      'dismissed',
      'offer_submitted',
      'converted'
    )
  ),
  constraint lead_listing_interests_match_reasons_array_check check (jsonb_typeof(match_reasons) = 'array'),
  constraint lead_listing_interests_match_score_check check (match_score is null or (match_score >= 0 and match_score <= 100))
);

create unique index if not exists lead_listing_interests_lead_listing_unique_idx
  on public.lead_listing_interests (lead_id, listing_id);

create index if not exists lead_listing_interests_org_idx
  on public.lead_listing_interests (organisation_id);
create index if not exists lead_listing_interests_lead_idx
  on public.lead_listing_interests (lead_id);
create index if not exists lead_listing_interests_listing_idx
  on public.lead_listing_interests (listing_id);
create index if not exists lead_listing_interests_contact_idx
  on public.lead_listing_interests (contact_id);
create index if not exists lead_listing_interests_status_idx
  on public.lead_listing_interests (status);
create index if not exists lead_listing_interests_source_idx
  on public.lead_listing_interests (source);
create index if not exists lead_listing_interests_created_idx
  on public.lead_listing_interests (created_at desc);
create index if not exists lead_listing_interests_org_status_idx
  on public.lead_listing_interests (organisation_id, status);

create or replace function public.bridge_lead_listing_interests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lead_listing_interests_updated_at on public.lead_listing_interests;
create trigger trg_lead_listing_interests_updated_at
before update on public.lead_listing_interests
for each row execute function public.bridge_lead_listing_interests_set_updated_at();

create or replace function public.bridge_lead_listing_interest_scope_ok(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_listing_id uuid,
  p_contact_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_organisation_id is not null
    and p_lead_id is not null
    and p_listing_id is not null
    and exists (
      select 1
      from public.leads l
      where l.lead_id = p_lead_id
        and l.organisation_id = p_organisation_id
    )
    and exists (
      select 1
      from public.private_listings pl
      where pl.id = p_listing_id
        and pl.organisation_id = p_organisation_id
    )
    and (
      p_contact_id is null
      or exists (
        select 1
        from public.contacts c
        where c.contact_id = p_contact_id
          and c.organisation_id = p_organisation_id
      )
    )
$$;

alter table public.lead_listing_interests enable row level security;

drop policy if exists lead_listing_interests_select_member on public.lead_listing_interests;
create policy lead_listing_interests_select_member
on public.lead_listing_interests
for select
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)
);

drop policy if exists lead_listing_interests_insert_member on public.lead_listing_interests;
create policy lead_listing_interests_insert_member
on public.lead_listing_interests
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)
);

drop policy if exists lead_listing_interests_update_member on public.lead_listing_interests;
create policy lead_listing_interests_update_member
on public.lead_listing_interests
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)
);

drop policy if exists lead_listing_interests_delete_member on public.lead_listing_interests;
create policy lead_listing_interests_delete_member
on public.lead_listing_interests
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)
);

grant select, insert, update, delete on public.lead_listing_interests to authenticated;

commit;
