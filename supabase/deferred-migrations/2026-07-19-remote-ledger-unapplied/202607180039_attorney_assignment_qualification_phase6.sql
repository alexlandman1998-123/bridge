begin;

create or replace function public.bridge_attorney_member_assignment_eligible(
  target_firm_id uuid,
  target_user_id uuid,
  target_attorney_role text,
  target_slot text default 'primary',
  target_is_primary boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with member_profile as (
    select
      public.bridge_normalize_attorney_professional_role(m.professional_role) as professional_role,
      public.bridge_normalize_attorney_practice_qualifications(null, m.practice_qualifications) as qualifications
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = target_user_id
      and m.status = 'active'
    limit 1
  ), required_lane as (
    select case lower(trim(coalesce(target_attorney_role, '')))
      when 'bond_attorney' then 'bond'
      when 'cancellation_attorney' then 'cancellation'
      else 'transfer'
    end as qualification
  )
  select coalesce((
    select case lower(trim(coalesce(target_slot, 'primary')))
      when 'secretary' then professional_role in ('conveyancing_secretary', 'admin_staff', 'candidate_attorney')
      when 'admin' then professional_role in ('admin_staff', 'conveyancing_secretary', 'candidate_attorney')
      else (
        professional_role in ('firm_admin', 'director_partner')
        or (
          not coalesce(target_is_primary, true)
          and professional_role = 'candidate_attorney'
        )
        or (
          professional_role = 'attorney_conveyancer'
          and (select qualification from required_lane) = any(qualifications)
        )
      )
    end
    from member_profile
  ), false);
$$;

revoke all on function public.bridge_attorney_member_assignment_eligible(uuid, uuid, text, text, boolean) from public;
revoke all on function public.bridge_attorney_member_assignment_eligible(uuid, uuid, text, text, boolean) from authenticated;

create or replace function public.enforce_attorney_assignment_professional_profile_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_firm_id uuid := coalesce(new.attorney_firm_id, new.firm_id);
  resolved_attorney_user_id uuid := coalesce(new.attorney_user_id, new.primary_attorney_id);
  resolved_attorney_role text := coalesce(new.attorney_role, case lower(trim(coalesce(new.assignment_type, '')))
    when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney'
    else 'transfer_attorney'
  end);
begin
  if coalesce(new.assignment_status, new.status, 'active') = 'removed' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.attorney_firm_id is not distinct from old.attorney_firm_id
    and new.firm_id is not distinct from old.firm_id
    and new.attorney_user_id is not distinct from old.attorney_user_id
    and new.primary_attorney_id is not distinct from old.primary_attorney_id
    and new.attorney_role is not distinct from old.attorney_role
    and new.assignment_type is not distinct from old.assignment_type
    and new.is_primary is not distinct from old.is_primary
    and new.secretary_id is not distinct from old.secretary_id
    and new.admin_handler_id is not distinct from old.admin_handler_id
    and new.assignment_status is not distinct from old.assignment_status
    and new.status is not distinct from old.status then
    return new;
  end if;

  if resolved_attorney_user_id is not null and not public.bridge_attorney_member_assignment_eligible(
    resolved_firm_id,
    resolved_attorney_user_id,
    resolved_attorney_role,
    'attorney',
    coalesce(new.is_primary, true)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Assigned attorney is not eligible for this transaction lane.';
  end if;

  if new.secretary_id is not null and not public.bridge_attorney_member_assignment_eligible(
    resolved_firm_id, new.secretary_id, resolved_attorney_role, 'secretary', false
  ) then
    raise exception using
      errcode = '23514',
      message = 'Assigned secretary does not have an eligible professional role.';
  end if;

  if new.admin_handler_id is not null and not public.bridge_attorney_member_assignment_eligible(
    resolved_firm_id, new.admin_handler_id, resolved_attorney_role, 'admin', false
  ) then
    raise exception using
      errcode = '23514',
      message = 'Assigned admin handler does not have an eligible professional role.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attorney_assignment_professional_profile_phase6 on public.transaction_attorney_assignments;
create trigger trg_attorney_assignment_professional_profile_phase6
before insert or update on public.transaction_attorney_assignments
for each row
execute function public.enforce_attorney_assignment_professional_profile_phase6();

comment on function public.bridge_attorney_member_assignment_eligible(uuid, uuid, text, text, boolean) is
  'Phase 6 canonical professional-role and practice-qualification eligibility boundary for transaction attorney assignment slots.';

commit;
