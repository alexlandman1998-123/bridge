-- Rentals Phase 2: owner workspace metadata.  An owner remains the canonical
-- CRM party linked through rental_property_landlords; these tables only add
-- Rental-specific operational state and never duplicate identity records.
begin;

create table if not exists public.rental_owner_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  party_id uuid not null,
  assigned_manager_id uuid references public.profiles(id) on delete set null,
  owner_type text not null default 'individual' check (owner_type in ('individual', 'joint_owners', 'company', 'trust', 'close_corporation', 'estate', 'other')),
  owner_reference text,
  compliance_status text not null default 'not_started' check (compliance_status in ('not_started', 'incomplete', 'under_review', 'verified', 'rejected', 'expired', 'review_required')),
  banking_status text not null default 'not_started' check (banking_status in ('not_started', 'pending', 'verified', 'rejected', 'expired')),
  portal_status text not null default 'not_invited' check (portal_status in ('not_invited', 'invited', 'active', 'revoked')),
  preferred_contact_channel text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, party_id)
);

create table if not exists public.rental_owner_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_profile_id uuid not null references public.rental_owner_profiles(id) on delete cascade,
  property_id uuid references public.rental_properties(id) on delete set null,
  approval_type text not null check (approval_type in ('maintenance', 'lease_renewal', 'deposit', 'expense', 'other')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled', 'expired')),
  summary text not null,
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_owner_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_profile_id uuid not null references public.rental_owner_profiles(id) on delete cascade,
  property_id uuid references public.rental_properties(id) on delete set null,
  activity_type text not null,
  description text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists rental_owner_profiles_scope_idx on public.rental_owner_profiles(organisation_id, compliance_status, banking_status);
create index if not exists rental_owner_approvals_queue_idx on public.rental_owner_approvals(organisation_id, status, due_at);
create index if not exists rental_owner_activity_owner_idx on public.rental_owner_activity(owner_profile_id, occurred_at desc);

create or replace function public.rental_owner_profile_scope_allowed(p_organisation_id uuid, p_party_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.rental_property_landlords relationship
    join public.rental_properties property on property.id = relationship.property_id
    where relationship.organisation_id = p_organisation_id
      and relationship.party_id = p_party_id
      and relationship.relationship_status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  );
$$;

create or replace function public.rental_owner_profile_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_rental_owner_profiles_touch on public.rental_owner_profiles;
create trigger trg_rental_owner_profiles_touch before update on public.rental_owner_profiles for each row execute function public.rental_owner_profile_touch();
drop trigger if exists trg_rental_owner_approvals_touch on public.rental_owner_approvals;
create trigger trg_rental_owner_approvals_touch before update on public.rental_owner_approvals for each row execute function public.rental_owner_profile_touch();

alter table public.rental_owner_profiles enable row level security;
alter table public.rental_owner_approvals enable row level security;
alter table public.rental_owner_activity enable row level security;
revoke all on public.rental_owner_profiles, public.rental_owner_approvals, public.rental_owner_activity from anon, authenticated;
grant select, insert, update on public.rental_owner_profiles, public.rental_owner_approvals, public.rental_owner_activity to authenticated;

create policy rental_owner_profiles_scoped on public.rental_owner_profiles for all to authenticated
  using (public.rental_owner_profile_scope_allowed(organisation_id, party_id))
  with check (public.rental_owner_profile_scope_allowed(organisation_id, party_id));
create policy rental_owner_approvals_scoped on public.rental_owner_approvals for all to authenticated
  using (exists (select 1 from public.rental_owner_profiles profile where profile.id = owner_profile_id and public.rental_owner_profile_scope_allowed(profile.organisation_id, profile.party_id)))
  with check (exists (select 1 from public.rental_owner_profiles profile where profile.id = owner_profile_id and profile.organisation_id = organisation_id and public.rental_owner_profile_scope_allowed(profile.organisation_id, profile.party_id)));
create policy rental_owner_activity_scoped on public.rental_owner_activity for all to authenticated
  using (exists (select 1 from public.rental_owner_profiles profile where profile.id = owner_profile_id and public.rental_owner_profile_scope_allowed(profile.organisation_id, profile.party_id)))
  with check (exists (select 1 from public.rental_owner_profiles profile where profile.id = owner_profile_id and profile.organisation_id = organisation_id and public.rental_owner_profile_scope_allowed(profile.organisation_id, profile.party_id)));

revoke all on function public.rental_owner_profile_scope_allowed(uuid, uuid), public.rental_owner_profile_touch() from public, anon;
grant execute on function public.rental_owner_profile_scope_allowed(uuid, uuid) to authenticated;

commit;
