begin;

create table public.website_hypercare_windows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  release_id uuid not null,
  website_site_id uuid not null,
  status text not null default 'observing' check (status in ('observing', 'accepted', 'failed')),
  target_hostname text not null,
  started_at timestamptz not null default now(),
  earliest_acceptance_at timestamptz not null,
  target_acceptance_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by text,
  acceptance_json jsonb not null default '{}'::jsonb check (jsonb_typeof(acceptance_json) = 'object'),
  started_by text not null check (char_length(trim(started_by)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_hypercare_windows_release_fkey
    foreign key (release_id, organisation_id)
    references public.website_production_releases(id, organisation_id) on delete cascade,
  constraint website_hypercare_windows_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id) on delete cascade,
  constraint website_hypercare_windows_timing_check check (
    earliest_acceptance_at >= started_at + interval '7 days'
    and target_acceptance_at >= earliest_acceptance_at
    and target_acceptance_at <= started_at + interval '14 days'
  )
);

create unique index website_hypercare_windows_id_organisation_idx
  on public.website_hypercare_windows (id, organisation_id);
create index website_hypercare_windows_release_organisation_idx
  on public.website_hypercare_windows (release_id, organisation_id);
create index website_hypercare_windows_site_organisation_idx
  on public.website_hypercare_windows (website_site_id, organisation_id);

create table public.website_hypercare_daily_observations (
  id uuid primary key default gen_random_uuid(),
  hypercare_window_id uuid not null,
  organisation_id uuid not null,
  observation_date date not null default current_date,
  result text not null check (result in ('pass', 'fail')),
  routes_passed boolean not null,
  mobile_passed boolean not null,
  desktop_passed boolean not null,
  listing_sync_passed boolean not null,
  image_delivery_passed boolean not null,
  all_leads_in_crm boolean not null,
  runtime_error_count integer not null check (runtime_error_count >= 0),
  tenant_leak_count integer not null check (tenant_leak_count >= 0),
  lost_lead_count integer not null check (lost_lead_count >= 0),
  broken_listing_count integer not null check (broken_listing_count >= 0),
  serious_regression_count integer not null check (serious_regression_count >= 0),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'object'),
  recorded_by text not null check (char_length(trim(recorded_by)) between 2 and 160),
  created_at timestamptz not null default now(),
  constraint website_hypercare_daily_window_fkey
    foreign key (hypercare_window_id, organisation_id)
    references public.website_hypercare_windows(id, organisation_id) on delete cascade,
  constraint website_hypercare_daily_unique unique (hypercare_window_id, observation_date),
  constraint website_hypercare_daily_result_check check (
    result = case when routes_passed and mobile_passed and desktop_passed
      and listing_sync_passed and image_delivery_passed and all_leads_in_crm
      and runtime_error_count = 0 and tenant_leak_count = 0 and lost_lead_count = 0
      and broken_listing_count = 0 and serious_regression_count = 0
      then 'pass' else 'fail' end
  )
);

create index website_hypercare_daily_window_created_idx
  on public.website_hypercare_daily_observations (hypercare_window_id, organisation_id, observation_date desc);

create table public.website_hypercare_incidents (
  id uuid primary key default gen_random_uuid(),
  hypercare_window_id uuid not null,
  organisation_id uuid not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  category text not null check (category in ('runtime', 'lead', 'listing', 'media', 'tenant_isolation', 'journey', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  summary text not null check (char_length(trim(summary)) between 4 and 1000),
  resolution text,
  opened_by text not null check (char_length(trim(opened_by)) between 2 and 160),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_hypercare_incidents_window_fkey
    foreign key (hypercare_window_id, organisation_id)
    references public.website_hypercare_windows(id, organisation_id) on delete cascade,
  constraint website_hypercare_incidents_resolution_check check (
    (status = 'open' and resolution is null and resolved_by is null and resolved_at is null)
    or (status = 'resolved' and char_length(trim(resolution)) >= 4
      and char_length(trim(resolved_by)) >= 2 and resolved_at is not null)
  )
);

create index website_hypercare_incidents_window_status_idx
  on public.website_hypercare_incidents (hypercare_window_id, organisation_id, status, severity);

create table public.website_hypercare_events (
  id uuid primary key default gen_random_uuid(),
  hypercare_window_id uuid not null,
  organisation_id uuid not null,
  action text not null check (action in ('started', 'observed', 'incident_opened', 'incident_resolved', 'accepted', 'failed')),
  operator text not null check (char_length(trim(operator)) between 2 and 160),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint website_hypercare_events_window_fkey
    foreign key (hypercare_window_id, organisation_id)
    references public.website_hypercare_windows(id, organisation_id) on delete cascade
);

create index website_hypercare_events_window_created_idx
  on public.website_hypercare_events (hypercare_window_id, organisation_id, created_at desc);

create or replace function public.website_reject_hypercare_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Hypercare events are immutable.' using errcode = '42501';
end;
$$;

create trigger trg_website_hypercare_events_immutable
before update or delete on public.website_hypercare_events
for each row execute function public.website_reject_hypercare_event_mutation();

create or replace function public.website_protect_hypercare_observation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Daily hypercare observations are immutable.' using errcode = '42501';
end;
$$;

create trigger trg_website_hypercare_observations_immutable
before update or delete on public.website_hypercare_daily_observations
for each row execute function public.website_protect_hypercare_observation();

create or replace function public.website_protect_hypercare_incident_core()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.hypercare_window_id is distinct from old.hypercare_window_id
    or new.organisation_id is distinct from old.organisation_id
    or new.severity is distinct from old.severity
    or new.category is distinct from old.category
    or new.summary is distinct from old.summary
    or old.status = 'resolved' then
    raise exception 'Recorded hypercare incident evidence is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_website_hypercare_incident_core
before update on public.website_hypercare_incidents
for each row execute function public.website_protect_hypercare_incident_core();

drop trigger if exists trg_website_hypercare_windows_updated_at on public.website_hypercare_windows;
create trigger trg_website_hypercare_windows_updated_at before update on public.website_hypercare_windows
for each row execute function public.set_updated_at_timestamp();
drop trigger if exists trg_website_hypercare_incidents_updated_at on public.website_hypercare_incidents;
create trigger trg_website_hypercare_incidents_updated_at before update on public.website_hypercare_incidents
for each row execute function public.set_updated_at_timestamp();

alter table public.website_hypercare_windows enable row level security;
alter table public.website_hypercare_daily_observations enable row level security;
alter table public.website_hypercare_incidents enable row level security;
alter table public.website_hypercare_events enable row level security;

revoke all on table public.website_hypercare_windows from public, anon, authenticated, service_role;
revoke all on table public.website_hypercare_daily_observations from public, anon, authenticated, service_role;
revoke all on table public.website_hypercare_incidents from public, anon, authenticated, service_role;
revoke all on table public.website_hypercare_events from public, anon, authenticated, service_role;
grant select on table public.website_hypercare_windows, public.website_hypercare_daily_observations,
  public.website_hypercare_incidents, public.website_hypercare_events to authenticated;
grant select, insert, update on table public.website_hypercare_windows to service_role;
grant select, insert on table public.website_hypercare_daily_observations to service_role;
grant select, insert, update on table public.website_hypercare_incidents to service_role;
grant select, insert on table public.website_hypercare_events to service_role;

create policy website_hypercare_windows_admin_select on public.website_hypercare_windows
for select to authenticated using ((select public.bridge_is_org_admin(organisation_id)));
create policy website_hypercare_daily_admin_select on public.website_hypercare_daily_observations
for select to authenticated using ((select public.bridge_is_org_admin(organisation_id)));
create policy website_hypercare_incidents_admin_select on public.website_hypercare_incidents
for select to authenticated using ((select public.bridge_is_org_admin(organisation_id)));
create policy website_hypercare_events_admin_select on public.website_hypercare_events
for select to authenticated using ((select public.bridge_is_org_admin(organisation_id)));

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
      'pauseFunction', 'website_rollback_production_release'));
  return pg_catalog.jsonb_build_object('hypercareWindowId', v_window.id, 'status', v_window.status,
    'startedAt', v_window.started_at, 'earliestAcceptanceAt', v_window.earliest_acceptance_at,
    'targetAcceptanceAt', v_window.target_acceptance_at, 'hostname', v_window.target_hostname);
exception when no_data_found then
  raise exception 'Hypercare is blocked until Phase 5 has an active custom-domain production release.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_record_hypercare_observation(
  p_organisation_id uuid, p_observation_date date, p_evidence jsonb, p_operator text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_window public.website_hypercare_windows%rowtype;
  v_result text;
  v_observation public.website_hypercare_daily_observations%rowtype;
  v_runtime integer := coalesce((p_evidence ->> 'runtimeErrorCount')::integer, 0);
  v_tenant integer := coalesce((p_evidence ->> 'tenantLeakCount')::integer, 0);
  v_lost integer := coalesce((p_evidence ->> 'lostLeadCount')::integer, 0);
  v_broken integer := coalesce((p_evidence ->> 'brokenListingCount')::integer, 0);
  v_serious integer := coalesce((p_evidence ->> 'seriousRegressionCount')::integer, 0);
begin
  if char_length(v_operator) < 2 or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'contract' <> 'public-websites-pilot-closeout-phase6-observation-v1'
    or p_observation_date is null or p_observation_date > current_date
    or p_observation_date < current_date - 14 then
    raise exception 'A current, contract-valid hypercare observation and operator are required.' using errcode = '22023';
  end if;
  select hypercare.* into strict v_window from public.website_hypercare_windows hypercare
  where hypercare.organisation_id = p_organisation_id and hypercare.status = 'observing' for update;
  if not exists (select 1 from public.website_production_releases release
    where release.id = v_window.release_id and release.status = 'active') then
    raise exception 'The production release is not active; use the pause/rollback path.' using errcode = '23514';
  end if;
  v_result := case when p_evidence @> '{"routesPassed":true,"mobilePassed":true,"desktopPassed":true,"listingSyncPassed":true,"imageDeliveryPassed":true,"allLeadsInCrm":true}'::jsonb
    and v_runtime = 0 and v_tenant = 0 and v_lost = 0 and v_broken = 0 and v_serious = 0 then 'pass' else 'fail' end;
  insert into public.website_hypercare_daily_observations (
    hypercare_window_id, organisation_id, observation_date, result, routes_passed,
    mobile_passed, desktop_passed, listing_sync_passed, image_delivery_passed, all_leads_in_crm,
    runtime_error_count, tenant_leak_count, lost_lead_count, broken_listing_count,
    serious_regression_count, evidence_json, recorded_by
  ) values (
    v_window.id, p_organisation_id, p_observation_date, v_result,
    coalesce((p_evidence ->> 'routesPassed')::boolean, false),
    coalesce((p_evidence ->> 'mobilePassed')::boolean, false),
    coalesce((p_evidence ->> 'desktopPassed')::boolean, false),
    coalesce((p_evidence ->> 'listingSyncPassed')::boolean, false),
    coalesce((p_evidence ->> 'imageDeliveryPassed')::boolean, false),
    coalesce((p_evidence ->> 'allLeadsInCrm')::boolean, false),
    v_runtime, v_tenant, v_lost, v_broken, v_serious, p_evidence, v_operator
  ) returning * into v_observation;
  insert into public.website_hypercare_events (hypercare_window_id, organisation_id, action, operator, metadata_json)
  values (v_window.id, p_organisation_id, 'observed', v_operator,
    pg_catalog.jsonb_build_object('observationId', v_observation.id, 'date', p_observation_date, 'result', v_result));
  return pg_catalog.jsonb_build_object('observationId', v_observation.id, 'result', v_result, 'date', p_observation_date);
exception when no_data_found then
  raise exception 'No observing hypercare window exists for this organisation.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_record_hypercare_incident(
  p_organisation_id uuid, p_severity text, p_category text, p_summary text, p_operator text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_window public.website_hypercare_windows%rowtype; v_incident public.website_hypercare_incidents%rowtype;
begin
  if char_length(trim(coalesce(p_operator, ''))) < 2 then raise exception 'An incident operator is required.' using errcode = '22023'; end if;
  select hypercare.* into strict v_window from public.website_hypercare_windows hypercare
  where hypercare.organisation_id = p_organisation_id and hypercare.status = 'observing';
  insert into public.website_hypercare_incidents (hypercare_window_id, organisation_id, severity, category, summary, opened_by)
  values (v_window.id, p_organisation_id, lower(trim(p_severity)), lower(trim(p_category)), left(trim(p_summary), 1000), left(trim(p_operator), 160))
  returning * into v_incident;
  insert into public.website_hypercare_events (hypercare_window_id, organisation_id, action, operator, metadata_json)
  values (v_window.id, p_organisation_id, 'incident_opened', left(trim(p_operator), 160),
    pg_catalog.jsonb_build_object('incidentId', v_incident.id, 'severity', v_incident.severity, 'category', v_incident.category));
  return pg_catalog.jsonb_build_object('incidentId', v_incident.id, 'status', v_incident.status);
exception when no_data_found then raise exception 'No observing hypercare window exists.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_resolve_hypercare_incident(
  p_incident_id uuid, p_resolution text, p_operator text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_incident public.website_hypercare_incidents%rowtype;
begin
  if char_length(trim(coalesce(p_operator, ''))) < 2 or char_length(trim(coalesce(p_resolution, ''))) < 4 then
    raise exception 'A resolution and operator are required.' using errcode = '22023';
  end if;
  update public.website_hypercare_incidents incident set status = 'resolved', resolution = left(trim(p_resolution), 2000),
    resolved_by = left(trim(p_operator), 160), resolved_at = now()
  where incident.id = p_incident_id and incident.status = 'open' returning * into strict v_incident;
  insert into public.website_hypercare_events (hypercare_window_id, organisation_id, action, operator, metadata_json)
  values (v_incident.hypercare_window_id, v_incident.organisation_id, 'incident_resolved', left(trim(p_operator), 160),
    pg_catalog.jsonb_build_object('incidentId', v_incident.id));
  return pg_catalog.jsonb_build_object('incidentId', v_incident.id, 'status', v_incident.status, 'resolvedAt', v_incident.resolved_at);
exception when no_data_found then raise exception 'Open hypercare incident not found.' using errcode = 'P0002';
end;
$$;

create or replace function public.website_accept_hypercare(
  p_organisation_id uuid, p_acceptance jsonb, p_operator text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_window public.website_hypercare_windows%rowtype; v_pass_days integer; v_approver text;
begin
  v_approver := left(trim(coalesce(p_acceptance ->> 'clientApproverName', '')), 160);
  if jsonb_typeof(p_acceptance) is distinct from 'object'
    or not p_acceptance @> '{"contract":"public-websites-pilot-closeout-phase6-acceptance-v1","productionAccepted":true}'::jsonb
    or char_length(v_approver) < 2 or char_length(trim(coalesce(p_acceptance ->> 'clientApproverRole', ''))) < 2
    or char_length(trim(coalesce(p_acceptance ->> 'approvalReference', ''))) < 2
    or char_length(trim(coalesce(p_operator, ''))) < 2 then
    raise exception 'Named final production acceptance and operator are required.' using errcode = '22023';
  end if;
  select hypercare.* into strict v_window from public.website_hypercare_windows hypercare
  where hypercare.organisation_id = p_organisation_id and hypercare.status = 'observing' for update;
  if now() < v_window.earliest_acceptance_at then raise exception 'At least seven full hypercare days are required.' using errcode = '23514'; end if;
  select count(distinct observation_date)::integer into v_pass_days
  from public.website_hypercare_daily_observations observation
  where observation.hypercare_window_id = v_window.id and observation.result = 'pass';
  if v_pass_days < 7 or exists (select 1 from public.website_hypercare_daily_observations observation
    where observation.hypercare_window_id = v_window.id and observation.result = 'fail') then
    raise exception 'Seven passing daily observations with no failed day are required.' using errcode = '23514';
  end if;
  if exists (select 1 from public.website_hypercare_incidents incident
    where incident.hypercare_window_id = v_window.id and incident.status = 'open') then
    raise exception 'Resolve every hypercare incident before production acceptance.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.website_production_releases release
    join public.website_domains domain on domain.website_site_id = release.website_site_id
    where release.id = v_window.release_id and release.status = 'active'
      and domain.hostname = release.target_hostname and domain.domain_kind = 'custom'
      and domain.status = 'active' and domain.is_primary) then
    raise exception 'The exact custom-domain production release must remain active.' using errcode = '23514';
  end if;
  update public.website_hypercare_windows hypercare set status = 'accepted', accepted_at = now(),
    accepted_by = v_approver, acceptance_json = p_acceptance
  where hypercare.id = v_window.id returning * into v_window;
  insert into public.website_hypercare_events (hypercare_window_id, organisation_id, action, operator, metadata_json)
  values (v_window.id, p_organisation_id, 'accepted', left(trim(p_operator), 160),
    pg_catalog.jsonb_build_object('passDays', v_pass_days, 'clientApproverName', v_approver,
      'approvalReference', p_acceptance ->> 'approvalReference'));
  return pg_catalog.jsonb_build_object('hypercareWindowId', v_window.id, 'status', v_window.status,
    'acceptedAt', v_window.accepted_at, 'passDays', v_pass_days);
exception when no_data_found then raise exception 'No observing hypercare window exists.' using errcode = 'P0002';
end;
$$;

revoke all on function public.website_start_hypercare(uuid, text) from public, anon, authenticated;
revoke all on function public.website_record_hypercare_observation(uuid, date, jsonb, text) from public, anon, authenticated;
revoke all on function public.website_record_hypercare_incident(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.website_resolve_hypercare_incident(uuid, text, text) from public, anon, authenticated;
revoke all on function public.website_accept_hypercare(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.website_start_hypercare(uuid, text) to service_role;
grant execute on function public.website_record_hypercare_observation(uuid, date, jsonb, text) to service_role;
grant execute on function public.website_record_hypercare_incident(uuid, text, text, text, text) to service_role;
grant execute on function public.website_resolve_hypercare_incident(uuid, text, text) to service_role;
grant execute on function public.website_accept_hypercare(uuid, jsonb, text) to service_role;
revoke all on function public.website_reject_hypercare_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.website_protect_hypercare_observation() from public, anon, authenticated, service_role;
revoke all on function public.website_protect_hypercare_incident_core() from public, anon, authenticated, service_role;

comment on table public.website_hypercare_windows is 'Seven-to-fourteen-day production hypercare gate; creation requires an active primary custom domain.';
comment on table public.website_hypercare_daily_observations is 'Immutable daily route, journey, listing, media, runtime and CRM reconciliation evidence.';
comment on table public.website_hypercare_incidents is 'Production incident register for the pilot hypercare window.';
comment on table public.website_hypercare_events is 'Immutable hypercare lifecycle and incident audit ledger.';

notify pgrst, 'reload schema';
commit;
;
