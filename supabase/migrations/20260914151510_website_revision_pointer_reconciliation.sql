begin;

-- Older website publishing paths could leave more than one revision marked as
-- published, or leave the site's pointer on an older one.  That makes every
-- later revision write fail the invariant trigger.  Prefer the existing valid
-- pointer (it is what visitors currently see); otherwise use the newest
-- published revision for that site.  Other accidental published revisions are
-- retained as archived history, never deleted.
do $reconcile$
begin
  if exists (
    select 1
    from public.website_sites site
    where site.status in ('published', 'suspended')
      and not exists (
        select 1
        from public.website_site_revisions revision
        where revision.website_site_id = site.id
          and revision.status = 'published'
      )
  ) then
    raise exception 'Cannot reconcile a published website without a published revision';
  end if;
end;
$reconcile$;

with candidates as (
  select
    site.id as website_site_id,
    coalesce(
      (
        select revision.id
        from public.website_site_revisions revision
        where revision.id = site.published_revision_id
          and revision.website_site_id = site.id
          and revision.status = 'published'
      ),
      (
        select revision.id
        from public.website_site_revisions revision
        where revision.website_site_id = site.id
          and revision.status = 'published'
        order by revision.revision_number desc, revision.updated_at desc, revision.id desc
        limit 1
      )
    ) as chosen_revision_id
  from public.website_sites site
  where exists (
    select 1
    from public.website_site_revisions revision
    where revision.website_site_id = site.id
      and revision.status = 'published'
  )
), archived as (
  update public.website_site_revisions revision
  set status = 'archived',
      archived_at = coalesce(revision.archived_at, now()),
      updated_at = now()
  from candidates candidate
  where revision.website_site_id = candidate.website_site_id
    and revision.status = 'published'
    and revision.id <> candidate.chosen_revision_id
  returning revision.website_site_id
)
update public.website_sites site
set published_revision_id = candidate.chosen_revision_id,
    updated_at = now()
from candidates candidate
where site.id = candidate.website_site_id
  and site.published_revision_id is distinct from candidate.chosen_revision_id;

-- Enforce the same repairable shape for all future editor operations: one
-- published revision per site, and the site pointer always names it.  The
-- existing deferred trigger remains the final invariant check.
create unique index if not exists website_site_revisions_one_published_per_site_idx
  on public.website_site_revisions (website_site_id)
  where status = 'published';

commit;
