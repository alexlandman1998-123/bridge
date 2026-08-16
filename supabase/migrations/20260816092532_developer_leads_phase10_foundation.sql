begin;

create table if not exists public.developer_leads (
  developer_lead_id uuid primary key default gen_random_uuid(),
  developer_org_id uuid not null references public.organisations(id) on delete cascade,
  source_agency_org_id uuid references public.organisations(id) on delete set null,
  source_agent_user_id uuid references public.profiles(id) on delete set null,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  source_lead_id uuid references public.leads(lead_id) on delete set null,
  primary_development_id uuid references public.developments(id) on delete set null,
  preferred_unit_id uuid references public.units(id) on delete set null,
  converted_transaction_id uuid references public.transactions(id) on delete set null,
  ownership_model text not null default 'developer_direct',
  lead_owner text not null default 'developer',
  selling_model text not null default 'developer_led',
  visibility_state text not null default 'full',
  reservation_state text not null default 'none',
  lead_status text not null default 'new',
  lead_source text not null default 'developer_direct',
  budget_min numeric(14, 2),
  budget_max numeric(14, 2),
  unit_type_interest text,
  public_reference text,
  protected_summary text,
  consent_requested_at timestamptz,
  handover_accepted_at timestamptz,
  reservation_expires_at timestamptz,
  converted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_leads_owner_check
    check (lead_owner in ('developer', 'agency')),
  constraint developer_leads_ownership_model_check
    check (ownership_model in ('developer_direct', 'developer_assigned', 'agency_introduced')),
  constraint developer_leads_selling_model_check
    check (selling_model in ('developer_led', 'agent_led')),
  constraint developer_leads_visibility_state_check
    check (visibility_state in ('full', 'limited', 'consent_pending', 'handed_over')),
  constraint developer_leads_reservation_state_check
    check (reservation_state in ('none', 'provisional', 'reserved', 'expired', 'converted')),
  constraint developer_leads_status_check
    check (lead_status in ('new', 'contacted', 'qualified', 'viewing', 'reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted', 'lost')),
  constraint developer_leads_budget_range_check
    check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint developer_leads_agency_visibility_check
    check (
      (
        lead_owner = 'developer'
        and ownership_model in ('developer_direct', 'developer_assigned')
        and visibility_state = 'full'
      )
      or (
        lead_owner = 'agency'
        and ownership_model = 'agency_introduced'
        and selling_model = 'agent_led'
        and source_agency_org_id is not null
        and visibility_state in ('limited', 'consent_pending', 'handed_over')
      )
    )
);

comment on table public.developer_leads is
  'Developer-module lead shell. Agency-fed rows contain only protected, non-PII summary data until buyer handover.';
comment on column public.developer_leads.protected_summary is
  'Non-sensitive summary safe for developer visibility on agency-fed leads before handover.';

create table if not exists public.developer_lead_private_details (
  developer_lead_id uuid primary key references public.developer_leads(developer_lead_id) on delete cascade,
  buyer_full_name text,
  buyer_email text,
  buyer_phone text,
  buyer_id_number text,
  private_notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  consent_reference text,
  consent_captured_at timestamptz,
  handover_source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.developer_lead_private_details is
  'Buyer PII and sensitive agency notes for developer leads. Agency-fed details become developer-visible only after handover.';

create table if not exists public.developer_lead_development_interests (
  developer_lead_interest_id uuid primary key default gen_random_uuid(),
  developer_lead_id uuid not null references public.developer_leads(developer_lead_id) on delete cascade,
  developer_org_id uuid not null references public.organisations(id) on delete cascade,
  development_id uuid references public.developments(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  interest_rank integer not null default 1,
  interest_status text not null default 'interested',
  budget_min numeric(14, 2),
  budget_max numeric(14, 2),
  unit_type_interest text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_lead_development_interests_status_check
    check (interest_status in ('interested', 'shortlisted', 'reserved', 'lost')),
  constraint developer_lead_development_interests_rank_check
    check (interest_rank > 0),
  constraint developer_lead_development_interests_budget_check
    check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint developer_lead_development_interests_unique
    unique (developer_lead_id, development_id, unit_id)
);

comment on table public.developer_lead_development_interests is
  'One-to-many development and optional unit interests for developer leads.';

create table if not exists public.developer_lead_activity (
  developer_lead_activity_id uuid primary key default gen_random_uuid(),
  developer_lead_id uuid not null references public.developer_leads(developer_lead_id) on delete cascade,
  developer_org_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  source_agency_org_id uuid references public.organisations(id) on delete set null,
  activity_type text not null default 'note',
  activity_note text,
  visibility_scope text not null default 'shared',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint developer_lead_activity_type_check
    check (activity_type in ('created', 'assigned', 'status_changed', 'reservation_changed', 'handover_requested', 'handover_completed', 'buyer_onboarding_sent', 'buyer_onboarding_submitted', 'otp_uploaded', 'converted_and_onboarding_sent', 'converted', 'note', 'system')),
  constraint developer_lead_activity_visibility_check
    check (visibility_scope in ('developer', 'agency', 'shared', 'system'))
);

comment on table public.developer_lead_activity is
  'Scoped activity and audit events for developer leads. Agency-only notes stay hidden from developer members.';

create index if not exists developer_leads_developer_org_status_idx
  on public.developer_leads (developer_org_id, lead_status, updated_at desc);
create index if not exists developer_leads_development_idx
  on public.developer_leads (primary_development_id, lead_status, updated_at desc);
create index if not exists developer_leads_assigned_agent_idx
  on public.developer_leads (developer_org_id, assigned_agent_id, updated_at desc);
create index if not exists developer_leads_source_agency_idx
  on public.developer_leads (source_agency_org_id, updated_at desc)
  where source_agency_org_id is not null;
create index if not exists developer_leads_visibility_idx
  on public.developer_leads (developer_org_id, visibility_state, updated_at desc);
create index if not exists developer_lead_interests_lead_idx
  on public.developer_lead_development_interests (developer_lead_id, interest_rank);
create index if not exists developer_lead_interests_development_idx
  on public.developer_lead_development_interests (developer_org_id, development_id, interest_status);
create index if not exists developer_lead_activity_lead_idx
  on public.developer_lead_activity (developer_lead_id, created_at desc);

drop trigger if exists trg_developer_leads_updated_at on public.developer_leads;
create trigger trg_developer_leads_updated_at
before update on public.developer_leads
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_developer_lead_private_details_updated_at on public.developer_lead_private_details;
create trigger trg_developer_lead_private_details_updated_at
before update on public.developer_lead_private_details
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_developer_lead_development_interests_updated_at on public.developer_lead_development_interests;
create trigger trg_developer_lead_development_interests_updated_at
before update on public.developer_lead_development_interests
for each row
execute function public.set_updated_at_timestamp();

alter table if exists public.developer_leads enable row level security;
alter table if exists public.developer_lead_private_details enable row level security;
alter table if exists public.developer_lead_development_interests enable row level security;
alter table if exists public.developer_lead_activity enable row level security;

drop policy if exists developer_leads_select_scoped on public.developer_leads;
create policy developer_leads_select_scoped
on public.developer_leads
for select
to authenticated
using (
  public.bridge_is_active_member(developer_org_id)
  or (
    source_agency_org_id is not null
    and public.bridge_is_active_member(source_agency_org_id)
  )
);

drop policy if exists developer_leads_insert_scoped on public.developer_leads;
create policy developer_leads_insert_scoped
on public.developer_leads
for insert
to authenticated
with check (
  (
    lead_owner = 'developer'
    and ownership_model in ('developer_direct', 'developer_assigned')
    and visibility_state = 'full'
    and public.bridge_is_active_member(developer_org_id)
  )
  or (
    lead_owner = 'agency'
    and ownership_model = 'agency_introduced'
    and selling_model = 'agent_led'
    and visibility_state in ('limited', 'consent_pending')
    and source_agency_org_id is not null
    and public.bridge_is_active_member(source_agency_org_id)
    and primary_development_id is not null
    and public.bridge_can_manage_development_record(primary_development_id)
  )
);

drop policy if exists developer_leads_update_scoped on public.developer_leads;
create policy developer_leads_update_scoped
on public.developer_leads
for update
to authenticated
using (
  public.bridge_is_active_member(developer_org_id)
  or (
    source_agency_org_id is not null
    and public.bridge_is_active_member(source_agency_org_id)
  )
)
with check (
  (
    lead_owner = 'developer'
    and ownership_model in ('developer_direct', 'developer_assigned')
    and visibility_state = 'full'
    and public.bridge_is_active_member(developer_org_id)
  )
  or (
    lead_owner = 'agency'
    and ownership_model = 'agency_introduced'
    and selling_model = 'agent_led'
    and visibility_state in ('limited', 'consent_pending', 'handed_over')
    and source_agency_org_id is not null
    and (
      public.bridge_is_active_member(source_agency_org_id)
      or public.bridge_is_active_member(developer_org_id)
    )
  )
);

drop policy if exists developer_lead_private_details_select_scoped on public.developer_lead_private_details;
create policy developer_lead_private_details_select_scoped
on public.developer_lead_private_details
for select
to authenticated
using (
  exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_private_details.developer_lead_id
      and (
        (
          public.bridge_is_active_member(lead.developer_org_id)
          and (
            lead.lead_owner = 'developer'
            or lead.visibility_state = 'handed_over'
          )
        )
        or (
          lead.source_agency_org_id is not null
          and public.bridge_is_active_member(lead.source_agency_org_id)
        )
      )
  )
);

drop policy if exists developer_lead_private_details_insert_scoped on public.developer_lead_private_details;
create policy developer_lead_private_details_insert_scoped
on public.developer_lead_private_details
for insert
to authenticated
with check (
  exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_private_details.developer_lead_id
      and (
        (
          lead.lead_owner = 'developer'
          and public.bridge_is_active_member(lead.developer_org_id)
        )
        or (
          lead.lead_owner = 'agency'
          and lead.source_agency_org_id is not null
          and public.bridge_is_active_member(lead.source_agency_org_id)
        )
      )
  )
);

drop policy if exists developer_lead_private_details_update_scoped on public.developer_lead_private_details;
create policy developer_lead_private_details_update_scoped
on public.developer_lead_private_details
for update
to authenticated
using (
  exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_private_details.developer_lead_id
      and (
        (
          lead.lead_owner = 'developer'
          and public.bridge_is_active_member(lead.developer_org_id)
        )
        or (
          lead.lead_owner = 'agency'
          and lead.source_agency_org_id is not null
          and public.bridge_is_active_member(lead.source_agency_org_id)
        )
        or (
          lead.lead_owner = 'agency'
          and lead.visibility_state = 'handed_over'
          and public.bridge_is_active_member(lead.developer_org_id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_private_details.developer_lead_id
      and (
        (
          lead.lead_owner = 'developer'
          and public.bridge_is_active_member(lead.developer_org_id)
        )
        or (
          lead.lead_owner = 'agency'
          and lead.source_agency_org_id is not null
          and public.bridge_is_active_member(lead.source_agency_org_id)
        )
        or (
          lead.lead_owner = 'agency'
          and lead.visibility_state = 'handed_over'
          and public.bridge_is_active_member(lead.developer_org_id)
        )
      )
  )
);

drop policy if exists developer_lead_interests_select_scoped on public.developer_lead_development_interests;
create policy developer_lead_interests_select_scoped
on public.developer_lead_development_interests
for select
to authenticated
using (
  public.bridge_is_active_member(developer_org_id)
  or exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_development_interests.developer_lead_id
      and lead.source_agency_org_id is not null
      and public.bridge_is_active_member(lead.source_agency_org_id)
  )
);

drop policy if exists developer_lead_interests_insert_scoped on public.developer_lead_development_interests;
create policy developer_lead_interests_insert_scoped
on public.developer_lead_development_interests
for insert
to authenticated
with check (
  public.bridge_is_active_member(developer_org_id)
  or exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_development_interests.developer_lead_id
      and lead.source_agency_org_id is not null
      and public.bridge_is_active_member(lead.source_agency_org_id)
  )
);

drop policy if exists developer_lead_interests_update_scoped on public.developer_lead_development_interests;
create policy developer_lead_interests_update_scoped
on public.developer_lead_development_interests
for update
to authenticated
using (
  public.bridge_is_active_member(developer_org_id)
  or exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_development_interests.developer_lead_id
      and lead.source_agency_org_id is not null
      and public.bridge_is_active_member(lead.source_agency_org_id)
  )
)
with check (
  public.bridge_is_active_member(developer_org_id)
  or exists (
    select 1
    from public.developer_leads lead
    where lead.developer_lead_id = developer_lead_development_interests.developer_lead_id
      and lead.source_agency_org_id is not null
      and public.bridge_is_active_member(lead.source_agency_org_id)
  )
);

drop policy if exists developer_lead_activity_select_scoped on public.developer_lead_activity;
create policy developer_lead_activity_select_scoped
on public.developer_lead_activity
for select
to authenticated
using (
  (
    public.bridge_is_active_member(developer_org_id)
    and visibility_scope in ('developer', 'shared', 'system')
  )
  or (
    source_agency_org_id is not null
    and public.bridge_is_active_member(source_agency_org_id)
    and visibility_scope in ('agency', 'shared', 'system')
  )
);

drop policy if exists developer_lead_activity_insert_scoped on public.developer_lead_activity;
create policy developer_lead_activity_insert_scoped
on public.developer_lead_activity
for insert
to authenticated
with check (
  (
    public.bridge_is_active_member(developer_org_id)
    and visibility_scope in ('developer', 'shared', 'system')
  )
  or (
    source_agency_org_id is not null
    and public.bridge_is_active_member(source_agency_org_id)
    and visibility_scope in ('agency', 'shared', 'system')
  )
);

grant select, insert, update on table public.developer_leads to authenticated;
grant select, insert, update on table public.developer_lead_private_details to authenticated;
grant select, insert, update on table public.developer_lead_development_interests to authenticated;
grant select, insert on table public.developer_lead_activity to authenticated;

notify pgrst, 'reload schema';

commit;
