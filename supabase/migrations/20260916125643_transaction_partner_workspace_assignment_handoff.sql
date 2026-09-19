-- Give a selected partner organisation its matter immediately. The partner
-- organisation, rather than a named consultant, owns the initial allocation.
create or replace function public.bridge_materialize_transaction_partner_workspace_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_organisation_id uuid;
  v_partner_organisation_id uuid;
  v_delivery_type text;
  v_service_type text;
begin
  if new.transaction_id is null
     or new.role_type not in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator')
     or coalesce(new.status, '') in ('removed', 'cancelled') then
    return new;
  end if;

  v_partner_organisation_id := coalesce(new.assigned_organisation_id, new.partner_organisation_id, new.organisation_id);
  if v_partner_organisation_id is null then
    return new;
  end if;

  select organisation_id into v_agency_organisation_id
  from public.transactions where id = new.transaction_id;
  if v_agency_organisation_id is null then return new; end if;

  v_delivery_type := case when new.role_type = 'bond_originator' then 'bond_application_request' else 'attorney_instruction' end;
  v_service_type := case when new.role_type = 'bond_originator' then 'bond_origination' else 'property_transfers' end;

  if not exists (
    select 1 from public.transaction_partner_assignments assignment
    where assignment.transaction_id = new.transaction_id
      and assignment.partner_organisation_id = v_partner_organisation_id
      and assignment.partner_role = new.role_type
      and assignment.assignment_status not in ('cancelled', 'declined', 'completed')
  ) then
    insert into public.transaction_partner_assignments (
      transaction_id, agency_organisation_id, partner_organisation_id,
      partner_connection_id, partner_service_type, partner_role,
      assigned_person_id, assigned_queue_id, delivery_type, assignment_status,
      source, created_by, activated_at, pending_work_delivery
    ) values (
      new.transaction_id, v_agency_organisation_id, v_partner_organisation_id,
      new.partner_connection_id, v_service_type, new.role_type,
      null, null, v_delivery_type, 'active', 'routing', new.assigned_by, now(),
      jsonb_build_object(
        'source', 'transaction_role_player',
        'rolePlayerId', new.id,
        'roleType', new.role_type,
        'organisationLevelAssignment', true
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists transaction_role_players_partner_workspace_assignment on public.transaction_role_players;
create trigger transaction_role_players_partner_workspace_assignment
after insert or update of role_type, status, assignment_status, assigned_organisation_id, partner_organisation_id, organisation_id
on public.transaction_role_players
for each row execute function public.bridge_materialize_transaction_partner_workspace_assignment();;
