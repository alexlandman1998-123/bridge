-- Phase 3: create a finance-owned invoice-preparation queue once the signed
-- OTP and attorney receipt controls are complete. This deliberately does not
-- generate, email, or represent a tax invoice: the billing profile and final
-- accounting-system issue step remain controlled finance work.

create table public.transaction_fee_invoice_queue (
  id uuid primary key default gen_random_uuid(),
  fee_control_id uuid not null unique references public.transaction_fee_controls(id) on delete cascade,
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  billing_party_type text not null check (billing_party_type in ('agent', 'attorney')),
  fee_amount_ex_vat numeric(12,2) not null default 1500.00,
  vat_rate numeric(5,4) not null default 0.1500,
  vat_amount numeric(12,2) not null default 225.00,
  total_amount_incl_vat numeric(12,2) not null default 1725.00,
  currency text not null default 'ZAR',
  status text not null default 'ready_for_finance' check (status in ('ready_for_finance', 'completed', 'cancelled')),
  prepared_at timestamptz not null default now(),
  prepared_by_user_id uuid references auth.users(id) on delete set null,
  finance_note text,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  invoice_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_fee_invoice_queue_amount_check
    check (
      fee_amount_ex_vat = 1500.00
      and vat_rate = 0.1500
      and vat_amount = 225.00
      and total_amount_incl_vat = 1725.00
      and currency = 'ZAR'
    ),
  constraint transaction_fee_invoice_queue_completion_check
    check (
      (status = 'completed' and completed_at is not null and completed_by_user_id is not null and nullif(trim(coalesce(invoice_reference, '')), '') is not null)
      or status <> 'completed'
    )
);

create index transaction_fee_invoice_queue_finance_idx
  on public.transaction_fee_invoice_queue (organisation_id, status, prepared_at desc);

create trigger transaction_fee_invoice_queue_touch_updated_at
before update on public.transaction_fee_invoice_queue
for each row execute function public.bridge_set_updated_at();

alter table public.transaction_fee_invoice_queue enable row level security;

create or replace function public.bridge_transaction_fee_finance_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = target_org
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') in ('active', 'accepted')
      and coalesce(member.workspace_role, member.organisation_role, member.role) in (
        'super_admin', 'owner', 'principal', 'director', 'partner', 'admin'
      )
  );
$$;

create policy transaction_fee_invoice_queue_select_finance_admin
  on public.transaction_fee_invoice_queue
  for select to authenticated
  using (public.bridge_transaction_fee_finance_admin(organisation_id));

create or replace function public.bridge_prepare_transaction_fee_invoice(
  p_transaction_id uuid,
  p_finance_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_control public.transaction_fee_controls%rowtype;
  v_invoice public.transaction_fee_invoice_queue%rowtype;
  v_note text := nullif(left(trim(coalesce(p_finance_note, '')), 1000), '');
begin
  if v_actor_id is null then
    raise exception 'An authenticated finance administrator is required to prepare an invoice.' using errcode = '42501';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'The transaction-fee verification has not been recorded for this matter.' using errcode = 'P0002';
  end if;

  if not public.bridge_transaction_fee_finance_admin(v_control.organisation_id) then
    raise exception 'Only senior organisation management may prepare this transaction-fee invoice.' using errcode = '42501';
  end if;

  if not v_control.consent_and_fee_terms_confirmed
    or not coalesce((to_jsonb(v_control)->>'attorney_receipt_confirmed')::boolean, false) then
    raise exception 'Signed OTP, consent verification, and attorney receipt confirmation are required before invoice preparation.' using errcode = '22023';
  end if;

  insert into public.transaction_fee_invoice_queue (
    fee_control_id, transaction_id, organisation_id, billing_party_type,
    prepared_by_user_id, finance_note
  ) values (
    v_control.id, v_control.transaction_id, v_control.organisation_id, v_control.billing_party_type,
    v_actor_id, v_note
  )
  on conflict (fee_control_id) do update
    set finance_note = coalesce(excluded.finance_note, public.transaction_fee_invoice_queue.finance_note)
  returning * into v_invoice;

  return jsonb_build_object(
    'id', v_invoice.id,
    'transactionId', v_invoice.transaction_id,
    'billingPartyType', v_invoice.billing_party_type,
    'status', v_invoice.status,
    'feeAmountExVat', v_invoice.fee_amount_ex_vat,
    'vatAmount', v_invoice.vat_amount,
    'totalAmountInclVat', v_invoice.total_amount_incl_vat
  );
end;
$$;

create or replace function public.bridge_complete_transaction_fee_invoice(
  p_transaction_id uuid,
  p_invoice_reference text,
  p_finance_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invoice public.transaction_fee_invoice_queue%rowtype;
  v_reference text := nullif(left(trim(coalesce(p_invoice_reference, '')), 160), '');
  v_note text := nullif(left(trim(coalesce(p_finance_note, '')), 1000), '');
begin
  if v_actor_id is null then
    raise exception 'An authenticated finance administrator is required to complete an invoice.' using errcode = '42501';
  end if;
  if v_reference is null then
    raise exception 'Enter the invoice reference from your accounting system.' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.transaction_fee_invoice_queue
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'Prepare the transaction-fee invoice before marking it complete.' using errcode = 'P0002';
  end if;
  if not public.bridge_transaction_fee_finance_admin(v_invoice.organisation_id) then
    raise exception 'Only senior organisation management may complete this transaction-fee invoice.' using errcode = '42501';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'A cancelled transaction-fee invoice cannot be completed.' using errcode = '22023';
  end if;

  update public.transaction_fee_invoice_queue
  set status = 'completed',
      completed_at = now(),
      completed_by_user_id = v_actor_id,
      invoice_reference = v_reference,
      finance_note = coalesce(v_note, finance_note)
  where id = v_invoice.id
  returning * into v_invoice;

  return jsonb_build_object(
    'id', v_invoice.id,
    'transactionId', v_invoice.transaction_id,
    'status', v_invoice.status,
    'invoiceReference', v_invoice.invoice_reference,
    'completedAt', v_invoice.completed_at
  );
end;
$$;

create or replace function public.bridge_list_transaction_fee_invoice_queue()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', queue.id,
    'feeControlId', queue.fee_control_id,
    'transactionId', queue.transaction_id,
    'billingPartyType', queue.billing_party_type,
    'status', queue.status,
    'feeAmountExVat', queue.fee_amount_ex_vat,
    'vatAmount', queue.vat_amount,
    'totalAmountInclVat', queue.total_amount_incl_vat,
    'preparedAt', queue.prepared_at,
    'invoiceReference', queue.invoice_reference
  )
  from public.transaction_fee_invoice_queue queue
  where public.bridge_transaction_fee_finance_admin(queue.organisation_id)
  union all
  select jsonb_build_object(
    'id', null,
    'feeControlId', control.id,
    'transactionId', control.transaction_id,
    'billingPartyType', control.billing_party_type,
    'status', 'ready_to_prepare',
    'feeAmountExVat', control.fee_amount_ex_vat,
    'vatAmount', control.vat_amount,
    'totalAmountInclVat', control.total_amount_incl_vat,
    'preparedAt', null,
    'invoiceReference', null
  )
  from public.transaction_fee_controls control
  where public.bridge_transaction_fee_finance_admin(control.organisation_id)
    and control.consent_and_fee_terms_confirmed
    and coalesce((to_jsonb(control)->>'attorney_receipt_confirmed')::boolean, false)
    and not exists (
      select 1 from public.transaction_fee_invoice_queue queue
      where queue.fee_control_id = control.id
    );
$$;

revoke all on table public.transaction_fee_invoice_queue from public, anon, authenticated;
grant select on table public.transaction_fee_invoice_queue to authenticated;
revoke all on function public.bridge_transaction_fee_finance_admin(uuid) from public, anon;
revoke all on function public.bridge_prepare_transaction_fee_invoice(uuid, text) from public, anon;
revoke all on function public.bridge_complete_transaction_fee_invoice(uuid, text, text) from public, anon;
revoke all on function public.bridge_list_transaction_fee_invoice_queue() from public, anon;
grant execute on function public.bridge_transaction_fee_finance_admin(uuid) to authenticated;
grant execute on function public.bridge_prepare_transaction_fee_invoice(uuid, text) to authenticated;
grant execute on function public.bridge_complete_transaction_fee_invoice(uuid, text, text) to authenticated;
grant execute on function public.bridge_list_transaction_fee_invoice_queue() to authenticated;

comment on table public.transaction_fee_invoice_queue is
  'Finance work queue for the R1,500 excl. VAT transaction fee after OTP and attorney receipt controls; it is not a tax-invoice document store.';

notify pgrst, 'reload schema';
