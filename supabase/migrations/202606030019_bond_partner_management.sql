create table if not exists public.bond_partners (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  partner_type text not null check (partner_type in ('agency', 'development', 'referral_partner', 'developer', 'attorney', 'internal_source')),
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_number text,
  default_region_id uuid references public.workspace_regions(id) on delete set null,
  default_branch_id uuid references public.workspace_units(id) on delete set null,
  default_consultant_id uuid references auth.users(id) on delete set null,
  routing_rule_id uuid references public.bond_routing_rules(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'invited', 'active', 'paused', 'disabled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bond_partner_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  invited_email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  token text not null unique,
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid references public.bond_partners(id) on delete cascade,
  event_type text not null check (event_type in (
    'PARTNER_CREATED',
    'PARTNER_UPDATED',
    'PARTNER_INVITED',
    'PARTNER_INVITE_RESENT',
    'PARTNER_ACCEPTED',
    'PARTNER_PAUSED',
    'PARTNER_DISABLED',
    'PARTNER_ROUTING_DEFAULT_UPDATED'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  source text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bond_partners_organisation_idx on public.bond_partners(organisation_id);
create index if not exists bond_partners_defaults_idx on public.bond_partners(default_region_id, default_branch_id, default_consultant_id);
create index if not exists bond_partner_invitations_partner_idx on public.bond_partner_invitations(partner_id);
create index if not exists bond_partner_activity_partner_idx on public.bond_partner_activity(partner_id, created_at desc);

alter table public.bond_partners enable row level security;
alter table public.bond_partner_invitations enable row level security;
alter table public.bond_partner_activity enable row level security;

drop policy if exists "bond_partners_member_select" on public.bond_partners;
create policy "bond_partners_member_select"
on public.bond_partners
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partners_member_insert" on public.bond_partners;
create policy "bond_partners_member_insert"
on public.bond_partners
for insert
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partners_member_update" on public.bond_partners;
create policy "bond_partners_member_update"
on public.bond_partners
for update
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_invitations_member_select" on public.bond_partner_invitations;
create policy "bond_partner_invitations_member_select"
on public.bond_partner_invitations
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_invitations_member_insert" on public.bond_partner_invitations;
create policy "bond_partner_invitations_member_insert"
on public.bond_partner_invitations
for insert
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_invitations_member_update" on public.bond_partner_invitations;
create policy "bond_partner_invitations_member_update"
on public.bond_partner_invitations
for update
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_activity_member_select" on public.bond_partner_activity;
create policy "bond_partner_activity_member_select"
on public.bond_partner_activity
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_activity_member_insert" on public.bond_partner_activity;
create policy "bond_partner_activity_member_insert"
on public.bond_partner_activity
for insert
with check (public.bridge_is_active_member(organisation_id));
