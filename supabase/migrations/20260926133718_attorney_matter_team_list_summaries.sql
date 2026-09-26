begin;

-- One scoped read for the visible matter page, avoiding an RPC per table row.
-- Full firm member details still come from bridge_get_attorney_matter_team only
-- when the chooser opens. Never return another firm's team through this RPC.
create or replace function public.bridge_list_attorney_matter_team_summaries(
  p_transaction_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_transaction_ids, 1), 0) > 100 then
    raise exception 'Select at most 100 matters per page.' using errcode = '22023';
  end if;

  with visible as (
    select distinct on (assignment.transaction_id)
      assignment.transaction_id,
      coalesce(assignment.attorney_firm_id, assignment.firm_id) as firm_id,
      coalesce(assignment.primary_attorney_id, assignment.attorney_user_id, assignment.assigned_user_id) as primary_user_id
    from unnest(coalesce(p_transaction_ids, array[]::uuid[])) requested(transaction_id)
    join public.transaction_attorney_assignments assignment
      on assignment.transaction_id = requested.transaction_id
    join public.attorney_firm_members viewer
      on viewer.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
     and viewer.user_id = auth.uid() and viewer.status = 'active'
    where coalesce(assignment.assignment_status, assignment.status) in ('pending', 'active', 'paused')
      and public.bridge_attorney_matter_team_access(
        assignment.transaction_id,
        coalesce(assignment.attorney_firm_id, assignment.firm_id),
        'view'
      )
    order by assignment.transaction_id,
      case when assignment.attorney_role = 'transfer_attorney' then 0 else 1 end,
      assignment.is_primary desc nulls last,
      assignment.created_at desc
  )
  select coalesce(jsonb_object_agg(visible.transaction_id::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', team.user_id,
        'name', coalesce(nullif(trim(profile.full_name), ''),
          nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
          profile.email, 'Team member'),
        'email', coalesce(profile.email, ''),
        'avatarUrl', profile.avatar_url,
        'role', coalesce(member.professional_role, member.role)
      ) order by case when team.user_id = visible.primary_user_id then 0 else 1 end,
        coalesce(profile.full_name, profile.email), team.user_id)
      from public.attorney_matter_team_members team
      join public.attorney_firm_members member
        on member.firm_id = team.firm_id and member.user_id = team.user_id
       and member.status = 'active'
      left join public.profiles profile on profile.id = team.user_id
      where team.transaction_id = visible.transaction_id
        and team.firm_id = visible.firm_id
        and team.removed_at is null
    ), '[]'::jsonb)
  ), '{}'::jsonb)
  into v_result
  from visible;

  return v_result;
end;
$$;

revoke all on function public.bridge_list_attorney_matter_team_summaries(uuid[])
  from public, anon;
grant execute on function public.bridge_list_attorney_matter_team_summaries(uuid[])
  to authenticated;

notify pgrst, 'reload schema';
commit;
