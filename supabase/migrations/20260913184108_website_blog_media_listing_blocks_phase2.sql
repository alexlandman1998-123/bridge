begin;

create table public.website_media_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  storage_path text not null,
  public_url text not null check (public_url ~* '^https://[^[:space:]]+$'),
  alt_text text not null default '' check (char_length(alt_text) <= 240),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (website_site_id, storage_path)
);
alter table public.website_media_assets enable row level security;
revoke all on public.website_media_assets from public, anon;
grant select, insert, update, delete on public.website_media_assets to authenticated;
create policy website_media_assets_org_access on public.website_media_assets for all to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id) and organisation_id = (select organisation_id from public.website_sites where id = website_site_id));

create table public.website_blog_listing_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  website_blog_post_id uuid not null references public.website_blog_posts(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (website_blog_post_id, listing_id)
);
alter table public.website_blog_listing_links enable row level security;
revoke all on public.website_blog_listing_links from public, anon;
grant select, insert, update, delete on public.website_blog_listing_links to authenticated;
create policy website_blog_listing_links_org_access on public.website_blog_listing_links for all to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

comment on table public.website_media_assets is 'Organisation-scoped website image assets. Alt text is mandatory before a referenced asset can be published.';
comment on table public.website_blog_listing_links is 'Live listing references for website article cards; listing details are never copied into the post.';
notify pgrst, 'reload schema';
commit;
