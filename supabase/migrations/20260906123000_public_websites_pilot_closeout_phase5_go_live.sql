begin;

alter table public.website_production_releases
  add column if not exists origin_dark_launch_id uuid references public.website_production_dark_launches(id) on delete restrict,
  add column if not exists client_approval_json jsonb not null default '{}'::jsonb,
  add column if not exists phase4_evidence_fingerprint text;

alter table public.website_production_releases
  drop constraint if exists website_production_releases_client_approval_object_check;
alter table public.website_production_releases
  add constraint website_production_releases_client_approval_object_check
  check (jsonb_typeof(client_approval_json) = 'object');

alter table public.website_production_releases
  drop constraint if exists website_production_releases_phase4_fingerprint_check;
alter table public.website_production_releases
  add constraint website_production_releases_phase4_fingerprint_check
  check (phase4_evidence_fingerprint is null or phase4_evidence_fingerprint ~ '^[a-f0-9]{64}$');

create unique index if not exists website_production_releases_origin_dark_launch_idx
  on public.website_production_releases (origin_dark_launch_id)
  where origin_dark_launch_id is not null;

revoke update, delete, truncate on table public.website_production_release_events from service_role;
grant select, insert on table public.website_production_release_events to service_role;

create or replace function public.website_protect_go_live_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.client_approval_json <> '{}'::jsonb and (
    new.client_approval_json is distinct from old.client_approval_json
    or new.origin_dark_launch_id is distinct from old.origin_dark_launch_id
    or new.phase4_evidence_fingerprint is distinct from old.phase4_evidence_fingerprint
  ) then
    raise exception 'Recorded client go-live approval evidence is immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_website_protect_go_live_approval on public.website_production_releases;
create trigger trg_website_protect_go_live_approval
before update on public.website_production_releases
for each row execute function public.website_protect_go_live_approval();

create or replace function public.website_approve_dark_launch_go_live(
  p_organisation_id uuid,
  p_target_hostname text,
  p_source_commit text,
  p_candidate_deployment_url text,
  p_rollback_deployment_url text,
  p_phase4_evidence_fingerprint text,
  p_client_approval jsonb,
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
  v_candidate text := trim(coalesce(p_candidate_deployment_url, ''));
  v_rollback text := trim(coalesce(p_rollback_deployment_url, ''));
  v_evidence text := lower(trim(coalesce(p_phase4_evidence_fingerprint, '')));
  v_operator text := left(trim(coalesce(p_configured_by, '')), 160);
  v_approver text := left(trim(coalesce(p_client_approval ->> 'clientApproverName', '')), 160);
  v_role text := left(trim(coalesce(p_client_approval ->> 'clientApproverRole', '')), 160);
  v_reference text := left(trim(coalesce(p_client_approval ->> 'approvalReference', '')), 200);
  v_launch public.website_production_dark_launches%rowtype;
  v_release public.website_production_releases%rowtype;
  v_existing public.website_production_releases%rowtype;
begin
  if jsonb_typeof(p_client_approval) is distinct from 'object'
    or not p_client_approval @> '{"clientApproved":true,"emailDnsChangesAllowed":false,"nameserverChangesAllowed":false}'::jsonb
    or char_length(v_approver) < 2
    or char_length(v_role) < 2
    or char_length(v_reference) < 2 then
    raise exception 'A named, role-bearing Kingstons client approval is required and may not authorise email DNS or nameserver changes.' using errcode = '22023';
  end if;
  if p_approved_at is null or p_approved_at > now() + interval '1 minute' or p_approved_at < now() - interval '14 days' then
    raise exception 'Client approval must be dated within the last 14 days.' using errcode = '22023';
  end if;
  if char_length(v_operator) < 2 then raise exception 'A production operator is required.' using errcode = '22023'; end if;
  if v_source_commit !~ '^[a-f0-9]{40}$' or v_evidence !~ '^[a-f0-9]{64}$' then
    raise exception 'The go-live must be bound to exact source and Phase 4 evidence fingerprints.' using errcode = '22023';
  end if;
  if v_hostname !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or v_hostname ~ '\.vercel\.app$'
    or v_hostname ~ '\.sites\.propdata\.co\.za$'
    or v_hostname ~ '^(mail|mailhost|autodiscover|smtp|imap|pop)\.' then
    raise exception 'A safe client-owned website hostname is required.' using errcode = '22023';
  end if;

  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id
    and launch.status = 'active'
    and launch.website_site_id is not null
    and launch.production_content_fingerprint is not null
  for update;

  if v_candidate = v_rollback or v_rollback <> v_launch.candidate_deployment_url then
    raise exception 'The Phase 5 rollback target must be the active Phase 4 dark-launch deployment.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.website_sites site
    join public.website_site_revisions revision on revision.id = site.published_revision_id
    where site.id = v_launch.website_site_id
      and site.organisation_id = p_organisation_id
      and site.status = 'published'
      and revision.website_site_id = site.id
      and revision.status = 'published'
      and revision.content_fingerprint = v_launch.production_content_fingerprint
  ) then
    raise exception 'The active dark-launch content no longer matches the reviewed production revision.' using errcode = '23514';
  end if;

  select release.* into v_existing
  from public.website_production_releases release
  where release.organisation_id = p_organisation_id
  for update;
  if found and (v_existing.status = 'active' or v_existing.client_approval_json <> '{}'::jsonb) then
    raise exception 'A recorded or active client go-live approval cannot be replaced.' using errcode = '55000';
  end if;

  insert into public.website_production_releases (
    organisation_id, website_site_id, target_hostname, status, source_commit,
    phase7_evidence_fingerprint, content_fingerprint, candidate_deployment_url,
    rollback_deployment_url, approval_reference, approved_by, approved_at,
    configured_by, origin_dark_launch_id, client_approval_json,
    phase4_evidence_fingerprint
  ) values (
    p_organisation_id, v_launch.website_site_id, v_hostname, 'approved', v_source_commit,
    v_evidence, v_launch.production_content_fingerprint, v_candidate,
    v_rollback, v_reference, v_approver, p_approved_at,
    v_operator, v_launch.id, p_client_approval, v_evidence
  )
  on conflict (organisation_id) do update
  set website_site_id = excluded.website_site_id,
      target_hostname = excluded.target_hostname,
      status = 'approved',
      source_commit = excluded.source_commit,
      phase7_evidence_fingerprint = excluded.phase7_evidence_fingerprint,
      content_fingerprint = excluded.content_fingerprint,
      candidate_deployment_url = excluded.candidate_deployment_url,
      rollback_deployment_url = excluded.rollback_deployment_url,
      approval_reference = excluded.approval_reference,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      dns_snapshot_json = '{}'::jsonb,
      domain_verified_at = null,
      activated_at = null,
      paused_at = null,
      configured_by = excluded.configured_by,
      origin_dark_launch_id = excluded.origin_dark_launch_id,
      client_approval_json = excluded.client_approval_json,
      phase4_evidence_fingerprint = excluded.phase4_evidence_fingerprint
  returning * into v_release;

  insert into public.website_production_release_events (
    release_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_release.id, p_organisation_id, 'approved', v_operator, v_source_commit,
    v_candidate, v_launch.production_content_fingerprint,
    pg_catalog.jsonb_build_object(
      'phase', 5,
      'darkLaunchId', v_launch.id,
      'darkLaunchSourceCommit', v_launch.source_commit,
      'phase4EvidenceFingerprint', v_evidence,
      'clientApproverName', v_approver,
      'clientApproverRole', v_role,
      'approvalReference', v_reference,
      'clientApprovalFingerprint', pg_catalog.encode(extensions.digest(p_client_approval::text, 'sha256'), 'hex'),
      'emailDnsChangesAllowed', false,
      'nameserverChangesAllowed', false
    )
  );

  return pg_catalog.jsonb_build_object(
    'releaseId', v_release.id,
    'status', v_release.status,
    'targetHostname', v_release.target_hostname,
    'domainLinked', false,
    'dnsChanged', false
  );
exception when no_data_found then
  raise exception 'The exact active production dark launch was not found.' using errcode = 'P0002';
end;
$$;

revoke all on function public.website_approve_dark_launch_go_live(uuid, text, text, text, text, text, jsonb, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.website_approve_dark_launch_go_live(uuid, text, text, text, text, text, jsonb, timestamptz, text)
  to service_role;
revoke all on function public.website_protect_go_live_approval() from public, anon, authenticated, service_role;

comment on function public.website_approve_dark_launch_go_live(uuid, text, text, text, text, text, jsonb, timestamptz, text) is
  'Promotes the exact active dark launch into a client-approved pre-domain release without linking a domain or changing DNS.';

notify pgrst, 'reload schema';
commit;
