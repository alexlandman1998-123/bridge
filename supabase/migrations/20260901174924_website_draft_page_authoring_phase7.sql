begin;

drop policy if exists website_site_revisions_admin_access on public.website_site_revisions;
create policy website_site_revisions_admin_read
on public.website_site_revisions
for select
to authenticated
using (
  exists (
    select 1 from public.website_sites site
    where site.id = website_site_revisions.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

drop policy if exists website_pages_admin_access on public.website_pages;
create policy website_pages_admin_read
on public.website_pages
for select
to authenticated
using (
  exists (
    select 1 from public.website_sites site
    where site.id = website_pages.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

create policy website_pages_admin_insert_drafts
on public.website_pages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.website_sites site
    join public.website_site_revisions revision on revision.id = website_pages.revision_id
    where site.id = website_pages.website_site_id
      and revision.website_site_id = site.id
      and revision.status = 'draft'
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

create policy website_pages_admin_update_drafts
on public.website_pages
for update
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    join public.website_site_revisions revision on revision.id = website_pages.revision_id
    where site.id = website_pages.website_site_id
      and revision.website_site_id = site.id
      and revision.status = 'draft'
      and public.bridge_is_org_admin(site.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.website_sites site
    join public.website_site_revisions revision on revision.id = website_pages.revision_id
    where site.id = website_pages.website_site_id
      and revision.website_site_id = site.id
      and revision.status = 'draft'
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

create policy website_pages_admin_delete_drafts
on public.website_pages
for delete
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    join public.website_site_revisions revision on revision.id = website_pages.revision_id
    where site.id = website_pages.website_site_id
      and revision.website_site_id = site.id
      and revision.status = 'draft'
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

comment on policy website_pages_admin_insert_drafts on public.website_pages is
  'Organisation admins may author structured pages only inside an active draft revision.';
comment on policy website_pages_admin_update_drafts on public.website_pages is
  'Published and archived website pages are immutable through the authenticated client.';

commit;
