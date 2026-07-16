begin;

create or replace function public.bridge_list_attorney_lead_assignees(
  p_organisation_id uuid,
  p_lead_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  member_role text,
  branch_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney';

  if not found then
    raise exception 'Attorney Lead not found';
  end if;

  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'assign'
  ) then
    raise exception 'Not authorised to assign this Attorney Lead';
  end if;

  return query
  with candidates as (
    select
      member.user_id,
      coalesce(
        nullif(trim(concat_ws(' ', member.first_name, member.last_name)), ''),
        nullif(trim(member.email), ''),
        'Attorney team member'
      ) as display_name,
      nullif(lower(trim(member.email)), '') as email,
      lower(trim(coalesce(
        nullif(trim(member.organisation_role), ''),
        nullif(trim(member.workspace_role), ''),
        nullif(trim(member.role), ''),
        nullif(trim(member.app_role), ''),
        'viewer'
      ))) as member_role,
      coalesce(member.primary_branch_id, member.branch_id) as branch_id,
      0 as source_priority,
      member.updated_at
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id is not null
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and coalesce(member.workspace_type, 'attorney_firm') in ('attorney', 'attorney_firm')

    union all

    select
      firm_member.user_id,
      coalesce(
        nullif(trim(profile.full_name), ''),
        nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
        nullif(trim(profile.email), ''),
        'Attorney team member'
      ) as display_name,
      nullif(lower(trim(profile.email)), '') as email,
      lower(trim(firm_member.role)) as member_role,
      coalesce(firm_member.primary_branch_id, firm_member.branch_id) as branch_id,
      1 as source_priority,
      firm_member.updated_at
    from public.attorney_firm_members firm_member
    join public.attorney_firms firm on firm.id = firm_member.firm_id
    left join public.profiles profile on profile.id = firm_member.user_id
    where firm.organisation_id = p_organisation_id
      and firm_member.status = 'active'
  ), deduplicated as (
    select distinct on (candidate.user_id)
      candidate.user_id,
      candidate.display_name,
      candidate.email,
      candidate.member_role,
      candidate.branch_id
    from candidates candidate
    order by candidate.user_id, candidate.source_priority, candidate.updated_at desc nulls last
  )
  select
    candidate.user_id,
    candidate.display_name,
    candidate.email,
    candidate.member_role,
    candidate.branch_id
  from deduplicated candidate
  order by candidate.display_name, candidate.email;
end;
$$;

create or replace function public.bridge_assign_attorney_lead(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_assigned_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_target_branch uuid;
  v_target_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_activity_type text;
  v_activity_note text;
  v_now timestamptz := now();
begin
  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney'
  for update;

  if not found then
    raise exception 'Attorney Lead not found';
  end if;

  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'assign'
  ) then
    raise exception 'Not authorised to assign this Attorney Lead';
  end if;

  if v_lead.assigned_user_id is not distinct from p_assigned_user_id then
    return jsonb_build_object(
      'success', true,
      'unchanged', true,
      'lead_id', p_lead_id,
      'assigned_user_id', p_assigned_user_id
    );
  end if;

  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Assignment reason is too long';
  end if;
  if v_lead.assigned_user_id is not null and v_reason is null then
    raise exception 'A reason is required to reassign or unassign an Attorney Lead';
  end if;

  if p_assigned_user_id is not null then
    select
      coalesce(member.primary_branch_id, member.branch_id),
      coalesce(
        nullif(trim(concat_ws(' ', member.first_name, member.last_name)), ''),
        nullif(trim(member.email), ''),
        'Attorney team member'
      )
    into v_target_branch, v_target_name
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = p_assigned_user_id
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and coalesce(member.workspace_type, 'attorney_firm') in ('attorney', 'attorney_firm')
    order by member.updated_at desc nulls last, member.created_at desc
    limit 1;

    if not found then
      select
        coalesce(firm_member.primary_branch_id, firm_member.branch_id),
        coalesce(
          nullif(trim(profile.full_name), ''),
          nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
          nullif(trim(profile.email), ''),
          'Attorney team member'
        )
      into v_target_branch, v_target_name
      from public.attorney_firm_members firm_member
      join public.attorney_firms firm on firm.id = firm_member.firm_id
      left join public.profiles profile on profile.id = firm_member.user_id
      where firm.organisation_id = p_organisation_id
        and firm_member.user_id = p_assigned_user_id
        and firm_member.status = 'active'
      order by firm_member.updated_at desc nulls last, firm_member.created_at desc
      limit 1;
    end if;

    if not found then
      raise exception 'Assignee must be an active member of this Attorney firm';
    end if;
  end if;

  update public.leads
  set assigned_user_id = p_assigned_user_id,
      branch_id = coalesce(branch_id, v_target_branch),
      assigned_at = case when p_assigned_user_id is null then null else v_now end,
      ownership_status = case when p_assigned_user_id is null then 'awaiting_assignment' else 'assigned' end,
      updated_at = v_now
  where organisation_id = p_organisation_id
    and lead_id = p_lead_id;

  insert into public.lead_assignment_history (
    organisation_id,
    lead_id,
    previous_agent_id,
    new_agent_id,
    reason,
    assignment_source,
    assigned_by
  ) values (
    p_organisation_id,
    p_lead_id,
    v_lead.assigned_user_id,
    p_assigned_user_id,
    coalesce(v_reason, 'Initial manual assignment'),
    'attorney_crm_manual',
    auth.uid()
  );

  v_activity_type := case
    when p_assigned_user_id is null then 'Lead Unassigned'
    when v_lead.assigned_user_id is null then 'Lead Assigned'
    else 'Lead Reassigned'
  end;
  v_activity_note := case
    when p_assigned_user_id is null then 'Lead returned to the unassigned queue'
    else 'Lead assigned to ' || coalesce(v_target_name, 'Attorney team member')
  end;
  if v_reason is not null then
    v_activity_note := v_activity_note || '. Reason: ' || v_reason;
  end if;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, p_lead_id, auth.uid(), v_activity_type, v_activity_note, v_now,
    case when p_assigned_user_id is null then 'Unassigned' else 'Assigned' end
  );

  return jsonb_build_object(
    'success', true,
    'unchanged', false,
    'lead_id', p_lead_id,
    'assigned_user_id', p_assigned_user_id
  );
end;
$$;

create or replace function public.bridge_add_attorney_lead_activity(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_activity_type text,
  p_note text,
  p_outcome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_activity_id uuid;
  v_activity_type text := lower(trim(coalesce(p_activity_type, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_outcome text := nullif(trim(coalesce(p_outcome, '')), '');
  v_now timestamptz := now();
begin
  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney'
  for update;

  if not found then
    raise exception 'Attorney Lead not found';
  end if;
  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then
    raise exception 'Not authorised to add activity to this Attorney Lead';
  end if;

  if v_activity_type not in ('note', 'call', 'email', 'meeting', 'whatsapp') then
    raise exception 'Invalid Attorney Lead activity type';
  end if;
  if v_note is null or char_length(v_note) > 5000 then
    raise exception 'Attorney Lead activity note is required and must not exceed 5000 characters';
  end if;
  if char_length(coalesce(v_outcome, '')) > 120 then
    raise exception 'Attorney Lead activity outcome is too long';
  end if;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id,
    p_lead_id,
    auth.uid(),
    initcap(v_activity_type),
    v_note,
    v_now,
    v_outcome
  )
  returning activity_id into v_activity_id;

  if v_activity_type in ('call', 'email', 'meeting', 'whatsapp') then
    update public.leads
    set first_contacted_at = coalesce(first_contacted_at, v_now),
        last_contacted_at = v_now,
        ownership_status = case when assigned_user_id is null then ownership_status else 'contacted' end,
        stage = case when stage = 'new' then 'contacted' else stage end,
        updated_at = v_now
    where organisation_id = p_organisation_id
      and lead_id = p_lead_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'activity_id', v_activity_id
  );
end;
$$;

create or replace function public.bridge_set_attorney_lead_follow_up(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_next_follow_up_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
begin
  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney'
  for update;

  if not found then
    raise exception 'Attorney Lead not found';
  end if;
  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then
    raise exception 'Not authorised to update this Attorney Lead follow-up';
  end if;
  if v_lead.stage in ('won', 'lost') and p_next_follow_up_at is not null then
    raise exception 'Closed Attorney Leads cannot receive a new follow-up';
  end if;
  if p_next_follow_up_at is not null and p_next_follow_up_at < v_now - interval '5 minutes' then
    raise exception 'Attorney Lead follow-up must be in the future';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'Attorney Lead follow-up note is too long';
  end if;

  update public.leads
  set next_follow_up_at = p_next_follow_up_at,
      updated_at = v_now
  where organisation_id = p_organisation_id
    and lead_id = p_lead_id;

  if v_lead.next_follow_up_at is distinct from p_next_follow_up_at then
    insert into public.lead_activities (
      organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
    ) values (
      p_organisation_id,
      p_lead_id,
      auth.uid(),
      'Follow-Up Changed',
      coalesce(
        v_note,
        case
          when p_next_follow_up_at is null then 'Follow-up cleared'
          else 'Follow-up scheduled for ' || to_char(p_next_follow_up_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI')
        end
      ),
      v_now,
      case when p_next_follow_up_at is null then 'Cleared' else 'Scheduled' end
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'next_follow_up_at', p_next_follow_up_at
  );
end;
$$;

revoke all on function public.bridge_list_attorney_lead_assignees(uuid, uuid) from public, anon;
revoke all on function public.bridge_assign_attorney_lead(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.bridge_add_attorney_lead_activity(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.bridge_set_attorney_lead_follow_up(uuid, uuid, timestamptz, text) from public, anon;

grant execute on function public.bridge_list_attorney_lead_assignees(uuid, uuid) to authenticated;
grant execute on function public.bridge_assign_attorney_lead(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.bridge_add_attorney_lead_activity(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.bridge_set_attorney_lead_follow_up(uuid, uuid, timestamptz, text) to authenticated;

comment on function public.bridge_list_attorney_lead_assignees(uuid, uuid) is
  'Lists active same-firm Attorney Lead assignees after checking Lead assignment authority.';
comment on function public.bridge_assign_attorney_lead(uuid, uuid, uuid, text) is
  'Atomically assigns an Attorney Lead and records immutable assignment and activity history.';
comment on function public.bridge_add_attorney_lead_activity(uuid, uuid, text, text, text) is
  'Adds a bounded internal Attorney Lead activity and records contact timestamps where applicable.';
comment on function public.bridge_set_attorney_lead_follow_up(uuid, uuid, timestamptz, text) is
  'Atomically changes an Attorney Lead follow-up date with audit activity.';

commit;
