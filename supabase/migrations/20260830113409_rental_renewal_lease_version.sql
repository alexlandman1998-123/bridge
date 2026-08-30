begin;

create extension if not exists btree_gist with schema extensions;

alter table public.rental_lease_versions
  drop constraint if exists rental_lease_versions_effective_dates_no_overlap;
alter table public.rental_lease_versions
  add constraint rental_lease_versions_effective_dates_no_overlap
  exclude using gist (
    lease_id with =,
    daterange(effective_start_date, effective_end_date, '[]') with &&
  ) where (status <> 'cancelled');

create table public.rental_renewal_lease_versions (
  id uuid primary key default gen_random_uuid(),
  renewal_id uuid not null unique references public.rental_renewals(id) on delete restrict,
  source_lease_version_id uuid not null references public.rental_lease_versions(id) on delete restrict,
  renewal_lease_version_id uuid not null unique references public.rental_lease_versions(id) on delete restrict,
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  signing_status text not null default 'pending' check (signing_status in ('pending', 'ready', 'signed', 'declined', 'cancelled'))
);

create index rental_renewal_lease_versions_target_idx on public.rental_renewal_lease_versions (renewal_lease_version_id);
alter table public.rental_renewal_lease_versions enable row level security;
revoke all on public.rental_renewal_lease_versions from public, anon;
grant select on public.rental_renewal_lease_versions to authenticated;
create policy rental_renewal_lease_versions_read on public.rental_renewal_lease_versions for select to authenticated using (exists(select 1 from public.rental_renewals renewal where renewal.id=renewal_id));

alter table public.rental_renewal_events drop constraint if exists rental_renewal_events_event_type_check;
alter table public.rental_renewal_events add constraint rental_renewal_events_event_type_check check (event_type in ('opened', 'terms_updated', 'intention_submitted', 'accepted', 'declined', 'cancelled', 'lease_version_generated'));

create or replace function public.rental_generate_renewal_lease_version(p_renewal_id uuid,p_expected_proposal_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_renewal public.rental_renewals%rowtype; v_source public.rental_lease_versions%rowtype; v_new_id uuid; v_link_id uuid; v_lease_id uuid; v_next_number integer; v_start date; v_end date; v_occupation date; v_rent numeric; v_deposit numeric; v_existing_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select renewal.* into v_renewal from public.rental_renewals renewal where renewal.id=p_renewal_id for update;
  if not found or not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=v_renewal.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_renewal.status<>'accepted' or v_renewal.proposal_version<>p_expected_proposal_version then raise exception 'Renewal must be accepted at the current proposal version'; end if;
  select * into v_source from public.rental_lease_versions where id=v_renewal.source_lease_version_id for update;
  select id into v_existing_id from public.rental_renewal_lease_versions where renewal_id=v_renewal.id;
  if v_existing_id is not null then return jsonb_build_object('renewal_lease_version_id',v_existing_id,'idempotent',true); end if;
  v_start:=coalesce(nullif(v_renewal.proposed_terms->>'effective_start_date','')::date,nullif(v_renewal.proposed_terms->>'lease_start_date','')::date);
  v_end:=coalesce(nullif(v_renewal.proposed_terms->>'effective_end_date','')::date,nullif(v_renewal.proposed_terms->>'lease_end_date','')::date);
  v_occupation:=coalesce(nullif(v_renewal.proposed_terms->>'occupation_date','')::date,v_start);
  v_rent:=nullif(v_renewal.proposed_terms->>'monthly_rent','')::numeric;
  v_deposit:=nullif(v_renewal.proposed_terms->>'deposit_amount','')::numeric;
  if v_start is null or v_end is null or v_end<v_start or v_start<>v_source.effective_end_date+1 or v_occupation<v_start or v_rent is null or v_rent<=0 or v_deposit is null or v_deposit<0 then raise exception 'Renewal terms require contiguous valid dates, rent and deposit'; end if;
  select lease_id into v_lease_id from public.rental_lease_versions where id=v_source.id;
  select coalesce(max(version_number),0)+1 into v_next_number from public.rental_lease_versions where lease_id=v_lease_id;
  insert into public.rental_lease_versions(lease_id,organisation_id,version_number,status,is_current,effective_start_date,effective_end_date,occupation_date,monthly_rent,deposit_amount,escalation_json,terms_json,created_by) values(v_lease_id,v_renewal.organisation_id,v_next_number,'draft',false,v_start,v_end,v_occupation,v_rent,v_deposit,coalesce(v_renewal.proposed_terms->'escalation_json',v_renewal.proposed_terms->'escalation','{}'::jsonb),v_renewal.proposed_terms,auth.uid()) returning id into v_new_id;
  insert into public.rental_renewal_lease_versions(renewal_id,source_lease_version_id,renewal_lease_version_id,generated_by) values(v_renewal.id,v_source.id,v_new_id,auth.uid()) returning id into v_link_id;
  insert into public.rental_renewal_events(renewal_id,event_type,actor_user_id,payload) values(v_renewal.id,'lease_version_generated',auth.uid(),jsonb_build_object('link_id',v_link_id,'lease_version_id',v_new_id,'proposal_version',v_renewal.proposal_version));
  return jsonb_build_object('renewal_lease_version_id',v_new_id,'link_id',v_link_id,'version_number',v_next_number,'signing_status','pending','idempotent',false);
end $$;

revoke all on function public.rental_generate_renewal_lease_version(uuid,integer) from public,anon;
grant execute on function public.rental_generate_renewal_lease_version(uuid,integer) to authenticated;
comment on function public.rental_generate_renewal_lease_version(uuid,integer) is 'Phase 58: creates a future draft renewal lease version only from an accepted current proposal, without changing the active tenancy or source lease version.';
commit;
