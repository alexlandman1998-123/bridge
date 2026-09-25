begin;

-- Phase 7 keeps failed seller-document emails recoverable from the listing
-- workspace while retaining the organisation and listing boundary.
create or replace function public.bridge_retry_seller_document_delivery_phase7(
  p_listing_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_event public.notification_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_listing_id is null or p_event_id is null then
    raise exception 'The listing and failed delivery are required.' using errcode = '22023';
  end if;

  select * into v_listing
  from public.private_listings
  where id = p_listing_id;
  if not found then
    raise exception 'Listing was not found.' using errcode = 'P0002';
  end if;
  if not coalesce(public.bridge_is_org_admin(v_listing.organisation_id), false)
     and v_listing.assigned_agent_id is distinct from auth.uid()
     and v_listing.created_by is distinct from auth.uid() then
    raise exception 'You are not authorised to retry messages for this listing.' using errcode = '42501';
  end if;

  select * into v_event
  from public.notification_events
  where id = p_event_id
    and listing_id = p_listing_id
    and organisation_id = v_listing.organisation_id
  for update;
  if not found then
    raise exception 'Seller document delivery was not found.' using errcode = 'P0002';
  end if;
  if v_event.automation_key not in ('seller_document_request_reminder', 'seller_document_manual_reminder')
     or v_event.channel <> 'email' then
    raise exception 'Only seller document email deliveries can be retried.' using errcode = '23514';
  end if;
  if v_event.status <> 'failed' then
    raise exception 'Only failed seller document deliveries can be retried.' using errcode = '23514';
  end if;

  update public.notification_events
  set status = 'queued',
      dispatch_attempt_count = least(coalesce(dispatch_attempt_count, 0), greatest(coalesce(max_dispatch_attempts, 5) - 1, 0)),
      last_dispatch_error = null,
      error_message = null,
      failed_at = null,
      queued_at = now(),
      next_dispatch_attempt_at = now(),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'retryRequestedAt', now(),
        'retryRequestedBy', auth.uid(),
        'retrySource', 'listing_documents_phase7'
      ),
      updated_at = now()
  where id = v_event.id
  returning * into v_event;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    p_listing_id, 'seller_document_delivery_retry', 'Seller document message retry queued',
    'A failed seller document email was queued for another delivery attempt.',
    auth.uid(), 'internal',
    jsonb_build_object('notificationEventId', v_event.id, 'automationKey', v_event.automation_key, 'phase', 'listing_documents_phase7')
  );

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_event));
end;
$$;

revoke all on function public.bridge_retry_seller_document_delivery_phase7(uuid, uuid) from public, anon;
grant execute on function public.bridge_retry_seller_document_delivery_phase7(uuid, uuid) to authenticated, service_role;

-- Resolve the intended participant at queue time. Requirement metadata is the
-- canonical assignment and the listing's primary seller remains the fallback.
create or replace function public.bridge_route_seller_document_delivery_phase7()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.private_listing_document_requirements%rowtype;
  v_workspace_token text;
  v_requirement_id uuid;
begin
  if new.automation_key not in ('seller_document_request_reminder', 'seller_document_manual_reminder') then
    return new;
  end if;

  v_requirement_id := nullif(coalesce(new.payload_json->>'requirementId', new.payload_json->>'requirement_id'), '')::uuid;
  if v_requirement_id is not null then
    select * into v_requirement
    from public.private_listing_document_requirements
    where id = v_requirement_id
      and private_listing_id = new.listing_id;
  end if;
  select seller_workspace_token into v_workspace_token
  from public.client_portal_contexts
  where listing_id = new.listing_id
    and context_type = 'selling'
    and status = 'active'
  order by updated_at desc nulls last
  limit 1;

  new.recipient_email := lower(coalesce(
    nullif(trim(v_requirement.request_metadata->>'seller_email'), ''),
    nullif(trim(new.recipient_email), '')
  ));
  new.payload_json := coalesce(new.payload_json, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'recipientName', nullif(trim(v_requirement.request_metadata->>'recipient_name'), ''),
    'participantId', nullif(trim(v_requirement.request_metadata->>'participant_id'), ''),
    'sellerWorkspaceToken', nullif(trim(v_workspace_token), '')
  ));
  new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) || jsonb_build_object(
    'participantRouting', case when nullif(trim(v_requirement.request_metadata->>'seller_email'), '') is null then 'primary_seller_fallback' else 'requirement_participant' end,
    'phase', 'listing_documents_phase7'
  );
  return new;
end;
$$;

drop trigger if exists trg_route_seller_document_delivery_phase7 on public.notification_events;
create trigger trg_route_seller_document_delivery_phase7
before insert on public.notification_events
for each row
when (new.automation_key in ('seller_document_request_reminder', 'seller_document_manual_reminder'))
execute function public.bridge_route_seller_document_delivery_phase7();

-- Manual reminders share the established reminder dispatcher. This preserves
-- one delivery queue and one set of retry/observability rules.
create or replace function public.bridge_claim_notification_reminder_events_phase4(
  p_limit integer default 25,
  p_event_id uuid default null
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 25), 100));
begin
  return query
  with next_events as (
    select id
    from public.notification_events
    where category = 'reminder'
      and channel = 'email'
      and status = 'queued'
      and automation_key in (
        'buyer_onboarding_reminder', 'seller_onboarding_reminder',
        'seller_document_request_reminder', 'seller_document_manual_reminder',
        'attorney_invite_reminder', 'bond_originator_invite_reminder', 'agent_invite_reminder',
        'lead_first_response_sla_reminder', 'lead_first_response_sla_escalation',
        'lead_follow_up_due_reminder', 'lead_follow_up_missed_escalation',
        'lead_dormant_reactivation', 'lead_no_response_nurture',
        'bond_application_portal_completion_reminder'
      )
      and recipient_email is not null
      and (p_event_id is null or id = p_event_id)
    order by queued_at asc nulls last, created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = null,
      updated_at = now()
  from next_events
  where event.id = next_events.id
  returning event.*;
end;
$$;

comment on function public.bridge_retry_seller_document_delivery_phase7(uuid, uuid) is
  'Queues an authorised retry for a failed seller-document email scoped to one listing and records the operator action.';

notify pgrst, 'reload schema';
commit;
