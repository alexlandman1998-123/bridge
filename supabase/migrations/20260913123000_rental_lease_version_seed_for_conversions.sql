begin;

create or replace function public.rental_seed_initial_lease_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rental_lease_versions(lease_id, organisation_id, version_number, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount, escalation_json, terms_json, created_by)
  values (
    new.id,
    new.organisation_id,
    1,
    nullif(new.terms_json ->> 'lease_start_date', '')::date,
    nullif(new.terms_json ->> 'lease_end_date', '')::date,
    nullif(coalesce(new.terms_json ->> 'occupation_date', new.terms_json ->> 'intended_occupation_date'), '')::date,
    nullif(new.terms_json ->> 'monthly_rent', '')::numeric,
    nullif(new.terms_json ->> 'deposit_amount', '')::numeric,
    coalesce(new.terms_json -> 'escalation', '{}'::jsonb),
    new.terms_json,
    new.created_by
  ) on conflict (lease_id, version_number) do nothing;
  return new;
end; $$;

drop trigger if exists trg_rental_leases_seed_initial_version on public.rental_leases;
create trigger trg_rental_leases_seed_initial_version
  after insert on public.rental_leases
  for each row execute function public.rental_seed_initial_lease_version();

insert into public.rental_lease_versions(lease_id, organisation_id, version_number, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount, escalation_json, terms_json, created_by)
select
  lease.id,
  lease.organisation_id,
  1,
  nullif(lease.terms_json ->> 'lease_start_date', '')::date,
  nullif(lease.terms_json ->> 'lease_end_date', '')::date,
  nullif(coalesce(lease.terms_json ->> 'occupation_date', lease.terms_json ->> 'intended_occupation_date'), '')::date,
  nullif(lease.terms_json ->> 'monthly_rent', '')::numeric,
  nullif(lease.terms_json ->> 'deposit_amount', '')::numeric,
  coalesce(lease.terms_json -> 'escalation', '{}'::jsonb),
  lease.terms_json,
  lease.created_by
from public.rental_leases lease
where not exists (select 1 from public.rental_lease_versions version where version.lease_id = lease.id);

revoke execute on function public.rental_seed_initial_lease_version() from public, anon, authenticated;

commit;
