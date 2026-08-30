begin;

create table public.rental_landlord_portal_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  landlord_relationship_id uuid not null references public.rental_property_landlords(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  authority text not null default 'full' check (authority in ('full', 'view_only')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique (property_id, user_id)
);

create table public.rental_landlord_portal_decisions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  landlord_access_id uuid not null references public.rental_landlord_portal_access(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  decision_kind text not null check (decision_kind in ('maintenance_quote', 'renewal_intention')),
  decision text not null check (decision in ('approve', 'decline', 'intend_renew', 'intend_not_renew')),
  quote_id uuid references public.rental_maintenance_quotes(id) on delete restrict,
  lease_version_id uuid references public.rental_lease_versions(id) on delete restrict,
  reviewed_snapshot jsonb not null,
  reviewed_version_hash text not null,
  evidence_link text,
  note text,
  client_request_id uuid not null,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'accepted', 'declined', 'superseded')),
  created_at timestamptz not null default now(),
  unique (user_id, property_id, client_request_id),
  check ((decision_kind = 'maintenance_quote' and quote_id is not null and lease_version_id is null and decision in ('approve', 'decline')) or (decision_kind = 'renewal_intention' and lease_version_id is not null and quote_id is null and decision in ('intend_renew', 'intend_not_renew')))
);

create index rental_landlord_portal_decisions_property_created_idx on public.rental_landlord_portal_decisions (property_id, created_at desc);
alter table public.rental_landlord_portal_access enable row level security;
alter table public.rental_landlord_portal_decisions enable row level security;
revoke all on public.rental_landlord_portal_access, public.rental_landlord_portal_decisions from public, anon;
grant select on public.rental_landlord_portal_access, public.rental_landlord_portal_decisions to authenticated;

create policy rental_landlord_portal_access_read on public.rental_landlord_portal_access for select to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id))
);
create policy rental_landlord_portal_decisions_read on public.rental_landlord_portal_decisions for select to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id))
);

create or replace function public.rental_grant_landlord_portal_access(p_property_id uuid, p_relationship_id uuid, p_user_id uuid, p_authority text default 'full') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_property public.rental_properties%rowtype; v_id uuid;
begin
  if auth.uid() is null or p_authority not in ('full','view_only') then raise exception 'Invalid portal access request'; end if;
  select * into v_property from public.rental_properties where id=p_property_id for update;
  if not found or not public.rental_branch_access(v_property.organisation_id,v_property.branch_id) or not exists(select 1 from public.rental_property_landlords relationship where relationship.id=p_relationship_id and relationship.property_id=v_property.id and relationship.relationship_status='active' and (relationship.effective_from is null or relationship.effective_from<=current_date) and (relationship.effective_to is null or relationship.effective_to>=current_date)) then raise exception 'Not authorized'; end if;
  insert into public.rental_landlord_portal_access(property_id,landlord_relationship_id,user_id,authority,status,granted_by,granted_at,revoked_at,revoked_by) values(v_property.id,p_relationship_id,p_user_id,p_authority,'active',auth.uid(),now(),null,null) on conflict(property_id,user_id) do update set landlord_relationship_id=excluded.landlord_relationship_id,authority=excluded.authority,status='active',granted_by=auth.uid(),granted_at=now(),revoked_at=null,revoked_by=null returning id into v_id;
  return jsonb_build_object('access_id',v_id,'status','active');
end $$;

create or replace function public.rental_submit_landlord_portal_decision(p_property_id uuid,p_decision_kind text,p_decision text,p_quote_id uuid,p_lease_version_id uuid,p_client_request_id uuid,p_evidence_link text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_access public.rental_landlord_portal_access%rowtype; v_existing public.rental_landlord_portal_decisions%rowtype; v_snapshot jsonb; v_hash text; v_id uuid;
begin
  if auth.uid() is null or p_client_request_id is null then raise exception 'Invalid landlord decision'; end if;
  select * into v_access from public.rental_landlord_portal_access where property_id=p_property_id and user_id=auth.uid() and status='active' and authority='full';
  if not found then raise exception 'Landlord approval access is not active for this property'; end if;
  select * into v_existing from public.rental_landlord_portal_decisions where user_id=auth.uid() and property_id=p_property_id and client_request_id=p_client_request_id;
  if found then return jsonb_build_object('decision_id',v_existing.id,'status',v_existing.status,'idempotent',true); end if;
  if (select count(*) from public.rental_landlord_portal_decisions where user_id=auth.uid() and property_id=p_property_id and created_at>now()-interval '15 minutes')>=5 then raise exception 'Too many decisions submitted. Please wait and try again.'; end if;
  if p_decision_kind='maintenance_quote' and p_decision in ('approve','decline') and p_quote_id is not null and p_lease_version_id is null then
    select jsonb_build_object('quote_id',q.id,'supplier_name',q.supplier_name,'quote_reference',q.quote_reference,'amount',q.amount,'currency_code',q.currency_code,'quote_link',q.quote_link,'scope_notes',q.scope_notes,'valid_until',q.valid_until,'status',q.status,'submitted_at',q.submitted_at) into v_snapshot from public.rental_maintenance_quotes q join public.rental_maintenance_requests request on request.id=q.request_id where q.id=p_quote_id and request.property_id=p_property_id and q.status in ('submitted','recommended') and (q.valid_until is null or q.valid_until>=current_date);
    if v_snapshot is null then raise exception 'Quote is no longer available for approval'; end if;
  elsif p_decision_kind='renewal_intention' and p_decision in ('intend_renew','intend_not_renew') and p_lease_version_id is not null and p_quote_id is null then
    select jsonb_build_object('lease_version_id',version.id,'version_number',version.version_number,'effective_start_date',version.effective_start_date,'effective_end_date',version.effective_end_date,'monthly_rent',version.monthly_rent,'deposit_amount',version.deposit_amount,'terms_json',version.terms_json) into v_snapshot from public.rental_lease_versions version join public.rental_leases lease on lease.id=version.lease_id join public.rental_tenancies tenancy on tenancy.id=lease.tenancy_id where version.id=p_lease_version_id and version.is_current=true and tenancy.property_id=p_property_id;
    if v_snapshot is null then raise exception 'Lease version is no longer current'; end if;
  else raise exception 'Invalid decision or reviewed record'; end if;
  v_hash:=md5(v_snapshot::text);
  insert into public.rental_landlord_portal_decisions(property_id,landlord_access_id,user_id,decision_kind,decision,quote_id,lease_version_id,reviewed_snapshot,reviewed_version_hash,evidence_link,note,client_request_id) values(p_property_id,v_access.id,auth.uid(),p_decision_kind,p_decision,p_quote_id,p_lease_version_id,v_snapshot,v_hash,nullif(btrim(coalesce(p_evidence_link,'')),''),nullif(btrim(coalesce(p_note,'')),''),p_client_request_id) returning id into v_id;
  return jsonb_build_object('decision_id',v_id,'status','submitted','reviewed_version_hash',v_hash,'idempotent',false);
end $$;

revoke all on function public.rental_grant_landlord_portal_access(uuid,uuid,uuid,text), public.rental_submit_landlord_portal_decision(uuid,text,text,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.rental_grant_landlord_portal_access(uuid,uuid,uuid,text), public.rental_submit_landlord_portal_decision(uuid,text,text,uuid,uuid,uuid,text,text) to authenticated;
commit;
