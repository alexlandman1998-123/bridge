begin;

create table public.website_production_dark_launches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  website_site_id uuid,
  listing_id uuid not null references public.private_listings(id) on delete restrict,
  status text not null default 'prepared'
    check (status in ('prepared', 'active', 'paused', 'rolled_back')),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  expected_content_fingerprint text not null
    check (expected_content_fingerprint ~ '^[a-f0-9]{32}([a-f0-9]{32})?$'),
  production_content_fingerprint text
    check (production_content_fingerprint is null or production_content_fingerprint ~ '^[a-f0-9]{32}$'),
  candidate_deployment_url text not null,
  rollback_deployment_url text not null,
  preview_hostname text not null,
  approval_reference text not null check (char_length(trim(approval_reference)) between 2 and 200),
  approved_by text not null check (char_length(trim(approved_by)) between 2 and 160),
  configured_by text not null check (char_length(trim(configured_by)) between 2 and 160),
  activated_at timestamptz,
  paused_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_production_dark_launches_candidate_check check (
    candidate_deployment_url = 'https://' || preview_hostname
    and candidate_deployment_url ~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app$'
  ),
  constraint website_production_dark_launches_rollback_check check (
    rollback_deployment_url ~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app$'
    and rollback_deployment_url <> candidate_deployment_url
  ),
  constraint website_production_dark_launches_preview_hostname_check check (
    preview_hostname = lower(preview_hostname)
    and preview_hostname ~ '^[a-z0-9][a-z0-9.-]*\.vercel\.app$'
  ),
  constraint website_production_dark_launches_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id)
    on delete cascade
);

create unique index website_production_dark_launches_preview_hostname_unique_idx
  on public.website_production_dark_launches (preview_hostname);
create unique index website_production_dark_launches_id_organisation_unique_idx
  on public.website_production_dark_launches (id, organisation_id);

drop trigger if exists trg_website_production_dark_launches_updated_at on public.website_production_dark_launches;
create trigger trg_website_production_dark_launches_updated_at
before update on public.website_production_dark_launches
for each row execute function public.set_updated_at_timestamp();

create table public.website_production_dark_launch_events (
  id uuid primary key default gen_random_uuid(),
  dark_launch_id uuid not null,
  organisation_id uuid not null,
  action text not null check (action in ('prepared', 'seeded', 'activated', 'resumed', 'paused', 'rolled_back')),
  operator text not null check (char_length(trim(operator)) between 2 and 160),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  deployment_url text not null,
  content_fingerprint text,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint website_production_dark_launch_events_launch_fkey
    foreign key (dark_launch_id, organisation_id)
    references public.website_production_dark_launches(id, organisation_id)
    on delete cascade
);

create index website_production_dark_launch_events_created_idx
  on public.website_production_dark_launch_events (dark_launch_id, created_at desc);

create or replace function public.website_reject_dark_launch_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Production dark-launch events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_website_production_dark_launch_events_immutable on public.website_production_dark_launch_events;
create trigger trg_website_production_dark_launch_events_immutable
before update or delete on public.website_production_dark_launch_events
for each row execute function public.website_reject_dark_launch_event_mutation();

alter table public.website_production_dark_launches enable row level security;
alter table public.website_production_dark_launch_events enable row level security;
revoke all on table public.website_production_dark_launches from public, anon, authenticated;
revoke all on table public.website_production_dark_launch_events from public, anon, authenticated;
grant select on table public.website_production_dark_launches to authenticated;
grant select on table public.website_production_dark_launch_events to authenticated;
grant select, insert, update on table public.website_production_dark_launches to service_role;
grant select, insert on table public.website_production_dark_launch_events to service_role;

create policy website_production_dark_launches_admin_select
on public.website_production_dark_launches
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

create policy website_production_dark_launch_events_admin_select
on public.website_production_dark_launch_events
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

create or replace function public.website_prepare_production_dark_launch(
  p_organisation_id uuid,
  p_listing_id uuid,
  p_source_commit text,
  p_expected_content_fingerprint text,
  p_candidate_deployment_url text,
  p_rollback_deployment_url text,
  p_approval_reference text,
  p_approved_by text,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_commit text := lower(trim(coalesce(p_source_commit, '')));
  v_expected_fingerprint text := lower(trim(coalesce(p_expected_content_fingerprint, '')));
  v_candidate text := regexp_replace(lower(trim(coalesce(p_candidate_deployment_url, ''))), '/$', '');
  v_rollback text := regexp_replace(lower(trim(coalesce(p_rollback_deployment_url, ''))), '/$', '');
  v_preview_hostname text;
  v_approval_reference text := left(trim(coalesce(p_approval_reference, '')), 200);
  v_approved_by text := left(trim(coalesce(p_approved_by, '')), 160);
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_launch public.website_production_dark_launches%rowtype;
begin
  if p_organisation_id is null or not exists (
    select 1 from public.organisations organisation where organisation.id = p_organisation_id
  ) then
    raise exception 'Production dark-launch organisation not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.private_listings listing
    join public.listing_publication_data publication on publication.listing_id = listing.id
    where listing.id = p_listing_id
      and listing.organisation_id = p_organisation_id
      and publication.status = 'Published'
      and nullif(trim(publication.title), '') is not null
      and nullif(trim(publication.property_type), '') is not null
      and publication.listing_type in ('Sale', 'Rental')
      and coalesce(publication.asking_price, 0) > 0
      and nullif(trim(publication.suburb), '') is not null
  ) then
    raise exception 'Dark launch requires one production-ready listing owned by the agency.' using errcode = '23514';
  end if;
  if v_source_commit !~ '^[a-f0-9]{40}$'
    or v_expected_fingerprint !~ '^[a-f0-9]{32}([a-f0-9]{32})?$' then
    raise exception 'Dark launch requires an exact source commit and reviewed content fingerprint.' using errcode = '22023';
  end if;
  if v_candidate !~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app$'
    or v_rollback !~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app$'
    or v_candidate = v_rollback then
    raise exception 'Dark launch requires distinct Vercel candidate and rollback deployments.' using errcode = '22023';
  end if;
  v_preview_hostname := split_part(v_candidate, '://', 2);
  if char_length(v_approval_reference) < 2 or char_length(v_approved_by) < 2 or char_length(v_operator) < 2 then
    raise exception 'Dark launch requires an approval reference, approver and operator.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.website_production_releases release
    where release.organisation_id = p_organisation_id and release.status = 'active'
  ) then
    raise exception 'A live custom-domain release cannot be replaced by a dark launch.' using errcode = '55000';
  end if;

  insert into public.website_production_dark_launches (
    organisation_id, listing_id, status, source_commit, expected_content_fingerprint,
    candidate_deployment_url, rollback_deployment_url, preview_hostname,
    approval_reference, approved_by, configured_by
  ) values (
    p_organisation_id, p_listing_id, 'prepared', v_source_commit, v_expected_fingerprint,
    v_candidate, v_rollback, v_preview_hostname,
    v_approval_reference, v_approved_by, v_operator
  )
  on conflict (organisation_id) do update
  set website_site_id = case
        when website_production_dark_launches.source_commit = excluded.source_commit
          and website_production_dark_launches.expected_content_fingerprint = excluded.expected_content_fingerprint
        then website_production_dark_launches.website_site_id
        else null
      end,
      production_content_fingerprint = case
        when website_production_dark_launches.source_commit = excluded.source_commit
          and website_production_dark_launches.expected_content_fingerprint = excluded.expected_content_fingerprint
        then website_production_dark_launches.production_content_fingerprint
        else null
      end,
      listing_id = excluded.listing_id,
      status = 'prepared',
      source_commit = excluded.source_commit,
      expected_content_fingerprint = excluded.expected_content_fingerprint,
      candidate_deployment_url = excluded.candidate_deployment_url,
      rollback_deployment_url = excluded.rollback_deployment_url,
      preview_hostname = excluded.preview_hostname,
      approval_reference = excluded.approval_reference,
      approved_by = excluded.approved_by,
      configured_by = excluded.configured_by,
      activated_at = null,
      paused_at = null,
      rolled_back_at = null
  returning * into v_launch;

  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit, deployment_url, metadata_json
  ) values (
    v_launch.id, p_organisation_id, 'prepared', v_operator, v_source_commit, v_candidate,
    pg_catalog.jsonb_build_object(
      'listingId', p_listing_id,
      'rollbackDeploymentUrl', v_rollback,
      'approvalReference', v_approval_reference,
      'approvedBy', v_approved_by,
      'expectedContentFingerprint', v_expected_fingerprint
    )
  );

  return pg_catalog.jsonb_build_object(
    'darkLaunchId', v_launch.id,
    'organisationId', v_launch.organisation_id,
    'status', v_launch.status,
    'previewHostname', v_launch.preview_hostname
  );
end;
$$;

create or replace function public.website_bind_production_dark_launch_content(
  p_organisation_id uuid,
  p_website_site_id uuid,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_launch public.website_production_dark_launches%rowtype;
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_fingerprint text;
  v_page_count integer;
begin
  if char_length(v_operator) < 2 then
    raise exception 'A production operator is required.' using errcode = '22023';
  end if;

  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id
    and launch.status = 'prepared'
  for update;

  select site.* into strict v_site
  from public.website_sites site
  where site.id = p_website_site_id
    and site.organisation_id = p_organisation_id
    and site.status = 'published'
    and site.template_key = 'property-standard-v1'
    and site.published_revision_id is not null
  for update;

  select revision.* into strict v_revision
  from public.website_site_revisions revision
  where revision.id = v_site.published_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'published'
  for update;

  select count(*)::integer,
    pg_catalog.md5(
      v_revision.brand_json::text || '|' || v_revision.seo_json::text || '|' || v_revision.navigation_json::text || '|' ||
      coalesce(string_agg(
        page.page_kind || ':' || page.slug || ':' || page.title || ':' || coalesce(page.seo_title, '') || ':' ||
        coalesce(page.seo_description, '') || ':' || coalesce(page.social_image_url, '') || ':' || page.content_blocks::text,
        '||' order by page.page_kind, page.slug
      ), '')
    )
  into v_page_count, v_fingerprint
  from public.website_pages page
  where page.website_site_id = v_site.id
    and page.revision_id = v_revision.id;

  if v_page_count < 4 or not exists (
    select 1
    from public.website_listing_publications publication
    where publication.website_site_id = v_site.id
      and publication.listing_id = v_launch.listing_id
      and publication.status = 'published'
      and pg_catalog.jsonb_array_length(publication.media_json) > 0
  ) then
    raise exception 'Production content cannot be bound until the standard pages and listing are seeded.' using errcode = '23514';
  end if;

  update public.website_site_revisions revision
  set content_fingerprint = v_fingerprint,
      updated_at = now()
  where revision.id = v_revision.id;

  update public.website_production_dark_launches launch
  set website_site_id = v_site.id,
      production_content_fingerprint = v_fingerprint,
      configured_by = v_operator
  where launch.id = v_launch.id
  returning * into v_launch;

  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_launch.id, p_organisation_id, 'seeded', v_operator, v_launch.source_commit,
    v_launch.candidate_deployment_url, v_fingerprint,
    pg_catalog.jsonb_build_object(
      'websiteSiteId', v_site.id,
      'revisionId', v_revision.id,
      'listingId', v_launch.listing_id,
      'pageCount', v_page_count,
      'reviewedStagingContentFingerprint', v_launch.expected_content_fingerprint,
      'productionContentFingerprint', v_fingerprint
    )
  );

  return pg_catalog.jsonb_build_object(
    'darkLaunchId', v_launch.id,
    'websiteSiteId', v_site.id,
    'revisionId', v_revision.id,
    'pageCount', v_page_count,
    'contentFingerprint', v_fingerprint
  );
end;
$$;

create or replace function public.website_activate_production_dark_launch(
  p_organisation_id uuid,
  p_source_commit text,
  p_candidate_deployment_url text,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_source_commit text := lower(trim(coalesce(p_source_commit, '')));
  v_candidate text := regexp_replace(lower(trim(coalesce(p_candidate_deployment_url, ''))), '/$', '');
  v_previous_status text;
  v_launch public.website_production_dark_launches%rowtype;
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_domain public.website_domains%rowtype;
begin
  if char_length(v_operator) < 2 then raise exception 'A production operator is required.' using errcode = '22023'; end if;
  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id
    and launch.status in ('prepared', 'paused', 'rolled_back')
  for update;
  v_previous_status := v_launch.status;
  if v_launch.source_commit <> v_source_commit or v_launch.candidate_deployment_url <> v_candidate then
    raise exception 'Dark launch does not match the prepared commit and deployment.' using errcode = '22023';
  end if;
  if v_launch.website_site_id is null or v_launch.production_content_fingerprint is null then
    raise exception 'Bind the seeded production content before activation.' using errcode = '23514';
  end if;

  select site.* into strict v_site
  from public.website_sites site
  where site.organisation_id = p_organisation_id
    and site.status = 'published'
    and site.template_key = 'property-standard-v1'
    and site.published_revision_id is not null
  for update;
  select revision.* into strict v_revision
  from public.website_site_revisions revision
  where revision.id = v_site.published_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'published'
    and lower(revision.content_fingerprint) = v_launch.production_content_fingerprint;
  if not exists (
    select 1 from public.website_listing_publications publication
    where publication.website_site_id = v_site.id
      and publication.listing_id = v_launch.listing_id
      and publication.status = 'published'
      and jsonb_array_length(publication.media_json) > 0
  ) then
    raise exception 'The reviewed production listing is not published with durable media.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.website_domains domain
    join public.website_sites other_site on other_site.id = domain.website_site_id
    where lower(domain.hostname) = v_launch.preview_hostname
      and other_site.organisation_id <> p_organisation_id
  ) then
    raise exception 'The prepared preview hostname belongs to another organisation.' using errcode = '23505';
  end if;

  update public.website_domains domain
  set status = 'disabled', is_primary = false
  where domain.website_site_id = v_site.id and domain.hostname <> v_launch.preview_hostname;

  insert into public.website_domains (
    website_site_id, hostname, domain_kind, status, is_primary, dns_instructions
  ) values (
    v_site.id, v_launch.preview_hostname, 'preview', 'active', true,
    pg_catalog.jsonb_build_object(
      'environment', 'production-dark-launch',
      'clientDnsRequired', false,
      'emailDnsRequired', false,
      'candidateDeploymentUrl', v_launch.candidate_deployment_url
    )
  )
  on conflict (lower(hostname)) do update
  set website_site_id = excluded.website_site_id,
      domain_kind = 'preview',
      status = 'active',
      is_primary = true,
      dns_instructions = excluded.dns_instructions,
      verified_at = null
  returning * into v_domain;

  update public.website_production_dark_launches launch
  set website_site_id = v_site.id,
      status = 'active',
      configured_by = v_operator,
      activated_at = now(),
      paused_at = null,
      rolled_back_at = null
  where launch.id = v_launch.id
  returning * into v_launch;

  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_launch.id, p_organisation_id,
    case when v_previous_status in ('paused', 'rolled_back') then 'resumed' else 'activated' end,
    v_operator, v_launch.source_commit, v_launch.candidate_deployment_url,
    v_revision.content_fingerprint,
    pg_catalog.jsonb_build_object(
      'websiteSiteId', v_site.id,
      'revisionId', v_revision.id,
      'listingId', v_launch.listing_id,
      'previewHostname', v_domain.hostname,
      'clientDnsChanged', false
    )
  );

  return pg_catalog.jsonb_build_object(
    'darkLaunchId', v_launch.id,
    'status', v_launch.status,
    'previewHostname', v_launch.preview_hostname,
    'contentFingerprint', v_revision.content_fingerprint,
    'activatedAt', v_launch.activated_at
  );
exception when no_data_found then
  raise exception 'Prepared dark launch, reviewed site or exact revision is missing.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_pause_production_dark_launch(
  p_organisation_id uuid,
  p_operator text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_launch public.website_production_dark_launches%rowtype;
begin
  if char_length(v_operator) < 2 or char_length(v_reason) < 4 then
    raise exception 'A production operator and pause reason are required.' using errcode = '22023';
  end if;
  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id and launch.status = 'active'
  for update;
  update public.website_domains domain set status = 'disabled', is_primary = false
  where domain.website_site_id = v_launch.website_site_id
    and domain.hostname = v_launch.preview_hostname;
  update public.website_production_dark_launches launch
  set status = 'paused', paused_at = now(), configured_by = v_operator
  where launch.id = v_launch.id returning * into v_launch;
  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_launch.id, p_organisation_id, 'paused', v_operator, v_launch.source_commit,
    v_launch.candidate_deployment_url, v_launch.expected_content_fingerprint,
    pg_catalog.jsonb_build_object('reason', v_reason, 'clientDnsChanged', false)
  );
  return pg_catalog.jsonb_build_object('darkLaunchId', v_launch.id, 'status', v_launch.status, 'pausedAt', v_launch.paused_at);
exception when no_data_found then
  raise exception 'Active production dark launch not found.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_rollback_production_dark_launch(
  p_organisation_id uuid,
  p_operator text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_launch public.website_production_dark_launches%rowtype;
begin
  if char_length(v_operator) < 2 or char_length(v_reason) < 4 then
    raise exception 'A production operator and rollback reason are required.' using errcode = '22023';
  end if;
  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id and launch.status in ('prepared', 'active', 'paused')
  for update;
  update public.website_domains domain set status = 'disabled', is_primary = false
  where domain.website_site_id = v_launch.website_site_id
    and domain.hostname = v_launch.preview_hostname;
  update public.website_production_dark_launches launch
  set status = 'rolled_back', rolled_back_at = now(), configured_by = v_operator
  where launch.id = v_launch.id returning * into v_launch;
  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_launch.id, p_organisation_id, 'rolled_back', v_operator, v_launch.source_commit,
    v_launch.rollback_deployment_url, v_launch.expected_content_fingerprint,
    pg_catalog.jsonb_build_object(
      'reason', v_reason,
      'clientDnsChanged', false,
      'dnsRestoreRequired', false,
      'rollbackDeploymentUrl', v_launch.rollback_deployment_url
    )
  );
  return pg_catalog.jsonb_build_object(
    'darkLaunchId', v_launch.id,
    'status', v_launch.status,
    'rollbackDeploymentUrl', v_launch.rollback_deployment_url,
    'dnsRestoreRequired', false,
    'rolledBackAt', v_launch.rolled_back_at
  );
exception when no_data_found then
  raise exception 'Production dark launch not found.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_require_active_pilot_for_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.website_pilot_enrolments enrolment
    where enrolment.organisation_id = new.organisation_id and enrolment.status = 'active'
  ) and not exists (
    select 1 from public.website_production_releases release
    where release.organisation_id = new.organisation_id and release.status in ('approved', 'active', 'paused')
  ) and not exists (
    select 1 from public.website_production_dark_launches launch
    where launch.organisation_id = new.organisation_id and launch.status in ('prepared', 'active', 'paused')
  ) then
    raise exception 'Website creation requires an active staging pilot, prepared dark launch or approved production release.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.website_require_active_pilot_for_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.website_sites site
    where site.id = new.website_site_id and site.organisation_id = new.organisation_id
      and (
        exists (
          select 1 from public.website_pilot_enrolments enrolment
          where enrolment.organisation_id = new.organisation_id and enrolment.status = 'active'
        )
        or exists (
          select 1 from public.website_production_releases release
          where release.organisation_id = new.organisation_id and release.status = 'active'
        )
        or exists (
          select 1
          from public.website_production_dark_launches launch
          join public.website_domains domain
            on domain.website_site_id = site.id
            and domain.hostname = launch.preview_hostname
            and domain.domain_kind = 'preview'
            and domain.status = 'active'
          where launch.organisation_id = new.organisation_id
            and launch.website_site_id = site.id
            and launch.status = 'active'
        )
      )
  ) then
    raise exception 'Website lead capture requires an active staged, dark-launch or production release.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.website_prepare_production_dark_launch(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.website_bind_production_dark_launch_content(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.website_activate_production_dark_launch(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.website_pause_production_dark_launch(uuid, text, text) from public, anon, authenticated;
revoke all on function public.website_rollback_production_dark_launch(uuid, text, text) from public, anon, authenticated;
revoke all on function public.website_reject_dark_launch_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.website_require_active_pilot_for_site() from public, anon, authenticated, service_role;
revoke all on function public.website_require_active_pilot_for_lead() from public, anon, authenticated, service_role;
grant execute on function public.website_prepare_production_dark_launch(uuid, uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.website_bind_production_dark_launch_content(uuid, uuid, text) to service_role;
grant execute on function public.website_activate_production_dark_launch(uuid, text, text, text) to service_role;
grant execute on function public.website_pause_production_dark_launch(uuid, text, text) to service_role;
grant execute on function public.website_rollback_production_dark_launch(uuid, text, text) to service_role;

comment on table public.website_production_dark_launches is
  'One-agency production preview allow-list. It never authorizes a client hostname or DNS change.';
comment on table public.website_production_dark_launch_events is
  'Immutable production dark-launch audit trail for preparation, activation, pause, resume and rollback.';
comment on function public.website_prepare_production_dark_launch(uuid, uuid, text, text, text, text, text, text, text) is
  'Prepares one exact production preview without creating or authorizing any client hostname.';
comment on function public.website_bind_production_dark_launch_content(uuid, uuid, text) is
  'Computes and binds the exact production content fingerprint after immutable production assets are seeded.';
comment on function public.website_activate_production_dark_launch(uuid, text, text, text) is
  'Opens only the exact Vercel preview hostname after the reviewed site revision and listing are present.';

notify pgrst, 'reload schema';
commit;
