begin;

create or replace function public.arch9_admin_inbound_leads_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads jsonb;
  v_activities jsonb;
  v_owners jsonb;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_leads
  from (
    select
      lead.*,
      owner.email as owner_email,
      owner.full_name as owner_name
    from public.inbound_leads lead
    left join public.profiles owner on owner.id = lead.owner_id
    order by lead.created_at desc
    limit 1000
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_activities
  from (
    select
      activity.*,
      actor.email as actor_email,
      actor.full_name as actor_name
    from public.inbound_lead_activities activity
    left join public.profiles actor on actor.id = activity.actor_user_id
    order by activity.created_at desc
    limit 1000
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.full_name nulls last, row_data.email), '[]'::jsonb)
    into v_owners
  from (
    select
      id,
      full_name,
      email,
      role,
      coalesce(nullif(trim(system_role), ''), 'active') as status
    from public.profiles
    order by full_name nulls last, email
    limit 200
  ) row_data;

  return jsonb_build_object(
    'generatedAt', now(),
    'leads', coalesce(v_leads, '[]'::jsonb),
    'activities', coalesce(v_activities, '[]'::jsonb),
    'owners', coalesce(v_owners, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.arch9_admin_inbound_leads_snapshot() from public, anon, authenticated;
grant execute on function public.arch9_admin_inbound_leads_snapshot() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
