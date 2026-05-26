begin;

create extension if not exists "pgcrypto" with schema extensions;

alter table if exists public.organisations
  add column if not exists discovery_visibility text not null default 'public',
  add column if not exists specialties text[] not null default '{}'::text[],
  add column if not exists active_areas text[] not null default '{}'::text[],
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists partner_rating numeric;

alter table if exists public.organisations
  drop constraint if exists organisations_discovery_visibility_check;

alter table if exists public.organisations
  add constraint organisations_discovery_visibility_check
  check (discovery_visibility in ('public', 'invite_only', 'hidden'));

alter table if exists public.organisations
  drop constraint if exists organisations_verification_status_check;

alter table if exists public.organisations
  add constraint organisations_verification_status_check
  check (verification_status in ('unverified', 'verified', 'review_required'));

create table if not exists public.organisation_partners (
  id uuid primary key default extensions.gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_organisation_id uuid not null references public.organisations(id) on delete cascade,
  relationship_status text not null default 'pending',
  relationship_type text not null default 'approved',
  visibility_level text not null default 'connected_partners',
  created_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_partners_not_self check (organisation_id <> partner_organisation_id),
  constraint organisation_partners_status_check check (relationship_status in ('pending', 'accepted', 'declined', 'blocked')),
  constraint organisation_partners_type_check check (relationship_type in ('preferred', 'approved', 'internal')),
  constraint organisation_partners_visibility_check check (visibility_level in ('private', 'connected_partners', 'preferred_partners', 'public_ecosystem', 'public', 'invite_only', 'hidden'))
);

create unique index if not exists organisation_partners_unique_pair_idx
  on public.organisation_partners (
    least(organisation_id, partner_organisation_id),
    greatest(organisation_id, partner_organisation_id)
  );

create index if not exists organisation_partners_org_status_idx
  on public.organisation_partners (organisation_id, relationship_status, relationship_type);

create index if not exists organisation_partners_partner_status_idx
  on public.organisation_partners (partner_organisation_id, relationship_status, relationship_type);

drop trigger if exists trg_organisation_partners_updated_at on public.organisation_partners;
create trigger trg_organisation_partners_updated_at
before update on public.organisation_partners
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.partner_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  sender_organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_email text not null,
  recipient_organisation_id uuid references public.organisations(id) on delete set null,
  invite_token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'pending',
  relationship_type text not null default 'approved',
  message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  constraint partner_invitations_status_check check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint partner_invitations_relationship_type_check check (relationship_type in ('preferred', 'approved', 'internal'))
);

create index if not exists partner_invitations_sender_status_idx
  on public.partner_invitations (sender_organisation_id, status, created_at desc);

create index if not exists partner_invitations_recipient_email_idx
  on public.partner_invitations (lower(recipient_email), status);

create table if not exists public.partner_visibility_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_organisation_id uuid references public.organisations(id) on delete cascade,
  visibility_level text not null default 'private',
  share_listings boolean not null default false,
  share_developments boolean not null default false,
  share_transaction_summaries boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_visibility_level_check check (visibility_level in ('private', 'connected_partners_only', 'preferred_partners_only', 'public_ecosystem')),
  constraint partner_visibility_unique unique (organisation_id, partner_organisation_id)
);

create index if not exists partner_visibility_settings_org_idx
  on public.partner_visibility_settings (organisation_id, visibility_level);

drop trigger if exists trg_partner_visibility_settings_updated_at on public.partner_visibility_settings;
create trigger trg_partner_visibility_settings_updated_at
before update on public.partner_visibility_settings
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.partner_referrals (
  id uuid primary key default extensions.gen_random_uuid(),
  referring_organisation_id uuid not null references public.organisations(id) on delete cascade,
  referred_organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  referral_status text not null default 'sent',
  referral_date timestamptz not null default now(),
  referral_value numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_referrals_not_self check (referring_organisation_id <> referred_organisation_id),
  constraint partner_referrals_status_check check (referral_status in ('sent', 'accepted', 'converted', 'declined', 'closed'))
);

create index if not exists partner_referrals_referring_idx
  on public.partner_referrals (referring_organisation_id, referral_status, referral_date desc);

create index if not exists partner_referrals_referred_idx
  on public.partner_referrals (referred_organisation_id, referral_status, referral_date desc);

create index if not exists partner_referrals_transaction_idx
  on public.partner_referrals (transaction_id);

drop trigger if exists trg_partner_referrals_updated_at on public.partner_referrals;
create trigger trg_partner_referrals_updated_at
before update on public.partner_referrals
for each row
execute function public.set_updated_at_timestamp();

alter table if exists public.transactions
  add column if not exists originating_partner_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists referral_source_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists relationship_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists partner_relationship_id uuid references public.organisation_partners(id) on delete set null;

create index if not exists transactions_originating_partner_idx
  on public.transactions (originating_partner_organisation_id);

create index if not exists transactions_referral_source_idx
  on public.transactions (referral_source_organisation_id);

create or replace function public.bridge_normalize_workspace_type(value text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(value, ''))
    when 'agent' then 'agency'
    when 'agency' then 'agency'
    when 'developer' then 'developer_company'
    when 'developer_company' then 'developer_company'
    when 'attorney' then 'attorney_firm'
    when 'attorney_firm' then 'attorney_firm'
    when 'bond' then 'bond_originator'
    when 'bond_company' then 'bond_originator'
    when 'bond_originator' then 'bond_originator'
    else lower(coalesce(value, ''))
  end;
$$;

create or replace function public.bridge_partner_connection_allowed(source_type text, target_type text)
returns boolean
language sql
immutable
as $$
  select case public.bridge_normalize_workspace_type(source_type)
    when 'agency' then public.bridge_normalize_workspace_type(target_type) in ('attorney_firm', 'bond_originator', 'developer_company')
    when 'attorney_firm' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'developer_company')
    when 'developer_company' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'attorney_firm', 'bond_originator')
    when 'bond_originator' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'developer_company')
    else false
  end;
$$;

create or replace function public.bridge_validate_partner_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_type text;
  partner_type text;
begin
  select type into source_type from public.organisations where id = new.organisation_id;
  select type into partner_type from public.organisations where id = new.partner_organisation_id;

  if not public.bridge_partner_connection_allowed(source_type, partner_type) then
    raise exception 'Partner connection between % and % is not allowed.', source_type, partner_type
      using errcode = 'check_violation';
  end if;

  if new.relationship_status = 'accepted' and new.accepted_at is null then
    new.accepted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_partner_relationship on public.organisation_partners;
create trigger trg_validate_partner_relationship
before insert or update on public.organisation_partners
for each row
execute function public.bridge_validate_partner_relationship();

create or replace view public.partner_relationship_metrics as
select
  org.id as organisation_id,
  count(op.id) filter (where op.relationship_status = 'accepted')::integer as active_partners,
  count(op.id) filter (where op.relationship_status = 'accepted' and op.relationship_type = 'preferred')::integer as preferred_partners,
  count(op.id) filter (where op.created_at >= now() - interval '30 days')::integer as new_partner_growth,
  count(op.id) filter (where op.relationship_status = 'accepted')::numeric
    / nullif(count(op.id) filter (where op.relationship_status in ('pending', 'accepted', 'declined')), 0) as invite_acceptance_rate
from public.organisations org
left join public.organisation_partners op
  on op.organisation_id = org.id or op.partner_organisation_id = org.id
group by org.id;

alter table public.organisation_partners enable row level security;
alter table public.partner_invitations enable row level security;
alter table public.partner_visibility_settings enable row level security;
alter table public.partner_referrals enable row level security;

drop policy if exists organisations_partner_discovery_select on public.organisations;
create policy organisations_partner_discovery_select on public.organisations
for select to authenticated
using (
  status = 'active'
  and discovery_visibility <> 'hidden'
  and type in ('agency', 'developer_company', 'attorney_firm', 'bond_originator')
);

drop policy if exists organisation_partners_select_connected_orgs on public.organisation_partners;
create policy organisation_partners_select_connected_orgs on public.organisation_partners
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or public.bridge_is_active_member(partner_organisation_id)
);

drop policy if exists organisation_partners_insert_org_admin on public.organisation_partners;
create policy organisation_partners_insert_org_admin on public.organisation_partners
for insert to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  and created_by = auth.uid()
);

drop policy if exists organisation_partners_update_connected_admin on public.organisation_partners;
create policy organisation_partners_update_connected_admin on public.organisation_partners
for update to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_is_org_admin(partner_organisation_id)
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_is_org_admin(partner_organisation_id)
);

drop policy if exists partner_invitations_select_sender_or_recipient on public.partner_invitations;
create policy partner_invitations_select_sender_or_recipient on public.partner_invitations
for select to authenticated
using (
  public.bridge_is_active_member(sender_organisation_id)
  or lower(recipient_email) = public.bridge_current_email()
  or (recipient_organisation_id is not null and public.bridge_is_active_member(recipient_organisation_id))
);

drop policy if exists partner_invitations_insert_sender_admin on public.partner_invitations;
create policy partner_invitations_insert_sender_admin on public.partner_invitations
for insert to authenticated
with check (
  public.bridge_is_org_admin(sender_organisation_id)
  and created_by = auth.uid()
);

drop policy if exists partner_invitations_update_sender_or_recipient_admin on public.partner_invitations;
create policy partner_invitations_update_sender_or_recipient_admin on public.partner_invitations
for update to authenticated
using (
  public.bridge_is_org_admin(sender_organisation_id)
  or (recipient_organisation_id is not null and public.bridge_is_org_admin(recipient_organisation_id))
)
with check (
  public.bridge_is_org_admin(sender_organisation_id)
  or (recipient_organisation_id is not null and public.bridge_is_org_admin(recipient_organisation_id))
);

drop policy if exists partner_visibility_select_connected_orgs on public.partner_visibility_settings;
create policy partner_visibility_select_connected_orgs on public.partner_visibility_settings
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (partner_organisation_id is not null and public.bridge_is_active_member(partner_organisation_id))
);

drop policy if exists partner_visibility_manage_owner_admin on public.partner_visibility_settings;
create policy partner_visibility_manage_owner_admin on public.partner_visibility_settings
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists partner_referrals_select_related_orgs on public.partner_referrals;
create policy partner_referrals_select_related_orgs on public.partner_referrals
for select to authenticated
using (
  public.bridge_is_active_member(referring_organisation_id)
  or public.bridge_is_active_member(referred_organisation_id)
);

drop policy if exists partner_referrals_insert_referring_admin on public.partner_referrals;
create policy partner_referrals_insert_referring_admin on public.partner_referrals
for insert to authenticated
with check (
  public.bridge_is_active_member(referring_organisation_id)
  and created_by = auth.uid()
);

drop policy if exists partner_referrals_update_related_admin on public.partner_referrals;
create policy partner_referrals_update_related_admin on public.partner_referrals
for update to authenticated
using (
  public.bridge_is_org_admin(referring_organisation_id)
  or public.bridge_is_org_admin(referred_organisation_id)
)
with check (
  public.bridge_is_org_admin(referring_organisation_id)
  or public.bridge_is_org_admin(referred_organisation_id)
);

grant select on public.organisation_partners to authenticated;
grant insert, update on public.organisation_partners to authenticated;
grant select, insert, update on public.partner_invitations to authenticated;
grant select, insert, update, delete on public.partner_visibility_settings to authenticated;
grant select, insert, update on public.partner_referrals to authenticated;
grant select on public.partner_relationship_metrics to authenticated;
grant execute on function public.bridge_normalize_workspace_type(text) to authenticated;
grant execute on function public.bridge_partner_connection_allowed(text, text) to authenticated;

commit;
