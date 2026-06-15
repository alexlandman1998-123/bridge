begin;
create or replace function public.bridge_delete_agency_lead(
  p_organisation_id uuid,
  p_lead_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead public.leads%rowtype;
begin
  if p_organisation_id is null or p_lead_id is null then
    return false;
  end if;

  select *
    into target_lead
  from public.leads
  where organisation_id = p_organisation_id
    and lead_id = p_lead_id
  limit 1;

  if target_lead.lead_id is null then
    return false;
  end if;

  if not (
    public.bridge_is_org_admin(p_organisation_id)
    or (
      public.bridge_membership_role(p_organisation_id) = 'agent'
      and target_lead.assigned_agent_id = auth.uid()
    )
  ) then
    raise exception 'You do not have permission to delete this lead.'
      using errcode = '42501';
  end if;

  update public.appointments
     set lead_id = null,
         updated_at = now()
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  delete from public.lead_activities
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  delete from public.tasks
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  update public.crm_deals
     set lead_id = null,
         updated_at = now()
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  update public.document_packets
     set lead_id = null,
         updated_at = now()
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  delete from public.leads
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  return true;
end;
$$;
grant execute on function public.bridge_delete_agency_lead(uuid, uuid) to authenticated;
commit;
