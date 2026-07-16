begin;

create table if not exists public.conveyancer_provider_credential_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  integration_profile_id uuid not null,
  operation_id text not null check (length(trim(operation_id)) > 0),
  provider_key text not null check (length(trim(provider_key)) > 0),
  environment text not null check (environment in ('sandbox', 'production')),
  reference_kind text not null check (reference_kind in ('env', 'vault', 'none')),
  status text not null check (status in ('verified', 'missing', 'invalid', 'resolver_unavailable')),
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  checked_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  contract_version text not null default 'conveyancer_provider_application_h6_v1',
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, integration_profile_id, operation_id, status),
  foreign key (integration_profile_id, organisation_id, attorney_firm_id)
    references public.conveyancer_integration_profiles(id, organisation_id, attorney_firm_id) on delete restrict
);

create index if not exists conveyancer_provider_credential_checks_scope_idx
  on public.conveyancer_provider_credential_checks(organisation_id, attorney_firm_id, integration_profile_id, checked_at desc);

alter table public.conveyancer_provider_credential_checks enable row level security;
drop policy if exists conveyancer_provider_credential_checks_select_scoped on public.conveyancer_provider_credential_checks;
create policy conveyancer_provider_credential_checks_select_scoped on public.conveyancer_provider_credential_checks
  for select to authenticated
  using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid));
revoke all on public.conveyancer_provider_credential_checks from anon, authenticated, service_role;
grant select on public.conveyancer_provider_credential_checks to authenticated, service_role;

drop trigger if exists conveyancer_provider_credential_checks_immutable on public.conveyancer_provider_credential_checks;
create trigger conveyancer_provider_credential_checks_immutable
  before update or delete on public.conveyancer_provider_credential_checks
  for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_provider_credential_checks_audit on public.conveyancer_provider_credential_checks;
create trigger conveyancer_provider_credential_checks_audit
  after insert on public.conveyancer_provider_credential_checks
  for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_record_conveyancer_provider_credential_check_h6(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_firm uuid; v_profile uuid; v_existing uuid; v_id uuid;
  v_status text := lower(trim(coalesce(payload ->> 'status', '')));
  v_kind text := lower(trim(coalesce(payload ->> 'referenceKind', 'none')));
  v_environment text := lower(trim(coalesce(payload ->> 'environment', 'sandbox')));
  v_fingerprint text := trim(coalesce(payload ->> 'fingerprint', ''));
  v_operation text := trim(coalesce(payload ->> 'operationId', ''));
begin
  begin
    v_org := (payload ->> 'organisationId')::uuid;
    v_firm := (payload ->> 'attorneyFirmId')::uuid;
    v_profile := (payload ->> 'profileId')::uuid;
  exception when invalid_text_representation then
    raise exception 'H6 credential-check binding is invalid.' using errcode = '22023';
  end;
  if coalesce(payload ->> 'version', '') <> 'conveyancer_provider_application_h6_v1'
    or v_operation = '' or v_status not in ('verified', 'missing', 'invalid', 'resolver_unavailable')
    or v_kind not in ('env', 'vault', 'none') or v_environment not in ('sandbox', 'production')
    or length(v_fingerprint) < 8 or octet_length(payload::text) > 8192
    or payload::text ~* '"(credential|secret|access.?token|api.?key|password|value)"[[:space:]]*:' then
    raise exception 'H6 credential evidence must be minimal and secret-free.' using errcode = '22023';
  end if;
  if not exists(
    select 1 from public.conveyancer_integration_profiles profile
    where profile.id = v_profile and profile.organisation_id = v_org and profile.attorney_firm_id = v_firm and profile.source_phase = 'P6'
  ) then raise exception 'H6 provider-profile binding is invalid.' using errcode = '22023'; end if;
  select id into v_existing from public.conveyancer_provider_credential_checks
  where attorney_firm_id = v_firm and integration_profile_id = v_profile and operation_id = v_operation and status = v_status;
  if v_existing is not null then return jsonb_build_object('ok', true, 'duplicate', true, 'checkId', v_existing); end if;
  insert into public.conveyancer_provider_credential_checks(
    organisation_id, attorney_firm_id, integration_profile_id, operation_id, provider_key,
    environment, reference_kind, status, fingerprint, checked_at, expires_at, metadata
  ) values (
    v_org, v_firm, v_profile, v_operation, lower(trim(payload ->> 'providerKey')),
    v_environment, v_kind, v_status, v_fingerprint, coalesce((payload ->> 'checkedAt')::timestamptz, now()),
    nullif(payload ->> 'expiresAt', '')::timestamptz, coalesce(payload -> 'metadata', '{}'::jsonb)
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'checkId', v_id, 'status', v_status);
end $$;

revoke all on function public.bridge_record_conveyancer_provider_credential_check_h6(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bridge_record_conveyancer_provider_credential_check_h6(jsonb) to service_role;

comment on table public.conveyancer_provider_credential_checks is 'H6 immutable, secret-free evidence that a server-side provider credential reference was resolvable.';
comment on function public.bridge_record_conveyancer_provider_credential_check_h6(jsonb) is 'H6 service-only credential readiness recorder; credential material is forbidden.';

notify pgrst, 'reload schema';
commit;
