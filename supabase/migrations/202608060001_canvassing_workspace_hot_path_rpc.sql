begin;

create index if not exists canvassing_prospects_org_created_idx
  on public.canvassing_prospects (organisation_id, created_at desc)
  where coalesce(is_demo_data, false) = false;

create index if not exists canvassing_activities_org_date_live_idx
  on public.canvassing_activities (organisation_id, activity_date desc)
  where coalesce(is_demo_data, false) = false;

create or replace function public.bridge_list_canvassing_workspace(
  p_organisation_id uuid,
  p_prospect_limit integer default 5000,
  p_activity_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prospect_limit integer := least(greatest(coalesce(p_prospect_limit, 5000), 1), 10000);
  v_activity_limit integer := least(greatest(coalesce(p_activity_limit, 5000), 1), 10000);
  v_prospects jsonb := '[]'::jsonb;
  v_activities jsonb := '[]'::jsonb;
begin
  if p_organisation_id is null then
    return jsonb_build_object(
      'prospects', '[]'::jsonb,
      'activities', '[]'::jsonb,
      'persistence', 'none',
      'syncedAt', now()
    );
  end if;

  if not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Active organisation membership is required to load canvassing data.'
      using errcode = '42501';
  end if;

  with prospect_rows as (
    select prospect.*
    from public.canvassing_prospects prospect
    where prospect.organisation_id = p_organisation_id
      and coalesce(prospect.is_demo_data, false) = false
    order by prospect.created_at desc
    limit v_prospect_limit
  )
  select coalesce(jsonb_agg(to_jsonb(prospect_rows) order by prospect_rows.created_at desc), '[]'::jsonb)
    into v_prospects
  from prospect_rows;

  with prospect_ids as (
    select (prospect ->> 'id')::uuid as id
    from jsonb_array_elements(v_prospects) prospect
  ),
  activity_rows as (
    select activity.*
    from public.canvassing_activities activity
    where activity.organisation_id = p_organisation_id
      and coalesce(activity.is_demo_data, false) = false
      and exists (
        select 1
        from prospect_ids
        where prospect_ids.id = activity.prospect_id
      )
    order by activity.activity_date desc
    limit v_activity_limit
  )
  select coalesce(jsonb_agg(to_jsonb(activity_rows) order by activity_rows.activity_date desc), '[]'::jsonb)
    into v_activities
  from activity_rows;

  return jsonb_build_object(
    'prospects', v_prospects,
    'activities', v_activities,
    'persistence', 'supabase',
    'syncedAt', now(),
    'truncated', jsonb_array_length(v_prospects) >= v_prospect_limit or jsonb_array_length(v_activities) >= v_activity_limit
  );
end;
$$;

grant execute on function public.bridge_list_canvassing_workspace(uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
