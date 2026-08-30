begin;

create table public.rental_renewals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  source_lease_version_id uuid not null references public.rental_lease_versions(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'awaiting_intentions', 'under_review', 'accepted', 'declined', 'cancelled')),
  proposal_version integer not null default 1 check (proposal_version > 0),
  proposed_terms jsonb not null default '{}'::jsonb,
  response_due_on date,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, source_lease_version_id)
);

create table public.rental_renewal_intentions (
  id uuid primary key default gen_random_uuid(),
  renewal_id uuid not null references public.rental_renewals(id) on delete restrict,
  actor_type text not null check (actor_type in ('tenant', 'landlord', 'staff')),
  actor_user_id uuid not null references auth.users(id),
  intention text not null check (intention in ('intend_renew', 'intend_not_renew', 'undecided')),
  proposal_version integer not null check (proposal_version > 0),
  note text,
  submitted_at timestamptz not null default now()
);

create table public.rental_renewal_events (
  id uuid primary key default gen_random_uuid(),
  renewal_id uuid not null references public.rental_renewals(id) on delete restrict,
  event_type text not null check (event_type in ('opened', 'terms_updated', 'intention_submitted', 'accepted', 'declined', 'cancelled')),
  actor_user_id uuid not null references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index rental_renewals_tenancy_status_idx on public.rental_renewals (tenancy_id, status, updated_at desc);
create index rental_renewal_intentions_renewal_idx on public.rental_renewal_intentions (renewal_id, submitted_at desc);
create index rental_renewal_events_renewal_idx on public.rental_renewal_events (renewal_id, occurred_at desc);
alter table public.rental_renewals enable row level security;
alter table public.rental_renewal_intentions enable row level security;
alter table public.rental_renewal_events enable row level security;
revoke all on public.rental_renewals, public.rental_renewal_intentions, public.rental_renewal_events from public, anon;
grant select on public.rental_renewals, public.rental_renewal_intentions, public.rental_renewal_events to authenticated;

create policy rental_renewals_read on public.rental_renewals for select to authenticated using (
  exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id))
  or exists(select 1 from public.rental_tenant_portal_access access where access.tenancy_id=tenancy_id and access.user_id=auth.uid() and access.status='active')
  or exists(select 1 from public.rental_tenancies tenancy join public.rental_landlord_portal_access access on access.property_id=tenancy.property_id where tenancy.id=tenancy_id and access.user_id=auth.uid() and access.status='active')
);
create policy rental_renewal_intentions_read on public.rental_renewal_intentions for select to authenticated using (exists(select 1 from public.rental_renewals renewal where renewal.id=renewal_id));
create policy rental_renewal_events_read on public.rental_renewal_events for select to authenticated using (exists(select 1 from public.rental_renewals renewal where renewal.id=renewal_id));

create or replace function public.rental_open_renewal(p_tenancy_id uuid, p_response_due_on date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_version public.rental_lease_versions%rowtype; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_tenancy from public.rental_tenancies where id=p_tenancy_id for update;
  if not found or not exists(select 1 from public.rental_properties property where property.id=v_tenancy.property_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_tenancy.status<>'active' then raise exception 'Only active tenancies can be renewed'; end if;
  select version.* into v_version from public.rental_leases lease join public.rental_lease_versions version on version.lease_id=lease.id where lease.tenancy_id=v_tenancy.id and version.is_current=true order by version.version_number desc limit 1 for update;
  if not found then raise exception 'Current lease version is required'; end if;
  insert into public.rental_renewals(organisation_id,tenancy_id,source_lease_version_id,proposed_terms,response_due_on,created_by) values(v_tenancy.organisation_id,v_tenancy.id,v_version.id,jsonb_build_object('effective_start_date',v_version.effective_start_date,'effective_end_date',v_version.effective_end_date,'monthly_rent',v_version.monthly_rent,'deposit_amount',v_version.deposit_amount,'escalation_json',v_version.escalation_json,'terms_json',v_version.terms_json),p_response_due_on,auth.uid()) on conflict(tenancy_id,source_lease_version_id) do nothing returning id into v_id;
  if v_id is null then
    select id,status into v_id,v_status from public.rental_renewals where tenancy_id=v_tenancy.id and source_lease_version_id=v_version.id;
    return jsonb_build_object('renewal_id',v_id,'status',v_status,'idempotent',true);
  end if;
  insert into public.rental_renewal_events(renewal_id,event_type,actor_user_id,payload) values(v_id,'opened',auth.uid(),jsonb_build_object('source_lease_version_id',v_version.id));
  return jsonb_build_object('renewal_id',v_id,'status','draft','idempotent',false);
end $$;

create or replace function public.rental_save_renewal_terms(p_renewal_id uuid,p_expected_version integer,p_terms jsonb,p_response_due_on date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_renewal public.rental_renewals%rowtype;
begin
  if auth.uid() is null or jsonb_typeof(coalesce(p_terms,'{}'::jsonb))<>'object' then raise exception 'Valid terms are required'; end if;
  select renewal.* into v_renewal from public.rental_renewals renewal where renewal.id=p_renewal_id for update;
  if not found or not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=v_renewal.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_renewal.status in('accepted','declined','cancelled') or v_renewal.proposal_version<>p_expected_version then raise exception 'Renewal terms have changed. Refresh before saving.'; end if;
  update public.rental_renewals set proposed_terms=p_terms,proposal_version=proposal_version+1,response_due_on=coalesce(p_response_due_on,response_due_on),status='awaiting_intentions',updated_at=now() where id=v_renewal.id returning * into v_renewal;
  insert into public.rental_renewal_events(renewal_id,event_type,actor_user_id,payload) values(v_renewal.id,'terms_updated',auth.uid(),jsonb_build_object('proposal_version',v_renewal.proposal_version));
  return jsonb_build_object('renewal_id',v_renewal.id,'proposal_version',v_renewal.proposal_version,'status',v_renewal.status);
end $$;

create or replace function public.rental_submit_renewal_intention(p_renewal_id uuid,p_intention text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_renewal public.rental_renewals%rowtype; v_actor text;
begin
  if auth.uid() is null or p_intention not in('intend_renew','intend_not_renew','undecided') then raise exception 'Valid renewal intention is required'; end if;
  select * into v_renewal from public.rental_renewals where id=p_renewal_id for update;
  if not found or v_renewal.status not in('draft','awaiting_intentions','under_review') then raise exception 'Renewal is not accepting intentions'; end if;
  if exists(select 1 from public.rental_tenant_portal_access access where access.tenancy_id=v_renewal.tenancy_id and access.user_id=auth.uid() and access.status='active') then v_actor:='tenant';
  elsif exists(select 1 from public.rental_tenancies tenancy join public.rental_landlord_portal_access access on access.property_id=tenancy.property_id where tenancy.id=v_renewal.tenancy_id and access.user_id=auth.uid() and access.status='active' and access.authority='full') then v_actor:='landlord';
  else raise exception 'Not authorized for this renewal'; end if;
  insert into public.rental_renewal_intentions(renewal_id,actor_type,actor_user_id,intention,proposal_version,note) values(v_renewal.id,v_actor,auth.uid(),p_intention,v_renewal.proposal_version,nullif(btrim(coalesce(p_note,'')),''));
  update public.rental_renewals set status='under_review',updated_at=now() where id=v_renewal.id and status='awaiting_intentions';
  insert into public.rental_renewal_events(renewal_id,event_type,actor_user_id,payload) values(v_renewal.id,'intention_submitted',auth.uid(),jsonb_build_object('actor_type',v_actor,'intention',p_intention,'proposal_version',v_renewal.proposal_version));
  return jsonb_build_object('renewal_id',v_renewal.id,'proposal_version',v_renewal.proposal_version,'status','submitted');
end $$;

create or replace function public.rental_decide_renewal(p_renewal_id uuid,p_expected_version integer,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_renewal public.rental_renewals%rowtype;
begin
  if auth.uid() is null or p_decision not in('accepted','declined','cancelled') then raise exception 'Valid renewal decision is required'; end if;
  select * into v_renewal from public.rental_renewals renewal where renewal.id=p_renewal_id for update;
  if not found or not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=v_renewal.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_renewal.status in('accepted','declined','cancelled') or v_renewal.proposal_version<>p_expected_version then raise exception 'Renewal has changed. Refresh before deciding.'; end if;
  update public.rental_renewals set status=p_decision,decided_by=auth.uid(),decided_at=now(),decision_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now() where id=v_renewal.id;
  insert into public.rental_renewal_events(renewal_id,event_type,actor_user_id,payload) values(v_renewal.id,p_decision,auth.uid(),jsonb_build_object('proposal_version',v_renewal.proposal_version));
  return jsonb_build_object('renewal_id',v_renewal.id,'status',p_decision,'proposal_version',v_renewal.proposal_version);
end $$;

revoke all on function public.rental_open_renewal(uuid,date),public.rental_save_renewal_terms(uuid,integer,jsonb,date),public.rental_submit_renewal_intention(uuid,text,text),public.rental_decide_renewal(uuid,integer,text,text) from public,anon;
grant execute on function public.rental_open_renewal(uuid,date),public.rental_save_renewal_terms(uuid,integer,jsonb,date),public.rental_submit_renewal_intention(uuid,text,text),public.rental_decide_renewal(uuid,integer,text,text) to authenticated;
commit;
