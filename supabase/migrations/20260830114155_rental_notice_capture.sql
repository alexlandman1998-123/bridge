begin;

create table public.rental_notices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  source text not null check (source in ('tenant', 'landlord', 'staff')),
  notice_type text not null default 'termination' check (notice_type in ('termination', 'non_renewal')),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'withdrawn', 'superseded')),
  received_on date not null,
  effective_on date not null,
  acknowledgement_due_on date not null,
  evidence_link text not null check (length(btrim(evidence_link)) > 0),
  note text,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  withdrawal_reason text,
  withdrawn_by uuid references auth.users(id),
  withdrawn_at timestamptz,
  check (effective_on >= received_on)
);

create index rental_notices_tenancy_status_idx on public.rental_notices (tenancy_id, status, effective_on);
alter table public.rental_notices enable row level security;
revoke all on public.rental_notices from public, anon;
grant select on public.rental_notices to authenticated;
create policy rental_notices_read on public.rental_notices for select to authenticated using (
  exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id))
  or exists(select 1 from public.rental_tenant_portal_access access where access.tenancy_id=tenancy_id and access.user_id=auth.uid() and access.status='active')
  or exists(select 1 from public.rental_tenancies tenancy join public.rental_landlord_portal_access access on access.property_id=tenancy.property_id where tenancy.id=tenancy_id and access.user_id=auth.uid() and access.status='active')
);

create or replace function public.rental_capture_notice(p_tenancy_id uuid,p_source text,p_notice_type text,p_received_on date,p_effective_on date,p_evidence_link text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_id uuid;
begin
  if auth.uid() is null or p_source not in('tenant','landlord','staff') or p_notice_type not in('termination','non_renewal') or p_received_on is null or p_effective_on is null or p_effective_on<p_received_on or length(btrim(coalesce(p_evidence_link,'')))=0 then raise exception 'Valid notice dates and evidence are required'; end if;
  select * into v_tenancy from public.rental_tenancies where id=p_tenancy_id for update;
  if not found or not exists(select 1 from public.rental_properties property where property.id=v_tenancy.property_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  insert into public.rental_notices(organisation_id,tenancy_id,source,notice_type,received_on,effective_on,acknowledgement_due_on,evidence_link,note,submitted_by) values(v_tenancy.organisation_id,v_tenancy.id,p_source,p_notice_type,p_received_on,p_effective_on,p_received_on+2,btrim(p_evidence_link),nullif(btrim(coalesce(p_note,'')),''),auth.uid()) returning id into v_id;
  return jsonb_build_object('notice_id',v_id,'status','submitted','acknowledgement_due_on',p_received_on+2);
end $$;

create or replace function public.rental_submit_portal_notice(p_tenancy_id uuid,p_notice_type text,p_effective_on date,p_evidence_link text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_source text; v_id uuid;
begin
  if auth.uid() is null or p_notice_type not in('termination','non_renewal') or p_effective_on is null or p_effective_on<current_date or length(btrim(coalesce(p_evidence_link,'')))=0 then raise exception 'A future effective date and evidence are required'; end if;
  select * into v_tenancy from public.rental_tenancies where id=p_tenancy_id for update;
  if not found then raise exception 'Tenancy not found'; end if;
  if exists(select 1 from public.rental_tenant_portal_access access where access.tenancy_id=v_tenancy.id and access.user_id=auth.uid() and access.status='active') then v_source:='tenant';
  elsif exists(select 1 from public.rental_landlord_portal_access access where access.property_id=v_tenancy.property_id and access.user_id=auth.uid() and access.status='active' and access.authority='full') then v_source:='landlord';
  else raise exception 'Not authorized for this tenancy'; end if;
  insert into public.rental_notices(organisation_id,tenancy_id,source,notice_type,received_on,effective_on,acknowledgement_due_on,evidence_link,note,submitted_by) values(v_tenancy.organisation_id,v_tenancy.id,v_source,p_notice_type,current_date,p_effective_on,current_date+2,btrim(p_evidence_link),nullif(btrim(coalesce(p_note,'')),''),auth.uid()) returning id into v_id;
  return jsonb_build_object('notice_id',v_id,'status','submitted','source',v_source,'acknowledgement_due_on',current_date+2);
end $$;

create or replace function public.rental_acknowledge_notice(p_notice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_notice public.rental_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_notice from public.rental_notices where id=p_notice_id for update;
  if not found or not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=v_notice.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'Not authorized'; end if;
  if v_notice.status='acknowledged' then return jsonb_build_object('notice_id',v_notice.id,'status','acknowledged','idempotent',true); end if;
  if v_notice.status<>'submitted' then raise exception 'Only submitted notices can be acknowledged'; end if;
  update public.rental_notices set status='acknowledged',acknowledged_by=auth.uid(),acknowledged_at=now() where id=v_notice.id;
  return jsonb_build_object('notice_id',v_notice.id,'status','acknowledged','idempotent',false);
end $$;

create or replace function public.rental_withdraw_notice(p_notice_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_notice public.rental_notices%rowtype; v_staff boolean;
begin
  if auth.uid() is null or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'A withdrawal reason is required'; end if;
  select * into v_notice from public.rental_notices where id=p_notice_id for update;
  if not found then raise exception 'Notice not found'; end if;
  select exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=v_notice.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) into v_staff;
  if not v_staff and v_notice.submitted_by<>auth.uid() then raise exception 'Not authorized'; end if;
  if v_notice.status in('withdrawn','superseded') then return jsonb_build_object('notice_id',v_notice.id,'status',v_notice.status,'idempotent',true); end if;
  update public.rental_notices set status='withdrawn',withdrawal_reason=btrim(p_reason),withdrawn_by=auth.uid(),withdrawn_at=now() where id=v_notice.id;
  return jsonb_build_object('notice_id',v_notice.id,'status','withdrawn','idempotent',false);
end $$;

create or replace function public.rental_get_tenancy_notice_status(p_tenancy_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_notice public.rental_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=p_tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id))
    and not exists(select 1 from public.rental_tenant_portal_access access where access.tenancy_id=p_tenancy_id and access.user_id=auth.uid() and access.status='active')
    and not exists(select 1 from public.rental_tenancies tenancy join public.rental_landlord_portal_access access on access.property_id=tenancy.property_id where tenancy.id=p_tenancy_id and access.user_id=auth.uid() and access.status='active') then raise exception 'Not authorized'; end if;
  select * into v_notice from public.rental_notices where tenancy_id=p_tenancy_id and status='acknowledged' order by effective_on asc,acknowledged_at desc limit 1;
  return jsonb_build_object('notice_given',found,'notice_id',v_notice.id,'source',v_notice.source,'notice_type',v_notice.notice_type,'effective_on',v_notice.effective_on,'acknowledged_at',v_notice.acknowledged_at);
end $$;

revoke all on function public.rental_capture_notice(uuid,text,text,date,date,text,text),public.rental_submit_portal_notice(uuid,text,date,text,text),public.rental_acknowledge_notice(uuid),public.rental_withdraw_notice(uuid,text),public.rental_get_tenancy_notice_status(uuid) from public,anon;
grant execute on function public.rental_capture_notice(uuid,text,text,date,date,text,text),public.rental_submit_portal_notice(uuid,text,date,text,text),public.rental_acknowledge_notice(uuid),public.rental_withdraw_notice(uuid,text),public.rental_get_tenancy_notice_status(uuid) to authenticated;
commit;
