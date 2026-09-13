begin;

alter table public.website_blog_posts
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists scheduled_for timestamptz,
  add column if not exists archived_at timestamptz,
  add constraint website_blog_posts_lifecycle_status_check check (lifecycle_status in ('draft', 'ready_for_review', 'scheduled', 'published', 'archived'));

alter table public.website_blog_posts
  add constraint website_blog_posts_schedule_check check (
    (lifecycle_status = 'scheduled' and scheduled_for is not null)
    or (lifecycle_status <> 'scheduled' and scheduled_for is null)
  );

update public.website_blog_posts
set lifecycle_status = case when status = 'published' then 'published' else 'draft' end;

create table public.website_blog_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  revision_id uuid not null references public.website_site_revisions(id) on delete cascade,
  from_slug text not null check (from_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  to_slug text not null check (to_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  unique (website_site_id, revision_id, from_slug)
);
alter table public.website_blog_slug_redirects enable row level security;
revoke all on public.website_blog_slug_redirects from public, anon;
grant select on public.website_blog_slug_redirects to authenticated;
create policy website_blog_slug_redirects_admin_read on public.website_blog_slug_redirects for select to authenticated using (public.bridge_is_org_admin(organisation_id));

create or replace function public.website_publish_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_result uuid;
begin
  v_result := public.website_publish_revision_core(p_website_site_id, p_revision_id);
  update public.website_blog_posts
  set status = 'published',
      published_at = coalesce(published_at, now()),
      lifecycle_status = case when lifecycle_status in ('archived', 'scheduled') then lifecycle_status else 'published' end
  where website_site_id = p_website_site_id and revision_id = v_result;
  return v_result;
end;
$$;

revoke all on function public.website_publish_revision(uuid, uuid) from public, anon;
grant execute on function public.website_publish_revision(uuid, uuid) to authenticated;

create or replace function public.website_manage_draft_blog_post(
  p_website_site_id uuid, p_revision_id uuid, p_post_id uuid, p_action text, p_scheduled_for timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_site public.website_sites%rowtype;
  v_post public.website_blog_posts%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_copy_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication is required to manage website articles.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_admin(v_site.organisation_id) then raise exception 'Only organisation administrators can manage website articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id and revision.status = 'draft') then raise exception 'Create an editable website draft before managing an article.' using errcode = 'P0002'; end if;
  select post.* into v_post from public.website_blog_posts post where post.id = p_post_id and post.website_site_id = v_site.id and post.revision_id = p_revision_id;
  if not found then raise exception 'This article is not in the editable website draft.' using errcode = 'P0002'; end if;
  if v_action = 'delete' then
    delete from public.website_blog_posts where id = v_post.id;
    return jsonb_build_object('deleted', true, 'id', p_post_id);
  end if;
  if v_action = 'duplicate' then
    v_copy_slug := left(v_post.slug || '-copy', 80);
    while exists (select 1 from public.website_blog_posts where website_site_id = v_site.id and revision_id = p_revision_id and slug = v_copy_slug) loop
      v_copy_slug := left(v_post.slug || '-' || substr(md5(random()::text), 1, 5), 80);
    end loop;
    insert into public.website_blog_posts (organisation_id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, content_blocks, author_name, status, lifecycle_status, seo_title, seo_description, created_by, updated_by)
    values (v_site.organisation_id, v_site.id, p_revision_id, left(v_post.title || ' (copy)', 160), v_copy_slug, v_post.summary, v_post.cover_image_url, v_post.cover_image_alt, v_post.body, v_post.content_blocks, v_post.author_name, 'draft', 'draft', v_post.seo_title, v_post.seo_description, auth.uid(), auth.uid()) returning * into v_post;
  elsif v_action in ('draft', 'ready_for_review', 'archive') then
    update public.website_blog_posts post set lifecycle_status = case when v_action = 'archive' then 'archived' else v_action end, scheduled_for = null, archived_at = case when v_action = 'archive' then now() else null end, updated_by = auth.uid(), updated_at = now() where post.id = v_post.id returning * into v_post;
  elsif v_action = 'schedule' then
    if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'Choose a future publication time.' using errcode = '22023'; end if;
    update public.website_blog_posts post set lifecycle_status = 'scheduled', scheduled_for = p_scheduled_for, archived_at = null, updated_by = auth.uid(), updated_at = now() where post.id = v_post.id returning * into v_post;
  else
    raise exception 'Choose a valid article action.' using errcode = '22023';
  end if;
  return jsonb_build_object('id', v_post.id, 'status', v_post.lifecycle_status, 'scheduledFor', v_post.scheduled_for, 'slug', v_post.slug);
end;
$$;

revoke all on function public.website_manage_draft_blog_post(uuid,uuid,uuid,text,timestamptz) from public, anon;
grant execute on function public.website_manage_draft_blog_post(uuid,uuid,uuid,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
