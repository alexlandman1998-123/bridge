-- Phase 2: an assigned attorney confirms receipt and review of the signed OTP
-- and approved consent documentation. This is evidence of receipt only; it
-- does not accept payment, create an invoice, or change the billing party.

alter table public.transaction_fee_controls
  add column attorney_receipt_confirmed boolean not null default false,
  add column attorney_receipt_confirmed_at timestamptz,
  add column attorney_receipt_confirmed_by_user_id uuid references auth.users(id) on delete set null,
  add column attorney_receipt_note text,
  add constraint transaction_fee_controls_attorney_receipt_check
    check (
      (attorney_receipt_confirmed and attorney_receipt_confirmed_at is not null and attorney_receipt_confirmed_by_user_id is not null)
      or not attorney_receipt_confirmed
    );

alter table public.transaction_fee_control_events
  drop constraint transaction_fee_control_events_type_check,
  add constraint transaction_fee_control_events_type_check
    check (event_type in (
      'fee_control_created',
      'fee_terms_confirmed',
      'fee_control_updated',
      'attorney_receipt_confirmed'
    ));

create or replace function public.bridge_confirm_transaction_fee_attorney_receipt(
  p_transaction_id uuid,
  p_documentation_received boolean,
  p_receipt_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_control public.transaction_fee_controls%rowtype;
  v_note text := nullif(left(trim(coalesce(p_receipt_note, '')), 1000), '');
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'An authenticated attorney is required to confirm document receipt.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this matter.' using errcode = '42501';
  end if;

  -- Only an attorney assigned to the matter, an active member of the assigned
  -- firm, or that firm's lead may make this legal-side confirmation. Agency
  -- users with general transaction visibility are deliberately excluded.
  if not exists (
    select 1
    from public.transaction_attorney_assignments taa
    left join public.attorney_firms af
      on af.id = coalesce(taa.attorney_firm_id, taa.firm_id)
    where taa.transaction_id = p_transaction_id
      and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
      and coalesce(taa.status, 'active') <> 'removed'
      and (
        taa.assigned_user_id = v_actor_id
        or taa.primary_attorney_id = v_actor_id
        or taa.attorney_user_id = v_actor_id
        or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id)
            and member.user_id = v_actor_id
            and coalesce(member.status, 'active') in ('active', 'accepted')
        )
      )
  ) then
    raise exception 'Only the assigned attorney firm may confirm document receipt for this matter.' using errcode = '42501';
  end if;

  if coalesce(p_documentation_received, false) is not true then
    raise exception 'Confirm receipt and review of the signed OTP and approved consent documentation.' using errcode = '22023';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'The transaction-fee verification has not yet been recorded for this matter.' using errcode = 'P0002';
  end if;

  update public.transaction_fee_controls
  set attorney_receipt_confirmed = true,
      attorney_receipt_confirmed_at = v_now,
      attorney_receipt_confirmed_by_user_id = v_actor_id,
      attorney_receipt_note = v_note
  where id = v_control.id
  returning * into v_control;

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id,
    v_control.transaction_id,
    v_control.organisation_id,
    'attorney_receipt_confirmed',
    jsonb_build_object(
      'otpDocumentId', v_control.otp_document_id,
      'documentationReceived', true,
      'receiptNote', v_note
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'id', v_control.id,
    'transactionId', v_control.transaction_id,
    'attorneyReceiptConfirmed', v_control.attorney_receipt_confirmed,
    'attorneyReceiptConfirmedAt', v_control.attorney_receipt_confirmed_at
  );
end;
$$;

revoke all on function public.bridge_confirm_transaction_fee_attorney_receipt(uuid, boolean, text) from public, anon;
grant execute on function public.bridge_confirm_transaction_fee_attorney_receipt(uuid, boolean, text) to authenticated;

comment on function public.bridge_confirm_transaction_fee_attorney_receipt(uuid, boolean, text) is
  'Records attorney-side receipt and review of signed OTP and approved consent documentation; it does not generate an invoice or accept payment liability.';

notify pgrst, 'reload schema';
