begin;

create table if not exists public.rental_lease_versions (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.rental_leases(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'cancelled')),
  is_current boolean not null default true,
  effective_start_date date,
  effective_end_date date,
  occupation_date date,
  monthly_rent numeric(14,2),
  deposit_amount numeric(14,2),
  escalation_json jsonb not null default '{}'::jsonb,
  terms_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique(lease_id, version_number)
);
create unique index if not exists rental_lease_versions_one_current_unique on public.rental_lease_versions(lease_id) where is_current;
create index if not exists rental_lease_versions_lease_idx on public.rental_lease_versions(lease_id, version_number desc);

create table if not exists public.rental_lease_version_documents (
  id uuid primary key default gen_random_uuid(),
  lease_version_id uuid not null references public.rental_lease_versions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_label text not null check (length(btrim(document_label)) > 0),
  document_link text not null check (length(btrim(document_link)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(lease_version_id, document_link)
);
create index if not exists rental_lease_version_documents_version_idx on public.rental_lease_version_documents(lease_version_id, created_at desc);

insert into public.rental_lease_versions(lease_id, organisation_id, version_number, effective_start_date, occupation_date, monthly_rent, deposit_amount, escalation_json, terms_json, created_by)
select lease.id, lease.organisation_id, 1,
  nullif(lease.terms_json ->> 'lease_start_date', '')::date,
  nullif(lease.terms_json ->> 'intended_occupation_date', '')::date,
  nullif(lease.terms_json ->> 'monthly_rent', '')::numeric,
  nullif(lease.terms_json ->> 'deposit_amount', '')::numeric,
  coalesce(lease.terms_json -> 'escalation', '{}'::jsonb), lease.terms_json, lease.created_by
from public.rental_leases lease
where not exists (select 1 from public.rental_lease_versions version where version.lease_id = lease.id);

alter table public.rental_lease_versions enable row level security;
alter table public.rental_lease_version_documents enable row level security;
revoke all on public.rental_lease_versions, public.rental_lease_version_documents from anon, authenticated;
grant select on public.rental_lease_versions, public.rental_lease_version_documents to authenticated;
create policy rental_lease_versions_staff_read on public.rental_lease_versions for select to authenticated using (exists (select 1 from public.rental_leases lease join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where lease.id = lease_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_lease_version_documents_staff_read on public.rental_lease_version_documents for select to authenticated using (exists (select 1 from public.rental_lease_versions version join public.rental_leases lease on lease.id = version.lease_id join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where version.id = lease_version_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_save_lease_draft(p_lease_id uuid, p_expected_version integer, p_terms_json jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lease_row public.rental_leases%rowtype; current_version public.rental_lease_versions%rowtype; new_version_id uuid; new_version_number integer; start_date date; end_date date; occupation date; monthly_rent numeric; deposit numeric; escalation jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select lease.* into lease_row from public.rental_leases lease where lease.id = p_lease_id for update;
  if not found then raise exception 'Rental lease not found'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental lease'; end if;
  select version.* into current_version from public.rental_lease_versions version where version.lease_id = lease_row.id and version.is_current for update;
  if not found then raise exception 'Lease has no current version'; end if;
  if current_version.version_number <> p_expected_version then raise exception 'This lease changed. Refresh and try again.' using errcode = '40001'; end if;
  if current_version.status <> 'draft' or lease_row.status not in ('draft', 'awaiting_tenant', 'awaiting_landlord') then raise exception 'Signed, active or cancelled leases cannot be edited as a draft'; end if;
  start_date := nullif(p_terms_json ->> 'lease_start_date', '')::date;
  end_date := nullif(p_terms_json ->> 'lease_end_date', '')::date;
  occupation := nullif(p_terms_json ->> 'occupation_date', '')::date;
  monthly_rent := nullif(p_terms_json ->> 'monthly_rent', '')::numeric;
  deposit := nullif(p_terms_json ->> 'deposit_amount', '')::numeric;
  escalation := coalesce(p_terms_json -> 'escalation', '{}'::jsonb);
  if start_date is null or end_date is null or occupation is null then raise exception 'Lease start, end and occupation dates are required'; end if;
  if end_date <= start_date then raise exception 'Lease end date must be after start date'; end if;
  if occupation < start_date then raise exception 'Occupation date cannot precede lease start date'; end if;
  if monthly_rent is null or monthly_rent <= 0 then raise exception 'Monthly rent must be greater than zero'; end if;
  if deposit is null or deposit < 0 then raise exception 'Deposit cannot be negative'; end if;
  update public.rental_lease_versions set is_current = false, status = 'superseded', superseded_at = now() where id = current_version.id;
  new_version_number := current_version.version_number + 1;
  insert into public.rental_lease_versions(lease_id, organisation_id, version_number, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount, escalation_json, terms_json, created_by)
  values (lease_row.id, lease_row.organisation_id, new_version_number, start_date, end_date, occupation, monthly_rent, deposit, escalation, p_terms_json, auth.uid()) returning id into new_version_id;
  update public.rental_leases set terms_json = p_terms_json where id = lease_row.id;
  return jsonb_build_object('id', new_version_id, 'lease_id', lease_row.id, 'version_number', new_version_number, 'status', 'draft');
end; $$;

create or replace function public.rental_link_lease_version_document(p_lease_version_id uuid, p_document_label text, p_document_link text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare version_row public.rental_lease_versions%rowtype; document_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if length(btrim(coalesce(p_document_label, ''))) = 0 or length(btrim(coalesce(p_document_link, ''))) = 0 then raise exception 'Document label and link are required'; end if;
  select version.* into version_row from public.rental_lease_versions version where version.id = p_lease_version_id;
  if not found then raise exception 'Lease version not found'; end if;
  if not exists (select 1 from public.rental_leases lease join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where lease.id = version_row.lease_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this lease version'; end if;
  insert into public.rental_lease_version_documents(lease_version_id, organisation_id, document_label, document_link, created_by)
  values (version_row.id, version_row.organisation_id, btrim(p_document_label), btrim(p_document_link), auth.uid()) on conflict (lease_version_id, document_link) do update set document_label = excluded.document_label returning id into document_id;
  return jsonb_build_object('id', document_id, 'lease_version_id', version_row.id);
end; $$;

revoke execute on function public.rental_save_lease_draft(uuid, integer, jsonb) from public, anon;
revoke execute on function public.rental_link_lease_version_document(uuid, text, text) from public, anon;
grant execute on function public.rental_save_lease_draft(uuid, integer, jsonb) to authenticated;
grant execute on function public.rental_link_lease_version_document(uuid, text, text) to authenticated;

commit;
