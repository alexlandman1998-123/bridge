begin;

create or replace function public.attorney_firm_module_open_matter_count(
  p_firm_id uuid,
  p_module_key text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct assignment.transaction_id)::integer
  from public.transaction_attorney_assignments assignment
  where coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id
    and lower(coalesce(assignment.assignment_status, assignment.status, 'active'))
      not in ('completed', 'removed', 'declined', 'rejected', 'cancelled')
    and lower(coalesce(assignment.instruction_status, 'active'))
      not in ('completed', 'removed', 'declined')
    and case lower(btrim(coalesce(p_module_key, '')))
      when 'transfer' then (
        lower(coalesce(assignment.assignment_type, assignment.matter_type, '')) in ('transfer', 'transfer_and_bond')
        or lower(coalesce(assignment.attorney_role, '')) = 'transfer_attorney'
      )
      when 'bond' then (
        lower(coalesce(assignment.assignment_type, assignment.matter_type, '')) in ('bond', 'transfer_and_bond')
        or lower(coalesce(assignment.attorney_role, '')) = 'bond_attorney'
      )
      when 'cancellation' then (
        lower(coalesce(assignment.assignment_type, assignment.matter_type, '')) = 'cancellation'
        or lower(coalesce(assignment.attorney_role, '')) = 'cancellation_attorney'
      )
      else false
    end;
$$;

comment on function public.attorney_firm_module_open_matter_count(uuid, text) is
  'Counts distinct non-terminal attorney matters for a firm service module. Combined transfer-and-bond assignments count in both lanes.';

create or replace function public.get_attorney_firm_module_overview(
  p_firm_id uuid
)
returns table (
  id uuid,
  firm_id uuid,
  module_key text,
  status text,
  activated_at timestamptz,
  deactivated_at timestamptz,
  changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  open_matter_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if not (
    public.attorney_user_is_active_member(p_firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = p_firm_id
        and firm.created_by = auth.uid()
    )
  ) then
    raise exception 'You do not have access to this attorney firm.' using errcode = '42501';
  end if;

  return query
  select
    module.id,
    module.firm_id,
    module.module_key,
    module.status,
    module.activated_at,
    module.deactivated_at,
    module.changed_by,
    module.created_at,
    module.updated_at,
    public.attorney_firm_module_open_matter_count(module.firm_id, module.module_key)
  from public.attorney_firm_modules module
  where module.firm_id = p_firm_id
  order by case module.module_key
    when 'transfer' then 1
    when 'bond' then 2
    else 3
  end;
end;
$$;

create or replace function public.enforce_attorney_firm_module_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_matter_count integer;
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    v_open_matter_count := public.attorney_firm_module_open_matter_count(new.firm_id, new.module_key);
    if v_open_matter_count > 0 then
      raise exception 'Module has % open matter(s). Move it to winding down until those matters are complete.', v_open_matter_count
        using errcode = '23514',
              hint = 'Select winding_down to stop new work while preserving existing operational access.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_attorney_firm_module_transition on public.attorney_firm_modules;
create trigger trg_enforce_attorney_firm_module_transition
before update of status on public.attorney_firm_modules
for each row
execute function public.enforce_attorney_firm_module_transition();

revoke all on function public.attorney_firm_module_open_matter_count(uuid, text) from public;
revoke all on function public.get_attorney_firm_module_overview(uuid) from public;

grant execute on function public.attorney_firm_module_open_matter_count(uuid, text) to authenticated;
grant execute on function public.get_attorney_firm_module_overview(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
