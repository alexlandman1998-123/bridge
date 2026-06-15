begin;

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
      'commercial_access_decision'
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
      'CommercialAccessReviewed'
    )
  );

drop function if exists public.bridge_notify_commercial_access_request(uuid);

create or replace function public.bridge_notify_commercial_access_request(p_request_id uuid)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.commercial_access_requests%rowtype;
  v_requester_name text;
begin
  select *
    into v_request
  from public.commercial_access_requests
  where id = p_request_id
    and module_key = 'commercial'
    and status = 'pending';

  if v_request.id is null then
    return;
  end if;

  if v_request.requester_user_id <> auth.uid()
     or not public.bridge_is_active_member(v_request.organisation_id) then
    raise exception 'Not allowed to notify Commercial access reviewers for this request.';
  end if;

  v_requester_name := coalesce(nullif(trim(v_request.requester_name), ''), nullif(trim(v_request.requester_email), ''), 'A workspace user');

  return query
  with reviewer_targets as (
    select distinct ou.user_id
    from public.organisation_users ou
    where ou.organisation_id = v_request.organisation_id
      and ou.user_id is not null
      and ou.user_id <> v_request.requester_user_id
      and lower(coalesce(ou.status, 'active')) not in ('deactivated', 'revoked', 'deleted')
      and lower(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')) in (
        'owner',
        'principal',
        'director',
        'partner',
        'admin',
        'super_admin'
      )
      and not exists (
        select 1
        from public.transaction_notifications tn
        where tn.user_id = ou.user_id
          and tn.is_read = false
          and tn.dedupe_key = 'commercial_access_request:' || v_request.id::text || ':' || ou.user_id::text
      )
  ),
  inserted as (
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
      reviewer_targets.user_id,
      'agent',
      'commercial_access_request',
      'Commercial access requested',
      v_requester_name || ' requested access to the Commercial workspace.',
      false,
      null,
      'commercial_access_request:' || v_request.id::text || ':' || reviewer_targets.user_id::text,
      'CommercialAccessRequested',
      jsonb_build_object(
        'source', 'commercial_access_request',
        'requestId', v_request.id,
        'requesterUserId', v_request.requester_user_id,
        'requesterEmail', v_request.requester_email,
        'requesterName', v_request.requester_name,
        'workspaceId', v_request.organisation_id,
        'actionRoute', '/settings/users',
        'path', '/settings/users'
      )
    from reviewer_targets
    returning id, user_id
  )
  select inserted.id, inserted.user_id
  from inserted;
end;
$$;

grant execute on function public.bridge_notify_commercial_access_request(uuid) to authenticated;

commit;
