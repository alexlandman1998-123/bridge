begin;

-- Control identifier: phase6_server_owned_release_epoch_integrity.
-- Phase 6 successor-release epochs are deliberately inert when this migration
-- is introduced.  This file creates only server-owned control-plane records:
-- it seeds no epoch, changes no runtime guard, and grants no browser/client
-- mutation path.  A future separately approved release must explicitly prepare
-- an epoch, register exactly two immutable memberships, and transition it from
-- prepared to active through the service-role RPC below.

create table if not exists public.legal_document_successor_release_epochs_phase6 (
  id uuid primary key,
  plan_digest text not null check (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  proposal_manifest_digest text not null check (proposal_manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  parent_phase5_receipt_commit_sha text not null check (parent_phase5_receipt_commit_sha ~ '^[0-9a-f]{40}$'),
  parent_phase5_receipt_manifest_digest text not null check (parent_phase5_receipt_manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  parent_phase5_observation_plan_digest text not null check (parent_phase5_observation_plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  legal_approval_evidence_digest text not null check (legal_approval_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  release_approval_evidence_digest text not null check (release_approval_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  release_contract text not null check (release_contract = 'legal-document-successor-release-epoch-v1'),
  intended_organisation_count smallint not null default 2 check (intended_organisation_count = 2),
  state text not null default 'prepared' check (state in ('prepared', 'active', 'draining', 'suspended')),
  prepared_at timestamptz not null default now(),
  state_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (plan_digest),
  -- This composite key is deliberately redundant with the primary key.  It is
  -- the referential target that prevents a packet binding from presenting an
  -- authentic epoch id alongside a different release-plan digest.
  unique (id, plan_digest),
  check (state_changed_at >= prepared_at)
);

-- Prepared, suspended, and draining epochs may coexist so that an approved
-- release can be staged and an earlier release can finish its already-bound
-- work.  Only one epoch may admit *new* packet bindings globally, however.
-- This database-level invariant also closes the concurrent-transition race:
-- two independent service transactions cannot both promote an epoch to active.
create unique index if not exists legal_document_successor_release_epochs_phase6_one_active_uq
  on public.legal_document_successor_release_epochs_phase6 (state)
  where state = 'active';

create table if not exists public.legal_document_successor_release_memberships_phase6 (
  id uuid primary key default gen_random_uuid(),
  release_epoch_id uuid not null references public.legal_document_successor_release_epochs_phase6(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  membership_slot smallint not null check (membership_slot in (1, 2)),
  cohort_role text not null check (cohort_role in ('existing_pilot', 'first_expansion')),
  membership_digest text not null check (membership_digest ~ '^sha256:[0-9a-f]{64}$'),
  allowed_packet_types text[] not null check (allowed_packet_types = array['mandate', 'otp']::text[]),
  membership_contract text not null check (membership_contract = 'legal-document-successor-release-membership-v1'),
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (release_epoch_id, organisation_id),
  unique (release_epoch_id, membership_slot),
  unique (release_epoch_id, cohort_role),
  -- Keep the binding's membership id, release epoch, organisation, and digest
  -- inseparable at the database boundary, not only in the service RPC.
  unique (id, release_epoch_id, organisation_id, membership_digest),
  check (
    (membership_slot = 1 and cohort_role = 'existing_pilot')
    or (membership_slot = 2 and cohort_role = 'first_expansion')
  )
);

create index if not exists legal_document_successor_release_memberships_phase6_epoch_idx
  on public.legal_document_successor_release_memberships_phase6 (release_epoch_id, membership_slot);

create table if not exists public.legal_document_successor_release_epoch_transitions_phase6 (
  id uuid primary key default gen_random_uuid(),
  release_epoch_id uuid not null references public.legal_document_successor_release_epochs_phase6(id) on delete restrict,
  plan_digest text not null check (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  from_state text check (from_state is null or from_state in ('prepared', 'active', 'draining', 'suspended')),
  to_state text not null check (to_state in ('prepared', 'active', 'draining', 'suspended')),
  transition_evidence_digest text not null check (transition_evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  transition_contract text not null check (transition_contract = 'legal-document-successor-release-transition-v1'),
  transitioned_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (release_epoch_id, to_state),
  check (
    (from_state is null and to_state = 'prepared')
    or (from_state = 'prepared' and to_state in ('active', 'suspended'))
    or (from_state = 'active' and to_state in ('draining', 'suspended'))
    or (from_state = 'draining' and to_state = 'suspended')
  )
);

create index if not exists legal_document_successor_release_epoch_transitions_phase6_epoch_idx
  on public.legal_document_successor_release_epoch_transitions_phase6 (release_epoch_id, transitioned_at desc);

create table if not exists public.legal_document_successor_release_packet_bindings_phase6 (
  id uuid primary key default gen_random_uuid(),
  release_epoch_id uuid not null references public.legal_document_successor_release_epochs_phase6(id) on delete restrict,
  membership_id uuid not null references public.legal_document_successor_release_memberships_phase6(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  packet_id uuid not null references public.document_packets(id) on delete restrict,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete restrict,
  generated_document_id uuid not null references public.documents(id) on delete restrict,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  plan_digest text not null check (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  membership_digest text not null check (membership_digest ~ '^sha256:[0-9a-f]{64}$'),
  generated_artifact_sha256 text not null check (generated_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  binding_contract text not null check (binding_contract = 'legal-document-successor-release-packet-binding-v1'),
  bound_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (packet_version_id),
  unique (release_epoch_id, packet_id, packet_version_id),
  constraint ld_sre_p6_binding_epoch_plan_fk
    foreign key (release_epoch_id, plan_digest)
    references public.legal_document_successor_release_epochs_phase6 (id, plan_digest)
    on delete restrict,
  constraint ld_sre_p6_binding_membership_scope_fk
    foreign key (membership_id, release_epoch_id, organisation_id, membership_digest)
    references public.legal_document_successor_release_memberships_phase6 (
      id, release_epoch_id, organisation_id, membership_digest
    )
    on delete restrict
);

create index if not exists legal_document_successor_release_packet_bindings_phase6_packet_idx
  on public.legal_document_successor_release_packet_bindings_phase6 (release_epoch_id, organisation_id, packet_id, bound_at desc);

create table if not exists public.legal_document_successor_release_lifecycle_events_phase6 (
  id uuid primary key default gen_random_uuid(),
  release_epoch_id uuid not null references public.legal_document_successor_release_epochs_phase6(id) on delete restrict,
  binding_id uuid not null references public.legal_document_successor_release_packet_bindings_phase6(id) on delete restrict,
  membership_id uuid not null references public.legal_document_successor_release_memberships_phase6(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  packet_id uuid not null references public.document_packets(id) on delete restrict,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete restrict,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  plan_digest text not null check (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  membership_digest text not null check (membership_digest ~ '^sha256:[0-9a-f]{64}$'),
  stage text not null check (stage in ('signing_invite_delivered', 'final_delivery_completed', 'final_access_authorized')),
  access_context text check (access_context is null or access_context in ('client_portal', 'seller_portal', 'workspace', 'signer')),
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$'),
  lifecycle_contract text not null check (lifecycle_contract = 'legal-document-successor-release-lifecycle-v1'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (binding_id, packet_version_id, stage)
);

create index if not exists legal_document_successor_release_lifecycle_events_phase6_packet_idx
  on public.legal_document_successor_release_lifecycle_events_phase6 (release_epoch_id, packet_id, packet_version_id, observed_at desc);

alter table public.legal_document_successor_release_epochs_phase6 enable row level security;
alter table public.legal_document_successor_release_memberships_phase6 enable row level security;
alter table public.legal_document_successor_release_epoch_transitions_phase6 enable row level security;
alter table public.legal_document_successor_release_packet_bindings_phase6 enable row level security;
alter table public.legal_document_successor_release_lifecycle_events_phase6 enable row level security;

revoke all on table public.legal_document_successor_release_epochs_phase6 from public, anon, authenticated, service_role;
revoke all on table public.legal_document_successor_release_memberships_phase6 from public, anon, authenticated, service_role;
revoke all on table public.legal_document_successor_release_epoch_transitions_phase6 from public, anon, authenticated, service_role;
revoke all on table public.legal_document_successor_release_packet_bindings_phase6 from public, anon, authenticated, service_role;
revoke all on table public.legal_document_successor_release_lifecycle_events_phase6 from public, anon, authenticated, service_role;

-- Service processes can inspect durable evidence, but cannot write these
-- tables directly.  All mutations go through the narrowly-scoped RPCs below.
grant select on table public.legal_document_successor_release_epochs_phase6 to service_role;
grant select on table public.legal_document_successor_release_memberships_phase6 to service_role;
grant select on table public.legal_document_successor_release_epoch_transitions_phase6 to service_role;
grant select on table public.legal_document_successor_release_packet_bindings_phase6 to service_role;
grant select on table public.legal_document_successor_release_lifecycle_events_phase6 to service_role;

create or replace function public.bridge_enforce_legal_document_successor_release_epoch_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor release epochs require service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if current_setting('bridge.legal_document_successor_release_epoch_phase6', true) <> 'prepare'
      or new.state <> 'prepared'
      or new.release_contract <> 'legal-document-successor-release-epoch-v1'
      or new.intended_organisation_count <> 2 then
      raise exception 'Phase 6 successor release epochs must be prepared through the controlled RPC.'
        using errcode = '55000', detail = 'PHASE6_EPOCH_PREPARE_REQUIRED';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('bridge.legal_document_successor_release_epoch_phase6', true) <> 'transition'
      or new.id is distinct from old.id
      or new.plan_digest is distinct from old.plan_digest
      or new.proposal_manifest_digest is distinct from old.proposal_manifest_digest
      or new.parent_phase5_receipt_commit_sha is distinct from old.parent_phase5_receipt_commit_sha
      or new.parent_phase5_receipt_manifest_digest is distinct from old.parent_phase5_receipt_manifest_digest
      or new.parent_phase5_observation_plan_digest is distinct from old.parent_phase5_observation_plan_digest
      or new.legal_approval_evidence_digest is distinct from old.legal_approval_evidence_digest
      or new.release_approval_evidence_digest is distinct from old.release_approval_evidence_digest
      or new.release_contract is distinct from old.release_contract
      or new.intended_organisation_count is distinct from old.intended_organisation_count
      or new.prepared_at is distinct from old.prepared_at
      or new.created_at is distinct from old.created_at then
      raise exception 'Phase 6 successor release epoch scope is immutable.'
        using errcode = '55000', detail = 'PHASE6_EPOCH_IMMUTABLE';
    end if;

    if not (
      (old.state = 'prepared' and new.state in ('active', 'suspended'))
      or (old.state = 'active' and new.state in ('draining', 'suspended'))
      or (old.state = 'draining' and new.state = 'suspended')
    ) then
      raise exception 'Phase 6 successor release state transition is invalid.'
        using errcode = '55000', detail = 'PHASE6_EPOCH_TRANSITION_INVALID';
    end if;

    if new.state = 'active' then
      select count(*) into v_membership_count
      from public.legal_document_successor_release_memberships_phase6
      where release_epoch_id = old.id;
      if v_membership_count <> 2 then
        raise exception 'Phase 6 activation requires exactly two immutable organisation memberships.'
          using errcode = '55000', detail = 'PHASE6_EPOCH_EXACT_TWO_MEMBERSHIPS_REQUIRED';
      end if;
    end if;
    if new.state_changed_at < old.state_changed_at then
      raise exception 'Phase 6 successor release state time cannot move backwards.'
        using errcode = '22000', detail = 'PHASE6_EPOCH_TIME_INVALID';
    end if;
    return new;
  end if;

  raise exception 'Phase 6 successor release epochs are never deleted.'
    using errcode = '55000', detail = 'PHASE6_EPOCH_DELETE_FORBIDDEN';
end;
$$;

create or replace function public.bridge_enforce_legal_document_successor_release_membership_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_membership_count integer := 0;
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or current_setting('bridge.legal_document_successor_release_epoch_phase6', true) <> 'membership' then
    raise exception 'Phase 6 successor release memberships are append-only controlled records.'
      using errcode = '42501', detail = 'PHASE6_MEMBERSHIP_MUTATION_FORBIDDEN';
  end if;

  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = new.release_epoch_id
  for update;
  if not found or v_epoch.state <> 'prepared' then
    raise exception 'Phase 6 successor release memberships can only be registered while the epoch is prepared.'
      using errcode = '55000', detail = 'PHASE6_MEMBERSHIP_PREPARED_EPOCH_REQUIRED';
  end if;

  select count(*) into v_membership_count
  from public.legal_document_successor_release_memberships_phase6
  where release_epoch_id = new.release_epoch_id;
  if v_membership_count >= 2 then
    raise exception 'Phase 6 successor release epochs cannot name more than two organisations.'
      using errcode = '55000', detail = 'PHASE6_MEMBERSHIP_LIMIT_EXCEEDED';
  end if;

  if new.membership_contract <> 'legal-document-successor-release-membership-v1'
    or new.allowed_packet_types is distinct from array['mandate', 'otp']::text[]
    or not (
      (new.membership_slot = 1 and new.cohort_role = 'existing_pilot')
      or (new.membership_slot = 2 and new.cohort_role = 'first_expansion')
    ) then
    raise exception 'Phase 6 successor release membership scope is invalid.'
      using errcode = '22000', detail = 'PHASE6_MEMBERSHIP_SCOPE_INVALID';
  end if;
  return new;
end;
$$;

create or replace function public.bridge_enforce_legal_document_successor_release_transition_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or current_setting('bridge.legal_document_successor_release_epoch_phase6', true) not in ('prepare', 'transition') then
    raise exception 'Phase 6 successor release transition history is append-only.'
      using errcode = '42501', detail = 'PHASE6_TRANSITION_MUTATION_FORBIDDEN';
  end if;
  return new;
end;
$$;

create or replace function public.bridge_enforce_legal_document_successor_release_binding_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or current_setting('bridge.legal_document_successor_release_epoch_phase6', true) <> 'bind' then
    raise exception 'Phase 6 successor release packet bindings are append-only controlled records.'
      using errcode = '42501', detail = 'PHASE6_BINDING_MUTATION_FORBIDDEN';
  end if;
  return new;
end;
$$;

create or replace function public.bridge_enforce_legal_document_successor_release_lifecycle_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or current_setting('bridge.legal_document_successor_release_epoch_phase6', true) <> 'lifecycle' then
    raise exception 'Phase 6 successor release lifecycle evidence is append-only controlled records.'
      using errcode = '42501', detail = 'PHASE6_LIFECYCLE_MUTATION_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_document_successor_release_epoch_phase6 on public.legal_document_successor_release_epochs_phase6;
create trigger trg_legal_document_successor_release_epoch_phase6
before insert or update or delete on public.legal_document_successor_release_epochs_phase6
for each row execute function public.bridge_enforce_legal_document_successor_release_epoch_phase6();

drop trigger if exists trg_legal_document_successor_release_membership_phase6 on public.legal_document_successor_release_memberships_phase6;
create trigger trg_legal_document_successor_release_membership_phase6
before insert or update or delete on public.legal_document_successor_release_memberships_phase6
for each row execute function public.bridge_enforce_legal_document_successor_release_membership_phase6();

drop trigger if exists trg_legal_document_successor_release_transition_phase6 on public.legal_document_successor_release_epoch_transitions_phase6;
create trigger trg_legal_document_successor_release_transition_phase6
before insert or update or delete on public.legal_document_successor_release_epoch_transitions_phase6
for each row execute function public.bridge_enforce_legal_document_successor_release_transition_phase6();

drop trigger if exists trg_legal_document_successor_release_binding_phase6 on public.legal_document_successor_release_packet_bindings_phase6;
create trigger trg_legal_document_successor_release_binding_phase6
before insert or update or delete on public.legal_document_successor_release_packet_bindings_phase6
for each row execute function public.bridge_enforce_legal_document_successor_release_binding_phase6();

drop trigger if exists trg_legal_document_successor_release_lifecycle_phase6 on public.legal_document_successor_release_lifecycle_events_phase6;
create trigger trg_legal_document_successor_release_lifecycle_phase6
before insert or update or delete on public.legal_document_successor_release_lifecycle_events_phase6
for each row execute function public.bridge_enforce_legal_document_successor_release_lifecycle_phase6();

create or replace function public.bridge_prepare_legal_document_successor_release_epoch_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_proposal_manifest_digest text,
  p_parent_phase5_receipt_commit_sha text,
  p_parent_phase5_receipt_manifest_digest text,
  p_parent_phase5_observation_plan_digest text,
  p_legal_approval_evidence_digest text,
  p_release_approval_evidence_digest text,
  p_prepared_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_proposal_manifest_digest text := lower(trim(coalesce(p_proposal_manifest_digest, '')));
  v_parent_phase5_receipt_commit_sha text := lower(trim(coalesce(p_parent_phase5_receipt_commit_sha, '')));
  v_parent_phase5_receipt_manifest_digest text := lower(trim(coalesce(p_parent_phase5_receipt_manifest_digest, '')));
  v_parent_phase5_observation_plan_digest text := lower(trim(coalesce(p_parent_phase5_observation_plan_digest, '')));
  v_legal_approval_evidence_digest text := lower(trim(coalesce(p_legal_approval_evidence_digest, '')));
  v_release_approval_evidence_digest text := lower(trim(coalesce(p_release_approval_evidence_digest, '')));
  v_prepared_at timestamptz := coalesce(p_prepared_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor release preparation requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  if p_release_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_proposal_manifest_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_parent_phase5_receipt_commit_sha !~ '^[0-9a-f]{40}$'
    or v_parent_phase5_receipt_manifest_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_parent_phase5_observation_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_legal_approval_evidence_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_release_approval_evidence_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_prepared_at > now() + interval '5 minutes' then
    raise exception 'Phase 6 successor release preparation input is invalid.'
      using errcode = '22000', detail = 'PHASE6_EPOCH_PREPARE_INPUT_INVALID';
  end if;

  perform set_config('bridge.legal_document_successor_release_epoch_phase6', 'prepare', true);
  insert into public.legal_document_successor_release_epochs_phase6 (
    id, plan_digest, proposal_manifest_digest,
    parent_phase5_receipt_commit_sha, parent_phase5_receipt_manifest_digest, parent_phase5_observation_plan_digest,
    legal_approval_evidence_digest, release_approval_evidence_digest,
    release_contract, intended_organisation_count, state, prepared_at, state_changed_at, created_at
  ) values (
    p_release_id, v_plan_digest, v_proposal_manifest_digest,
    v_parent_phase5_receipt_commit_sha, v_parent_phase5_receipt_manifest_digest, v_parent_phase5_observation_plan_digest,
    v_legal_approval_evidence_digest, v_release_approval_evidence_digest,
    'legal-document-successor-release-epoch-v1', 2, 'prepared', v_prepared_at, v_prepared_at, v_prepared_at
  ) on conflict (id) do nothing;

  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for key share;
  if not found
    or v_epoch.state <> 'prepared'
    or v_epoch.plan_digest <> v_plan_digest
    or v_epoch.proposal_manifest_digest <> v_proposal_manifest_digest
    or v_epoch.parent_phase5_receipt_commit_sha <> v_parent_phase5_receipt_commit_sha
    or v_epoch.parent_phase5_receipt_manifest_digest <> v_parent_phase5_receipt_manifest_digest
    or v_epoch.parent_phase5_observation_plan_digest <> v_parent_phase5_observation_plan_digest
    or v_epoch.legal_approval_evidence_digest <> v_legal_approval_evidence_digest
    or v_epoch.release_approval_evidence_digest <> v_release_approval_evidence_digest
    or v_epoch.release_contract <> 'legal-document-successor-release-epoch-v1'
    or v_epoch.intended_organisation_count <> 2 then
    raise exception 'Phase 6 successor release preparation conflicts with immutable prior evidence.'
      using errcode = '55000', detail = 'PHASE6_EPOCH_PREPARE_CONFLICT';
  end if;

  if not exists (
    select 1 from public.legal_document_successor_release_epoch_transitions_phase6
    where release_epoch_id = v_epoch.id and to_state = 'prepared'
  ) then
    insert into public.legal_document_successor_release_epoch_transitions_phase6 (
      release_epoch_id, plan_digest, from_state, to_state, transition_evidence_digest,
      transition_contract, transitioned_at, created_at
    ) values (
      v_epoch.id, v_epoch.plan_digest, null, 'prepared', v_epoch.release_approval_evidence_digest,
      'legal-document-successor-release-transition-v1', v_epoch.prepared_at, v_epoch.prepared_at
    );
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-epoch-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'state', v_epoch.state,
    'intendedOrganisationCount', v_epoch.intended_organisation_count,
    'preparedAt', v_epoch.prepared_at
  );
end;
$$;

create or replace function public.bridge_register_legal_document_successor_release_membership_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_organisation_id uuid,
  p_membership_slot smallint,
  p_cohort_role text,
  p_membership_digest text,
  p_allowed_packet_types text[],
  p_registered_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_membership public.legal_document_successor_release_memberships_phase6%rowtype;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_membership_digest text := lower(trim(coalesce(p_membership_digest, '')));
  v_cohort_role text := lower(trim(coalesce(p_cohort_role, '')));
  v_allowed_packet_types text[];
  v_registered_at timestamptz := coalesce(p_registered_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor membership registration requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  select array_agg(distinct lower(trim(packet_type)) order by lower(trim(packet_type)))
    into v_allowed_packet_types
  from unnest(coalesce(p_allowed_packet_types, array[]::text[])) as packet_type
  where nullif(trim(packet_type), '') is not null;

  if p_release_id is null or p_organisation_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_membership_digest !~ '^sha256:[0-9a-f]{64}$'
    or p_membership_slot not in (1, 2)
    or (p_membership_slot = 1 and v_cohort_role <> 'existing_pilot')
    or (p_membership_slot = 2 and v_cohort_role <> 'first_expansion')
    or v_allowed_packet_types is distinct from array['mandate', 'otp']::text[]
    or v_registered_at > now() + interval '5 minutes' then
    raise exception 'Phase 6 successor membership input is invalid.'
      using errcode = '22000', detail = 'PHASE6_MEMBERSHIP_INPUT_INVALID';
  end if;

  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for update;
  if not found
    or v_epoch.plan_digest <> v_plan_digest
    or v_epoch.state <> 'prepared'
    or v_epoch.intended_organisation_count <> 2 then
    raise exception 'Phase 6 successor membership requires the exact prepared release epoch.'
      using errcode = '55000', detail = 'PHASE6_MEMBERSHIP_EPOCH_REQUIRED';
  end if;

  select * into v_membership
  from public.legal_document_successor_release_memberships_phase6
  where release_epoch_id = p_release_id and organisation_id = p_organisation_id
  for key share;
  if found then
    if v_membership.membership_slot <> p_membership_slot
      or v_membership.cohort_role <> v_cohort_role
      or v_membership.membership_digest <> v_membership_digest
      or v_membership.allowed_packet_types is distinct from v_allowed_packet_types
      or v_membership.membership_contract <> 'legal-document-successor-release-membership-v1' then
      raise exception 'Phase 6 successor membership conflicts with immutable prior evidence.'
        using errcode = '55000', detail = 'PHASE6_MEMBERSHIP_CONFLICT';
    end if;
  else
    perform set_config('bridge.legal_document_successor_release_epoch_phase6', 'membership', true);
    insert into public.legal_document_successor_release_memberships_phase6 (
      release_epoch_id, organisation_id, membership_slot, cohort_role, membership_digest,
      allowed_packet_types, membership_contract, registered_at, created_at
    ) values (
      v_epoch.id, p_organisation_id, p_membership_slot, v_cohort_role, v_membership_digest,
      v_allowed_packet_types, 'legal-document-successor-release-membership-v1', v_registered_at, v_registered_at
    ) returning * into v_membership;
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-membership-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'membershipId', v_membership.id,
    'organisationId', v_membership.organisation_id,
    'membershipSlot', v_membership.membership_slot,
    'cohortRole', v_membership.cohort_role,
    'membershipDigest', v_membership.membership_digest,
    'allowedPacketTypes', v_membership.allowed_packet_types,
    'registeredAt', v_membership.registered_at
  );
end;
$$;

create or replace function public.bridge_transition_legal_document_successor_release_epoch_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_target_state text,
  p_transition_evidence_digest text,
  p_transitioned_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_from_state text;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_target_state text := lower(trim(coalesce(p_target_state, '')));
  v_transition_evidence_digest text := lower(trim(coalesce(p_transition_evidence_digest, '')));
  v_transitioned_at timestamptz := coalesce(p_transitioned_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor release transition requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  if p_release_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_transition_evidence_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_target_state not in ('active', 'draining', 'suspended')
    or v_transitioned_at > now() + interval '5 minutes' then
    raise exception 'Phase 6 successor release transition input is invalid.'
      using errcode = '22000', detail = 'PHASE6_EPOCH_TRANSITION_INPUT_INVALID';
  end if;

  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for update;
  if not found
    or v_epoch.plan_digest <> v_plan_digest
    or v_transitioned_at < v_epoch.state_changed_at then
    raise exception 'Phase 6 successor release transition requires the exact current epoch.'
      using errcode = '55000', detail = 'PHASE6_EPOCH_TRANSITION_EPOCH_REQUIRED';
  end if;
  if v_target_state = 'active'
    and v_transition_evidence_digest <> v_epoch.release_approval_evidence_digest then
    raise exception 'Phase 6 activation must use the epoch-bound release approval evidence digest.'
      using errcode = '55000', detail = 'PHASE6_EPOCH_ACTIVATION_EVIDENCE_REQUIRED';
  end if;

  v_from_state := v_epoch.state;
  perform set_config('bridge.legal_document_successor_release_epoch_phase6', 'transition', true);
  update public.legal_document_successor_release_epochs_phase6
  set state = v_target_state, state_changed_at = v_transitioned_at
  where id = v_epoch.id
  returning * into v_epoch;

  insert into public.legal_document_successor_release_epoch_transitions_phase6 (
    release_epoch_id, plan_digest, from_state, to_state, transition_evidence_digest,
    transition_contract, transitioned_at, created_at
  ) values (
    v_epoch.id, v_epoch.plan_digest, v_from_state, v_target_state, v_transition_evidence_digest,
    'legal-document-successor-release-transition-v1', v_transitioned_at, v_transitioned_at
  );

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-epoch-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'state', v_epoch.state,
    'stateChangedAt', v_epoch.state_changed_at
  );
end;
$$;

create or replace function public.bridge_bind_legal_document_successor_release_packet_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_organisation_id uuid,
  p_membership_digest text,
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_generated_artifact_sha256 text,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_membership public.legal_document_successor_release_memberships_phase6%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_document public.documents%rowtype;
  v_binding public.legal_document_successor_release_packet_bindings_phase6%rowtype;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_membership_digest text := lower(trim(coalesce(p_membership_digest, '')));
  v_generated_artifact_sha256 text := lower(trim(coalesce(p_generated_artifact_sha256, '')));
  v_packet_type text;
  v_observed_at timestamptz := coalesce(p_observed_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor packet binding requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  if p_release_id is null or p_organisation_id is null or p_packet_id is null or p_packet_version_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_membership_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_generated_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$'
    or v_observed_at > now() + interval '5 minutes' then
    raise exception 'Phase 6 successor packet binding input is invalid.'
      using errcode = '22000', detail = 'PHASE6_BINDING_INPUT_INVALID';
  end if;

  -- Lock the epoch before reading membership or packet state.  This serializes
  -- activation/draining/suspension against a new binding.
  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for update;
  if not found
    or v_epoch.plan_digest <> v_plan_digest
    or v_epoch.state <> 'active'
    or v_epoch.intended_organisation_count <> 2 then
    raise exception 'Phase 6 packet binding requires the exact active successor release epoch.'
      using errcode = '55000', detail = 'PHASE6_BINDING_ACTIVE_EPOCH_REQUIRED';
  end if;

  select * into v_membership
  from public.legal_document_successor_release_memberships_phase6
  where release_epoch_id = v_epoch.id and organisation_id = p_organisation_id
  for key share;
  if not found
    or v_membership.membership_digest <> v_membership_digest
    or v_membership.allowed_packet_types is distinct from array['mandate', 'otp']::text[]
    or v_membership.membership_contract <> 'legal-document-successor-release-membership-v1' then
    raise exception 'Phase 6 packet binding requires the exact immutable organisation membership.'
      using errcode = '55000', detail = 'PHASE6_BINDING_MEMBERSHIP_REQUIRED';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for share;
  select * into v_version
  from public.document_packet_versions
  where id = p_packet_version_id and packet_id = p_packet_id
  for share;
  if not found
    or v_packet.organisation_id is distinct from p_organisation_id
    or v_version.organisation_id is distinct from p_organisation_id then
    raise exception 'Phase 6 successor packet version is missing or outside the registered organisation.'
      using errcode = 'P0002', detail = 'PHASE6_BINDING_PACKET_VERSION_REQUIRED';
  end if;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  if v_packet_type not in ('mandate', 'otp')
    or not (v_packet_type = any(v_membership.allowed_packet_types))
    or v_version.rendered_document_id is null
    or lower(trim(coalesce(v_version.rendered_sha256, ''))) <> v_generated_artifact_sha256 then
    raise exception 'Phase 6 successor packet version does not match the immutable scoped artifact.'
      using errcode = '55000', detail = 'PHASE6_BINDING_PACKET_SCOPE_INVALID';
  end if;
  if v_packet.current_version_number is distinct from v_version.version_number then
    raise exception 'Phase 6 successor packet binding requires the packet current version.'
      using errcode = '55000', detail = 'PHASE6_BINDING_CURRENT_VERSION_REQUIRED';
  end if;

  -- While an epoch is active, state_changed_at is its activation time.  A
  -- packet cannot be admitted retrospectively: its generated version (and a
  -- finalised version, if it already exists) must have been created after the
  -- active epoch began.  Keep bound_at chronological too, rather than letting
  -- a caller backdate receipt evidence before the active release or artifact.
  if v_version.generated_at is null
    or v_version.generated_at <= v_epoch.state_changed_at
    or (v_version.finalised_at is not null and v_version.finalised_at <= v_epoch.state_changed_at)
    or v_observed_at < v_epoch.state_changed_at
    or v_observed_at < v_version.generated_at
    or (v_version.finalised_at is not null and v_observed_at < v_version.finalised_at) then
    raise exception 'Phase 6 successor packet binding requires a current version generated after epoch activation and chronological release evidence.'
      using errcode = '55000', detail = 'PHASE6_BINDING_RELEASE_TIME_REQUIRED';
  end if;
  select * into v_document
  from public.documents
  where id = v_version.rendered_document_id
  for share;
  if not found or v_document.legal_packet_id is distinct from v_packet.id then
    raise exception 'Phase 6 successor binding must name the packet-owned generated document.'
      using errcode = '55000', detail = 'PHASE6_BINDING_DOCUMENT_REQUIRED';
  end if;

  select * into v_binding
  from public.legal_document_successor_release_packet_bindings_phase6
  where packet_version_id = v_version.id
  for key share;
  if found then
    if v_binding.release_epoch_id <> v_epoch.id
      or v_binding.membership_id <> v_membership.id
      or v_binding.organisation_id <> p_organisation_id
      or v_binding.packet_id <> v_packet.id
      or v_binding.generated_document_id <> v_document.id
      or v_binding.packet_type <> v_packet_type
      or v_binding.plan_digest <> v_epoch.plan_digest
      or v_binding.membership_digest <> v_membership.membership_digest
      or v_binding.generated_artifact_sha256 <> v_generated_artifact_sha256
      or v_binding.binding_contract <> 'legal-document-successor-release-packet-binding-v1' then
      raise exception 'Phase 6 successor packet binding conflicts with immutable prior evidence.'
        using errcode = '55000', detail = 'PHASE6_BINDING_CONFLICT';
    end if;
  else
    perform set_config('bridge.legal_document_successor_release_epoch_phase6', 'bind', true);
    insert into public.legal_document_successor_release_packet_bindings_phase6 (
      release_epoch_id, membership_id, organisation_id, packet_id, packet_version_id, generated_document_id,
      packet_type, plan_digest, membership_digest, generated_artifact_sha256,
      binding_contract, bound_at, created_at
    ) values (
      v_epoch.id, v_membership.id, p_organisation_id, v_packet.id, v_version.id, v_document.id,
      v_packet_type, v_epoch.plan_digest, v_membership.membership_digest, v_generated_artifact_sha256,
      'legal-document-successor-release-packet-binding-v1', v_observed_at, v_observed_at
    ) returning * into v_binding;
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-packet-binding-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'membershipId', v_membership.id,
    'membershipDigest', v_membership.membership_digest,
    'bindingId', v_binding.id,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'packetType', v_packet_type,
    'boundAt', v_binding.bound_at
  );
end;
$$;

create or replace function public.bridge_assert_legal_document_successor_release_packet_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_organisation_id uuid,
  p_membership_digest text,
  p_packet_id uuid,
  p_packet_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_membership public.legal_document_successor_release_memberships_phase6%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_binding public.legal_document_successor_release_packet_bindings_phase6%rowtype;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_membership_digest text := lower(trim(coalesce(p_membership_digest, '')));
  v_packet_type text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor release assertion requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  if p_release_id is null or p_organisation_id is null or p_packet_id is null or p_packet_version_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_membership_digest !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Phase 6 successor release assertion input is invalid.'
      using errcode = '22000', detail = 'PHASE6_ASSERT_INPUT_INVALID';
  end if;

  -- An assertion is allowed while draining so already-bound documents can
  -- complete.  It never admits a new binding outside the active state.
  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for share;
  if not found
    or v_epoch.plan_digest <> v_plan_digest
    or v_epoch.state not in ('active', 'draining')
    or v_epoch.intended_organisation_count <> 2 then
    raise exception 'Phase 6 successor release assertion requires an active or draining exact epoch.'
      using errcode = '55000', detail = 'PHASE6_ASSERT_EPOCH_REQUIRED';
  end if;
  select * into v_membership
  from public.legal_document_successor_release_memberships_phase6
  where release_epoch_id = v_epoch.id and organisation_id = p_organisation_id
  for key share;
  if not found or v_membership.membership_digest <> v_membership_digest then
    raise exception 'Phase 6 successor release assertion requires the exact immutable membership.'
      using errcode = '55000', detail = 'PHASE6_ASSERT_MEMBERSHIP_REQUIRED';
  end if;
  select * into v_packet from public.document_packets where id = p_packet_id for share;
  select * into v_version from public.document_packet_versions
  where id = p_packet_version_id and packet_id = p_packet_id
  for share;
  select * into v_binding
  from public.legal_document_successor_release_packet_bindings_phase6
  where packet_version_id = p_packet_version_id
  for key share;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  if v_packet.id is null
    or v_version.id is null
    or v_binding.id is null
    or v_packet.organisation_id is distinct from p_organisation_id
    or v_version.organisation_id is distinct from p_organisation_id
    or v_packet_type not in ('mandate', 'otp')
    or v_binding.release_epoch_id <> v_epoch.id
    or v_binding.membership_id <> v_membership.id
    or v_binding.organisation_id <> p_organisation_id
    or v_binding.packet_id <> p_packet_id
    or v_binding.packet_version_id <> p_packet_version_id
    or v_binding.packet_type <> v_packet_type
    or v_binding.plan_digest <> v_epoch.plan_digest
    or v_binding.membership_digest <> v_membership.membership_digest
    or v_binding.generated_document_id is distinct from v_version.rendered_document_id
    or lower(trim(coalesce(v_version.rendered_sha256, ''))) <> v_binding.generated_artifact_sha256
    or v_binding.binding_contract <> 'legal-document-successor-release-packet-binding-v1' then
    raise exception 'The exact release, plan, membership, packet version, and artifact binding are required.'
      using errcode = '55000', detail = 'PHASE6_ASSERT_BINDING_REQUIRED';
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-packet-binding-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'membershipId', v_membership.id,
    'membershipDigest', v_membership.membership_digest,
    'bindingId', v_binding.id,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'packetType', v_packet_type,
    'state', v_epoch.state,
    'newBindingsAllowed', v_epoch.state = 'active'
  );
end;
$$;

create or replace function public.bridge_record_legal_document_successor_release_lifecycle_event_phase6(
  p_release_id uuid,
  p_plan_digest text,
  p_organisation_id uuid,
  p_membership_digest text,
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_stage text,
  p_access_context text default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch public.legal_document_successor_release_epochs_phase6%rowtype;
  v_membership public.legal_document_successor_release_memberships_phase6%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_binding public.legal_document_successor_release_packet_bindings_phase6%rowtype;
  v_event public.legal_document_successor_release_lifecycle_events_phase6%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_plan_digest text := lower(trim(coalesce(p_plan_digest, '')));
  v_membership_digest text := lower(trim(coalesce(p_membership_digest, '')));
  v_stage text := lower(trim(coalesce(p_stage, '')));
  v_access_context text := lower(trim(coalesce(p_access_context, '')));
  v_packet_type text;
  v_observed_at timestamptz := coalesce(p_observed_at, now());
  v_signer_count integer := 0;
  v_signed_count integer := 0;
  v_delivery_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 6 successor lifecycle evidence requires service authority.'
      using errcode = '42501', detail = 'PHASE6_EPOCH_SERVICE_REQUIRED';
  end if;
  if p_release_id is null or p_organisation_id is null or p_packet_id is null or p_packet_version_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_membership_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_stage not in ('signing_invite_delivered', 'final_delivery_completed', 'final_access_authorized')
    or (v_stage = 'final_access_authorized' and v_access_context not in ('client_portal', 'seller_portal', 'workspace', 'signer'))
    or (v_stage <> 'final_access_authorized' and v_access_context <> '')
    or v_observed_at > now() + interval '5 minutes' then
    raise exception 'Phase 6 successor lifecycle input is invalid.'
      using errcode = '22000', detail = 'PHASE6_LIFECYCLE_INPUT_INVALID';
  end if;

  select * into v_epoch
  from public.legal_document_successor_release_epochs_phase6
  where id = p_release_id
  for share;
  if not found
    or v_epoch.plan_digest <> v_plan_digest
    or v_epoch.state not in ('active', 'draining') then
    raise exception 'Phase 6 successor lifecycle evidence requires an active or draining exact epoch.'
      using errcode = '55000', detail = 'PHASE6_LIFECYCLE_EPOCH_REQUIRED';
  end if;
  select * into v_membership
  from public.legal_document_successor_release_memberships_phase6
  where release_epoch_id = v_epoch.id and organisation_id = p_organisation_id
  for key share;
  select * into v_packet from public.document_packets where id = p_packet_id for share;
  select * into v_version from public.document_packet_versions
  where id = p_packet_version_id and packet_id = p_packet_id
  for share;
  select * into v_binding
  from public.legal_document_successor_release_packet_bindings_phase6
  where packet_version_id = p_packet_version_id
  for key share;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  if v_membership.id is null
    or v_packet.id is null
    or v_version.id is null
    or v_binding.id is null
    or v_membership.membership_digest <> v_membership_digest
    or v_packet.organisation_id is distinct from p_organisation_id
    or v_version.organisation_id is distinct from p_organisation_id
    or v_binding.release_epoch_id <> v_epoch.id
    or v_binding.membership_id <> v_membership.id
    or v_binding.organisation_id <> p_organisation_id
    or v_binding.packet_id <> p_packet_id
    or v_binding.packet_version_id <> p_packet_version_id
    or v_binding.packet_type <> v_packet_type
    or v_packet_type not in ('mandate', 'otp')
    or v_binding.plan_digest <> v_epoch.plan_digest
    or v_binding.membership_digest <> v_membership.membership_digest
    or v_binding.generated_document_id is distinct from v_version.rendered_document_id
    or lower(trim(coalesce(v_version.rendered_sha256, ''))) <> v_binding.generated_artifact_sha256
    or v_binding.binding_contract <> 'legal-document-successor-release-packet-binding-v1'
    or v_observed_at < v_binding.bound_at then
    raise exception 'Phase 6 lifecycle evidence requires the exact immutable release binding.'
      using errcode = '55000', detail = 'PHASE6_LIFECYCLE_BINDING_REQUIRED';
  end if;

  if v_stage = 'signing_invite_delivered' then
    if not exists (
      select 1
      from public.document_packet_signers signer
      where signer.packet_id = p_packet_id
        and signer.packet_version_id = p_packet_version_id
        and lower(coalesce(signer.status, '')) in ('sent', 'viewed', 'signed')
    ) then
      raise exception 'Phase 6 signing invite delivery must be durably recorded first.'
        using errcode = '55000', detail = 'PHASE6_LIFECYCLE_SIGNING_DELIVERY_REQUIRED';
    end if;
  else
    select * into v_evidence
    from public.legal_final_artifact_evidence
    where packet_id = p_packet_id and packet_version_id = p_packet_version_id
    for share;
    select count(*), count(*) filter (where lower(coalesce(status, '')) = 'signed')
      into v_signer_count, v_signed_count
    from public.document_packet_signers
    where packet_id = p_packet_id and packet_version_id = p_packet_version_id;
    if v_evidence.id is null
      or v_evidence.organisation_id is distinct from p_organisation_id
      or v_evidence.path is distinct from v_version.final_signed_file_path
      or v_evidence.bucket is distinct from v_version.final_signed_file_bucket
      or coalesce(v_signer_count, 0) = 0
      or v_signed_count <> v_signer_count then
      raise exception 'Phase 6 final lifecycle evidence requires the durable final artifact and all signer completion.'
        using errcode = '55000', detail = 'PHASE6_LIFECYCLE_FINAL_EVIDENCE_REQUIRED';
    end if;
    if v_stage = 'final_delivery_completed' then
      select count(*) into v_delivery_count
      from public.legal_final_artifact_deliveries delivery
      where delivery.packet_version_id = p_packet_version_id
        and lower(coalesce(delivery.status, '')) = 'sent'
        and nullif(trim(coalesce(delivery.provider_message_id, '')), '') is not null;
      if v_delivery_count <> v_signer_count then
        raise exception 'Phase 6 final lifecycle evidence requires a provider-accepted delivery for every signer.'
          using errcode = '55000', detail = 'PHASE6_LIFECYCLE_FINAL_DELIVERY_REQUIRED';
      end if;
    end if;
  end if;

  select * into v_event
  from public.legal_document_successor_release_lifecycle_events_phase6
  where binding_id = v_binding.id and packet_version_id = p_packet_version_id and stage = v_stage
  for key share;
  if found then
    if v_event.release_epoch_id <> v_epoch.id
      or v_event.membership_id <> v_membership.id
      or v_event.organisation_id <> p_organisation_id
      or v_event.packet_id <> p_packet_id
      or v_event.packet_type <> v_packet_type
      or v_event.plan_digest <> v_epoch.plan_digest
      or v_event.membership_digest <> v_membership.membership_digest
      or v_event.access_context is distinct from nullif(v_access_context, '')
      or v_event.artifact_sha256 is distinct from case when v_stage = 'signing_invite_delivered' then null else v_evidence.sha256 end
      or v_event.lifecycle_contract <> 'legal-document-successor-release-lifecycle-v1' then
      raise exception 'Phase 6 successor lifecycle evidence conflicts with immutable prior evidence.'
        using errcode = '55000', detail = 'PHASE6_LIFECYCLE_CONFLICT';
    end if;
  else
    perform set_config('bridge.legal_document_successor_release_epoch_phase6', 'lifecycle', true);
    insert into public.legal_document_successor_release_lifecycle_events_phase6 (
      release_epoch_id, binding_id, membership_id, organisation_id, packet_id, packet_version_id,
      packet_type, plan_digest, membership_digest, stage, access_context, artifact_sha256,
      lifecycle_contract, observed_at, created_at
    ) values (
      v_epoch.id, v_binding.id, v_membership.id, p_organisation_id, p_packet_id, p_packet_version_id,
      v_packet_type, v_epoch.plan_digest, v_membership.membership_digest, v_stage, nullif(v_access_context, ''),
      case when v_stage = 'signing_invite_delivered' then null else v_evidence.sha256 end,
      'legal-document-successor-release-lifecycle-v1', v_observed_at, v_observed_at
    ) returning * into v_event;
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-successor-release-lifecycle-v1',
    'releaseId', v_epoch.id,
    'planDigest', v_epoch.plan_digest,
    'membershipId', v_membership.id,
    'membershipDigest', v_membership.membership_digest,
    'bindingId', v_binding.id,
    'eventId', v_event.id,
    'packetId', p_packet_id,
    'packetVersionId', p_packet_version_id,
    'packetType', v_packet_type,
    'stage', v_stage,
    'observedAt', v_event.observed_at
  );
end;
$$;

revoke all on function public.bridge_enforce_legal_document_successor_release_epoch_phase6() from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_successor_release_membership_phase6() from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_successor_release_transition_phase6() from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_successor_release_binding_phase6() from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_successor_release_lifecycle_phase6() from public, anon, authenticated, service_role;

revoke all on function public.bridge_prepare_legal_document_successor_release_epoch_phase6(uuid, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_register_legal_document_successor_release_membership_phase6(uuid, text, uuid, smallint, text, text, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_transition_legal_document_successor_release_epoch_phase6(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_bind_legal_document_successor_release_packet_phase6(uuid, text, uuid, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_assert_legal_document_successor_release_packet_phase6(uuid, text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bridge_record_legal_document_successor_release_lifecycle_event_phase6(uuid, text, uuid, text, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.bridge_prepare_legal_document_successor_release_epoch_phase6(uuid, text, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.bridge_register_legal_document_successor_release_membership_phase6(uuid, text, uuid, smallint, text, text, text[], timestamptz) to service_role;
grant execute on function public.bridge_transition_legal_document_successor_release_epoch_phase6(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.bridge_bind_legal_document_successor_release_packet_phase6(uuid, text, uuid, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.bridge_assert_legal_document_successor_release_packet_phase6(uuid, text, uuid, text, uuid, uuid) to service_role;
grant execute on function public.bridge_record_legal_document_successor_release_lifecycle_event_phase6(uuid, text, uuid, text, uuid, uuid, text, text, timestamptz) to service_role;

comment on table public.legal_document_successor_release_epochs_phase6 is
  'Not live authority by itself. Phase 6 successor-release epochs are server-owned, explicitly prepared records for a future separately authorised two-organisation release.';
comment on table public.legal_document_successor_release_memberships_phase6 is
  'Append-only Phase 6 membership scope. Every epoch is limited to exactly two roles: one existing pilot organisation and one first expansion organisation.';
comment on table public.legal_document_successor_release_packet_bindings_phase6 is
  'Append-only Phase 6 binding from one exact release epoch, plan digest, membership digest, packet version, and generated artifact hash.';
comment on table public.legal_document_successor_release_lifecycle_events_phase6 is
  'Append-only Phase 6 lifecycle evidence for an already release-bound packet version. It never creates a new release authority.';

notify pgrst, 'reload schema';

commit;
