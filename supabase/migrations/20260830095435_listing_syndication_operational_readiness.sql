begin;

create index if not exists listing_background_jobs_syndication_health_idx
  on public.listing_background_jobs (
    organisation_id,
    job_type,
    (coalesce(payload ->> 'environment', 'sandbox')),
    created_at desc
  )
  where job_type in ('property24_publish', 'private_property_publish');

create or replace function public.bridge_listing_syndication_health_v1(
  p_listing_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_organisation_id uuid;
  v_result jsonb;
begin
  select organisation_id into v_organisation_id
  from public.private_listings
  where id = p_listing_id;

  if v_organisation_id is null or not public.bridge_is_org_admin(v_organisation_id) then
    raise exception 'Organisation administrator access is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'listingId', p_listing_id,
    'total', count(*),
    'active', count(*) filter (where status in ('queued', 'processing', 'retry_scheduled')),
    'completed', count(*) filter (where status = 'completed'),
    'manualReview', count(*) filter (where status = 'manual_review'),
    'failed', count(*) filter (where status = 'failed'),
    'productionAttempts', count(*) filter (where payload ->> 'environment' = 'production'),
    'lastAttemptAt', max(created_at),
    'lastCompletedAt', max(completed_at),
    'providers', jsonb_build_object(
      'property24', count(*) filter (where job_type = 'property24_publish'),
      'privateProperty', count(*) filter (where job_type = 'private_property_publish')
    )
  ) into v_result
  from public.listing_background_jobs
  where organisation_id = v_organisation_id
    and listing_id = p_listing_id
    and job_type in ('property24_publish', 'private_property_publish');

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.bridge_listing_syndication_health_v1(uuid) from public, anon;
grant execute on function public.bridge_listing_syndication_health_v1(uuid) to authenticated;

commit;
