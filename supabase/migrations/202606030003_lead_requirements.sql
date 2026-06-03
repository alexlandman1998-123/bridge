begin;

create table if not exists public.lead_requirements (
  requirement_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  title text,
  intent_type text not null default 'buy',
  property_category text,
  property_types text[],
  areas text[],
  suburbs text[],
  city text,
  province text,
  budget_min numeric,
  budget_max numeric,
  bedrooms_min numeric,
  bathrooms_min numeric,
  garages_min numeric,
  parking_min numeric,
  erf_size_min numeric,
  floor_size_min numeric,
  must_haves text[],
  nice_to_haves text[],
  deal_breakers text[],
  finance_status text,
  finance_type text,
  pre_approved boolean,
  deposit_available boolean,
  timeline text,
  urgency text,
  communication_preference text,
  consent_to_receive_matches boolean not null default false,
  notes text,
  status text not null default 'active',
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_requirements_intent_type_check check (
    intent_type in ('buy', 'rent', 'sell', 'lease', 'invest', 'other')
  ),
  constraint lead_requirements_status_check check (
    status in ('active', 'paused', 'fulfilled', 'archived')
  ),
  constraint lead_requirements_finance_status_check check (
    finance_status is null or finance_status in ('unknown', 'cash', 'bond_needed', 'pre_approved', 'bond_in_progress', 'not_ready')
  ),
  constraint lead_requirements_timeline_check check (
    timeline is null or timeline in ('immediately', '0_3_months', '3_6_months', '6_12_months', 'not_sure')
  ),
  constraint lead_requirements_urgency_check check (
    urgency is null or urgency in ('low', 'medium', 'high')
  ),
  constraint lead_requirements_budget_order_check check (
    budget_min is null or budget_max is null or budget_min <= budget_max
  )
);

create index if not exists lead_requirements_org_idx
  on public.lead_requirements (organisation_id);
create index if not exists lead_requirements_lead_idx
  on public.lead_requirements (lead_id);
create index if not exists lead_requirements_contact_idx
  on public.lead_requirements (contact_id);
create index if not exists lead_requirements_status_idx
  on public.lead_requirements (status);
create index if not exists lead_requirements_intent_type_idx
  on public.lead_requirements (intent_type);
create index if not exists lead_requirements_budget_min_idx
  on public.lead_requirements (budget_min);
create index if not exists lead_requirements_budget_max_idx
  on public.lead_requirements (budget_max);
create index if not exists lead_requirements_city_idx
  on public.lead_requirements (city);
create index if not exists lead_requirements_province_idx
  on public.lead_requirements (province);
create index if not exists lead_requirements_created_idx
  on public.lead_requirements (created_at desc);

create index if not exists lead_requirements_areas_gin_idx
  on public.lead_requirements using gin (areas);
create index if not exists lead_requirements_suburbs_gin_idx
  on public.lead_requirements using gin (suburbs);
create index if not exists lead_requirements_property_types_gin_idx
  on public.lead_requirements using gin (property_types);
create index if not exists lead_requirements_must_haves_gin_idx
  on public.lead_requirements using gin (must_haves);
create index if not exists lead_requirements_nice_to_haves_gin_idx
  on public.lead_requirements using gin (nice_to_haves);

create unique index if not exists lead_requirements_one_primary_active_idx
  on public.lead_requirements (lead_id)
  where is_primary = true and status = 'active';

create or replace function public.bridge_lead_requirements_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lead_requirements_updated_at on public.lead_requirements;
create trigger trg_lead_requirements_updated_at
before update on public.lead_requirements
for each row execute function public.bridge_lead_requirements_set_updated_at();

create or replace function public.bridge_lead_requirement_scope_ok(
  p_organisation_id uuid,
  p_lead_id uuid,
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
    and exists (
      select 1
      from public.leads l
      where l.lead_id = p_lead_id
        and l.organisation_id = p_organisation_id
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

alter table public.lead_requirements enable row level security;

drop policy if exists lead_requirements_select_member on public.lead_requirements;
create policy lead_requirements_select_member
on public.lead_requirements
for select
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)
);

drop policy if exists lead_requirements_insert_member on public.lead_requirements;
create policy lead_requirements_insert_member
on public.lead_requirements
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)
);

drop policy if exists lead_requirements_update_member on public.lead_requirements;
create policy lead_requirements_update_member
on public.lead_requirements
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)
);

drop policy if exists lead_requirements_delete_member on public.lead_requirements;
create policy lead_requirements_delete_member
on public.lead_requirements
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)
);

grant select, insert, update, delete on public.lead_requirements to authenticated;

alter table public.lead_listing_interests
  add column if not exists requirement_id uuid references public.lead_requirements(requirement_id) on delete set null;

create index if not exists lead_listing_interests_requirement_idx
  on public.lead_listing_interests (requirement_id);

commit;
