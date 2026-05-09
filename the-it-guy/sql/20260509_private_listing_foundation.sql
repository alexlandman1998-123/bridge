begin;

create table if not exists public.private_listings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  seller_lead_id text,
  originating_crm_lead_id text,
  seller_profile_id uuid,
  property_profile_id uuid,
  listing_reference text,
  listing_status text not null default 'seller_lead',
  listing_visibility text not null default 'internal',
  property_type text,
  listing_category text,
  title text,
  description text,
  asking_price numeric(14,2),
  estimated_value numeric(14,2),
  address_line_1 text,
  address_line_2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  seller_type text,
  finance_context text,
  mandate_type text,
  mandate_status text not null default 'not_started',
  seller_onboarding_status text not null default 'not_started',
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listings_status_check check (
    listing_status in (
      'seller_lead',
      'onboarding_sent',
      'onboarding_completed',
      'listing_review',
      'mandate_ready',
      'mandate_sent',
      'mandate_signed',
      'active',
      'under_offer',
      'transaction_created',
      'sold',
      'withdrawn'
    )
  ),
  constraint private_listings_visibility_check check (
    listing_visibility in ('internal', 'active_market', 'archived')
  ),
  constraint private_listings_onboarding_status_check check (
    seller_onboarding_status in ('not_started', 'sent', 'in_progress', 'completed', 'rejected')
  ),
  constraint private_listings_mandate_status_check check (
    mandate_status in ('not_started', 'ready', 'generated', 'sent', 'viewed', 'signed', 'rejected', 'expired')
  )
);

create unique index if not exists private_listings_listing_reference_idx
  on public.private_listings(listing_reference)
  where listing_reference is not null;

create index if not exists private_listings_org_idx on public.private_listings(organisation_id);
create index if not exists private_listings_org_agent_idx on public.private_listings(organisation_id, assigned_agent_id);
create index if not exists private_listings_org_status_idx on public.private_listings(organisation_id, listing_status);
create index if not exists private_listings_org_visibility_idx on public.private_listings(organisation_id, listing_visibility);
create index if not exists private_listings_org_created_idx on public.private_listings(organisation_id, created_at desc);
create index if not exists private_listings_originating_lead_idx on public.private_listings(originating_crm_lead_id);
create index if not exists private_listings_seller_lead_idx on public.private_listings(seller_lead_id);

create table if not exists public.private_listing_seller_onboarding (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  token text not null unique,
  token_expires_at timestamptz,
  seller_type text,
  ownership_structure text,
  marital_regime text,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'not_started',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_seller_onboarding_status_check check (
    status in ('not_started', 'sent', 'in_progress', 'completed', 'rejected')
  )
);

create unique index if not exists private_listing_seller_onboarding_listing_unique_idx
  on public.private_listing_seller_onboarding(private_listing_id);
create index if not exists private_listing_seller_onboarding_token_idx
  on public.private_listing_seller_onboarding(token);
create index if not exists private_listing_seller_onboarding_status_idx
  on public.private_listing_seller_onboarding(status);

create table if not exists public.private_listing_activity (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  activity_type text,
  activity_title text,
  activity_description text,
  performed_by uuid references auth.users(id) on delete set null,
  visibility text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint private_listing_activity_visibility_check check (
    visibility in ('internal', 'shared', 'client_visible')
  )
);

create index if not exists private_listing_activity_listing_idx
  on public.private_listing_activity(private_listing_id, created_at desc);
create index if not exists private_listing_activity_type_idx
  on public.private_listing_activity(activity_type);

create or replace function public.bridge_private_listing_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_listings_updated_at on public.private_listings;
create trigger trg_private_listings_updated_at
before update on public.private_listings
for each row execute function public.bridge_private_listing_set_updated_at();

drop trigger if exists trg_private_listing_seller_onboarding_updated_at on public.private_listing_seller_onboarding;
create trigger trg_private_listing_seller_onboarding_updated_at
before update on public.private_listing_seller_onboarding
for each row execute function public.bridge_private_listing_set_updated_at();

alter table if exists public.private_listings enable row level security;
alter table if exists public.private_listing_seller_onboarding enable row level security;
alter table if exists public.private_listing_activity enable row level security;

drop policy if exists private_listings_select_member on public.private_listings;
create policy private_listings_select_member
on public.private_listings
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists private_listings_insert_member on public.private_listings;
create policy private_listings_insert_member
on public.private_listings
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id is null
    or assigned_agent_id = auth.uid()
  )
);

drop policy if exists private_listings_update_member on public.private_listings;
create policy private_listings_update_member
on public.private_listings
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
)
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

drop policy if exists private_listings_delete_admin on public.private_listings;
create policy private_listings_delete_admin
on public.private_listings
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and public.bridge_is_org_admin(organisation_id)
);

drop policy if exists private_listing_seller_onboarding_select_member on public.private_listing_seller_onboarding;
create policy private_listing_seller_onboarding_select_member
on public.private_listing_seller_onboarding
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
);

drop policy if exists private_listing_seller_onboarding_mutate_member on public.private_listing_seller_onboarding;
create policy private_listing_seller_onboarding_mutate_member
on public.private_listing_seller_onboarding
for all
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

drop policy if exists private_listing_seller_onboarding_select_token on public.private_listing_seller_onboarding;
create policy private_listing_seller_onboarding_select_token
on public.private_listing_seller_onboarding
for select
to anon
using (
  token is not null
  and (token_expires_at is null or token_expires_at > now())
);

drop policy if exists private_listing_seller_onboarding_update_token on public.private_listing_seller_onboarding;
create policy private_listing_seller_onboarding_update_token
on public.private_listing_seller_onboarding
for update
to anon
using (
  token is not null
  and (token_expires_at is null or token_expires_at > now())
)
with check (
  token is not null
  and (token_expires_at is null or token_expires_at > now())
);

drop policy if exists private_listing_activity_select_member on public.private_listing_activity;
create policy private_listing_activity_select_member
on public.private_listing_activity
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
);

drop policy if exists private_listing_activity_insert_member on public.private_listing_activity;
create policy private_listing_activity_insert_member
on public.private_listing_activity
for insert
to authenticated
with check (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

grant select, insert, update on public.private_listings to authenticated;
grant select, insert, update on public.private_listing_seller_onboarding to authenticated;
grant select, update on public.private_listing_seller_onboarding to anon;
grant select, insert on public.private_listing_activity to authenticated;

commit;
