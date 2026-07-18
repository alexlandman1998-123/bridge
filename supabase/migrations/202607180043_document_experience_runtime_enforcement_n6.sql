begin;

create table if not exists public.document_experience_rollout_controls_n6 (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  stage text not null,
  status text not null default 'active',
  revision integer not null,
  cohort_digest text not null,
  evidence_digest text not null,
  max_participants integer not null,
  observation_started_at timestamptz not null,
  observation_ends_at timestamptz not null,
  expires_at timestamptz not null,
  change_reference text not null,
  source_n4 jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_experience_rollout_controls_n6_stage_check check (stage in ('pilot','expanded','full')),
  constraint document_experience_rollout_controls_n6_status_check check (status in ('active','paused','completed')),
  constraint document_experience_rollout_controls_n6_digest_check check (cohort_digest ~ '^sha256:[a-f0-9]{64}$' and evidence_digest ~ '^sha256:[a-f0-9]{64}$'),
  constraint document_experience_rollout_controls_n6_limit_check check (max_participants between 1 and 1000),
  constraint document_experience_rollout_controls_n6_window_check check (observation_started_at < observation_ends_at and observation_ends_at < expires_at),
  unique(environment, revision)
);

create unique index if not exists document_experience_rollout_controls_n6_one_active_idx
  on public.document_experience_rollout_controls_n6(environment) where status = 'active';

create table if not exists public.document_experience_rollout_enrolments_n6 (
  control_id uuid not null references public.document_experience_rollout_controls_n6(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  primary key(control_id, organisation_id),
  constraint document_experience_rollout_enrolments_n6_status_check check (status in ('active','paused','removed'))
);

create index if not exists document_experience_rollout_enrolments_n6_org_idx
  on public.document_experience_rollout_enrolments_n6(organisation_id, enrolled_at desc);

create table if not exists public.document_experience_rollout_audit_n6 (
  id uuid primary key default gen_random_uuid(),
  control_id uuid references public.document_experience_rollout_controls_n6(id) on delete set null,
  environment text not null,
  stage text not null,
  status text not null,
  revision integer not null,
  cohort_digest text not null,
  evidence_digest text not null,
  organisation_count integer not null,
  change_reference text not null,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.document_experience_rollout_controls_n6 enable row level security;
alter table public.document_experience_rollout_enrolments_n6 enable row level security;
alter table public.document_experience_rollout_audit_n6 enable row level security;

drop policy if exists document_experience_rollout_controls_n6_member_select on public.document_experience_rollout_controls_n6;
create policy document_experience_rollout_controls_n6_member_select
on public.document_experience_rollout_controls_n6 for select to authenticated
using (exists (
  select 1 from public.document_experience_rollout_enrolments_n6 enrolment
  where enrolment.control_id = document_experience_rollout_controls_n6.id and public.bridge_is_active_member(enrolment.organisation_id)
));

drop policy if exists document_experience_rollout_enrolments_n6_member_select on public.document_experience_rollout_enrolments_n6;
create policy document_experience_rollout_enrolments_n6_member_select
on public.document_experience_rollout_enrolments_n6 for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists document_experience_rollout_audit_n6_member_select on public.document_experience_rollout_audit_n6;
create policy document_experience_rollout_audit_n6_member_select
on public.document_experience_rollout_audit_n6 for select to authenticated
using (exists (
  select 1
  from public.document_experience_rollout_enrolments_n6 enrolment
  where enrolment.control_id = document_experience_rollout_audit_n6.control_id
    and public.bridge_is_active_member(enrolment.organisation_id)
));

create or replace function public.bridge_set_document_experience_rollout_n6(
  p_environment text,
  p_stage text,
  p_status text,
  p_cohort_digest text,
  p_evidence_digest text,
  p_max_participants integer,
  p_observation_started_at timestamptz,
  p_observation_ends_at timestamptz,
  p_expires_at timestamptz,
  p_change_reference text,
  p_organisation_ids uuid[],
  p_source_n4 jsonb default '{}'::jsonb,
  p_expected_revision integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_stage text := lower(trim(coalesce(p_stage, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
  v_current public.document_experience_rollout_controls_n6%rowtype;
  v_control_id uuid;
  v_revision integer;
  v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.' using errcode = '42501'; end if;
  if v_environment = '' or v_stage not in ('pilot','expanded','full') or v_status not in ('active','paused','completed') then raise exception 'Invalid rollout target.' using errcode = '22023'; end if;
  if coalesce(p_change_reference, '') = '' or coalesce(p_cohort_digest, '') !~ '^sha256:[a-f0-9]{64}$' or coalesce(p_evidence_digest, '') !~ '^sha256:[a-f0-9]{64}$' then raise exception 'Digest binding and change reference required.' using errcode = '22023'; end if;
  if p_observation_started_at >= p_observation_ends_at or p_observation_ends_at >= p_expires_at then raise exception 'Invalid rollout window.' using errcode = '22023'; end if;
  select * into v_current from public.document_experience_rollout_controls_n6 where environment = v_environment order by revision desc limit 1 for update;
  if coalesce(v_current.revision, 0) <> coalesce(p_expected_revision, 0) then raise exception 'Rollout revision conflict.' using errcode = '40001'; end if;
  if (v_stage = 'pilot' and p_max_participants > 10) or (v_stage = 'expanded' and p_max_participants > 100) or (v_stage = 'full' and p_max_participants > 1000) then raise exception 'Stage participant ceiling exceeded.' using errcode = '22023'; end if;
  if v_current.id is not null and v_status = 'active' and v_stage <> v_current.stage and not (v_current.stage = 'pilot' and v_stage = 'expanded') and not (v_current.stage = 'expanded' and v_stage = 'full') then raise exception 'Invalid rollout stage transition.' using errcode = '22023'; end if;
  v_revision := coalesce(v_current.revision, 0) + 1;
  select count(distinct item) into v_count from unnest(coalesce(p_organisation_ids, array[]::uuid[])) item;
  if v_count < 1 or v_count > p_max_participants then raise exception 'Organisation cohort exceeds participant limit.' using errcode = '22023'; end if;
  if v_status = 'active' then update public.document_experience_rollout_controls_n6 set status = 'paused', updated_at = now() where environment = v_environment and status = 'active'; end if;
  insert into public.document_experience_rollout_controls_n6(environment, stage, status, revision, cohort_digest, evidence_digest, max_participants, observation_started_at, observation_ends_at, expires_at, change_reference, source_n4, created_by)
  values(v_environment, v_stage, v_status, v_revision, lower(p_cohort_digest), lower(p_evidence_digest), p_max_participants, p_observation_started_at, p_observation_ends_at, p_expires_at, trim(p_change_reference), coalesce(p_source_n4, '{}'::jsonb), auth.uid()) returning id into v_control_id;
  insert into public.document_experience_rollout_enrolments_n6(control_id, organisation_id)
  select v_control_id, item from (select distinct unnest(p_organisation_ids) item) cohort;
  insert into public.document_experience_rollout_audit_n6(control_id, environment, stage, status, revision, cohort_digest, evidence_digest, organisation_count, change_reference, performed_by)
  values(v_control_id, v_environment, v_stage, v_status, v_revision, lower(p_cohort_digest), lower(p_evidence_digest), v_count, trim(p_change_reference), auth.uid());
  return jsonb_build_object('success', true, 'control_id', v_control_id, 'revision', v_revision, 'stage', v_stage, 'status', v_status, 'organisation_count', v_count);
end;
$$;

create or replace function public.bridge_document_experience_runtime_access_n6(p_organisation_id uuid, p_environment text default 'production')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_control public.document_experience_rollout_controls_n6%rowtype;
  v_enrolment public.document_experience_rollout_enrolments_n6%rowtype;
  v_count integer;
begin
  if p_organisation_id is null then return jsonb_build_object('configured', false, 'allowed', false, 'reason', 'organisation_required'); end if;
  if auth.role() <> 'service_role' and not public.bridge_is_active_member(p_organisation_id) then raise exception 'Organisation membership required.' using errcode = '42501'; end if;
  select * into v_control from public.document_experience_rollout_controls_n6 where environment = lower(trim(coalesce(p_environment, 'production'))) order by revision desc limit 1;
  if v_control.id is null then return jsonb_build_object('configured', false, 'allowed', false, 'reason', 'no_control'); end if;
  if v_control.status <> 'active' then return jsonb_build_object('configured', true, 'allowed', false, 'reason', 'paused', 'stage', v_control.stage, 'revision', v_control.revision); end if;
  if now() >= v_control.expires_at then return jsonb_build_object('configured', true, 'allowed', false, 'reason', 'expired', 'stage', v_control.stage, 'revision', v_control.revision, 'expires_at', v_control.expires_at); end if;
  if v_control.cohort_digest !~ '^sha256:[a-f0-9]{64}$' or v_control.evidence_digest !~ '^sha256:[a-f0-9]{64}$' then return jsonb_build_object('configured', true, 'allowed', false, 'reason', 'invalid_control', 'stage', v_control.stage, 'revision', v_control.revision); end if;
  select * into v_enrolment from public.document_experience_rollout_enrolments_n6 where control_id = v_control.id and organisation_id = p_organisation_id limit 1;
  if v_enrolment.control_id is null or v_enrolment.status <> 'active' then return jsonb_build_object('configured', true, 'allowed', false, 'reason', 'not_enrolled', 'stage', v_control.stage, 'revision', v_control.revision); end if;
  select count(*) into v_count from public.document_experience_rollout_enrolments_n6 where control_id = v_control.id and status = 'active';
  if v_count > v_control.max_participants then return jsonb_build_object('configured', true, 'allowed', false, 'reason', 'cohort_limit_exceeded', 'stage', v_control.stage, 'revision', v_control.revision); end if;
  return jsonb_build_object('configured', true, 'allowed', true, 'reason', 'enrolled', 'stage', v_control.stage, 'revision', v_control.revision, 'expires_at', v_control.expires_at);
end;
$$;

revoke all on function public.bridge_set_document_experience_rollout_n6(text,text,text,text,text,integer,timestamptz,timestamptz,timestamptz,text,uuid[],jsonb,integer) from public, anon, authenticated;
grant execute on function public.bridge_set_document_experience_rollout_n6(text,text,text,text,text,integer,timestamptz,timestamptz,timestamptz,text,uuid[],jsonb,integer) to service_role;
revoke all on function public.bridge_document_experience_runtime_access_n6(uuid,text) from public, anon;
grant execute on function public.bridge_document_experience_runtime_access_n6(uuid,text) to authenticated, service_role;

commit;
