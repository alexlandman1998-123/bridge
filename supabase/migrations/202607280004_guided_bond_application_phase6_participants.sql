create extension if not exists pgcrypto with schema public;

create table if not exists public.bond_applications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  onboarding_form_data_id uuid references public.onboarding_form_data(id) on delete set null,
  schema_version text not null default 'phase-6-v1',
  flow_version text not null default 'phase-6-v1',
  storage_mode text not null default 'normalized_v1' check (storage_mode in ('legacy', 'normalized_v1')),
  status text not null default 'draft' check (
    status in ('draft', 'awaiting_participants', 'ready_for_review', 'preparing_submission', 'awaiting_signatures', 'submitted', 'cancelled')
  ),
  revision integer not null default 1 check (revision > 0),
  source_legacy_hash text,
  source_legacy_updated_at timestamptz,
  compatibility_projection_version integer,
  compatibility_projection_hash text,
  compatibility_projected_at timestamptz,
  active_submission_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists bond_applications_one_active_per_transaction_idx
  on public.bond_applications (transaction_id)
  where status <> 'cancelled';

create index if not exists bond_applications_transaction_status_idx
  on public.bond_applications (transaction_id, status, revision desc);

create table if not exists public.bond_application_participants (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  participant_key text not null,
  role text not null check (role in ('primary_applicant', 'co_applicant')),
  ordinal integer not null default 1 check (ordinal > 0),
  person_id uuid,
  contact_id uuid,
  status text not null default 'in_progress' check (
    status in ('pending_invite', 'invited', 'accepted', 'in_progress', 'ready_for_submission', 'awaiting_signature', 'signed', 'completed', 'declined', 'removed')
  ),
  invitation_status text check (
    invitation_status is null or invitation_status in ('pending', 'sent', 'accepted', 'declined', 'revoked', 'expired', 'superseded')
  ),
  review_context_hash text,
  reviewed_revision integer,
  reviewed_at timestamptz,
  ready_at timestamptz,
  awaiting_signature_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  removed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (bond_application_id, participant_key)
);

create unique index if not exists bond_application_participants_one_primary_idx
  on public.bond_application_participants (bond_application_id)
  where role = 'primary_applicant' and removed_at is null;

create unique index if not exists bond_application_participants_one_co_applicant_idx
  on public.bond_application_participants (bond_application_id)
  where role = 'co_applicant' and removed_at is null;

create index if not exists bond_application_participants_status_idx
  on public.bond_application_participants (bond_application_id, status, role);

create table if not exists public.bond_application_sections (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  participant_id uuid references public.bond_application_participants(id) on delete cascade,
  scope text not null check (scope in ('application', 'participant')),
  section_key text not null,
  schema_version text not null default 'phase-6-v1',
  answers_json jsonb not null default '{}'::jsonb,
  answers_hash text,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'complete', 'not_applicable')),
  version integer not null default 1 check (version > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (
    (scope = 'application' and participant_id is null)
    or (scope = 'participant' and participant_id is not null)
  )
);

create unique index if not exists bond_application_sections_application_key_idx
  on public.bond_application_sections (bond_application_id, section_key)
  where participant_id is null;

create unique index if not exists bond_application_sections_participant_key_idx
  on public.bond_application_sections (bond_application_id, participant_id, section_key)
  where participant_id is not null;

create index if not exists bond_application_sections_lookup_idx
  on public.bond_application_sections (bond_application_id, scope, status);

create table if not exists public.bond_application_document_requirements (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  participant_id uuid references public.bond_application_participants(id) on delete cascade,
  requirement_key text not null,
  canonical_document_type text not null,
  rule_set_version text not null,
  required_before text not null,
  satisfaction_mode text not null,
  status text not null default 'active' check (status in ('active', 'satisfied', 'inactive', 'waived', 'superseded')),
  source text not null default 'guided_rule' check (source in ('guided_rule', 'originator_request', 'manual')),
  transaction_required_document_id uuid references public.transaction_required_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists bond_application_document_requirements_application_key_idx
  on public.bond_application_document_requirements (bond_application_id, requirement_key)
  where participant_id is null and status <> 'superseded';

create unique index if not exists bond_application_document_requirements_participant_key_idx
  on public.bond_application_document_requirements (bond_application_id, participant_id, requirement_key)
  where participant_id is not null and status <> 'superseded';

create index if not exists bond_application_document_requirements_status_idx
  on public.bond_application_document_requirements (bond_application_id, participant_id, status);

create table if not exists public.bond_application_participant_invites (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.bond_application_participants(id) on delete cascade,
  purpose text not null default 'co_applicant_access',
  token_hash text not null,
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'accepted', 'declined', 'revoked', 'expired', 'superseded')
  ),
  delivery_channel text not null default 'email',
  delivery_destination_reference text,
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists bond_application_participant_invites_token_hash_idx
  on public.bond_application_participant_invites (token_hash);

create unique index if not exists bond_application_participant_invites_one_active_idx
  on public.bond_application_participant_invites (participant_id, purpose)
  where status in ('pending', 'sent');

create index if not exists bond_application_participant_invites_status_expiry_idx
  on public.bond_application_participant_invites (status, expires_at);

create or replace function public.bridge_hash_bond_application_invite_token(p_token text)
returns text
language sql
stable
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.bridge_has_bond_application_participant_token_access(p_bond_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bond_application_participant_invites invite
    join public.bond_application_participants participant
      on participant.id = invite.participant_id
    where participant.bond_application_id = p_bond_application_id
      and invite.token_hash = public.bridge_hash_bond_application_invite_token(public.bridge_request_header('x-bridge-client-portal-token'))
      and invite.status in ('sent', 'accepted')
      and invite.expires_at > now()
      and participant.status <> 'removed'
  )
$$;

create or replace function public.bridge_has_bond_application_participant_token_access(p_bond_application_id uuid, p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bond_application_participant_invites invite
    join public.bond_application_participants participant
      on participant.id = invite.participant_id
    where participant.bond_application_id = p_bond_application_id
      and participant.id = p_participant_id
      and invite.token_hash = public.bridge_hash_bond_application_invite_token(public.bridge_request_header('x-bridge-client-portal-token'))
      and invite.status in ('sent', 'accepted')
      and invite.expires_at > now()
      and participant.status <> 'removed'
  )
$$;

alter table public.bond_applications enable row level security;
alter table public.bond_application_participants enable row level security;
alter table public.bond_application_sections enable row level security;
alter table public.bond_application_document_requirements enable row level security;
alter table public.bond_application_participant_invites enable row level security;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transaction_bond_application_submissions'
      and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transaction_bond_application_submissions'
      and column_name = 'bond_application_id'
  ) then
    alter table public.transaction_bond_application_submissions
      add column bond_application_id uuid references public.bond_applications(id) on delete set null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transaction_bond_application_submissions'
      and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transaction_bond_application_submissions'
      and column_name = 'source_application_revision'
  ) then
    alter table public.transaction_bond_application_submissions
      add column source_application_revision integer,
      add column review_context_hash text;
  end if;
end $$;

create index if not exists transaction_bond_application_submissions_bond_application_idx
  on public.transaction_bond_application_submissions (bond_application_id, submission_version desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bond_applications' and policyname = 'bond_applications_client_portal_read'
  ) then
    create policy bond_applications_client_portal_read
      on public.bond_applications
      for select
      using (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or public.bridge_has_bond_application_participant_token_access(id)
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bond_applications' and policyname = 'bond_applications_client_portal_write'
  ) then
    create policy bond_applications_client_portal_write
      on public.bond_applications
      for all
      using (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      )
      with check (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_participants'
      and policyname = 'bond_application_participants_client_portal_read'
  ) then
    create policy bond_application_participants_client_portal_read
      on public.bond_application_participants
      for select
      using (
        exists (
          select 1
          from public.bond_applications ba
          where ba.id = bond_application_participants.bond_application_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_participants'
      and policyname = 'bond_application_participants_client_portal_write'
  ) then
    create policy bond_application_participants_client_portal_write
      on public.bond_application_participants
      for all
      using (
        exists (
          select 1
          from public.bond_applications ba
          where ba.id = bond_application_participants.bond_application_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_participants.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      )
      with check (
        exists (
          select 1
          from public.bond_applications ba
          where ba.id = bond_application_participants.bond_application_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_participants.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_sections'
      and policyname = 'bond_application_sections_client_portal_read'
  ) then
    create policy bond_application_sections_client_portal_read
      on public.bond_application_sections
      for select
      using (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_sections.participant_id
          where ba.id = bond_application_sections.bond_application_id
            and (
              auth.role() = 'service_role'
              or (bond_application_sections.scope = 'application' and (
                public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
                or public.bridge_has_bond_application_participant_token_access(ba.id)
              ))
              or (bap.role = 'primary_applicant' and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_sections.participant_id)
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_sections'
      and policyname = 'bond_application_sections_client_portal_write'
  ) then
    create policy bond_application_sections_client_portal_write
      on public.bond_application_sections
      for all
      using (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_sections.participant_id
          where ba.id = bond_application_sections.bond_application_id
            and (
              auth.role() = 'service_role'
              or (public.bridge_has_client_portal_token_transaction_access(ba.transaction_id) and (
                bond_application_sections.scope = 'application'
                or bap.role = 'primary_applicant'
              ))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_sections.participant_id)
            )
        )
        or auth.role() = 'service_role'
      )
      with check (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_sections.participant_id
          where ba.id = bond_application_sections.bond_application_id
            and (
              auth.role() = 'service_role'
              or (public.bridge_has_client_portal_token_transaction_access(ba.transaction_id) and (
                bond_application_sections.scope = 'application'
                or bap.role = 'primary_applicant'
              ))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_sections.participant_id)
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_document_requirements'
      and policyname = 'bond_application_document_requirements_client_portal_read'
  ) then
    create policy bond_application_document_requirements_client_portal_read
      on public.bond_application_document_requirements
      for select
      using (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_document_requirements.participant_id
          where ba.id = bond_application_document_requirements.bond_application_id
            and (
              auth.role() = 'service_role'
              or (bond_application_document_requirements.participant_id is null and (
                public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
                or public.bridge_has_bond_application_participant_token_access(ba.id)
              ))
              or (bap.role = 'primary_applicant' and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_document_requirements.participant_id)
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_document_requirements'
      and policyname = 'bond_application_document_requirements_client_portal_write'
  ) then
    create policy bond_application_document_requirements_client_portal_write
      on public.bond_application_document_requirements
      for all
      using (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_document_requirements.participant_id
          where ba.id = bond_application_document_requirements.bond_application_id
            and (
              auth.role() = 'service_role'
              or (public.bridge_has_client_portal_token_transaction_access(ba.transaction_id) and (
                bond_application_document_requirements.participant_id is null
                or bap.role = 'primary_applicant'
              ))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_document_requirements.participant_id)
            )
        )
        or auth.role() = 'service_role'
      )
      with check (
        exists (
          select 1
          from public.bond_applications ba
          left join public.bond_application_participants bap on bap.id = bond_application_document_requirements.participant_id
          where ba.id = bond_application_document_requirements.bond_application_id
            and (
              auth.role() = 'service_role'
              or (public.bridge_has_client_portal_token_transaction_access(ba.transaction_id) and (
                bond_application_document_requirements.participant_id is null
                or bap.role = 'primary_applicant'
              ))
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_document_requirements.participant_id)
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_participant_invites'
      and policyname = 'bond_application_participant_invites_client_portal_read'
  ) then
    create policy bond_application_participant_invites_client_portal_read
      on public.bond_application_participant_invites
      for select
      using (
        exists (
          select 1
          from public.bond_application_participants bap
          join public.bond_applications ba on ba.id = bap.bond_application_id
          where bap.id = bond_application_participant_invites.participant_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_participant_invites'
      and policyname = 'bond_application_participant_invites_client_portal_write'
  ) then
    create policy bond_application_participant_invites_client_portal_write
      on public.bond_application_participant_invites
      for all
      using (
        exists (
          select 1
          from public.bond_application_participants bap
          join public.bond_applications ba on ba.id = bap.bond_application_id
          where bap.id = bond_application_participant_invites.participant_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id, bap.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      )
      with check (
        exists (
          select 1
          from public.bond_application_participants bap
          join public.bond_applications ba on ba.id = bap.bond_application_id
          where bap.id = bond_application_participant_invites.participant_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id, bap.id)
              or auth.role() = 'service_role'
            )
        )
        or auth.role() = 'service_role'
      );
  end if;
end $$;

create or replace function public.bridge_prevent_bond_submission_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.snapshot_json is distinct from new.snapshot_json
      or old.snapshot_hash is distinct from new.snapshot_hash
      or old.declarations_json is distinct from new.declarations_json
      or old.document_manifest_json is distinct from new.document_manifest_json
      or old.selected_bank_ids is distinct from new.selected_bank_ids
      or old.signer_manifest_json is distinct from new.signer_manifest_json
      or old.submission_version is distinct from new.submission_version
      or old.application_schema_version is distinct from new.application_schema_version
      or old.flow_version is distinct from new.flow_version
      or old.document_rule_set_version is distinct from new.document_rule_set_version
      or old.declaration_contract_version is distinct from new.declaration_contract_version
      or old.source_application_hash is distinct from new.source_application_hash
      or old.source_application_updated_at is distinct from new.source_application_updated_at
      or old.bond_application_id is distinct from new.bond_application_id
      or old.source_application_revision is distinct from new.source_application_revision
      or old.review_context_hash is distinct from new.review_context_hash
    then
      raise exception 'Bond application submission snapshot fields are immutable';
    end if;
  end if;
  return new;
end;
$$;

comment on table public.bond_applications is
  'Normalized guided buyer bond application domain records. These are buyer application records, not bank application rows.';
comment on table public.bond_application_participants is
  'Participant ownership records for guided bond applications. Phase 6 supports primary_applicant and one co_applicant only.';
comment on table public.bond_application_sections is
  'Application and participant answer sections with optimistic section versions.';
comment on table public.bond_application_document_requirements is
  'Participant-aware guided requirement links to the existing transaction document infrastructure.';
comment on table public.bond_application_participant_invites is
  'Hashed participant invite tokens for co-applicant portal access. Raw tokens are never stored.';
