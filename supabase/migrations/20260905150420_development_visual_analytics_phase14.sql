create table if not exists public.development_visual_events (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (event_type in (
    'scene_viewed', 'hotspot_selected', 'unit_opened', 'floor_plan_viewed',
    'shortlisted', 'compared', 'enquiry_started', 'journey_abandoned',
    'fallback_encountered'
  )),
  scene_id text,
  unit_id text,
  viewport text not null default 'desktop' check (viewport in ('desktop', 'tablet', 'mobile')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint development_visual_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint development_visual_events_metadata_size check (pg_column_size(metadata) <= 4096)
);

create index if not exists development_visual_events_development_occurred_idx
  on public.development_visual_events (development_id, occurred_at desc);
create index if not exists development_visual_events_session_idx
  on public.development_visual_events (development_id, session_id, occurred_at desc);
create index if not exists development_visual_events_scene_idx
  on public.development_visual_events (development_id, scene_id, event_type)
  where scene_id is not null;
create index if not exists development_visual_events_unit_idx
  on public.development_visual_events (development_id, unit_id, event_type)
  where unit_id is not null;

alter table public.development_visual_events enable row level security;

drop policy if exists development_visual_events_member_select on public.development_visual_events;
create policy development_visual_events_member_select
on public.development_visual_events
for select to authenticated
using (public.bridge_can_manage_development_record(development_id));

revoke all on table public.development_visual_events from anon, authenticated;
grant select on table public.development_visual_events to authenticated;

create or replace function public.record_public_development_visual_events(
  requested_slug text,
  requested_session_id uuid,
  requested_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_development_id uuid;
  inserted_count integer := 0;
  recent_count integer := 0;
begin
  if requested_session_id is null
     or length(trim(coalesce(requested_slug, ''))) not between 1 and 180
     or jsonb_typeof(requested_events) <> 'array'
     or jsonb_array_length(requested_events) < 1
     or jsonb_array_length(requested_events) > 25 then
    raise exception 'Invalid analytics batch.' using errcode = '22023';
  end if;

  select d.id into target_development_id
  from public.developments d
  join public.development_profiles p on p.development_id = d.id
  where lower(p.marketing_content #>> '{listingConfiguration,listingSlug}') = lower(trim(requested_slug))
    and coalesce((p.marketing_content #>> '{listingConfiguration,publicVisibility}')::boolean, false)
    and lower(coalesce(p.marketing_content #>> '{listingConfiguration,marketingStatus}', 'draft')) = 'live'
  limit 1;

  if target_development_id is null then
    raise exception 'Published development not found.' using errcode = 'P0002';
  end if;

  select count(*) into recent_count
  from public.development_visual_events e
  where e.development_id = target_development_id
    and e.session_id = requested_session_id
    and e.occurred_at > now() - interval '1 minute';

  if recent_count >= 120 then return 0; end if;

  insert into public.development_visual_events (
    development_id, session_id, event_type, scene_id, unit_id, viewport, metadata, occurred_at
  )
  select
    target_development_id,
    requested_session_id,
    item->>'eventType',
    nullif(left(trim(item->>'sceneId'), 160), ''),
    nullif(left(trim(item->>'unitId'), 160), ''),
    case when item->>'viewport' in ('desktop', 'tablet', 'mobile') then item->>'viewport' else 'desktop' end,
    case when jsonb_typeof(item->'metadata') = 'object'
      then (item->'metadata') - array['email', 'phone', 'name', 'url']
      else '{}'::jsonb
    end,
    now()
  from jsonb_array_elements(requested_events) item
  where item->>'eventType' in (
    'scene_viewed', 'hotspot_selected', 'unit_opened', 'floor_plan_viewed',
    'shortlisted', 'compared', 'enquiry_started', 'journey_abandoned',
    'fallback_encountered'
  )
    and (item->'metadata' is null or pg_column_size(item->'metadata') <= 4096)
  limit greatest(0, least(25, 120 - recent_count));

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.record_public_development_visual_events(text, uuid, jsonb) from public;
grant execute on function public.record_public_development_visual_events(text, uuid, jsonb) to anon, authenticated;

create or replace function public.get_development_visual_analytics(
  requested_development_id uuid,
  requested_days integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped as (
    select *
    from public.development_visual_events e
    where e.development_id = requested_development_id
      and e.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(requested_days, 30), 365)))
  ), summary as (
    select
      count(distinct session_id) sessions,
      count(*) filter (where event_type = 'scene_viewed') scene_views,
      count(*) filter (where event_type = 'unit_opened') unit_opens,
      count(*) filter (where event_type = 'enquiry_started') enquiries,
      count(*) filter (where event_type = 'fallback_encountered') fallbacks,
      count(*) filter (where event_type = 'journey_abandoned') abandonments
    from scoped
  )
  select jsonb_build_object(
    'periodDays', greatest(1, least(coalesce(requested_days, 30), 365)),
    'summary', jsonb_build_object(
      'sessions', summary.sessions,
      'sceneViews', summary.scene_views,
      'unitOpens', summary.unit_opens,
      'enquiries', summary.enquiries,
      'fallbacks', summary.fallbacks,
      'abandonments', summary.abandonments,
      'enquiryRate', case when summary.sessions > 0 then round(summary.enquiries::numeric * 100 / summary.sessions, 1) else 0 end
    ),
    'scenes', coalesce((select jsonb_agg(row_data order by views desc) from (
      select scene_id as id, max(metadata->>'sceneName') as name,
        count(*) filter (where event_type = 'scene_viewed') as views,
        count(*) filter (where event_type = 'enquiry_started') as enquiries,
        count(*) filter (where event_type = 'fallback_encountered') as fallbacks
      from scoped where scene_id is not null group by scene_id order by views desc limit 20
    ) row_data), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(row_data order by opens desc) from (
      select unit_id as id, max(metadata->>'unitNumber') as unit_number,
        count(*) filter (where event_type = 'unit_opened') as opens,
        count(*) filter (where event_type = 'shortlisted') as shortlists
      from scoped where unit_id is not null group by unit_id order by opens desc limit 20
    ) row_data), '[]'::jsonb),
    'dropoffs', coalesce((select jsonb_agg(row_data order by abandonments desc) from (
      select scene_id as id, max(metadata->>'sceneName') as name, count(*) as abandonments
      from scoped where event_type = 'journey_abandoned' and scene_id is not null group by scene_id order by abandonments desc limit 20
    ) row_data), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(row_data order by sessions desc) from (
      select viewport as device, count(distinct session_id) as sessions from scoped group by viewport
    ) row_data), '[]'::jsonb)
  )
  from summary;
$$;

revoke execute on function public.get_development_visual_analytics(uuid, integer) from public, anon;
grant execute on function public.get_development_visual_analytics(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
