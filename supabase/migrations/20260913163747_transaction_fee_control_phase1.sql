-- Phase 1: record the R1,500 excl. VAT transaction-fee verification at
-- signed-OTP upload. This is deliberately separate from the legacy buyer/
-- seller R750 platform-fee ledger.

create table public.transaction_fee_controls (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  otp_document_id uuid references public.documents(id) on delete set null,
  billing_party_type text not null,
  fee_amount_ex_vat numeric(12,2) not null default 1500.00,
  vat_rate numeric(5,4) not null default 0.1500,
  vat_amount numeric(12,2) not null default 225.00,
  total_amount_incl_vat numeric(12,2) not null default 1725.00,
  currency text not null default 'ZAR',
  consent_and_fee_terms_confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmation_note text,
  status text not null default 'verification_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_fee_controls_billing_party_check
    check (billing_party_type in ('agent', 'attorney')),
  constraint transaction_fee_controls_status_check
    check (status in ('verification_required', 'verified')),
  constraint transaction_fee_controls_amount_check
    check (
      fee_amount_ex_vat = 1500.00
      and vat_rate = 0.1500
      and vat_amount = 225.00
      and total_amount_incl_vat = 1725.00
      and currency = 'ZAR'
    ),
  constraint transaction_fee_controls_confirmation_check
    check (
      (consent_and_fee_terms_confirmed and confirmed_at is not null and confirmed_by_user_id is not null)
      or not consent_and_fee_terms_confirmed
    )
);

create table public.transaction_fee_control_events (
  id uuid primary key default gen_random_uuid(),
  fee_control_id uuid not null references public.transaction_fee_controls(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transaction_fee_control_events_type_check
    check (event_type in ('fee_control_created', 'fee_terms_confirmed', 'fee_control_updated')),
  constraint transaction_fee_control_events_data_check
    check (jsonb_typeof(event_data) = 'object')
);

create index transaction_fee_controls_org_status_idx
  on public.transaction_fee_controls (organisation_id, status, updated_at desc);
create index transaction_fee_controls_billing_party_idx
  on public.transaction_fee_controls (organisation_id, billing_party_type, status);
create index transaction_fee_control_events_transaction_idx
  on public.transaction_fee_control_events (transaction_id, created_at desc);

create trigger transaction_fee_controls_touch_updated_at
before update on public.transaction_fee_controls
for each row execute function public.bridge_set_updated_at();

alter table public.transaction_fee_controls enable row level security;
alter table public.transaction_fee_control_events enable row level security;

create policy transaction_fee_controls_select_scoped
  on public.transaction_fee_controls
  for select to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

create policy transaction_fee_control_events_select_scoped
  on public.transaction_fee_control_events
  for select to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

create or replace function public.bridge_record_transaction_fee_control(
  p_transaction_id uuid,
  p_otp_document_id uuid,
  p_billing_party_type text,
  p_consent_and_fee_terms_confirmed boolean,
  p_confirmation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_transaction public.transactions%rowtype;
  v_control public.transaction_fee_controls%rowtype;
  v_billing_party_type text := lower(nullif(trim(coalesce(p_billing_party_type, '')), ''));
  v_note text := nullif(left(trim(coalesce(p_confirmation_note, '')), 1000), '');
  v_now timestamptz := now();
  v_created boolean := false;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to record a transaction fee control.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to record this transaction fee control.' using errcode = '42501';
  end if;

  if v_billing_party_type not in ('agent', 'attorney') then
    raise exception 'The transaction fee must be billed to either the agent or attorney.' using errcode = '22023';
  end if;

  if coalesce(p_consent_and_fee_terms_confirmed, false) is not true then
    raise exception 'Confirm that the transaction-fee terms and consent form are included before uploading the OTP.' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found for fee control.' using errcode = 'P0002';
  end if;

  if p_otp_document_id is not null and not exists (
    select 1 from public.documents document_row
    where document_row.id = p_otp_document_id
      and document_row.transaction_id = p_transaction_id
  ) then
    raise exception 'The OTP document does not belong to this transaction.' using errcode = '22023';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if not found then
    insert into public.transaction_fee_controls (
      transaction_id, organisation_id, otp_document_id, billing_party_type,
      consent_and_fee_terms_confirmed, confirmed_at, confirmed_by_user_id,
      confirmation_note, status
    ) values (
      p_transaction_id, v_transaction.organisation_id, p_otp_document_id, v_billing_party_type,
      true, v_now, auth.uid(), v_note, 'verified'
    ) returning * into v_control;
    v_created := true;
  else
    update public.transaction_fee_controls
    set otp_document_id = coalesce(p_otp_document_id, otp_document_id),
        billing_party_type = v_billing_party_type,
        consent_and_fee_terms_confirmed = true,
        confirmed_at = v_now,
        confirmed_by_user_id = auth.uid(),
        confirmation_note = v_note,
        status = 'verified'
    where id = v_control.id
    returning * into v_control;
  end if;

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id, p_transaction_id, v_transaction.organisation_id,
    case when v_created then 'fee_control_created' else 'fee_control_updated' end,
    jsonb_build_object(
      'billingPartyType', v_billing_party_type,
      'feeAmountExVat', v_control.fee_amount_ex_vat,
      'vatAmount', v_control.vat_amount,
      'totalAmountInclVat', v_control.total_amount_incl_vat,
      'otpDocumentId', p_otp_document_id
    ), auth.uid()
  );

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id, p_transaction_id, v_transaction.organisation_id, 'fee_terms_confirmed',
    jsonb_build_object('otpDocumentId', p_otp_document_id, 'confirmationNote', v_note), auth.uid()
  );

  return jsonb_build_object(
    'id', v_control.id,
    'transactionId', v_control.transaction_id,
    'billingPartyType', v_control.billing_party_type,
    'feeAmountExVat', v_control.fee_amount_ex_vat,
    'vatAmount', v_control.vat_amount,
    'totalAmountInclVat', v_control.total_amount_incl_vat,
    'status', v_control.status,
    'confirmedAt', v_control.confirmed_at
  );
end;
$$;

revoke all on table public.transaction_fee_controls, public.transaction_fee_control_events from public, anon, authenticated;
grant select on table public.transaction_fee_controls, public.transaction_fee_control_events to authenticated;
revoke all on function public.bridge_record_transaction_fee_control(uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.bridge_record_transaction_fee_control(uuid, uuid, text, boolean, text) to authenticated;

comment on table public.transaction_fee_controls is
  'Phase 1 auditable R1,500 excl. VAT fee verification captured at signed-OTP upload; no invoice is generated here.';
comment on function public.bridge_record_transaction_fee_control(uuid, uuid, text, boolean, text) is
  'Records the required signed-OTP fee-terms and consent-form confirmation for the transaction.';

notify pgrst, 'reload schema';
