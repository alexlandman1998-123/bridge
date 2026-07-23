begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'commercial_transaction_type') then
    create type public.commercial_transaction_type as enum (
      'lease',
      'sale'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'commercial_transaction_status') then
    create type public.commercial_transaction_status as enum (
      'draft',
      'negotiating',
      'hot_in_progress',
      'hot_signed',
      'lease_pending',
      'sale_pending',
      'completed',
      'lost',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.commercial_transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  deal_id uuid references public.commercial_deals(id) on delete set null,
  requirement_id uuid references public.commercial_requirements(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  listing_id uuid references public.commercial_listings(id) on delete set null,
  broker_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid references public.commercial_tenants(id) on delete set null,
  contact_id uuid,
  transaction_type public.commercial_transaction_type not null,
  status public.commercial_transaction_status not null default 'draft',
  transaction_name text not null,
  target_value numeric,
  expected_close_date date,
  actual_close_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists commercial_transactions_deal_unique_idx
  on public.commercial_transactions (deal_id)
  where deal_id is not null;

create index if not exists commercial_transactions_organisation_idx
  on public.commercial_transactions (organisation_id);
create index if not exists commercial_transactions_hierarchy_idx
  on public.commercial_transactions (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_transactions_status_idx
  on public.commercial_transactions (organisation_id, status);
create index if not exists commercial_transactions_requirement_idx
  on public.commercial_transactions (requirement_id);
create index if not exists commercial_transactions_property_idx
  on public.commercial_transactions (property_id);
create index if not exists commercial_transactions_vacancy_idx
  on public.commercial_transactions (vacancy_id);
create index if not exists commercial_transactions_listing_idx
  on public.commercial_transactions (listing_id);
create index if not exists commercial_transactions_broker_idx
  on public.commercial_transactions (broker_id, expected_close_date);
create index if not exists commercial_transactions_name_idx
  on public.commercial_transactions (organisation_id, transaction_name);

drop trigger if exists trg_bridge_touch_commercial_transactions_updated_at on public.commercial_transactions;
create trigger trg_bridge_touch_commercial_transactions_updated_at
before update on public.commercial_transactions
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_transactions enable row level security;

drop policy if exists commercial_transactions_brokerage_access on public.commercial_transactions;
create policy commercial_transactions_brokerage_access on public.commercial_transactions
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

grant select, insert, update, delete on public.commercial_transactions to authenticated;

alter table if exists public.transaction_notifications
  drop constraint if exists transaction_notifications_notification_type_check;

alter table if exists public.transaction_notifications
  add constraint transaction_notifications_notification_type_check
  check (
    notification_type in (
      'participant_assigned',
      'document_uploaded',
      'readiness_updated',
      'workflow_updated',
      'lane_handoff',
      'registration_completed',
      'overdue_missing_docs',
      'additional_document_requested',
      'bond_originator_required',
      'bond_runtime_fixture',
      'portal_invitation',
      'commercial_access_request',
      'commercial_access_decision',
      'commercial_viewing_update',
      'commercial_transaction_update'
    )
  );

alter table if exists public.transaction_notifications
  drop constraint if exists transaction_notifications_event_type_check;

alter table if exists public.transaction_notifications
  add constraint transaction_notifications_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated',
      'OccupationalRentUpdated',
      'BondHybridFinanceWorkflowUpdated',
      'BondHybridFinanceApplicationUpdated',
      'BondHybridFinanceQuoteUpdated',
      'BondHybridFinanceInstructionSent',
      'AttorneyCriticalBlockerCreated',
      'AttorneyDocumentUploaded',
      'AttorneyLaneBlocked',
      'AttorneyLaneCompleted',
      'AttorneyLaneCreated',
      'AttorneyLaneStageUpdated',
      'AttorneyUnauthorizedAccessAttempt',
      'transaction_created',
      'transfer_attorney_assigned',
      'bond_originator_assigned',
      'cancellation_attorney_assigned',
      'attorney_assignment_created',
      'bond_application_created',
      'roleplayer_visibility_granted',
      'roleplayer_reassigned',
      'BOND_INTAKE_STARTED',
      'BOND_INTAKE_RECEIVED',
      'BOND_OTP_READY',
      'BOND_APPLICATION_STARTED',
      'BOND_APPLICATION_SUBMITTED',
      'BOND_DOCUMENTS_COMPLETE',
      'BOND_APPLICATION_READY_FOR_REVIEW',
      'BOND_APPLICATION_ACCEPTED',
      'BOND_APPLICATION_ASSIGNED',
      'BOND_APPLICATION_DECLINED',
      'BUYER_BOND_ORIGINATOR_INTRO',
      'CommercialAccessRequested',
      'CommercialAccessReviewed',
      'CommercialViewingUpdated',
      'CommercialTransactionUpdated'
    )
  );

create or replace function public.bridge_notify_commercial_transaction(
  p_transaction_id uuid,
  p_event_type text,
  p_title text,
  p_message text
)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.commercial_transactions%rowtype;
  v_event text;
begin
  select *
    into v_transaction
  from public.commercial_transactions
  where id = p_transaction_id;

  if v_transaction.id is null or v_transaction.broker_id is null then
    return;
  end if;

  if not public.bridge_commercial_can_access_record(
    v_transaction.organisation_id,
    v_transaction.branch_id,
    v_transaction.team_id,
    v_transaction.broker_id,
    v_transaction.created_by
  ) then
    raise exception 'Not allowed to notify for this commercial transaction.';
  end if;

  v_event := coalesce(nullif(trim(p_event_type), ''), 'transaction_updated');

  return query
  with recipients as (
    select distinct recipient_user_id
    from (
      select v_transaction.broker_id as recipient_user_id
      union all
      select ou.user_id
      from public.organisation_users ou
      where ou.organisation_id = v_transaction.organisation_id
        and ou.user_id is not null
        and (
          (
            coalesce(ou.primary_branch_id, ou.branch_id) = v_transaction.branch_id
            and lower(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')) in ('branch_manager', 'branch_admin', 'regional_manager')
          )
          or lower(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')) in (
            'owner',
            'principal',
            'director',
            'partner',
            'admin',
            'admin_staff',
            'manager',
            'hq_manager',
            'commercial_hq_admin',
            'commercial_hq_manager',
            'super_admin'
          )
        )
    ) recipients
    where recipient_user_id is not null
  )
  insert into public.transaction_notifications (
    transaction_id,
    user_id,
    role_type,
    notification_type,
    title,
    message,
    is_read,
    read_at,
    dedupe_key,
    event_type,
    event_data
  )
  select
    null,
    recipients.recipient_user_id,
    case
      when recipients.recipient_user_id = v_transaction.broker_id then 'agent'
      else 'manager'
    end,
    'commercial_transaction_update',
    coalesce(nullif(trim(p_title), ''), 'Commercial transaction update'),
    coalesce(nullif(trim(p_message), ''), 'A commercial transaction was updated.'),
    false,
    null,
    'commercial_transaction:' || v_event || ':' || v_transaction.id::text || ':' || recipients.recipient_user_id::text || ':' || extract(epoch from now())::bigint::text,
    'CommercialTransactionUpdated',
    jsonb_build_object(
      'source', 'commercial_transactions',
      'eventType', v_event,
      'transactionId', v_transaction.id,
      'dealId', v_transaction.deal_id,
      'requirementId', v_transaction.requirement_id,
      'propertyId', v_transaction.property_id,
      'vacancyId', v_transaction.vacancy_id,
      'listingId', v_transaction.listing_id,
      'workspaceId', v_transaction.organisation_id,
      'actionRoute', '/commercial/transactions/' || v_transaction.id::text,
      'path', '/commercial/transactions/' || v_transaction.id::text
    )
  from recipients
  returning id, user_id;
end;
$$;

grant execute on function public.bridge_notify_commercial_transaction(uuid, text, text, text) to authenticated;

with latest_hot as (
  select distinct on (hot.deal_id)
    hot.deal_id,
    hot.id,
    hot.status,
    hot.property_id,
    hot.vacancy_id,
    hot.created_at,
    hot.updated_at
  from public.commercial_heads_of_terms hot
  where hot.deal_id is not null
  order by hot.deal_id, coalesce(hot.updated_at, hot.created_at) desc, hot.id desc
),
latest_lease as (
  select distinct on (coalesce(lease.deal_id, lease.heads_of_terms_id))
    lease.deal_id,
    lease.heads_of_terms_id,
    lease.id,
    lease.status,
    lease.property_id,
    lease.vacancy_id,
    lease.created_at,
    lease.updated_at
  from public.commercial_leases lease
  where lease.deal_id is not null or lease.heads_of_terms_id is not null
  order by coalesce(lease.deal_id, lease.heads_of_terms_id), coalesce(lease.updated_at, lease.created_at) desc, lease.id desc
),
source_deals as (
  select
    deal.id as deal_id,
    deal.organisation_id,
    deal.branch_id,
    deal.team_id,
    coalesce(deal.broker_id, deal.assigned_broker) as broker_id,
    deal.requirement_id,
    coalesce(deal.property_id, hot.property_id, lease.property_id) as property_id,
    coalesce(deal.vacancy_id, hot.vacancy_id, lease.vacancy_id) as vacancy_id,
    deal.listing_id,
    deal.tenant_id as company_id,
    null::uuid as contact_id,
    case
      when lower(coalesce(deal.deal_type, 'lease')) = 'sale' then 'sale'::public.commercial_transaction_type
      else 'lease'::public.commercial_transaction_type
    end as transaction_type,
    case
      when lower(coalesce(deal.status, deal.stage, '')) in ('cancelled') then 'cancelled'::public.commercial_transaction_status
      when lower(coalesce(deal.status, deal.stage, '')) in ('lost', 'closed_lost', 'rejected') then 'lost'::public.commercial_transaction_status
      when lower(coalesce(lease.status, '')) in ('executed', 'active') then 'completed'::public.commercial_transaction_status
      when lower(coalesce(deal.deal_type, 'lease')) = 'sale' and lower(coalesce(deal.stage, deal.status, '')) in ('converted', 'signed', 'closed_won') then 'completed'::public.commercial_transaction_status
      when lower(coalesce(deal.deal_type, 'lease')) = 'sale' and (
        lease.id is not null
        or lower(coalesce(hot.status, '')) in ('accepted', 'signed', 'ready_for_lease', 'converted')
      ) then 'sale_pending'::public.commercial_transaction_status
      when lease.id is not null then 'lease_pending'::public.commercial_transaction_status
      when lower(coalesce(hot.status, '')) in ('accepted', 'signed', 'ready_for_lease', 'converted') then 'hot_signed'::public.commercial_transaction_status
      when hot.id is not null or lower(coalesce(deal.stage, '')) in ('hot_draft', 'hot_sent', 'hot_accepted', 'heads_of_terms') then 'hot_in_progress'::public.commercial_transaction_status
      when lower(coalesce(deal.stage, deal.status, '')) in ('negotiation', 'proposal', 'qualified', 'new') then 'negotiating'::public.commercial_transaction_status
      else 'draft'::public.commercial_transaction_status
    end as status,
    coalesce(
      nullif(trim(deal.deal_name), ''),
      nullif(trim(tenant.name), ''),
      concat('Commercial transaction ', left(deal.id::text, 8))
    ) as transaction_name,
    coalesce(deal.deal_value, deal.estimated_commission) as target_value,
    deal.expected_close_date,
    case
      when lower(coalesce(lease.status, '')) in ('executed', 'active') then coalesce(lease.updated_at, lease.created_at)::date
      when lower(coalesce(deal.deal_type, 'lease')) = 'sale' and lower(coalesce(deal.stage, deal.status, '')) in ('converted', 'signed', 'closed_won') then coalesce(deal.updated_at, deal.created_at)::date
      else null
    end as actual_close_date,
    deal.notes,
    deal.created_by,
    coalesce(deal.created_at, now()) as created_at,
    coalesce(lease.updated_at, hot.updated_at, deal.updated_at, deal.created_at, now()) as updated_at,
    deal.updated_by
  from public.commercial_deals deal
  left join latest_hot hot
    on hot.deal_id = deal.id
  left join latest_lease lease
    on lease.deal_id = deal.id
  left join public.commercial_tenants tenant
    on tenant.id = deal.tenant_id
  where deal.organisation_id is not null
    and coalesce(deal.broker_id, deal.assigned_broker) is not null
    and lower(coalesce(deal.status, 'active')) <> 'archived'
),
inserted_transactions as (
  insert into public.commercial_transactions (
    organisation_id,
    branch_id,
    team_id,
    deal_id,
    requirement_id,
    property_id,
    vacancy_id,
    listing_id,
    broker_id,
    company_id,
    contact_id,
    transaction_type,
    status,
    transaction_name,
    target_value,
    expected_close_date,
    actual_close_date,
    notes,
    created_by,
    created_at,
    updated_at,
    updated_by
  )
  select
    source.organisation_id,
    source.branch_id,
    source.team_id,
    source.deal_id,
    source.requirement_id,
    source.property_id,
    source.vacancy_id,
    source.listing_id,
    source.broker_id,
    source.company_id,
    source.contact_id,
    source.transaction_type,
    source.status,
    source.transaction_name,
    source.target_value,
    source.expected_close_date,
    source.actual_close_date,
    source.notes,
    source.created_by,
    source.created_at,
    source.updated_at,
    source.updated_by
  from source_deals source
  where not exists (
    select 1
    from public.commercial_transactions existing
    where existing.deal_id = source.deal_id
  )
  returning *
)
insert into public.commercial_activity (
  organisation_id,
  branch_id,
  team_id,
  broker_id,
  entity_type,
  entity_id,
  activity_type,
  title,
  body,
  metadata,
  created_at,
  created_by
)
select
  transaction.organisation_id,
  transaction.branch_id,
  transaction.team_id,
  transaction.broker_id,
  'commercial_transaction',
  transaction.id,
  'transaction_migrated',
  'Transaction created',
  'Commercial transaction created from existing deal data.',
  jsonb_build_object(
    'dealId', transaction.deal_id,
    'requirementId', transaction.requirement_id,
    'propertyId', transaction.property_id,
    'vacancyId', transaction.vacancy_id,
    'listingId', transaction.listing_id,
    'status', transaction.status,
    'transactionType', transaction.transaction_type,
    'migrationSource', 'commercial_transactions_phase2'
  ),
  transaction.created_at,
  transaction.created_by
from inserted_transactions transaction;

commit;
