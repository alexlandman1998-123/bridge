begin;

-- Shared/client-safe attorney updates used to write a lane note and a raw event
-- separately. That left the shared journey and activity projections stale until
-- a later fetch. Publish the update and its canonical transaction command in
-- one transaction instead.
insert into public.transaction_sync_action_catalog (
  action_key, owner_role, canonical_event_type, affected_lane, source_table,
  default_visibility, client_safe_projection_required
) values
  ('TRANSFER_ATTORNEY_UPDATE_PUBLISHED', 'transfer_attorney', 'TransferAttorneyUpdatePublished', 'transfer', 'transaction_attorney_lane_updates', 'client_visible', true),
  ('BOND_ATTORNEY_UPDATE_PUBLISHED', 'bond_attorney', 'BondAttorneyUpdatePublished', 'bond_registration', 'transaction_attorney_lane_updates', 'client_visible', true),
  ('CANCELLATION_ATTORNEY_UPDATE_PUBLISHED', 'cancellation_attorney', 'CancellationAttorneyUpdatePublished', 'seller_bond_cancellation', 'transaction_attorney_lane_updates', 'client_visible', true)
on conflict (action_key) do update set
  owner_role = excluded.owner_role,
  canonical_event_type = excluded.canonical_event_type,
  affected_lane = excluded.affected_lane,
  source_table = excluded.source_table,
  default_visibility = excluded.default_visibility,
  client_safe_projection_required = excluded.client_safe_projection_required,
  updated_at = now();

-- Keep the private journey catalogue in lockstep with the outcome-led transfer
-- workbench. We deliberately retain older transfer keys: existing matters can
-- still contain a legacy step and must remain mutable/replayable after release.
with current_transfer_steps(step_key, default_visibility, client_visible_allowed, professional_title, professional_description, client_title, client_description) as (
  values
  ('instruction_received', 'professional_shared', true, 'Instruction Received', 'The transfer instruction and source documents have been received.', 'Property transfer update', 'Property transfer is currently at: Instruction Received.'),
  ('matter_opened', 'professional_shared', true, 'File Opened and Matter Number Assigned', 'The conveyancing file is opened and a matter number is recorded.', 'Property transfer update', 'Property transfer is currently at: File Opened and Matter Number Assigned.'),
  ('otp_source_docs_checked', 'professional_shared', true, 'OTP and Source Documents Checked', 'The sale agreement, parties, purchase price, suspensive conditions, and property details are checked.', 'Property transfer update', 'Property transfer is currently at: OTP and Source Documents Checked.'),
  ('buyer_fica_review', 'professional_shared', true, 'Review & Approve Buyer FICA', 'Review the buyer''s applicable identity, address and authority documents in one pack.', 'Property transfer update', 'Property transfer is currently at: Review & Approve Buyer FICA.'),
  ('seller_fica_review', 'professional_shared', true, 'Review & Approve Seller FICA', 'Review the seller''s applicable identity, address and authority documents in one pack.', 'Property transfer update', 'Property transfer is currently at: Review & Approve Seller FICA.'),
  ('title_deed_checked', 'professional_shared', true, 'Title Deed or Ownership Checked', 'The title deed, ownership, restrictions, and property description are checked.', 'Property transfer update', 'Property transfer is currently at: Title Deed or Ownership Checked.'),
  ('existing_bond_confirmed', 'internal', false, 'Existing Bond or Cancellation Requirement Confirmed', 'Any seller existing bond and cancellation requirement is confirmed.', null, null),
  ('transfer_duty_vat_review', 'internal', true, 'Review Transfer Duty / VAT', 'Review the applicable transfer-duty, exemption, or VAT evidence and record the route used.', 'Property transfer update', 'Property transfer is currently at: Review Transfer Duty / VAT.'),
  ('municipal_rates_clearance_review', 'client_visible', true, 'Review Municipal Rates Clearance', 'Review rates figures, payment evidence, and the municipal rates-clearance certificate in one place.', 'Property transfer update', 'Property transfer is currently at: Review Municipal Rates Clearance.'),
  ('levy_hoa_clearance_review', 'professional_shared', true, 'Review Levy / HOA Clearance', 'Review the body-corporate or HOA clearance only where the property requires it.', 'Property transfer update', 'Property transfer is currently at: Review Levy / HOA Clearance.'),
  ('property_compliance_review', 'professional_shared', true, 'Review Property Compliance Certificates', 'Review only the compliance certificates that apply to this property and agreement.', 'Property transfer update', 'Property transfer is currently at: Review Property Compliance Certificates.'),
  ('transfer_document_pack_review', 'professional_shared', true, 'Prepare & Review Transfer Document Pack', 'Prepare the transfer pack and review it against the OTP, parties, property, and finance route.', 'Property transfer update', 'Property transfer is currently at: Prepare & Review Transfer Document Pack.'),
  ('buyer_signing_review', 'professional_shared', true, 'Complete Buyer Signing', 'Schedule or manage the buyer signing route, then review the signed transfer documents.', 'Property transfer update', 'Property transfer is currently at: Complete Buyer Signing.'),
  ('seller_signing_review', 'professional_shared', true, 'Complete Seller Signing', 'Schedule or manage the seller signing route, then review the signed transfer documents.', 'Property transfer update', 'Property transfer is currently at: Complete Seller Signing.'),
  ('payment_security_review', 'professional_shared', true, 'Review Payment Security', 'Review the applicable guarantee, bond, undertaking, or cleared-trust-funds route and its evidence.', 'Property transfer update', 'Property transfer is currently at: Review Payment Security.'),
  ('lodgement_ready', 'professional_shared', true, 'Lodgement Ready', 'Review the completed lodgement pack and coordination position, then confirm that the transfer is ready for lodgement.', 'Property transfer update', 'Property transfer is currently at: Lodgement Ready.'),
  ('lodged_at_deeds_office', 'professional_shared', true, 'Lodged at Deeds Office', 'Record the Deeds Office lodgement once the submission has been accepted.', 'Property transfer update', 'Property transfer is currently at: Lodged at Deeds Office.'),
  ('in_prep', 'professional_shared', true, 'On Prep', 'Record Deeds Office prep once the matter is in preparation for registration.', 'Property transfer update', 'Property transfer is currently at: On Prep.'),
  ('registered', 'professional_shared', true, 'Registered', 'Confirm the transfer registration and capture its registration evidence before close-out begins.', 'Property transfer update', 'Property transfer is currently at: Registered.'),
  ('post_registration_closeout_review', 'client_visible', true, 'Complete Post-Registration Close-Out', 'Review final accounts, settlement/pro-ration position, and the final registration communication in one close-out outcome.', 'Property transfer update', 'Property transfer is currently at: Complete Post-Registration Close-Out.'),
  ('matter_closed', 'client_visible', true, 'Matter Closed', 'The transfer matter is administratively closed.', 'Property transfer update', 'Property transfer is currently at: Matter Closed.')
)
insert into journey_private.task_catalog (lane_key, step_key, definition)
select
  'transfer',
  step_key,
  jsonb_build_object(
    'processKey', 'transfer',
    'processLabel', 'Property transfer',
    'stepKey', step_key,
    'ownerRole', 'transfer_attorney',
    'defaultVisibility', default_visibility,
    'clientVisibleAllowed', client_visible_allowed,
    'professional', jsonb_build_object('title', professional_title, 'description', professional_description),
    'client', case when client_title is null then null else jsonb_build_object('title', client_title, 'description', client_description) end
  )
from current_transfer_steps
on conflict (lane_key, step_key) do update set definition = excluded.definition;

create or replace function public.bridge_add_attorney_lane_update_and_sync_v1(
  p_transaction_id uuid,
  p_lane_key text,
  p_update_type text,
  p_visibility text,
  p_message text,
  p_client_recipients jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_professional_title text,
  p_professional_description text,
  p_client_title text default null,
  p_client_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lane public.transaction_subprocesses%rowtype;
  v_update public.transaction_attorney_lane_updates%rowtype;
  v_existing public.transaction_sync_command_receipts%rowtype;
  v_lane_key text := lower(trim(coalesce(p_lane_key, '')));
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_action_key text;
  v_role text;
  v_audience jsonb;
  v_sync jsonb;
begin
  if p_transaction_id is null then
    raise exception 'Transaction id is required.' using errcode = '22023';
  end if;
  if v_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney lane.' using errcode = '22023';
  end if;
  if v_visibility not in ('professional_shared', 'client_visible') then
    raise exception 'Only shared or client-visible updates use this command.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_update_type, '')), '') is null
     or nullif(trim(coalesce(p_message, '')), '') is null then
    raise exception 'An update type and message are required.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 160
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A stable attorney update idempotency key is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_client_recipients, '[]'::jsonb)) <> 'array' then
    raise exception 'Client recipients must be an array.' using errcode = '22023';
  end if;
  if v_visibility = 'client_visible' and not (coalesce(p_client_recipients, '[]'::jsonb) ?| array['buyer', 'seller']) then
    raise exception 'Choose at least one client recipient before publishing an update.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_idempotency_key), 0)
  );
  select * into v_existing
  from public.transaction_sync_command_receipts receipt
  where receipt.transaction_id = p_transaction_id
    and receipt.idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then
    return jsonb_build_object(
      'duplicate', true,
      'updateId', v_existing.source_record_id,
      'transactionId', p_transaction_id,
      'sync', jsonb_build_object(
        'receiptId', v_existing.id,
        'eventId', v_existing.canonical_event_id,
        'transactionVersion', v_existing.transaction_version,
        'status', v_existing.status,
        'outputs', v_existing.outputs_json
      )
    );
  end if;

  select * into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = v_lane_key
  limit 1;
  if v_lane.id is null then
    raise exception 'Attorney lane not found.' using errcode = 'P0001';
  end if;

  v_action_key := case v_lane_key
    when 'bond' then 'BOND_ATTORNEY_UPDATE_PUBLISHED'
    when 'cancellation' then 'CANCELLATION_ATTORNEY_UPDATE_PUBLISHED'
    else 'TRANSFER_ATTORNEY_UPDATE_PUBLISHED'
  end;
  v_role := case v_lane_key
    when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney'
    else 'transfer_attorney'
  end;
  v_audience := case
    when v_visibility = 'client_visible' then
      coalesce(p_client_recipients, '[]'::jsonb) ||
      case v_lane_key
        when 'cancellation' then '["agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
        else '["agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
      end
    when v_lane_key = 'cancellation' then
      '["seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
    else '["buyer","seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
  end;

  insert into public.transaction_attorney_lane_updates (
    transaction_id, subprocess_id, lane_key, attorney_role, update_type,
    visibility, message, created_by, client_recipients, metadata
  ) values (
    p_transaction_id, v_lane.id, v_lane_key, v_role, trim(p_update_type),
    v_visibility, trim(p_message), auth.uid(), coalesce(p_client_recipients, '[]'::jsonb),
    jsonb_strip_nulls(coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('sharedJourneyAtomic', true))
  ) returning * into v_update;

  v_sync := public.bridge_commit_transaction_sync_command_phase2(
    p_transaction_id,
    v_action_key,
    trim(p_idempotency_key),
    'transaction_attorney_lane_updates',
    v_update.id::text,
    v_visibility,
    v_audience,
    trim(p_professional_title),
    trim(p_professional_description),
    nullif(trim(coalesce(p_client_title, '')), ''),
    nullif(trim(coalesce(p_client_description, '')), ''),
    jsonb_build_object(
      'laneKey', v_lane_key,
      'attorneyRole', v_role,
      'updateType', trim(p_update_type),
      'clientRecipients', coalesce(p_client_recipients, '[]'::jsonb)
    )
  );

  return jsonb_build_object('duplicate', false, 'updateId', v_update.id, 'transactionId', p_transaction_id, 'sync', v_sync);
end;
$$;

revoke all on function public.bridge_add_attorney_lane_update_and_sync_v1(
  uuid,text,text,text,text,jsonb,jsonb,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.bridge_add_attorney_lane_update_and_sync_v1(
  uuid,text,text,text,text,jsonb,jsonb,text,text,text,text,text
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
