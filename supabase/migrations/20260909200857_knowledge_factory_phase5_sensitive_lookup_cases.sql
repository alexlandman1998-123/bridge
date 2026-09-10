begin;

-- Approval queue only. This table must never hold identity numbers, raw credit
-- bureau responses, deeds-party details, bond-holder details or supplier data.
create table public.knowledge_factory_sensitive_lookup_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  prospect_id uuid references public.canvassing_prospects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  lookup_type text not null check (lookup_type in ('credit_check', 'bonds', 'transfers', 'avm', 'recent_sales')),
  subject_label text not null check (length(btrim(subject_label)) between 2 and 200),
  business_purpose text not null check (length(btrim(business_purpose)) between 10 and 500),
  consent_captured_at timestamptz not null,
  consent_captured_by uuid not null references auth.users(id) on delete restrict,
  consent_version text not null default 'arch9_sensitive_lookup_v1',
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved_for_quote', 'quoted', 'submitted', 'completed', 'rejected', 'cancelled', 'expired')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  quoted_credits integer check (quoted_credits is null or quoted_credits >= 0),
  expires_at timestamptz,
  provider_status text not null default 'not_configured' check (provider_status in ('not_configured', 'ready_for_validation', 'validated', 'submitted', 'completed', 'failed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_sensitive_lookup_cases_approval_check check (
    (status not in ('approved_for_quote', 'quoted', 'submitted', 'completed') and approved_at is null)
    or (approved_at is not null and approved_by is not null)
  )
);

create index knowledge_factory_sensitive_lookup_cases_organisation_status_idx
  on public.knowledge_factory_sensitive_lookup_cases (organisation_id, status, created_at desc);

alter table public.knowledge_factory_sensitive_lookup_cases enable row level security;
revoke all on public.knowledge_factory_sensitive_lookup_cases from anon, authenticated;
grant select, insert, update on public.knowledge_factory_sensitive_lookup_cases to authenticated;

create policy knowledge_factory_sensitive_lookup_cases_read
on public.knowledge_factory_sensitive_lookup_cases for select to authenticated
using (
  created_by = (select auth.uid())
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
);

create policy knowledge_factory_sensitive_lookup_cases_insert
on public.knowledge_factory_sensitive_lookup_cases for insert to authenticated
with check (created_by = (select auth.uid()) and public.knowledge_factory_is_active_member(organisation_id));

create policy knowledge_factory_sensitive_lookup_cases_admin_update
on public.knowledge_factory_sensitive_lookup_cases for update to authenticated
using (public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']))
with check (public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']));

commit;
