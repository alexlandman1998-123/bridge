begin;

create table if not exists public.website_sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  template_key text not null default 'property-standard-v1'
    check (template_key in ('property-standard-v1')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'suspended')),
  preview_slug text not null,
  locale text not null default 'en-ZA',
  currency_code text not null default 'ZAR'
    check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_sites_preview_slug_check check (
    preview_slug = lower(preview_slug)
    and preview_slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  )
);

create unique index if not exists website_sites_preview_slug_unique_idx
  on public.website_sites (preview_slug);
create index if not exists website_sites_organisation_status_idx
  on public.website_sites (organisation_id, status);

create table if not exists public.website_domains (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  hostname text not null,
  domain_kind text not null default 'custom'
    check (domain_kind in ('preview', 'custom')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'active', 'failed', 'disabled')),
  is_primary boolean not null default false,
  dns_instructions jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_domains_hostname_check check (
    hostname = lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  constraint website_domains_dns_instructions_object_check check (jsonb_typeof(dns_instructions) = 'object')
);

create unique index if not exists website_domains_hostname_unique_idx
  on public.website_domains (lower(hostname));
create unique index if not exists website_domains_primary_per_site_unique_idx
  on public.website_domains (website_site_id)
  where is_primary;
create index if not exists website_domains_site_status_idx
  on public.website_domains (website_site_id, status);

create table if not exists public.website_site_revisions (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  brand_json jsonb not null default '{}'::jsonb,
  seo_json jsonb not null default '{}'::jsonb,
  navigation_json jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_site_revisions_number_unique unique (website_site_id, revision_number),
  constraint website_site_revisions_brand_object_check check (jsonb_typeof(brand_json) = 'object'),
  constraint website_site_revisions_seo_object_check check (jsonb_typeof(seo_json) = 'object'),
  constraint website_site_revisions_navigation_array_check check (jsonb_typeof(navigation_json) = 'array')
);

create unique index if not exists website_site_revisions_one_published_per_site_unique_idx
  on public.website_site_revisions (website_site_id)
  where status = 'published';

create table if not exists public.website_pages (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  revision_id uuid references public.website_site_revisions(id) on delete cascade,
  page_kind text not null
    check (page_kind in ('home', 'about', 'contact', 'valuation', 'campaign')),
  slug text not null default '',
  title text not null,
  seo_title text,
  seo_description text,
  social_image_url text,
  content_blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_pages_slug_check check (
    slug = '' or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint website_pages_content_blocks_array_check check (jsonb_typeof(content_blocks) = 'array')
);

create unique index if not exists website_pages_slug_per_revision_unique_idx
  on public.website_pages (website_site_id, revision_id, slug);
create unique index if not exists website_pages_single_home_per_revision_unique_idx
  on public.website_pages (website_site_id, revision_id)
  where page_kind = 'home';

create table if not exists public.website_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid references public.leads(lead_id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  page_id uuid references public.website_pages(id) on delete set null,
  submission_type text not null
    check (submission_type in ('property_enquiry', 'general_enquiry', 'valuation_request', 'campaign_enquiry')),
  idempotency_key text not null,
  payload_json jsonb not null,
  attribution_json jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'routed', 'duplicate', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  routed_at timestamptz,
  constraint website_lead_submissions_idempotency_unique unique (website_site_id, idempotency_key),
  constraint website_lead_submissions_payload_object_check check (jsonb_typeof(payload_json) = 'object'),
  constraint website_lead_submissions_attribution_object_check check (jsonb_typeof(attribution_json) = 'object')
);

create index if not exists website_lead_submissions_site_created_idx
  on public.website_lead_submissions (website_site_id, created_at desc);
create index if not exists website_lead_submissions_org_created_idx
  on public.website_lead_submissions (organisation_id, created_at desc);
create index if not exists website_lead_submissions_lead_idx
  on public.website_lead_submissions (lead_id)
  where lead_id is not null;

drop trigger if exists trg_website_sites_updated_at on public.website_sites;
create trigger trg_website_sites_updated_at
before update on public.website_sites
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_website_domains_updated_at on public.website_domains;
create trigger trg_website_domains_updated_at
before update on public.website_domains
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_website_site_revisions_updated_at on public.website_site_revisions;
create trigger trg_website_site_revisions_updated_at
before update on public.website_site_revisions
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_website_pages_updated_at on public.website_pages;
create trigger trg_website_pages_updated_at
before update on public.website_pages
for each row execute function public.set_updated_at_timestamp();

alter table public.website_sites enable row level security;
alter table public.website_domains enable row level security;
alter table public.website_site_revisions enable row level security;
alter table public.website_pages enable row level security;
alter table public.website_lead_submissions enable row level security;

revoke all on table public.website_sites from anon, authenticated;
revoke all on table public.website_domains from anon, authenticated;
revoke all on table public.website_site_revisions from anon, authenticated;
revoke all on table public.website_pages from anon, authenticated;
revoke all on table public.website_lead_submissions from anon, authenticated;

grant select, insert, update, delete on table public.website_sites to authenticated;
grant select, insert, update, delete on table public.website_domains to authenticated;
grant select, insert, update, delete on table public.website_site_revisions to authenticated;
grant select, insert, update, delete on table public.website_pages to authenticated;

create policy website_sites_admin_access
on public.website_sites
for all
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)))
with check ((select public.bridge_is_org_admin(organisation_id)));

create policy website_domains_admin_access
on public.website_domains
for all
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_domains.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_domains.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

create policy website_site_revisions_admin_access
on public.website_site_revisions
for all
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_site_revisions.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_site_revisions.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

create policy website_pages_admin_access
on public.website_pages
for all
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_pages.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_pages.website_site_id
      and public.bridge_is_org_admin(site.organisation_id)
  )
);

comment on table public.website_sites is
  'Tenant-owned public website configuration. The public application resolves this server-side; it is never exposed to anonymous clients.';
comment on table public.website_lead_submissions is
  'Durable website enquiry receipt. It is written only by trusted server code after hostname and anti-abuse checks.';

commit;
