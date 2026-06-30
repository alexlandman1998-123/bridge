begin;

create extension if not exists "pgcrypto";

create table if not exists public.developer_partner_relationships (
  id uuid primary key default gen_random_uuid(),
  developer_organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_organisation_id uuid references public.organisations(id) on delete set null,
  partner_type text not null,
  status text not null default 'invited',
  scope_type text not null default 'all_developments',
  scope_json jsonb not null default '{}'::jsonb,
  partner_display_name text,
  partner_invitation_email text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_partner_relationships_partner_type_check check (
    partner_type in ('agency', 'transfer_attorney', 'bond_originator')
  ),
  constraint developer_partner_relationships_status_check check (
    status in ('invited', 'accepted', 'agreement_pending', 'agreement_active', 'suspended', 'archived')
  ),
  constraint developer_partner_relationships_scope_type_check check (
    scope_type in ('all_developments', 'specific_developments', 'specific_phases', 'specific_units')
  ),
  constraint developer_partner_relationships_distinct_orgs_check check (
    partner_organisation_id is null or partner_organisation_id <> developer_organisation_id
  ),
  constraint developer_partner_relationships_target_check check (
    partner_organisation_id is not null or nullif(trim(coalesce(partner_invitation_email, '')), '') is not null
  )
);

create table if not exists public.developer_partner_agreements (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.developer_partner_relationships(id) on delete cascade,
  agreement_type text not null,
  status text not null default 'draft',
  template_key text,
  generated_document_id uuid references public.documents(id) on delete set null,
  packet_id uuid references public.document_packets(id) on delete set null,
  effective_date date,
  expiry_date date,
  signed_at timestamptz,
  terminated_at timestamptz,
  waived_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_partner_agreements_type_check check (
    agreement_type in ('agency_mandate', 'transfer_attorney_sla', 'bond_originator_sla')
  ),
  constraint developer_partner_agreements_status_check check (
    status in ('draft', 'generated', 'sent_for_signature', 'signed', 'active', 'expired', 'terminated', 'waived')
  ),
  constraint developer_partner_agreements_dates_check check (
    expiry_date is null or effective_date is null or expiry_date >= effective_date
  )
);

create table if not exists public.developer_partner_agreement_terms (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.developer_partner_agreements(id) on delete cascade,
  terms_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_partner_agreement_terms_agreement_unique unique (agreement_id)
);

create index if not exists developer_partner_relationships_developer_idx
  on public.developer_partner_relationships (developer_organisation_id, partner_type, status);

create index if not exists developer_partner_relationships_partner_idx
  on public.developer_partner_relationships (partner_organisation_id, partner_type, status)
  where partner_organisation_id is not null;

create index if not exists developer_partner_relationships_scope_idx
  on public.developer_partner_relationships (scope_type);

create index if not exists developer_partner_relationships_invitation_email_idx
  on public.developer_partner_relationships (lower(partner_invitation_email))
  where partner_invitation_email is not null;

create unique index if not exists developer_partner_relationships_active_unique_idx
  on public.developer_partner_relationships (
    developer_organisation_id,
    partner_organisation_id,
    partner_type
  )
  where partner_organisation_id is not null and status <> 'archived';

create index if not exists developer_partner_agreements_relationship_idx
  on public.developer_partner_agreements (relationship_id, agreement_type, status);

create index if not exists developer_partner_agreements_status_idx
  on public.developer_partner_agreements (status, expiry_date);

create index if not exists developer_partner_agreement_terms_agreement_idx
  on public.developer_partner_agreement_terms (agreement_id);

create or replace function public.bridge_touch_developer_partner_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_developer_partner_relationships_updated_at
  on public.developer_partner_relationships;
create trigger trg_developer_partner_relationships_updated_at
before update on public.developer_partner_relationships
for each row
execute function public.bridge_touch_developer_partner_updated_at();

drop trigger if exists trg_developer_partner_agreements_updated_at
  on public.developer_partner_agreements;
create trigger trg_developer_partner_agreements_updated_at
before update on public.developer_partner_agreements
for each row
execute function public.bridge_touch_developer_partner_updated_at();

drop trigger if exists trg_developer_partner_agreement_terms_updated_at
  on public.developer_partner_agreement_terms;
create trigger trg_developer_partner_agreement_terms_updated_at
before update on public.developer_partner_agreement_terms
for each row
execute function public.bridge_touch_developer_partner_updated_at();

create or replace function public.bridge_is_developer_partner_relationship_member(target_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.developer_partner_relationships rel
    where rel.id = target_relationship_id
      and (
        public.bridge_is_active_member(rel.developer_organisation_id)
        or (
          rel.partner_organisation_id is not null
          and public.bridge_is_active_member(rel.partner_organisation_id)
        )
      )
  );
$$;

create or replace function public.bridge_is_developer_partner_relationship_admin(target_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.developer_partner_relationships rel
    where rel.id = target_relationship_id
      and (
        public.bridge_is_org_admin(rel.developer_organisation_id)
        or (
          rel.partner_organisation_id is not null
          and public.bridge_is_org_admin(rel.partner_organisation_id)
        )
      )
  );
$$;

alter table public.developer_partner_relationships enable row level security;
alter table public.developer_partner_agreements enable row level security;
alter table public.developer_partner_agreement_terms enable row level security;

drop policy if exists developer_partner_relationships_select_related_orgs
  on public.developer_partner_relationships;
create policy developer_partner_relationships_select_related_orgs
on public.developer_partner_relationships
for select
to authenticated
using (
  public.bridge_is_active_member(developer_organisation_id)
  or (
    partner_organisation_id is not null
    and public.bridge_is_active_member(partner_organisation_id)
  )
);

drop policy if exists developer_partner_relationships_insert_developer_admin
  on public.developer_partner_relationships;
create policy developer_partner_relationships_insert_developer_admin
on public.developer_partner_relationships
for insert
to authenticated
with check (
  public.bridge_is_org_admin(developer_organisation_id)
  and (invited_by is null or invited_by = auth.uid())
);

drop policy if exists developer_partner_relationships_update_related_admins
  on public.developer_partner_relationships;
create policy developer_partner_relationships_update_related_admins
on public.developer_partner_relationships
for update
to authenticated
using (
  public.bridge_is_org_admin(developer_organisation_id)
  or (
    partner_organisation_id is not null
    and public.bridge_is_org_admin(partner_organisation_id)
  )
)
with check (
  public.bridge_is_org_admin(developer_organisation_id)
  or (
    partner_organisation_id is not null
    and public.bridge_is_org_admin(partner_organisation_id)
  )
);

drop policy if exists developer_partner_agreements_select_relationship_members
  on public.developer_partner_agreements;
create policy developer_partner_agreements_select_relationship_members
on public.developer_partner_agreements
for select
to authenticated
using (public.bridge_is_developer_partner_relationship_member(relationship_id));

drop policy if exists developer_partner_agreements_insert_relationship_admins
  on public.developer_partner_agreements;
create policy developer_partner_agreements_insert_relationship_admins
on public.developer_partner_agreements
for insert
to authenticated
with check (
  public.bridge_is_developer_partner_relationship_admin(relationship_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists developer_partner_agreements_update_relationship_admins
  on public.developer_partner_agreements;
create policy developer_partner_agreements_update_relationship_admins
on public.developer_partner_agreements
for update
to authenticated
using (public.bridge_is_developer_partner_relationship_admin(relationship_id))
with check (public.bridge_is_developer_partner_relationship_admin(relationship_id));

drop policy if exists developer_partner_agreement_terms_select_relationship_members
  on public.developer_partner_agreement_terms;
create policy developer_partner_agreement_terms_select_relationship_members
on public.developer_partner_agreement_terms
for select
to authenticated
using (
  exists (
    select 1
    from public.developer_partner_agreements agreement
    where agreement.id = agreement_id
      and public.bridge_is_developer_partner_relationship_member(agreement.relationship_id)
  )
);

drop policy if exists developer_partner_agreement_terms_insert_relationship_admins
  on public.developer_partner_agreement_terms;
create policy developer_partner_agreement_terms_insert_relationship_admins
on public.developer_partner_agreement_terms
for insert
to authenticated
with check (
  exists (
    select 1
    from public.developer_partner_agreements agreement
    where agreement.id = agreement_id
      and public.bridge_is_developer_partner_relationship_admin(agreement.relationship_id)
  )
);

drop policy if exists developer_partner_agreement_terms_update_relationship_admins
  on public.developer_partner_agreement_terms;
create policy developer_partner_agreement_terms_update_relationship_admins
on public.developer_partner_agreement_terms
for update
to authenticated
using (
  exists (
    select 1
    from public.developer_partner_agreements agreement
    where agreement.id = agreement_id
      and public.bridge_is_developer_partner_relationship_admin(agreement.relationship_id)
  )
)
with check (
  exists (
    select 1
    from public.developer_partner_agreements agreement
    where agreement.id = agreement_id
      and public.bridge_is_developer_partner_relationship_admin(agreement.relationship_id)
  )
);

grant select, insert, update on public.developer_partner_relationships to authenticated;
grant select, insert, update on public.developer_partner_agreements to authenticated;
grant select, insert, update on public.developer_partner_agreement_terms to authenticated;
grant execute on function public.bridge_is_developer_partner_relationship_member(uuid) to authenticated;
grant execute on function public.bridge_is_developer_partner_relationship_admin(uuid) to authenticated;

comment on table public.developer_partner_relationships is
  'Developer module partner relationships between a developer organisation and agencies, transfer attorneys, or bond originators.';
comment on table public.developer_partner_agreements is
  'Agreement lifecycle records attached to developer partner relationships, including mandates and SLAs.';
comment on table public.developer_partner_agreement_terms is
  'Structured terms JSON for generated developer partner agreements.';

commit;
