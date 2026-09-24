begin;

-- The public website is a shared application, so tenant scope must hold even
-- when a trusted server process bypasses RLS. These triggers prevent an
-- organisation, site, revision, listing, or page from being mixed across
-- agencies by an import, RPC, or future server-side code path.

create or replace function public.website_assert_tenant_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_site_organisation_id uuid;
  v_related_organisation_id uuid;
  v_related_site_id uuid;
begin
  if tg_table_name = 'website_listing_publications' then
    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;
    select organisation_id into v_related_organisation_id from public.private_listings where id = new.listing_id;
    if v_site_organisation_id is null or v_related_organisation_id is distinct from v_site_organisation_id then
      raise exception 'Website listing publication must belong to the website organisation.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'website_lead_submissions' then
    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;
    if v_site_organisation_id is null or new.organisation_id is distinct from v_site_organisation_id then
      raise exception 'Website lead submission organisation must match its website.' using errcode = '23514';
    end if;
    if new.listing_id is not null and not exists (
      select 1 from public.private_listings where id = new.listing_id and organisation_id = v_site_organisation_id
    ) then
      raise exception 'Website lead listing must belong to the website organisation.' using errcode = '23514';
    end if;
    if new.page_id is not null and not exists (
      select 1 from public.website_pages page
      join public.website_site_revisions revision on revision.id = page.revision_id and revision.website_site_id = new.website_site_id
      where page.id = new.page_id and page.website_site_id = new.website_site_id
    ) then
      raise exception 'Website lead page must belong to the website and one of its revisions.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'website_preapproval_applications' then
    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;
    if v_site_organisation_id is null or new.organisation_id is distinct from v_site_organisation_id then
      raise exception 'Website preapproval application organisation must match its website.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.partner_routing_rules rule
      where rule.id = new.routing_rule_id
        and rule.source_organisation_id = v_site_organisation_id
        and rule.target_organisation_id = new.allocated_organisation_id
        and rule.target_user_id = new.allocated_originator_id
    ) then
      raise exception 'Website preapproval routing rule must match the website organisation and allocated recipient.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'website_pages' then
    select website_site_id into v_related_site_id from public.website_site_revisions where id = new.revision_id;
    if v_related_site_id is distinct from new.website_site_id then
      raise exception 'Website page revision must belong to the same website.' using errcode = '23514';
    end if;
  elsif tg_table_name in ('website_blog_posts', 'website_media_assets', 'website_blog_slug_redirects') then
    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;
    if v_site_organisation_id is null or new.organisation_id is distinct from v_site_organisation_id then
      raise exception 'Website content organisation must match its website.' using errcode = '23514';
    end if;
    if tg_table_name in ('website_blog_posts', 'website_blog_slug_redirects') then
      select website_site_id into v_related_site_id from public.website_site_revisions where id = new.revision_id;
      if v_related_site_id is distinct from new.website_site_id then
        raise exception 'Website content revision must belong to the same website.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'website_blog_listing_links' then
    select organisation_id into v_related_organisation_id from public.website_blog_posts where id = new.website_blog_post_id;
    if v_related_organisation_id is null or new.organisation_id is distinct from v_related_organisation_id then
      raise exception 'Website article listing link organisation must match its article.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.private_listings where id = new.listing_id and organisation_id = new.organisation_id) then
      raise exception 'Website article listing link must reference a listing in the same organisation.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'website_analytics_daily' and new.listing_id is not null then
    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;
    if not exists (select 1 from public.private_listings where id = new.listing_id and organisation_id = v_site_organisation_id) then
      raise exception 'Website analytics listing must belong to the website organisation.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.website_assert_tenant_boundary() is
  'Defence-in-depth tenant invariant for public website records; enforced for all writers, including service-role processes.';

drop trigger if exists trg_website_listing_publications_tenant_boundary on public.website_listing_publications;
create trigger trg_website_listing_publications_tenant_boundary
before insert or update of website_site_id, listing_id on public.website_listing_publications
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_pages_tenant_boundary on public.website_pages;
create trigger trg_website_pages_tenant_boundary
before insert or update of website_site_id, revision_id on public.website_pages
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_lead_submissions_tenant_boundary on public.website_lead_submissions;
create trigger trg_website_lead_submissions_tenant_boundary
before insert or update of website_site_id, organisation_id, listing_id, page_id on public.website_lead_submissions
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_preapproval_applications_tenant_boundary on public.website_preapproval_applications;
create trigger trg_website_preapproval_applications_tenant_boundary
before insert or update of website_site_id, organisation_id, routing_rule_id, allocated_originator_id, allocated_organisation_id on public.website_preapproval_applications
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_blog_posts_tenant_boundary on public.website_blog_posts;
create trigger trg_website_blog_posts_tenant_boundary
before insert or update of organisation_id, website_site_id, revision_id on public.website_blog_posts
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_media_assets_tenant_boundary on public.website_media_assets;
create trigger trg_website_media_assets_tenant_boundary
before insert or update of organisation_id, website_site_id on public.website_media_assets
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_blog_slug_redirects_tenant_boundary on public.website_blog_slug_redirects;
create trigger trg_website_blog_slug_redirects_tenant_boundary
before insert or update of organisation_id, website_site_id, revision_id on public.website_blog_slug_redirects
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_blog_listing_links_tenant_boundary on public.website_blog_listing_links;
create trigger trg_website_blog_listing_links_tenant_boundary
before insert or update of organisation_id, website_blog_post_id, listing_id on public.website_blog_listing_links
for each row execute function public.website_assert_tenant_boundary();

drop trigger if exists trg_website_analytics_daily_tenant_boundary on public.website_analytics_daily;
create trigger trg_website_analytics_daily_tenant_boundary
before insert or update of website_site_id, listing_id on public.website_analytics_daily
for each row execute function public.website_assert_tenant_boundary();

-- Surface historic drift before promotion. This query is intentionally
-- read-only; migration application does not alter or delete any tenant data.
create or replace view public.website_tenant_boundary_violations
with (security_invoker = true)
as
  select 'website_listing_publications'::text as source, publication.id, publication.website_site_id, site.organisation_id as expected_organisation_id, listing.organisation_id as actual_organisation_id
  from public.website_listing_publications publication
  join public.website_sites site on site.id = publication.website_site_id
  join public.private_listings listing on listing.id = publication.listing_id
  where listing.organisation_id is distinct from site.organisation_id
union all
  select 'website_lead_submissions', submission.id, submission.website_site_id, site.organisation_id, submission.organisation_id
  from public.website_lead_submissions submission
  join public.website_sites site on site.id = submission.website_site_id
  where submission.organisation_id is distinct from site.organisation_id
union all
  select 'website_blog_posts', post.id, post.website_site_id, site.organisation_id, post.organisation_id
  from public.website_blog_posts post
  join public.website_sites site on site.id = post.website_site_id
  where post.organisation_id is distinct from site.organisation_id
union all
  select 'website_media_assets', asset.id, asset.website_site_id, site.organisation_id, asset.organisation_id
  from public.website_media_assets asset
  join public.website_sites site on site.id = asset.website_site_id
  where asset.organisation_id is distinct from site.organisation_id
union all
  select 'website_blog_slug_redirects', redirect.id, redirect.website_site_id, site.organisation_id, redirect.organisation_id
  from public.website_blog_slug_redirects redirect
  join public.website_sites site on site.id = redirect.website_site_id
  where redirect.organisation_id is distinct from site.organisation_id;

revoke all on public.website_tenant_boundary_violations from public, anon;
grant select on public.website_tenant_boundary_violations to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
