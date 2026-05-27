begin;

alter table if exists public.organisation_partners
  add column if not exists partner_type text,
  add column if not exists status text,
  add column if not exists scope_type text not null default 'organisation',
  add column if not exists scope_id uuid,
  add column if not exists scope_name text,
  add column if not exists preferred boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.organisation_partners
set
  status = coalesce(nullif(status, ''), nullif(relationship_status, ''), 'pending'),
  scope_type = coalesce(nullif(scope_type, ''), 'organisation'),
  scope_id = coalesce(scope_id, organisation_id),
  preferred = coalesce(preferred, false) or relationship_type = 'preferred' or visibility_level = 'preferred_partners_only',
  updated_at = coalesce(updated_at, created_at, now())
where true;

alter table if exists public.organisation_partners
  drop constraint if exists organisation_partners_scope_type_check,
  add constraint organisation_partners_scope_type_check
    check (scope_type in ('organisation', 'region', 'branch', 'team', 'user'));

alter table if exists public.organisation_partners
  drop constraint if exists organisation_partners_status_check,
  add constraint organisation_partners_status_check
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'removed'));

create index if not exists organisation_partners_owner_scope_idx
  on public.organisation_partners (organisation_id, scope_type, scope_id);

create index if not exists organisation_partners_partner_scope_idx
  on public.organisation_partners (partner_organisation_id, scope_type, scope_id);

create unique index if not exists organisation_partners_owner_partner_scope_uidx
  on public.organisation_partners (organisation_id, partner_organisation_id, scope_type, scope_id)
  where status <> 'removed';

alter table if exists public.partner_invitations
  add column if not exists partner_type text,
  add column if not exists scope_type text not null default 'organisation',
  add column if not exists scope_id uuid,
  add column if not exists scope_name text,
  add column if not exists preferred boolean not null default false;

update public.partner_invitations
set
  scope_type = coalesce(nullif(scope_type, ''), 'organisation'),
  scope_id = coalesce(scope_id, sender_organisation_id),
  preferred = coalesce(preferred, false),
  partner_type = coalesce(nullif(partner_type, ''), nullif(to_workspace_type, ''))
where true;

alter table if exists public.partner_invitations
  drop constraint if exists partner_invitations_scope_type_check,
  add constraint partner_invitations_scope_type_check
    check (scope_type in ('organisation', 'region', 'branch', 'team', 'user'));

create index if not exists partner_invitations_scope_idx
  on public.partner_invitations (sender_organisation_id, scope_type, scope_id);

commit;
