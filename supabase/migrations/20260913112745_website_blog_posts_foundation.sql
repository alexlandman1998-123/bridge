begin;

create table public.website_blog_posts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  revision_id uuid references public.website_site_revisions(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 80),
  summary text not null default '' check (char_length(summary) <= 600),
  cover_image_url text,
  cover_image_alt text,
  body text not null default '' check (char_length(body) <= 50000),
  author_name text not null default '' check (char_length(author_name) <= 160),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  seo_title text check (char_length(seo_title) <= 180),
  seo_description text check (char_length(seo_description) <= 320),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_blog_posts_cover_image_check check (
    cover_image_url is null or cover_image_url ~* '^https://[^[:space:]]+$'
  ),
  constraint website_blog_posts_cover_alt_check check (
    (cover_image_url is null and cover_image_alt is null)
    or (cover_image_url is not null and char_length(trim(coalesce(cover_image_alt, ''))) between 1 and 240)
  ),
  constraint website_blog_posts_published_at_check check (
    (status = 'draft' and published_at is null) or (status = 'published' and published_at is not null)
  )
);

create unique index website_blog_posts_site_slug_unique_idx on public.website_blog_posts (website_site_id, slug);
create index website_blog_posts_site_status_published_idx on public.website_blog_posts (website_site_id, status, published_at desc nulls last);

create trigger website_blog_posts_updated_at before update on public.website_blog_posts
for each row execute function public.set_updated_at_timestamp();

alter table public.website_blog_posts enable row level security;
revoke all on table public.website_blog_posts from public, anon;
grant select, insert, update, delete on table public.website_blog_posts to authenticated;

create policy website_blog_posts_admin_select on public.website_blog_posts for select to authenticated
using (public.bridge_is_org_admin(organisation_id));
create policy website_blog_posts_admin_insert on public.website_blog_posts for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id) and created_by = auth.uid() and updated_by = auth.uid() and organisation_id = (select organisation_id from public.website_sites where id = website_site_id));
create policy website_blog_posts_admin_update on public.website_blog_posts for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id) and organisation_id = (select organisation_id from public.website_sites where id = website_site_id) and updated_by = auth.uid());
create policy website_blog_posts_admin_delete on public.website_blog_posts for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));

comment on table public.website_blog_posts is 'Organisation-scoped website journal posts. Only published posts may be served by the public website.';
notify pgrst, 'reload schema';
commit;
