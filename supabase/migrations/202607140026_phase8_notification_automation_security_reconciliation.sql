begin;

-- Correct the Phase 2 transaction-notification projection. The historical
-- function supplied twelve values for eleven target columns and silently
-- returned null through its exception handler when first executed.
create or replace function public.bridge_insert_invite_accepted_transaction_notification_phase2(
  p_transaction_id uuid,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_event_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_notification_id uuid;
  v_role text := lower(coalesce(nullif(trim(p_recipient_role), ''), 'agent'));
begin
  if p_recipient_user_id is null or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    return null;
  end if;

  if to_regclass('public.transaction_notifications') is null then
    return null;
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_user_id) then
    return null;
  end if;

  if v_role not in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin') then
    v_role := 'agent';
  end if;

  select id
    into v_existing_id
  from public.transaction_notifications
  where user_id = p_recipient_user_id
    and dedupe_key = p_dedupe_key
    and is_read = false
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

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
    p_transaction_id,
    p_recipient_user_id,
    v_role,
    'participant_assigned',
    coalesce(nullif(trim(p_title), ''), 'Invite accepted'),
    coalesce(nullif(trim(p_message), ''), 'An invite has been accepted.'),
    false,
    null,
    p_dedupe_key,
    'ParticipantAssigned',
    coalesce(p_event_data, '{}'::jsonb)
  )
  returning id into v_notification_id;

  return v_notification_id;
exception
  when undefined_table or undefined_column or check_violation or foreign_key_violation then
    return null;
end;
$$;

-- Direct API access is read-only for authenticated users. Event and run writes
-- come from database triggers or the service-role email dispatcher.
revoke all on table public.notification_automation_definitions from public, anon, authenticated;
revoke all on table public.notification_events from public, anon, authenticated;
revoke all on table public.notification_reminder_runs from public, anon, authenticated;
grant select on table public.notification_automation_definitions to authenticated, service_role;
grant select on table public.notification_events to authenticated;
grant select, insert, update, delete on table public.notification_events to service_role;
grant select, insert, update, delete on table public.notification_reminder_runs to service_role;

-- Internal recording and trigger helpers must not be callable through the API.
revoke all on function public.bridge_notification_automation_set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.bridge_notification_phase2_is_attorney_role(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_notification_phase2_role_label(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_notification_event_phase2(text, uuid, text, uuid, uuid, text, text, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_insert_invite_accepted_transaction_notification_phase2(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_notification_phase2_first_workspace_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_transaction_partner_invite_accepted_notification_phase2(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_canonical_transaction_invite_accepted_notification_phase2(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_workspace_invite_accepted_notification_phase2(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_handle_transaction_partner_invite_accepted_notification_phase2() from public, anon, authenticated, service_role;
revoke all on function public.bridge_handle_invite_accepted_notification_phase2() from public, anon, authenticated, service_role;

-- Queue and dispatch mutation stays service-only.
revoke all on function public.bridge_queue_notification_reminder_events_phase3(integer, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bridge_reset_stale_notification_reminder_processing_phase4(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_queue_notification_reminder_events_phase6(integer, timestamptz, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.bridge_queue_notification_reminder_events_phase3(integer, timestamptz, boolean) to service_role;
grant execute on function public.bridge_reset_stale_notification_reminder_processing_phase4(timestamptz) to service_role;
grant execute on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) to service_role;
grant execute on function public.bridge_queue_notification_reminder_events_phase6(integer, timestamptz, boolean, boolean) to service_role;

-- Health snapshots are organisation-scoped and available to signed-in users.
revoke all on function public.bridge_notification_automation_health_phase5(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.bridge_notification_automation_health_phase6(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.bridge_notification_automation_health_phase5(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.bridge_notification_automation_health_phase6(uuid, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
