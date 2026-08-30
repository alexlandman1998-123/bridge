begin;

create table if not exists public.rental_lease_signers (
  id uuid primary key default gen_random_uuid(),
  lease_version_id uuid not null references public.rental_lease_versions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  signer_role text not null check (signer_role in ('tenant', 'landlord')),
  party_id uuid,
  signer_name text not null check (length(btrim(signer_name)) > 0),
  signer_email text,
  status text not null default 'pending' check (status in ('pending', 'signed', 'declined', 'voided')),
  signed_at timestamptz,
  signed_document_link text,
  evidence_note text,
  evidence_recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lease_version_id, signer_role)
);
create index if not exists rental_lease_signers_version_idx on public.rental_lease_signers(lease_version_id, signer_role);

create table if not exists public.rental_lease_signing_events (
  id uuid primary key default gen_random_uuid(),
  lease_version_id uuid not null references public.rental_lease_versions(id) on delete cascade,
  signer_id uuid references public.rental_lease_signers(id) on delete set null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('signing_prepared', 'signer_signed', 'signer_declined', 'signer_reopened', 'lease_signed')),
  evidence_json jsonb not null default '{}'::jsonb,
  occurred_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index if not exists rental_lease_signing_events_version_idx on public.rental_lease_signing_events(lease_version_id, occurred_at desc);

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
  if current_version.status <> 'draft' or lease_row.status <> 'draft' then raise exception 'Lease terms are locked once signing starts'; end if;
  start_date := nullif(p_terms_json ->> 'lease_start_date', '')::date; end_date := nullif(p_terms_json ->> 'lease_end_date', '')::date; occupation := nullif(p_terms_json ->> 'occupation_date', '')::date; monthly_rent := nullif(p_terms_json ->> 'monthly_rent', '')::numeric; deposit := nullif(p_terms_json ->> 'deposit_amount', '')::numeric; escalation := coalesce(p_terms_json -> 'escalation', '{}'::jsonb);
  if start_date is null or end_date is null or occupation is null then raise exception 'Lease start, end and occupation dates are required'; end if;
  if end_date <= start_date then raise exception 'Lease end date must be after start date'; end if;
  if occupation < start_date then raise exception 'Occupation date cannot precede lease start date'; end if;
  if monthly_rent is null or monthly_rent <= 0 then raise exception 'Monthly rent must be greater than zero'; end if;
  if deposit is null or deposit < 0 then raise exception 'Deposit cannot be negative'; end if;
  update public.rental_lease_versions set is_current = false, status = 'superseded', superseded_at = now() where id = current_version.id;
  new_version_number := current_version.version_number + 1;
  insert into public.rental_lease_versions(lease_id, organisation_id, version_number, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount, escalation_json, terms_json, created_by) values (lease_row.id, lease_row.organisation_id, new_version_number, start_date, end_date, occupation, monthly_rent, deposit, escalation, p_terms_json, auth.uid()) returning id into new_version_id;
  update public.rental_leases set terms_json = p_terms_json where id = lease_row.id;
  return jsonb_build_object('id', new_version_id, 'lease_id', lease_row.id, 'version_number', new_version_number, 'status', 'draft');
end; $$;

alter table public.rental_lease_signers enable row level security;
alter table public.rental_lease_signing_events enable row level security;
revoke all on public.rental_lease_signers, public.rental_lease_signing_events from anon, authenticated;
grant select on public.rental_lease_signers, public.rental_lease_signing_events to authenticated;
create policy rental_lease_signers_staff_read on public.rental_lease_signers for select to authenticated using (exists (select 1 from public.rental_lease_versions version join public.rental_leases lease on lease.id = version.lease_id join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where version.id = lease_version_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_lease_signing_events_staff_read on public.rental_lease_signing_events for select to authenticated using (exists (select 1 from public.rental_lease_versions version join public.rental_leases lease on lease.id = version.lease_id join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id join public.rental_properties property on property.id = tenancy.property_id where version.id = lease_version_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_prepare_lease_signing(p_lease_id uuid, p_expected_version integer, p_signers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lease_row public.rental_leases%rowtype; version_row public.rental_lease_versions%rowtype; signer jsonb; signer_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select lease.* into lease_row from public.rental_leases lease where lease.id = p_lease_id for update;
  if not found then raise exception 'Rental lease not found'; end if;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental lease'; end if;
  select version.* into version_row from public.rental_lease_versions version where version.lease_id = lease_row.id and version.is_current for update;
  if not found or version_row.version_number <> p_expected_version then raise exception 'This lease changed. Refresh and try again.' using errcode = '40001'; end if;
  if lease_row.status = 'signed' then return jsonb_build_object('lease_id', lease_row.id, 'status', 'signed', 'idempotent', true); end if;
  if lease_row.status <> 'draft' then raise exception 'This lease is already in a signing recovery state'; end if;
  if jsonb_typeof(p_signers) <> 'array' then raise exception 'Tenant and landlord signer details are required'; end if;
  select count(*) into signer_count from jsonb_array_elements(p_signers) value where value ->> 'role' in ('tenant', 'landlord') and length(btrim(coalesce(value ->> 'name', ''))) > 0;
  if signer_count <> 2 or not exists (select 1 from jsonb_array_elements(p_signers) value where value ->> 'role' = 'tenant' and length(btrim(coalesce(value ->> 'name', ''))) > 0) or not exists (select 1 from jsonb_array_elements(p_signers) value where value ->> 'role' = 'landlord' and length(btrim(coalesce(value ->> 'name', ''))) > 0) then raise exception 'One tenant and one landlord signer are required'; end if;
  for signer in select value from jsonb_array_elements(p_signers) value loop
    if signer ->> 'role' in ('tenant', 'landlord') then
      insert into public.rental_lease_signers(lease_version_id, organisation_id, signer_role, signer_name, signer_email) values (version_row.id, lease_row.organisation_id, signer ->> 'role', btrim(signer ->> 'name'), nullif(btrim(coalesce(signer ->> 'email', '')), ''));
    end if;
  end loop;
  update public.rental_leases set status = 'awaiting_tenant' where id = lease_row.id;
  insert into public.rental_lease_signing_events(lease_version_id, organisation_id, event_type, occurred_by) values (version_row.id, lease_row.organisation_id, 'signing_prepared', auth.uid());
  return jsonb_build_object('lease_id', lease_row.id, 'lease_version_id', version_row.id, 'status', 'awaiting_tenant', 'idempotent', false);
exception when unique_violation then
  return jsonb_build_object('lease_id', lease_row.id, 'lease_version_id', version_row.id, 'status', lease_row.status, 'idempotent', true);
end; $$;

create or replace function public.rental_record_lease_signature(p_signer_id uuid, p_outcome text, p_document_link text default null, p_evidence_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare signer_row public.rental_lease_signers%rowtype; lease_row public.rental_leases%rowtype; all_signed boolean; tenant_pending boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_outcome not in ('signed', 'declined') then raise exception 'Invalid signer outcome'; end if;
  if p_outcome = 'signed' and length(btrim(coalesce(p_document_link, ''))) = 0 then raise exception 'A signed document link is required'; end if;
  select signer.* into signer_row from public.rental_lease_signers signer where signer.id = p_signer_id for update;
  if not found then raise exception 'Lease signer not found'; end if;
  select lease.* into lease_row from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where version.id = signer_row.lease_version_id for update;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this lease'; end if;
  if lease_row.status = 'signed' then raise exception 'This lease is already signed'; end if;
  update public.rental_lease_signers set status = p_outcome, signed_at = case when p_outcome = 'signed' then now() else null end, signed_document_link = case when p_outcome = 'signed' then btrim(p_document_link) else null end, evidence_note = nullif(btrim(coalesce(p_evidence_note, '')), ''), evidence_recorded_by = auth.uid() where id = signer_row.id;
  insert into public.rental_lease_signing_events(lease_version_id, signer_id, organisation_id, event_type, evidence_json, occurred_by) values (signer_row.lease_version_id, signer_row.id, signer_row.organisation_id, case when p_outcome = 'signed' then 'signer_signed' else 'signer_declined' end, jsonb_build_object('document_link', nullif(btrim(coalesce(p_document_link, '')), ''), 'note', nullif(btrim(coalesce(p_evidence_note, '')), '')), auth.uid());
  select bool_and(status = 'signed'), bool_or(signer_role = 'tenant' and status <> 'signed') into all_signed, tenant_pending from public.rental_lease_signers where lease_version_id = signer_row.lease_version_id;
  if all_signed then
    update public.rental_leases set status = 'signed' where id = lease_row.id;
    insert into public.rental_lease_signing_events(lease_version_id, organisation_id, event_type, occurred_by) values (signer_row.lease_version_id, signer_row.organisation_id, 'lease_signed', auth.uid());
  elsif tenant_pending then update public.rental_leases set status = 'awaiting_tenant' where id = lease_row.id;
  else update public.rental_leases set status = 'awaiting_landlord' where id = lease_row.id; end if;
  return jsonb_build_object('lease_id', lease_row.id, 'status', case when all_signed then 'signed' when tenant_pending then 'awaiting_tenant' else 'awaiting_landlord' end);
end; $$;

create or replace function public.rental_reopen_lease_signer(p_signer_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare signer_row public.rental_lease_signers%rowtype; lease_row public.rental_leases%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A recovery reason is required'; end if;
  select signer.* into signer_row from public.rental_lease_signers signer where signer.id = p_signer_id for update;
  if not found then raise exception 'Lease signer not found'; end if;
  select lease.* into lease_row from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where version.id = signer_row.lease_version_id for update;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this lease'; end if;
  if lease_row.status = 'signed' then raise exception 'Create a new lease version to recover a signed lease'; end if;
  update public.rental_lease_signers set status = 'pending', signed_at = null, signed_document_link = null, evidence_note = btrim(p_reason), evidence_recorded_by = auth.uid() where id = signer_row.id;
  update public.rental_leases set status = case when signer_row.signer_role = 'tenant' then 'awaiting_tenant' else 'awaiting_landlord' end where id = lease_row.id;
  insert into public.rental_lease_signing_events(lease_version_id, signer_id, organisation_id, event_type, evidence_json, occurred_by) values (signer_row.lease_version_id, signer_row.id, signer_row.organisation_id, 'signer_reopened', jsonb_build_object('reason', btrim(p_reason)), auth.uid());
  return jsonb_build_object('lease_id', lease_row.id, 'status', case when signer_row.signer_role = 'tenant' then 'awaiting_tenant' else 'awaiting_landlord' end);
end; $$;

revoke execute on function public.rental_prepare_lease_signing(uuid, integer, jsonb) from public, anon;
revoke execute on function public.rental_record_lease_signature(uuid, text, text, text) from public, anon;
revoke execute on function public.rental_reopen_lease_signer(uuid, text) from public, anon;
grant execute on function public.rental_prepare_lease_signing(uuid, integer, jsonb) to authenticated;
grant execute on function public.rental_record_lease_signature(uuid, text, text, text) to authenticated;
grant execute on function public.rental_reopen_lease_signer(uuid, text) to authenticated;

drop trigger if exists trg_rental_lease_signers_updated_at on public.rental_lease_signers;
create trigger trg_rental_lease_signers_updated_at before update on public.rental_lease_signers for each row execute function public.rental_set_updated_at();

commit;
