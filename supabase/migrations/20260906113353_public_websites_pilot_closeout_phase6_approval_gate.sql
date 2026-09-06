begin;

create or replace function public.website_start_hypercare(p_organisation_id uuid, p_operator text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_release public.website_production_releases%rowtype;
  v_window public.website_hypercare_windows%rowtype;
begin
  if char_length(v_operator) < 2 then raise exception 'A hypercare operator is required.' using errcode = '22023'; end if;
  select release.* into strict v_release from public.website_production_releases release
  where release.organisation_id = p_organisation_id and release.status = 'active'
    and release.activated_at is not null and release.domain_verified_at is not null
    and release.origin_dark_launch_id is not null
    and release.phase4_evidence_fingerprint is not null
    and release.client_approval_json @> '{"clientApproved":true,"emailDnsChangesAllowed":false,"nameserverChangesAllowed":false}'::jsonb
    and exists (
      select 1 from public.website_production_dark_launches launch
      where launch.id = release.origin_dark_launch_id
        and launch.organisation_id = release.organisation_id
        and launch.website_site_id = release.website_site_id
        and launch.status = 'active'
        and launch.production_content_fingerprint = release.content_fingerprint
    )
  for update;
  if not exists (
    select 1 from public.website_domains domain
    where domain.website_site_id = v_release.website_site_id
      and lower(domain.hostname) = v_release.target_hostname
      and domain.domain_kind = 'custom' and domain.status = 'active' and domain.is_primary
  ) then
    raise exception 'Hypercare cannot start until the client custom domain is active and primary.' using errcode = '23514';
  end if;
  if v_release.target_hostname ~ '\.vercel\.app$' then
    raise exception 'Hypercare cannot run against a Vercel preview hostname.' using errcode = '23514';
  end if;
  insert into public.website_hypercare_windows (
    organisation_id, release_id, website_site_id, target_hostname, started_at,
    earliest_acceptance_at, target_acceptance_at, started_by
  ) values (
    p_organisation_id, v_release.id, v_release.website_site_id, v_release.target_hostname, now(),
    now() + interval '7 days', now() + interval '14 days', v_operator
  ) returning * into v_window;
  insert into public.website_hypercare_events (hypercare_window_id, organisation_id, action, operator, metadata_json)
  values (v_window.id, p_organisation_id, 'started', v_operator,
    pg_catalog.jsonb_build_object('releaseId', v_release.id, 'hostname', v_release.target_hostname,
      'originDarkLaunchId', v_release.origin_dark_launch_id,
      'phase4EvidenceFingerprint', v_release.phase4_evidence_fingerprint,
      'pauseFunction', 'website_rollback_production_release'));
  return pg_catalog.jsonb_build_object('hypercareWindowId', v_window.id, 'status', v_window.status,
    'startedAt', v_window.started_at, 'earliestAcceptanceAt', v_window.earliest_acceptance_at,
    'targetAcceptanceAt', v_window.target_acceptance_at, 'hostname', v_window.target_hostname);
exception when no_data_found then
  raise exception 'Hypercare is blocked until the client-approved Phase 5 release and its custom domain are active.' using errcode = 'P0002';
end;
$$;

revoke all on function public.website_start_hypercare(uuid, text) from public, anon, authenticated;
grant execute on function public.website_start_hypercare(uuid, text) to service_role;

comment on function public.website_start_hypercare(uuid, text) is
  'Starts hypercare only for the exact immutable client-approved Phase 5 release, active dark launch and active primary custom domain.';

notify pgrst, 'reload schema';
commit;
;
