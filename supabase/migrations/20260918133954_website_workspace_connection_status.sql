-- Keep the Website workspace's access check to one bounded, authorised lookup.
-- The browser must not wait on several protected table reads before it can
-- tell an agency whether website tools are available.
create or replace function public.website_workspace_connection_status(
  p_organisation_id uuid
)
returns table (
  access_state text,
  pilot_status text,
  production_release_status text,
  production_release_candidate_url text,
  production_dark_launch_status text,
  production_dark_launch_candidate_url text,
  site_id uuid,
  preview_slug text,
  site_status text,
  template_key text,
  published_revision_id uuid,
  site_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null or not public.bridge_is_org_member(p_organisation_id) then
    raise exception 'You do not have access to this website workspace.' using errcode = '42501';
  end if;

  return query
  with connection as (
    select
      (select enrolment.status from public.website_pilot_enrolments enrolment where enrolment.organisation_id = p_organisation_id) as pilot_status,
      (select release.status from public.website_production_releases release where release.organisation_id = p_organisation_id) as production_release_status,
      (select release.candidate_deployment_url from public.website_production_releases release where release.organisation_id = p_organisation_id) as production_release_candidate_url,
      (select launch.status from public.website_production_dark_launches launch where launch.organisation_id = p_organisation_id) as production_dark_launch_status,
      (select launch.candidate_deployment_url from public.website_production_dark_launches launch where launch.organisation_id = p_organisation_id) as production_dark_launch_candidate_url
  ), site as (
    select id, preview_slug, status, template_key, published_revision_id, updated_at
    from public.website_sites
    where organisation_id = p_organisation_id
  )
  select
    case
      when connection.pilot_status = 'active'
        or connection.production_release_status in ('approved', 'active', 'paused')
        or connection.production_dark_launch_status in ('prepared', 'active', 'paused')
        then 'available'
      when connection.pilot_status is not null then 'pilot_paused'
      else 'unavailable'
    end,
    connection.pilot_status,
    connection.production_release_status,
    connection.production_release_candidate_url,
    connection.production_dark_launch_status,
    connection.production_dark_launch_candidate_url,
    site.id,
    site.preview_slug,
    site.status,
    site.template_key,
    site.published_revision_id,
    site.updated_at
  from connection
  left join site on true;
end;
$$;

revoke all on function public.website_workspace_connection_status(uuid) from public, anon;
grant execute on function public.website_workspace_connection_status(uuid) to authenticated, service_role;
