begin;

-- Reserve stock against its buyer lead before onboarding or a transaction.
-- Invoker permissions retain the existing unit and lead row-security checks.
create unique index developer_leads_one_active_unit_reservation
  on public.developer_leads(preferred_unit_id)
  where reservation_state='reserved' and converted_transaction_id is null;

create function public.bridge_set_development_lead_reservation(
  p_developer_lead_id uuid, p_unit_id uuid, p_reserved boolean default true
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  unit_row public.units%rowtype;
  lead_row public.developer_leads%rowtype;
  owner_org uuid;
begin
  if auth.uid() is null or p_reserved is null then raise exception 'Sign in to manage a reservation.' using errcode='42501'; end if;
  -- Every reservation of this unit takes the same lock, including competitors.
  select * into unit_row from public.units where id=p_unit_id for update;
  if not found then raise exception 'This unit is unavailable.' using errcode='42501'; end if;
  select * into lead_row from public.developer_leads where developer_lead_id=p_developer_lead_id for update;
  if not found then raise exception 'This buyer lead is unavailable.' using errcode='42501'; end if;
  select organisation_id into owner_org from public.developments where id=unit_row.development_id;
  if owner_org is distinct from lead_row.developer_org_id or unit_row.development_id is distinct from lead_row.primary_development_id then
    raise exception 'Choose a unit in this buyer lead’s development.' using errcode='22023';
  end if;
  if lead_row.converted_transaction_id is not null or exists(
    select 1 from public.transactions where unit_id=p_unit_id and coalesce(lifecycle_state,'active') not in ('cancelled','archived')
  ) then raise exception 'Manage this unit through its existing transaction.' using errcode='23514'; end if;
  if p_reserved then
    if lead_row.reservation_state='reserved' and lead_row.preferred_unit_id is distinct from p_unit_id then
      raise exception 'Release the buyer’s existing reservation before choosing another unit.' using errcode='23514';
    end if;
    if lower(coalesce(unit_row.status,''))<>'available' and not(
      lower(unit_row.status)='reserved' and lead_row.reservation_state='reserved' and lead_row.preferred_unit_id=p_unit_id
    ) then raise exception 'This unit is no longer available for reservation.' using errcode='23514'; end if;
    update public.units set status='Reserved' where id=p_unit_id;
    if not found then raise exception 'You cannot change this unit.' using errcode='42501'; end if;
    update public.developer_leads set preferred_unit_id=p_unit_id,reservation_state='reserved',reservation_expires_at=null,lead_status='reserved'
      where developer_lead_id=p_developer_lead_id returning * into lead_row;
  else
    if lead_row.preferred_unit_id is distinct from p_unit_id or lead_row.reservation_state not in ('reserved','expired') then
      raise exception 'This buyer does not hold the unit reservation.' using errcode='23514';
    end if;
    if lower(unit_row.status)<>'reserved' then raise exception 'Review the unit’s current status before releasing its reservation.' using errcode='23514'; end if;
    update public.units set status='Available' where id=p_unit_id;
    if not found then raise exception 'You cannot change this unit.' using errcode='42501'; end if;
    update public.developer_leads set reservation_state='none',reservation_expires_at=null,
      lead_status=case when lead_status='reserved' then 'qualified' else lead_status end
      where developer_lead_id=p_developer_lead_id returning * into lead_row;
  end if;
  if not found then raise exception 'You cannot change this buyer lead.' using errcode='42501'; end if;
  update public.developer_lead_development_interests set unit_id=p_unit_id
    where developer_lead_id=p_developer_lead_id and development_id=unit_row.development_id;
  if not found then raise exception 'The buyer’s development link must be completed before reserving a unit.' using errcode='23514'; end if;
  insert into public.developer_lead_activity(developer_lead_id,developer_org_id,source_agency_org_id,actor_user_id,activity_type,activity_note,visibility_scope,metadata)
  values(lead_row.developer_lead_id,lead_row.developer_org_id,lead_row.source_agency_org_id,auth.uid(),'status_changed',
    case when p_reserved then 'Unit reserved for this buyer.' else 'Unit reservation released.' end,
    case when lead_row.source_agency_org_id is null then 'developer' else 'shared' end,
    jsonb_build_object('unitId',p_unit_id,'reservationState',lead_row.reservation_state));
  return jsonb_build_object('developerLeadId',lead_row.developer_lead_id,'developerOrgId',lead_row.developer_org_id,
    'sourceLeadId',case when lead_row.source_agency_org_id is null or public.bridge_has_organisation_membership(lead_row.source_agency_org_id) then lead_row.source_lead_id else null end,
    'sourceAgencyOrgId',lead_row.source_agency_org_id,'unitId',p_unit_id,
    'reservationState',lead_row.reservation_state,'leadStatus',lead_row.lead_status,'unitStatus',case when p_reserved then 'Reserved' else 'Available' end);
end $$;
revoke all on function public.bridge_set_development_lead_reservation(uuid,uuid,boolean) from public,anon;
grant execute on function public.bridge_set_development_lead_reservation(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
