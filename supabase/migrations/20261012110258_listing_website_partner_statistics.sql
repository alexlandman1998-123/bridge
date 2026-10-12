-- Track and read explicitly granted partner website publications.
-- Preserve installed RPC bodies outside these corrections, including grants,
-- recruitment events, member/owner checks and completed-day portal statistics.
begin;
do $migration$
declare
  definition text;
  old_fragment text;
  new_fragment text;
begin
  definition := pg_get_functiondef(to_regprocedure('public.website_record_analytics_event(text,text,text,uuid)'));
  if definition is null then raise exception 'Missing prerequisite function public.website_record_analytics_event(text,text,text,uuid)'; end if;
  old_fragment := $old$    if p_listing_id is null or not exists (
      select 1 from public.website_listing_publications publication
      where publication.website_site_id = v_site_id
        and publication.listing_id = p_listing_id
        and publication.status = 'published'
    ) then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
$old$;
  new_fragment := $new$    if p_listing_id is null or not (exists (
      select 1 from public.website_listing_publications publication
      where publication.website_site_id = v_site_id
        and publication.listing_id = p_listing_id
        and publication.status = 'published'
    ) or exists (
      select 1 from public.website_partner_listing_publications publication
      join public.website_partner_listing_grants grant_row on grant_row.id=publication.grant_id
        and grant_row.website_site_id=publication.website_site_id
      join public.private_listings listing on listing.id=publication.listing_id
        and listing.organisation_id=grant_row.source_organisation_id
      where publication.website_site_id=v_site_id and publication.listing_id=p_listing_id
        and publication.status='published' and grant_row.enabled
    )) then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
$new$;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'Unexpected website statistics function body. Review the installed definition before applying.';
  end if;
  definition := replace(definition,old_fragment,new_fragment);
  execute definition;
  definition := pg_get_functiondef(to_regprocedure('public.listing_overview_performance(uuid,uuid,integer)'));
  if definition is null then raise exception 'Missing prerequisite function public.listing_overview_performance(uuid,uuid,integer)'; end if;
  old_fragment := $old$  view_days integer; website_views bigint;$old$;
  new_fragment := $new$  view_days integer; website_views bigint; site_ids uuid[]; today_views bigint;$new$;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'Unexpected website statistics function body. Review the installed definition before applying.';
  end if;
  definition := replace(definition,old_fragment,new_fragment);
  old_fragment := $old$  select count(*)>0,coalesce(bool_or(p.status='published' and s.status='published'),false)
    into site_mapped,site_published from public.website_listing_publications p join public.website_sites s on s.id=p.website_site_id
    where p.listing_id=p_listing_id and s.organisation_id=p_organisation_id;
  select sum(a.event_count) filter (where a.event_date between start_day and end_day),
    count(distinct a.event_date) filter (where a.event_date between start_day and end_day),max(a.updated_at)
    into website_views,view_days,tracked_at from public.website_analytics_daily a join public.website_sites s on s.id=a.website_site_id
    where a.listing_id=p_listing_id and s.organisation_id=p_organisation_id and a.event_type='listing_view' and a.event_date between previous_start and end_day;
  select count(distinct r.id) into enquiries from public.website_lead_submissions r join public.website_sites s on s.id=r.website_site_id
    where r.organisation_id=p_organisation_id and s.organisation_id=p_organisation_id and r.listing_id=p_listing_id
      and r.submission_type='property_enquiry' and r.status in ('received','routed','duplicate')
      and r.created_at >= (start_day::timestamp at time zone 'Africa/Johannesburg')
      and r.created_at < ((end_day+1)::timestamp at time zone 'Africa/Johannesburg');
$old$;
  new_fragment := $new$  select array_agg(distinct mapped.website_site_id),count(*)>0,coalesce(bool_or(mapped.published),false)
    into site_ids,site_mapped,site_published from (
      select p.website_site_id,(p.status='published' and s.status='published') as published
      from public.website_listing_publications p join public.website_sites s on s.id=p.website_site_id
      where p.listing_id=p_listing_id and s.organisation_id=p_organisation_id
      union all
      select p.website_site_id,(p.status='published' and s.status='published' and g.enabled)
      from public.website_partner_listing_publications p
      join public.website_partner_listing_grants g on g.id=p.grant_id and g.website_site_id=p.website_site_id
      join public.website_sites s on s.id=p.website_site_id
      where p.listing_id=p_listing_id and g.source_organisation_id=p_organisation_id
    ) mapped;
  select sum(a.event_count) filter (where a.event_date between start_day and end_day),
    count(distinct a.event_date) filter (where a.event_date between start_day and end_day),max(a.updated_at),
    sum(a.event_count) filter (where a.event_date=end_day+1)
    into website_views,view_days,tracked_at,today_views from public.website_analytics_daily a
    where a.listing_id=p_listing_id and a.website_site_id=any(coalesce(site_ids,array[]::uuid[]))
      and a.event_type='listing_view' and a.event_date between previous_start and end_day+1;
  select count(*) into enquiries from (
    select r.id from public.website_lead_submissions r
    join public.website_sites s on s.id=r.website_site_id and s.organisation_id=p_organisation_id
    where r.organisation_id=p_organisation_id and r.website_site_id=any(coalesce(site_ids,array[]::uuid[])) and r.listing_id=p_listing_id
      and r.submission_type='property_enquiry' and r.status in ('received','routed','duplicate')
      and r.created_at >= (start_day::timestamp at time zone 'Africa/Johannesburg')
      and r.created_at < ((end_day+1)::timestamp at time zone 'Africa/Johannesburg')
    union all
    select r.id from public.website_partner_lead_submissions r
    join public.website_partner_listing_grants g on g.id=r.grant_id and g.website_site_id=r.website_site_id
      and g.source_organisation_id=r.source_organisation_id
    where r.source_organisation_id=p_organisation_id and r.website_site_id=any(coalesce(site_ids,array[]::uuid[]))
      and r.listing_id=p_listing_id and r.status in ('received','routed','duplicate')
      and r.created_at >= (start_day::timestamp at time zone 'Africa/Johannesburg')
      and r.created_at < ((end_day+1)::timestamp at time zone 'Africa/Johannesburg')
  ) accepted;
$new$;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'Unexpected website statistics function body. Review the installed definition before applying.';
  end if;
  definition := replace(definition,old_fragment,new_fragment);
  old_fragment := $old$'views',website_views,'previousViews',null$old$;
  new_fragment := $new$'todayViews',today_views,'todayDate',end_day+1,'views',website_views,'previousViews',null$new$;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'Unexpected website statistics function body. Review the installed definition before applying.';
  end if;
  definition := replace(definition,old_fragment,new_fragment);
  execute definition;
end;
$migration$;
commit;
