begin;

create extension if not exists "pgcrypto";

alter table if exists public.transaction_participants
  add column if not exists participant_phone text,
  add column if not exists buyer_party_id uuid references public.buyers(id) on delete set null,
  add column if not exists buyer_party_role text not null default 'additional_buyer',
  add column if not exists buyer_party_position integer not null default 0,
  add column if not exists is_primary_buyer boolean not null default false,
  add column if not exists buyer_profile_status text not null default 'draft',
  add column if not exists buyer_onboarding_status text not null default 'not_started',
  add column if not exists buyer_onboarding_completed_at timestamptz,
  add column if not exists buyer_manual_capture_status text not null default 'not_started',
  add column if not exists buyer_manual_capture_completed_at timestamptz,
  add column if not exists buyer_portal_invite_status text not null default 'not_sent',
  add column if not exists buyer_portal_invited_at timestamptz,
  add column if not exists buyer_portal_last_sent_at timestamptz,
  add column if not exists buyer_portal_link_id uuid,
  add column if not exists buyer_source text not null default 'agent',
  add column if not exists buyer_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_transaction_id_role_type_legal_role_ke;

create unique index if not exists transaction_participants_non_buyer_role_uidx
  on public.transaction_participants (transaction_id, role_type, legal_role)
  where coalesce(transaction_role, '') <> 'buyer';

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_party_role_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_party_role_check
  check (buyer_party_role in ('primary_buyer', 'additional_buyer'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_profile_status_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_profile_status_check
  check (buyer_profile_status in ('draft', 'invited', 'in_progress', 'captured', 'completed', 'inactive'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_onboarding_status_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_onboarding_status_check
  check (buyer_onboarding_status in ('not_started', 'sent', 'in_progress', 'completed', 'manually_captured', 'blocked'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_manual_capture_status_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_manual_capture_status_check
  check (buyer_manual_capture_status in ('not_started', 'in_progress', 'completed', 'manually_captured', 'blocked'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_portal_invite_status_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_portal_invite_status_check
  check (buyer_portal_invite_status in ('not_sent', 'ready', 'sent', 'active', 'blocked', 'revoked'));

create unique index if not exists transaction_participants_one_primary_buyer_idx
  on public.transaction_participants (transaction_id)
  where transaction_role = 'buyer'
    and is_primary_buyer = true
    and coalesce(status, 'active') not in ('inactive', 'removed', 'archived', 'deleted');

create unique index if not exists transaction_participants_buyer_party_uidx
  on public.transaction_participants (transaction_id, buyer_party_id)
  where transaction_role = 'buyer'
    and buyer_party_id is not null
    and coalesce(status, 'active') not in ('inactive', 'removed', 'archived', 'deleted');

create index if not exists transaction_participants_buyer_party_status_idx
  on public.transaction_participants (
    transaction_id,
    buyer_party_position,
    buyer_onboarding_status,
    buyer_portal_invite_status
  )
  where transaction_role = 'buyer';

alter table if exists public.transactions
  add column if not exists primary_buyer_participant_id uuid references public.transaction_participants(id) on delete set null,
  add column if not exists buyer_parties_model_version text not null default 'transaction_buyers_phase1_v1';

insert into public.transaction_participants (
  transaction_id,
  buyer_party_id,
  user_id,
  participant_name,
  participant_email,
  participant_phone,
  role_type,
  legal_role,
  transaction_role,
  status,
  buyer_party_role,
  buyer_party_position,
  is_primary_buyer,
  buyer_profile_status,
  buyer_onboarding_status,
  buyer_portal_invite_status,
  buyer_source,
  buyer_metadata
)
select
  txn.id,
  buyer.id,
  null::uuid,
  nullif(trim(coalesce(buyer.name, txn.buyer_name, '')), ''),
  lower(nullif(trim(coalesce(buyer.email, '')), '')),
  nullif(trim(coalesce(buyer.phone, '')), ''),
  'buyer',
  'none',
  'buyer',
  'active',
  'primary_buyer',
  0,
  true,
  case
    when coalesce(txn.onboarding_status, '') in ('completed', 'complete', 'submitted') then 'completed'
    when coalesce(txn.onboarding_status, '') in ('sent', 'in_progress') then 'in_progress'
    else 'draft'
  end,
  case
    when coalesce(txn.onboarding_status, '') in ('completed', 'complete', 'submitted') then 'completed'
    when coalesce(txn.onboarding_status, '') = 'sent' then 'sent'
    when coalesce(txn.onboarding_status, '') = 'in_progress' then 'in_progress'
    else 'not_started'
  end,
  'not_sent',
  'legacy_transaction_buyer',
  jsonb_build_object(
    'modelVersion', 'transaction_buyers_phase1_v1',
    'legacyBuyerId', txn.buyer_id,
    'legacyBackfilledAt', now()
  )
from public.transactions txn
join public.buyers buyer on buyer.id = txn.buyer_id
where txn.buyer_id is not null
  and not exists (
    select 1
    from public.transaction_participants existing
    where existing.transaction_id = txn.id
      and existing.transaction_role = 'buyer'
      and existing.buyer_party_id = txn.buyer_id
      and coalesce(existing.status, 'active') not in ('inactive', 'removed', 'archived', 'deleted')
  );

update public.transaction_participants participant
set
  is_primary_buyer = true,
  buyer_party_role = 'primary_buyer',
  buyer_party_position = 0,
  buyer_party_id = coalesce(participant.buyer_party_id, txn.buyer_id),
  buyer_metadata = coalesce(participant.buyer_metadata, '{}'::jsonb) || jsonb_build_object(
    'modelVersion', 'transaction_buyers_phase1_v1',
    'legacyBuyerId', txn.buyer_id
  )
from public.transactions txn
where participant.transaction_id = txn.id
  and participant.transaction_role = 'buyer'
  and txn.buyer_id is not null
  and (
    participant.buyer_party_id = txn.buyer_id
    or participant.id = txn.primary_buyer_participant_id
  );

update public.transaction_participants participant
set
  buyer_party_role = 'additional_buyer',
  is_primary_buyer = false,
  buyer_party_position = greatest(participant.buyer_party_position, 1)
where participant.transaction_role = 'buyer'
  and coalesce(participant.status, 'active') not in ('inactive', 'removed', 'archived', 'deleted')
  and participant.is_primary_buyer = false;

update public.transactions txn
set primary_buyer_participant_id = (
  select participant.id
  from public.transaction_participants participant
  where participant.transaction_id = txn.id
    and participant.transaction_role = 'buyer'
    and participant.is_primary_buyer = true
    and coalesce(participant.status, 'active') not in ('inactive', 'removed', 'archived', 'deleted')
  order by participant.buyer_party_position asc, participant.id asc
  limit 1
)
where txn.primary_buyer_participant_id is null
  and exists (
    select 1
    from public.transaction_participants participant
    where participant.transaction_id = txn.id
      and participant.transaction_role = 'buyer'
      and participant.is_primary_buyer = true
      and coalesce(participant.status, 'active') not in ('inactive', 'removed', 'archived', 'deleted')
  );

comment on column public.transactions.primary_buyer_participant_id is
  'Primary buyer participant for the transaction multi-buyer model. Legacy transactions.buyer_id remains the compatibility bridge.';
comment on column public.transactions.buyer_parties_model_version is
  'Version marker for the additive multi-buyer transaction party model.';
comment on column public.transaction_participants.buyer_party_id is
  'Optional link to the legacy buyers table for a buyer participant.';
comment on column public.transaction_participants.is_primary_buyer is
  'Marks the primary buyer participant used for legacy single-buyer compatibility and default communication.';

commit;
