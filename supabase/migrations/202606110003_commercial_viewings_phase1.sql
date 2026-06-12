begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'commercial_viewing_status') then
    create type public.commercial_viewing_status as enum (
      'scheduled',
      'confirmed',
      'completed',
      'cancelled',
      'no_show'
    );
  end if;
end
$$;

create table if not exists public.commercial_viewings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  requirement_id uuid not null references public.commercial_requirements(id) on delete cascade,
  property_id uuid references public.commercial_properties(id) on delete set null,
  vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  listing_id uuid references public.commercial_listings(id) on delete set null,
  broker_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid references public.commercial_tenants(id) on delete set null,
  contact_id uuid,
  viewing_date date not null,
  viewing_time time not null,
  status public.commercial_viewing_status not null default 'scheduled',
  notes text,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists commercial_viewings_organisation_idx on public.commercial_viewings (organisation_id);
create index if not exists commercial_viewings_hierarchy_idx on public.commercial_viewings (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_viewings_requirement_idx on public.commercial_viewings (requirement_id);
create index if not exists commercial_viewings_property_idx on public.commercial_viewings (property_id);
create index if not exists commercial_viewings_vacancy_idx on public.commercial_viewings (vacancy_id);
create index if not exists commercial_viewings_listing_idx on public.commercial_viewings (listing_id);
create index if not exists commercial_viewings_broker_date_idx on public.commercial_viewings (broker_id, viewing_date, viewing_time);
create index if not exists commercial_viewings_status_idx on public.commercial_viewings (organisation_id, status);

drop trigger if exists trg_bridge_touch_commercial_viewings_updated_at on public.commercial_viewings;
create trigger trg_bridge_touch_commercial_viewings_updated_at
before update on public.commercial_viewings
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_viewings enable row level security;

drop policy if exists commercial_viewings_brokerage_access on public.commercial_viewings;
create policy commercial_viewings_brokerage_access on public.commercial_viewings
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

grant select, insert, update, delete on public.commercial_viewings to authenticated;

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
      'commercial_viewing_update'
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
      'CommercialViewingUpdated'
    )
  );

create or replace function public.bridge_notify_commercial_viewing(
  p_viewing_id uuid,
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
  v_viewing public.commercial_viewings%rowtype;
  v_event text;
begin
  select *
    into v_viewing
  from public.commercial_viewings
  where id = p_viewing_id;

  if v_viewing.id is null or v_viewing.broker_id is null then
    return;
  end if;

  if not public.bridge_commercial_can_access_record(
    v_viewing.organisation_id,
    v_viewing.branch_id,
    v_viewing.team_id,
    v_viewing.broker_id,
    v_viewing.created_by
  ) then
    raise exception 'Not allowed to notify for this commercial viewing.';
  end if;

  v_event := coalesce(nullif(trim(p_event_type), ''), 'viewing_updated');

  return query
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
  values (
    null,
    v_viewing.broker_id,
    'agent',
    'commercial_viewing_update',
    coalesce(nullif(trim(p_title), ''), 'Commercial viewing update'),
    coalesce(nullif(trim(p_message), ''), 'A commercial viewing was updated.'),
    false,
    null,
    'commercial_viewing:' || v_event || ':' || v_viewing.id::text || ':' || extract(epoch from now())::bigint::text,
    'CommercialViewingUpdated',
    jsonb_build_object(
      'source', 'commercial_viewings',
      'eventType', v_event,
      'viewingId', v_viewing.id,
      'requirementId', v_viewing.requirement_id,
      'propertyId', v_viewing.property_id,
      'vacancyId', v_viewing.vacancy_id,
      'listingId', v_viewing.listing_id,
      'workspaceId', v_viewing.organisation_id,
      'actionRoute', '/commercial/viewings',
      'path', '/commercial/viewings'
    )
  )
  returning id, user_id;
end;
$$;

grant execute on function public.bridge_notify_commercial_viewing(uuid, text, text, text) to authenticated;

commit;
