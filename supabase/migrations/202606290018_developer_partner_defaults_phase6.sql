begin;

alter table if exists public.organisation_preferred_partners
  add column if not exists developer_partner_relationship_id uuid references public.developer_partner_relationships(id) on delete set null,
  add column if not exists partner_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists scope_type text not null default 'all_developments',
  add column if not exists scope_json jsonb not null default '{}'::jsonb;

alter table if exists public.organisation_preferred_partners
  drop constraint if exists organisation_preferred_partners_partner_type_check;

alter table if exists public.organisation_preferred_partners
  add constraint organisation_preferred_partners_partner_type_check
  check (partner_type in ('agency', 'bond_originator', 'bond_attorney', 'transfer_attorney'));

alter table if exists public.organisation_preferred_partners
  drop constraint if exists organisation_preferred_partners_source_check;

alter table if exists public.organisation_preferred_partners
  add constraint organisation_preferred_partners_source_check
  check (source in ('manual', 'developer_partner_relationship'));

alter table if exists public.organisation_preferred_partners
  drop constraint if exists organisation_preferred_partners_scope_type_check;

alter table if exists public.organisation_preferred_partners
  add constraint organisation_preferred_partners_scope_type_check
  check (scope_type in ('all_developments', 'specific_developments', 'specific_phases', 'specific_units'));

create unique index if not exists organisation_preferred_partners_developer_relationship_idx
  on public.organisation_preferred_partners (developer_partner_relationship_id)
  where developer_partner_relationship_id is not null;

create index if not exists organisation_preferred_partners_partner_org_idx
  on public.organisation_preferred_partners (partner_organisation_id)
  where partner_organisation_id is not null;

create index if not exists organisation_preferred_partners_source_idx
  on public.organisation_preferred_partners (organisation_id, source, partner_type);

comment on column public.organisation_preferred_partners.developer_partner_relationship_id is
  'Developer Partner relationship that sourced this preferred/default partner record.';

comment on column public.organisation_preferred_partners.scope_json is
  'Developer Partner scope copied onto the preferred/default record for downstream routing.';

commit;
