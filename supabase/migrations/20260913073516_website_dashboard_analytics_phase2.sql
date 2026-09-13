-- Phase 2 is intentionally limited to completed website-submission evidence.
-- Visit and page-view tracking is added separately in Phase 3.
create or replace function public.website_dashboard_analytics(
  p_website_site_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_site public.website_sites%rowtype;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := pg_catalog.date_trunc('day', pg_catalog.now()) - ((greatest(1, least(coalesce(p_days, 30), 90)) - 1) * interval '1 day');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id;

  if v_site.id is null or not public.bridge_has_organisation_membership(v_site.organisation_id) then
    raise exception 'Not authorised for this website.' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'windowDays', v_days,
    'submissions', (
      select pg_catalog.count(*)
      from public.website_lead_submissions submission
      where submission.website_site_id = v_site.id
        and submission.created_at >= v_since
        and submission.status in ('received', 'routed', 'duplicate')
    ),
    'leadsCreated', (
      select pg_catalog.count(distinct submission.lead_id)
      from public.website_lead_submissions submission
      where submission.website_site_id = v_site.id
        and submission.created_at >= v_since
        and submission.lead_id is not null
        and submission.status = 'routed'
    ),
    'valuationRequests', (
      select pg_catalog.count(*)
      from public.website_lead_submissions submission
      where submission.website_site_id = v_site.id
        and submission.created_at >= v_since
        and submission.submission_type = 'valuation_request'
        and submission.status in ('received', 'routed', 'duplicate')
    ),
    'dailySubmissions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date', daily.day, 'submissions', daily.submissions) order by daily.day)
      from (
        select pg_catalog.to_char(pg_catalog.date_trunc('day', submission.created_at), 'YYYY-MM-DD') as day,
          pg_catalog.count(*) as submissions
        from public.website_lead_submissions submission
        where submission.website_site_id = v_site.id
          and submission.created_at >= v_since
          and submission.status in ('received', 'routed', 'duplicate')
        group by 1
      ) daily
    ), '[]'::jsonb),
    'topPages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('label', ranked.label, 'submissions', ranked.submissions) order by ranked.submissions desc, ranked.label)
      from (
        select coalesce(nullif(page.title, ''), 'Property enquiry') as label, pg_catalog.count(*) as submissions
        from public.website_lead_submissions submission
        left join public.website_pages page on page.id = submission.page_id
        where submission.website_site_id = v_site.id
          and submission.created_at >= v_since
          and submission.status in ('received', 'routed', 'duplicate')
        group by 1
        order by 2 desc, 1
        limit 5
      ) ranked
    ), '[]'::jsonb),
    'recentSubmissions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', recent.id,
        'submissionType', recent.submission_type,
        'status', recent.status,
        'createdAt', recent.created_at,
        'leadId', recent.lead_id
      ) order by recent.created_at desc)
      from (
        select submission.id, submission.submission_type, submission.status, submission.created_at, submission.lead_id
        from public.website_lead_submissions submission
        where submission.website_site_id = v_site.id
          and submission.created_at >= v_since
        order by submission.created_at desc
        limit 8
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.website_dashboard_analytics(uuid, integer) from public, anon;
grant execute on function public.website_dashboard_analytics(uuid, integer) to authenticated;

comment on function public.website_dashboard_analytics(uuid, integer) is
  'Organisation-scoped aggregate website submission analytics. It deliberately excludes visitor and page-view metrics until first-party event capture exists.';
