begin;

create table public.website_production_releases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  website_site_id uuid,
  target_hostname text not null,
  status text not null default 'approved'
    check (status in ('approved', 'active', 'paused', 'retired')),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  phase7_evidence_fingerprint text not null check (phase7_evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  content_fingerprint text,
  candidate_deployment_url text not null,
  rollback_deployment_url text not null,
  approval_reference text not null,
  approved_by text not null,
  approved_at timestamptz not null,
  dns_snapshot_json jsonb not null default '{}'::jsonb,
  domain_verified_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  retired_at timestamptz,
  configured_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_production_releases_hostname_check check (
    target_hostname = lower(target_hostname)
    and target_hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  constraint website_production_releases_dns_snapshot_object_check
    check (jsonb_typeof(dns_snapshot_json) = 'object'),
  constraint website_production_releases_approval_reference_check
    check (char_length(trim(approval_reference)) between 2 and 200),
  constraint website_production_releases_approved_by_check
    check (char_length(trim(approved_by)) between 2 and 160),
  constraint website_production_releases_configured_by_check
    check (char_length(trim(configured_by)) between 2 and 160),
  constraint website_production_releases_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id)
    on delete cascade
);

create unique index website_production_releases_hostname_unique_idx
  on public.website_production_releases (lower(target_hostname));
create unique index website_production_releases_id_organisation_unique_idx
  on public.website_production_releases (id, organisation_id);

drop trigger if exists trg_website_production_releases_updated_at on public.website_production_releases;
create trigger trg_website_production_releases_updated_at
before update on public.website_production_releases
for each row execute function public.set_updated_at_timestamp();

create table public.website_production_release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null,
  organisation_id uuid not null,
  action text not null check (action in ('approved', 'domain_prepared', 'domain_verified', 'activated', 'rolled_back', 'retired')),
  operator text not null check (char_length(trim(operator)) between 2 and 160),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  deployment_url text,
  content_fingerprint text,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint website_production_release_events_release_fkey
    foreign key (release_id, organisation_id)
    references public.website_production_releases(id, organisation_id)
    on delete cascade
);

create index website_production_release_events_release_created_idx
  on public.website_production_release_events (release_id, created_at desc);

alter table public.website_production_releases enable row level security;
alter table public.website_production_release_events enable row level security;
revoke all on table public.website_production_releases from public, anon, authenticated;
revoke all on table public.website_production_release_events from public, anon, authenticated;
grant select on table public.website_production_releases to authenticated;
grant select on table public.website_production_release_events to authenticated;
grant select, insert, update on table public.website_production_releases to service_role;
grant select, insert on table public.website_production_release_events to service_role;

create policy website_production_releases_admin_select
on public.website_production_releases
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

create policy website_production_release_events_admin_select
on public.website_production_release_events
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

create or replace function public.website_approve_production_release(
  p_organisation_id uuid,
  p_target_hostname text,
  p_source_commit text,
  p_phase7_evidence_fingerprint text,
  p_candidate_deployment_url text,
  p_rollback_deployment_url text,
  p_approval_reference text,
  p_approved_by text,
  p_approved_at timestamptz,
  p_configured_by text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hostname text := lower(trim(coalesce(p_target_hostname, '')));
  v_source_commit text := lower(trim(coalesce(p_source_commit, '')));
  v_evidence_fingerprint text := lower(trim(coalesce(p_phase7_evidence_fingerprint, '')));
  v_candidate text := trim(coalesce(p_candidate_deployment_url, ''));
  v_rollback text := trim(coalesce(p_rollback_deployment_url, ''));
  v_approval_reference text := left(trim(coalesce(p_approval_reference, '')), 200);
  v_approved_by text := left(trim(coalesce(p_approved_by, '')), 160);
  v_operator text := left(trim(coalesce(p_configured_by, '')), 160);
  v_release public.website_production_releases%rowtype;
begin
  if p_organisation_id is null or not exists (
    select 1 from public.organisations organisation where organisation.id = p_organisation_id
  ) then
    raise exception 'Production release organisation not found.' using errcode = 'P0002';
  end if;
  if v_hostname !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or v_hostname like '%.vercel.app'
    or v_hostname like '%.sites.propdata.co.za'
    or split_part(v_hostname, '.', 1) in ('mail', 'mailhost', 'autodiscover', 'smtp', 'imap', 'pop') then
    raise exception 'A client-approved custom website hostname is required.' using errcode = '22023';
  end if;
  if v_source_commit !~ '^[a-f0-9]{40}$' or v_evidence_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Source commit and Phase 7 evidence fingerprint are required.' using errcode = '22023';
  end if;
  if v_candidate !~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app/?$'
    or v_rollback !~ '^https://[a-z0-9][a-z0-9.-]*\.vercel\.app/?$'
    or v_candidate = v_rollback then
    raise exception 'Distinct candidate and rollback Vercel deployments are required.' using errcode = '22023';
  end if;
  if char_length(v_approval_reference) < 2 or char_length(v_approved_by) < 2 or char_length(v_operator) < 2 then
    raise exception 'Approval reference, approver and operator are required.' using errcode = '22023';
  end if;
  if p_approved_at is null or p_approved_at > now() + interval '1 minute' or p_approved_at < now() - interval '14 days' then
    raise exception 'Production approval must be dated within the last 14 days.' using errcode = '22023';
  end if;

  select release.* into v_release
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id
  for update;
  if found and v_release.status = 'active' then
    raise exception 'Pause the active production release before replacing its approval.' using errcode = '55000';
  end if;

  insert into public.website_production_releases (
    organisation_id, target_hostname, status, source_commit, phase7_evidence_fingerprint,
    candidate_deployment_url, rollback_deployment_url, approval_reference,
    approved_by, approved_at, configured_by
  ) values (
    p_organisation_id, v_hostname, 'approved', v_source_commit, v_evidence_fingerprint,
    v_candidate, v_rollback, v_approval_reference,
    v_approved_by, p_approved_at, v_operator
  )
  on conflict (organisation_id) do update
  set target_hostname = excluded.target_hostname,
      status = 'approved',
      source_commit = excluded.source_commit,
      phase7_evidence_fingerprint = excluded.phase7_evidence_fingerprint,
      content_fingerprint = null,
      candidate_deployment_url = excluded.candidate_deployment_url,
      rollback_deployment_url = excluded.rollback_deployment_url,
      approval_reference = excluded.approval_reference,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      dns_snapshot_json = '{}'::jsonb,
      domain_verified_at = null,
      paused_at = null,
      retired_at = null,
      configured_by = excluded.configured_by
  returning * into v_release;

  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit, deployment_url, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'approved', v_operator, v_source_commit, v_candidate,
    pg_catalog.jsonb_build_object(
      'approvalReference', v_approval_reference,
      'approvedBy', v_approved_by,
      'phase7EvidenceFingerprint', v_evidence_fingerprint,
      'rollbackDeploymentUrl', v_rollback
    )
  );

  return pg_catalog.jsonb_build_object(
    'releaseId', v_release.id,
    'organisationId', v_release.organisation_id,
    'status', v_release.status,
    'targetHostname', v_release.target_hostname
  );
end;
$$;

create or replace function public.website_prepare_production_domain(
  p_organisation_id uuid,
  p_dns_snapshot jsonb,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_release public.website_production_releases%rowtype;
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_domain public.website_domains%rowtype;
begin
  if jsonb_typeof(p_dns_snapshot) is distinct from 'object'
    or not p_dns_snapshot @> '{"emailDnsUnchanged":true,"nameserversUnchanged":true}'::jsonb
    or jsonb_typeof(p_dns_snapshot -> 'websiteRecordsBefore') is distinct from 'array'
    or jsonb_typeof(p_dns_snapshot -> 'plannedWebsiteRecords') is distinct from 'array'
    or char_length(trim(coalesce(p_dns_snapshot ->> 'rollbackContact', ''))) < 2 then
    raise exception 'A reviewed website-only DNS snapshot and rollback contact are required.' using errcode = '22023';
  end if;
  if char_length(v_operator) < 2 then
    raise exception 'A production operator is required.' using errcode = '22023';
  end if;

  select release.* into strict v_release
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id
    and release.status in ('approved', 'paused')
  for update;

  if lower(trim(coalesce(p_dns_snapshot ->> 'hostname', ''))) <> v_release.target_hostname then
    raise exception 'The DNS snapshot hostname does not match the approved production hostname.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_dns_snapshot -> 'plannedWebsiteRecords') item
    where upper(coalesce(item ->> 'type', '')) not in ('A', 'AAAA', 'ALIAS', 'ANAME', 'CNAME', 'TXT')
      or lower(coalesce(item ->> 'name', '')) ~ '(^|\.)(mail|mailhost|autodiscover|smtp|imap|pop)(\.|$)'
      or lower(trim(coalesce(item ->> 'name', ''))) not in (
        v_release.target_hostname,
        '_vercel.' || v_release.target_hostname
      )
  ) then
    raise exception 'The DNS plan contains a prohibited or non-website record.' using errcode = '22023';
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
    and revision.content_fingerprint is not null;
  if not exists (
    select 1 from public.website_domains domain
    where domain.website_site_id = v_site.id and domain.domain_kind = 'preview' and domain.status = 'active'
  ) then
    raise exception 'An active approved preview domain is required before production preparation.' using errcode = '23514';
  end if;

  select domain.* into v_domain
  from public.website_domains domain
  where lower(domain.hostname) = v_release.target_hostname
  for update;
  if found and v_domain.website_site_id <> v_site.id then
    raise exception 'The approved hostname belongs to another website.' using errcode = '23505';
  end if;
  if v_domain.id is null then
    insert into public.website_domains (
      website_site_id, hostname, domain_kind, status, is_primary, dns_instructions
    ) values (
      v_site.id, v_release.target_hostname, 'custom', 'pending', false,
      pg_catalog.jsonb_build_object(
        'phase', 8,
        'emailDnsChangesAllowed', false,
        'nameserverChangesAllowed', false,
        'snapshot', p_dns_snapshot
      )
    ) returning * into v_domain;
  else
    update public.website_domains domain
    set domain_kind = 'custom', status = 'pending', is_primary = false,
        dns_instructions = pg_catalog.jsonb_build_object(
          'phase', 8,
          'emailDnsChangesAllowed', false,
          'nameserverChangesAllowed', false,
          'snapshot', p_dns_snapshot
        ),
        verified_at = null
    where domain.id = v_domain.id
    returning * into v_domain;
  end if;

  update public.website_production_releases release
  set website_site_id = v_site.id,
      content_fingerprint = v_revision.content_fingerprint,
      dns_snapshot_json = p_dns_snapshot,
      domain_verified_at = null,
      configured_by = v_operator
  where release.id = v_release.id
  returning * into v_release;

  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit, deployment_url, content_fingerprint, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'domain_prepared', v_operator, v_release.source_commit,
    v_release.candidate_deployment_url, v_revision.content_fingerprint,
    pg_catalog.jsonb_build_object('hostname', v_release.target_hostname, 'domainId', v_domain.id)
  );

  return pg_catalog.jsonb_build_object(
    'releaseId', v_release.id,
    'status', v_release.status,
    'hostname', v_domain.hostname,
    'domainStatus', v_domain.status,
    'contentFingerprint', v_revision.content_fingerprint
  );
exception when no_data_found then
  raise exception 'Approved release, published site or reviewed revision is missing.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_verify_production_domain(
  p_organisation_id uuid,
  p_verification jsonb,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_release public.website_production_releases%rowtype;
  v_domain public.website_domains%rowtype;
begin
  if jsonb_typeof(p_verification) is distinct from 'object'
    or not p_verification @> '{"hostnameResolved":true,"certificateReady":true,"emailDnsUnchanged":true,"nameserversUnchanged":true}'::jsonb then
    raise exception 'DNS, TLS and email-safety verification must all pass.' using errcode = '22023';
  end if;
  if char_length(v_operator) < 2 then raise exception 'A production operator is required.' using errcode = '22023'; end if;

  select release.* into strict v_release
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id
    and release.status in ('approved', 'paused')
    and release.website_site_id is not null
    and release.content_fingerprint is not null
  for update;
  if lower(trim(coalesce(p_verification ->> 'hostname', ''))) <> v_release.target_hostname then
    raise exception 'Verification hostname does not match the approved release.' using errcode = '22023';
  end if;

  update public.website_domains domain
  set status = 'verified', verified_at = now(),
      dns_instructions = domain.dns_instructions || pg_catalog.jsonb_build_object('verification', p_verification)
  where domain.website_site_id = v_release.website_site_id
    and lower(domain.hostname) = v_release.target_hostname
    and domain.domain_kind = 'custom'
    and domain.status in ('pending', 'verified')
  returning * into v_domain;
  if not found then raise exception 'Prepared production domain not found.' using errcode = 'P0002'; end if;

  update public.website_production_releases release
  set domain_verified_at = v_domain.verified_at, configured_by = v_operator
  where release.id = v_release.id
  returning * into v_release;
  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit, deployment_url, content_fingerprint, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'domain_verified', v_operator, v_release.source_commit,
    v_release.candidate_deployment_url, v_release.content_fingerprint,
    pg_catalog.jsonb_build_object('hostname', v_release.target_hostname, 'verifiedAt', v_domain.verified_at)
  );
  return pg_catalog.jsonb_build_object('releaseId', v_release.id, 'hostname', v_domain.hostname, 'domainStatus', v_domain.status);
exception when no_data_found then
  raise exception 'Prepared production release not found.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_activate_production_release(
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
  v_release public.website_production_releases%rowtype;
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_domain public.website_domains%rowtype;
begin
  if char_length(v_operator) < 2 then raise exception 'A production operator is required.' using errcode = '22023'; end if;
  select release.* into strict v_release
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id
    and release.status in ('approved', 'paused')
  for update;
  if v_release.source_commit <> lower(trim(coalesce(p_source_commit, '')))
    or v_release.candidate_deployment_url <> trim(coalesce(p_candidate_deployment_url, '')) then
    raise exception 'Activation does not match the approved commit and deployment.' using errcode = '22023';
  end if;
  if v_release.domain_verified_at is null then raise exception 'The custom domain is not verified.' using errcode = '23514'; end if;

  select site.* into strict v_site from public.website_sites site
  where site.id = v_release.website_site_id and site.organisation_id = p_organisation_id
    and site.status = 'published' and site.published_revision_id is not null
  for update;
  select revision.* into strict v_revision from public.website_site_revisions revision
  where revision.id = v_site.published_revision_id and revision.website_site_id = v_site.id
    and revision.status = 'published' and revision.content_fingerprint = v_release.content_fingerprint;
  select domain.* into strict v_domain from public.website_domains domain
  where domain.website_site_id = v_site.id and lower(domain.hostname) = v_release.target_hostname
    and domain.domain_kind = 'custom' and domain.status = 'verified'
  for update;

  update public.website_domains domain set is_primary = false where domain.website_site_id = v_site.id and domain.is_primary;
  update public.website_domains domain set status = 'active', is_primary = true where domain.id = v_domain.id returning * into v_domain;
  update public.website_production_releases release
  set status = 'active', activated_at = now(), paused_at = null, configured_by = v_operator
  where release.id = v_release.id returning * into v_release;
  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit, deployment_url, content_fingerprint, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'activated', v_operator, v_release.source_commit,
    v_release.candidate_deployment_url, v_revision.content_fingerprint,
    pg_catalog.jsonb_build_object('hostname', v_release.target_hostname, 'revisionId', v_revision.id)
  );
  return pg_catalog.jsonb_build_object(
    'releaseId', v_release.id, 'status', v_release.status, 'hostname', v_domain.hostname,
    'contentFingerprint', v_revision.content_fingerprint, 'activatedAt', v_release.activated_at
  );
exception when no_data_found then
  raise exception 'The approved release, exact revision or verified domain is no longer ready.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_rollback_production_release(
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
  v_release public.website_production_releases%rowtype;
begin
  if char_length(v_operator) < 2 or char_length(v_reason) < 4 then
    raise exception 'A production operator and rollback reason are required.' using errcode = '22023';
  end if;
  select release.* into strict v_release
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id and release.status in ('approved', 'active', 'paused')
  for update;

  update public.website_domains domain set is_primary = false
  where domain.website_site_id = v_release.website_site_id and domain.is_primary;
  update public.website_domains domain set status = 'disabled', is_primary = false
  where domain.website_site_id = v_release.website_site_id
    and lower(domain.hostname) = v_release.target_hostname and domain.domain_kind = 'custom';
  update public.website_domains domain set status = 'active', is_primary = true
  where domain.id = (
    select preview.id from public.website_domains preview
    where preview.website_site_id = v_release.website_site_id and preview.domain_kind = 'preview'
    order by preview.created_at limit 1
  );
  update public.website_production_releases release
  set status = 'paused', paused_at = now(), configured_by = v_operator
  where release.id = v_release.id returning * into v_release;
  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit, deployment_url, content_fingerprint, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'rolled_back', v_operator, v_release.source_commit,
    v_release.rollback_deployment_url, v_release.content_fingerprint,
    pg_catalog.jsonb_build_object('reason', v_reason, 'restoreHostname', v_release.target_hostname)
  );
  return pg_catalog.jsonb_build_object(
    'releaseId', v_release.id, 'status', v_release.status,
    'rollbackDeploymentUrl', v_release.rollback_deployment_url,
    'dnsRestoreRequired', true, 'pausedAt', v_release.paused_at
  );
exception when no_data_found then
  raise exception 'Production release not found.' using errcode = 'P0002';
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
  ) then
    raise exception 'Website creation requires an active staging pilot or approved production release.' using errcode = '42501';
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
      )
  ) then
    raise exception 'Website lead capture requires an active staged or production release.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.website_approve_production_release(uuid, text, text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.website_prepare_production_domain(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.website_verify_production_domain(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.website_activate_production_release(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.website_rollback_production_release(uuid, text, text) from public, anon, authenticated;
revoke all on function public.website_require_active_pilot_for_site() from public, anon, authenticated, service_role;
revoke all on function public.website_require_active_pilot_for_lead() from public, anon, authenticated, service_role;
grant execute on function public.website_approve_production_release(uuid, text, text, text, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.website_prepare_production_domain(uuid, jsonb, text) to service_role;
grant execute on function public.website_verify_production_domain(uuid, jsonb, text) to service_role;
grant execute on function public.website_activate_production_release(uuid, text, text, text) to service_role;
grant execute on function public.website_rollback_production_release(uuid, text, text) to service_role;

comment on table public.website_production_releases is
  'Service-managed production website allow-list bound to reviewed pilot evidence, an exact commit, deployment, revision and custom hostname.';
comment on table public.website_production_release_events is
  'Immutable audit history for production website approval, domain preparation, activation and rollback.';
comment on function public.website_rollback_production_release(uuid, text, text) is
  'Fails public serving and lead capture closed before the external deployment and website-only DNS rollback are completed.';

notify pgrst, 'reload schema';
commit;
