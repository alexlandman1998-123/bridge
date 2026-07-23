begin;

-- Buyer onboarding and the buyer portal intentionally use different bearer
-- capabilities.  An onboarding token may read and complete only its own
-- transaction; it may not receive general transaction update access or write
-- client_portal_links directly.

drop policy if exists transactions_select_onboarding_token_scope on public.transactions;
create policy transactions_select_onboarding_token_scope on public.transactions
for select to anon, authenticated
using (public.bridge_has_onboarding_token_transaction_access(id));

-- Funding sources are buyer-provided finance data.  The write path below is
-- deliberately an RPC so a bearer token cannot use an unrestricted table
-- update/delete capability, but onboarding still needs to read its own saved
-- entries when rendering the form.
drop policy if exists transaction_funding_sources_onboarding_select on public.transaction_funding_sources;
create policy transaction_funding_sources_onboarding_select on public.transaction_funding_sources
for select to anon, authenticated
using (public.bridge_has_onboarding_token_transaction_access(transaction_id));

create or replace function public.bridge_buyer_onboarding_portal_access()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding_token text := nullif(trim(coalesce(public.bridge_onboarding_request_token(), '')), '');
  v_onboarding public.transaction_onboarding%rowtype;
  v_transaction public.transactions%rowtype;
  v_link public.client_portal_links%rowtype;
  v_portal_enabled boolean := true;
begin
  if v_onboarding_token is null then
    raise exception 'A valid buyer onboarding token is required.' using errcode = '42501';
  end if;

  select *
    into v_onboarding
  from public.transaction_onboarding onboarding
  where onboarding.token = v_onboarding_token
    and onboarding.is_active is true
  order by onboarding.updated_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'Buyer onboarding link is invalid or inactive.' using errcode = '42501';
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_onboarding.transaction_id
  for update;

  if not found or v_transaction.development_id is null or v_transaction.unit_id is null then
    raise exception 'This buyer onboarding link is not connected to a complete transaction.' using errcode = '22023';
  end if;

  select coalesce(settings.client_portal_enabled, true)
    into v_portal_enabled
  from public.development_settings settings
  where settings.development_id = v_transaction.development_id;

  if not coalesce(v_portal_enabled, true) then
    return jsonb_build_object(
      'available', false,
      'reason', 'client_portal_disabled',
      'transactionId', v_transaction.id
    );
  end if;

  -- The partial unique index protects the invariant; the advisory lock makes
  -- simultaneous first-load requests deterministic before that conflict path.
  perform pg_advisory_xact_lock(hashtext(v_transaction.id::text));

  select *
    into v_link
  from public.client_portal_links link
  where link.transaction_id = v_transaction.id
    and link.is_active is true
  order by link.updated_at desc nulls last
  limit 1;

  if not found then
    insert into public.client_portal_links (
      development_id,
      unit_id,
      transaction_id,
      buyer_id,
      token,
      is_active
    )
    values (
      v_transaction.development_id,
      v_transaction.unit_id,
      v_transaction.id,
      v_transaction.buyer_id,
      'clp' || replace(extensions.gen_random_uuid()::text, '-', ''),
      true
    )
    on conflict (transaction_id) where is_active do nothing
    returning * into v_link;

    if v_link.id is null then
      select *
        into v_link
      from public.client_portal_links link
      where link.transaction_id = v_transaction.id
        and link.is_active is true
      order by link.updated_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_link.id is null then
    raise exception 'Unable to prepare buyer portal access.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'available', true,
    'id', v_link.id,
    'developmentId', v_link.development_id,
    'unitId', v_link.unit_id,
    'transactionId', v_link.transaction_id,
    'buyerId', v_link.buyer_id,
    'token', v_link.token,
    'isActive', v_link.is_active,
    'createdAt', v_link.created_at,
    'updatedAt', v_link.updated_at,
    'path', '/client/' || v_link.token
  );
end;
$$;

revoke all on function public.bridge_buyer_onboarding_portal_access() from public, anon, authenticated;
grant execute on function public.bridge_buyer_onboarding_portal_access() to anon, authenticated;

create or replace function public.bridge_save_buyer_onboarding_snapshot(
  p_form_data jsonb,
  p_snapshot jsonb,
  p_funding_sources jsonb default '[]'::jsonb,
  p_submit boolean default false,
  p_next_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding_token text := nullif(trim(coalesce(public.bridge_onboarding_request_token(), '')), '');
  v_portal_token text := nullif(trim(coalesce(public.bridge_client_portal_request_token(), '')), '');
  v_onboarding public.transaction_onboarding%rowtype;
  v_link public.client_portal_links%rowtype;
  v_transaction public.transactions%rowtype;
  v_transaction_id uuid;
  v_finance_type text;
  v_finance_managed_by text;
  v_purchaser_type text;
  v_onboarding_status text;
  v_reservation_status text;
  v_sales_price numeric;
  v_purchase_price numeric;
  v_cash_amount numeric;
  v_bond_amount numeric;
  v_deposit_amount numeric;
  v_reservation_amount numeric;
  v_reservation_required boolean;
  v_reservation_paid_date date;
  v_onboarding_completed_at timestamptz;
  v_external_submitted_at timestamptz;
  v_now timestamptz := now();
  v_next_action text := nullif(left(trim(coalesce(p_next_action, '')), 1000), '');
  v_source jsonb;
  v_source_type text;
  v_source_amount numeric;
  v_source_expected_date date;
  v_source_actual_date date;
  v_source_status text;
  v_portal jsonb := null;
begin
  if v_onboarding_token is not null and v_portal_token is not null then
    raise exception 'Buyer onboarding and client portal credentials cannot be combined.' using errcode = '42501';
  end if;

  if v_onboarding_token is null and v_portal_token is null then
    raise exception 'A valid buyer onboarding or client portal token is required.' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_snapshot), '') <> 'object' then
    raise exception 'Buyer onboarding snapshot must be an object.' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_form_data), '') <> 'object' then
    raise exception 'Buyer onboarding form data must be an object.' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_funding_sources), '') <> 'array' then
    raise exception 'Funding sources must be a list.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_funding_sources) > 25 then
    raise exception 'A maximum of 25 funding sources is allowed.' using errcode = '22023';
  end if;

  if v_onboarding_token is not null then
    select *
      into v_onboarding
    from public.transaction_onboarding onboarding
    where onboarding.token = v_onboarding_token
      and onboarding.is_active is true
    order by onboarding.updated_at desc nulls last
    limit 1
    for update;

    if not found then
      raise exception 'Buyer onboarding link is invalid or inactive.' using errcode = '42501';
    end if;

    v_transaction_id := v_onboarding.transaction_id;
  else
    if p_submit then
      raise exception 'Only an active onboarding link can submit buyer onboarding.' using errcode = '42501';
    end if;

    select *
      into v_link
    from public.client_portal_links link
    where link.token = v_portal_token
      and link.is_active is true
    order by link.updated_at desc nulls last
    limit 1
    for update;

    if not found then
      raise exception 'Client portal link is invalid or inactive.' using errcode = '42501';
    end if;

    v_transaction_id := v_link.transaction_id;
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found for buyer onboarding.' using errcode = 'P0002';
  end if;

  if v_onboarding.id is null then
    select *
      into v_onboarding
    from public.transaction_onboarding onboarding
    where onboarding.transaction_id = v_transaction.id
      and onboarding.is_active is true
    order by onboarding.updated_at desc nulls last
    limit 1
    for update;
  end if;

  v_finance_type := lower(nullif(trim(coalesce(p_snapshot ->> 'finance_type', '')), ''));
  if v_finance_type not in ('cash', 'bond', 'combination', 'hybrid') then
    raise exception 'Unsupported buyer finance type.' using errcode = '22023';
  end if;

  v_finance_managed_by := lower(nullif(trim(coalesce(p_snapshot ->> 'finance_managed_by', '')), ''));
  if v_finance_managed_by not in ('bond_originator', 'client', 'internal') then
    raise exception 'Unsupported finance owner.' using errcode = '22023';
  end if;

  v_purchaser_type := lower(nullif(trim(coalesce(p_snapshot ->> 'purchaser_type', '')), ''));
  if v_purchaser_type not in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser') then
    raise exception 'Unsupported purchaser type.' using errcode = '22023';
  end if;

  v_onboarding_status := lower(nullif(trim(coalesce(p_snapshot ->> 'onboarding_status', '')), ''));
  if v_onboarding_status not in ('awaiting_client_onboarding', 'awaiting_signed_otp') then
    raise exception 'Unsupported buyer onboarding status.' using errcode = '22023';
  end if;
  if p_submit then
    v_onboarding_status := 'awaiting_signed_otp';
  end if;

  v_reservation_status := lower(nullif(trim(coalesce(p_snapshot ->> 'reservation_status', '')), ''));
  if v_reservation_status not in ('not_required', 'pending', 'paid', 'verified', 'rejected') then
    raise exception 'Unsupported reservation status.' using errcode = '22023';
  end if;

  v_sales_price := case when nullif(trim(coalesce(p_snapshot ->> 'sales_price', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'sales_price')::numeric else null end;
  v_purchase_price := case when nullif(trim(coalesce(p_snapshot ->> 'purchase_price', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'purchase_price')::numeric else null end;
  v_cash_amount := case when nullif(trim(coalesce(p_snapshot ->> 'cash_amount', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'cash_amount')::numeric else null end;
  v_bond_amount := case when nullif(trim(coalesce(p_snapshot ->> 'bond_amount', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'bond_amount')::numeric else null end;
  v_deposit_amount := case when nullif(trim(coalesce(p_snapshot ->> 'deposit_amount', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'deposit_amount')::numeric else null end;
  v_reservation_amount := case when nullif(trim(coalesce(p_snapshot ->> 'reservation_amount', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (p_snapshot ->> 'reservation_amount')::numeric else null end;

  if coalesce(v_sales_price, 0) < 0
    or coalesce(v_purchase_price, 0) < 0
    or coalesce(v_cash_amount, 0) < 0
    or coalesce(v_bond_amount, 0) < 0
    or coalesce(v_deposit_amount, 0) < 0
    or coalesce(v_reservation_amount, 0) < 0 then
    raise exception 'Buyer finance amounts cannot be negative.' using errcode = '22023';
  end if;

  v_reservation_required := case lower(coalesce(p_snapshot ->> 'reservation_required', ''))
    when 'true' then true
    when 'yes' then true
    when '1' then true
    else false
  end;

  begin
    v_reservation_paid_date := nullif(trim(coalesce(p_snapshot ->> 'reservation_paid_date', '')), '')::date;
  exception when others then
    raise exception 'Reservation paid date must be a valid date.' using errcode = '22023';
  end;

  begin
    v_onboarding_completed_at := nullif(trim(coalesce(p_snapshot ->> 'onboarding_completed_at', '')), '')::timestamptz;
    v_external_submitted_at := nullif(trim(coalesce(p_snapshot ->> 'external_onboarding_submitted_at', '')), '')::timestamptz;
  exception when others then
    raise exception 'Buyer onboarding completion time must be valid.' using errcode = '22023';
  end;

  if p_submit then
    v_onboarding_completed_at := coalesce(v_onboarding_completed_at, v_now);
    v_external_submitted_at := coalesce(v_external_submitted_at, v_now);
  end if;

  update public.transactions
  set finance_type = v_finance_type,
      finance_managed_by = v_finance_managed_by,
      sales_price = v_sales_price,
      purchase_price = v_purchase_price,
      cash_amount = v_cash_amount,
      bond_amount = v_bond_amount,
      deposit_amount = v_deposit_amount,
      reservation_required = v_reservation_required,
      reservation_amount = case when v_reservation_required then v_reservation_amount else null end,
      reservation_status = v_reservation_status,
      reservation_paid_date = case when v_reservation_required then v_reservation_paid_date else null end,
      purchaser_type = v_purchaser_type,
      onboarding_status = v_onboarding_status,
      onboarding_completed_at = v_onboarding_completed_at,
      external_onboarding_submitted_at = v_external_submitted_at,
      current_main_stage = case when p_submit then 'OTP' else current_main_stage end,
      next_action = case when p_submit then v_next_action else next_action end,
      comment = case when p_submit then v_next_action else comment end,
      last_meaningful_activity_at = case when p_submit then v_now else last_meaningful_activity_at end,
      updated_at = v_now
  where id = v_transaction.id;

  insert into public.onboarding_form_data (
    transaction_id,
    purchaser_type,
    form_data,
    updated_at
  )
  values (
    v_transaction.id,
    v_purchaser_type,
    p_form_data,
    v_now
  )
  on conflict (transaction_id) do update
  set purchaser_type = excluded.purchaser_type,
      form_data = excluded.form_data,
      updated_at = excluded.updated_at;

  delete from public.transaction_funding_sources source
  where source.transaction_id = v_transaction.id;

  for v_source in select value from jsonb_array_elements(p_funding_sources) loop
    if jsonb_typeof(v_source) <> 'object' then
      raise exception 'Each funding source must be an object.' using errcode = '22023';
    end if;

    v_source_type := lower(regexp_replace(trim(coalesce(v_source ->> 'sourceType', v_source ->> 'source_type', 'other')), '\\s+', '_', 'g'));
    v_source_type := coalesce(nullif(left(v_source_type, 80), ''), 'other');
    v_source_amount := case when nullif(trim(coalesce(v_source ->> 'amount', '')), '') ~ '^[0-9]+(\\.[0-9]+)?$' then (v_source ->> 'amount')::numeric else null end;
    if coalesce(v_source_amount, 0) < 0 then
      raise exception 'Funding source amounts cannot be negative.' using errcode = '22023';
    end if;

    begin
      v_source_expected_date := nullif(trim(coalesce(v_source ->> 'expectedPaymentDate', v_source ->> 'expected_payment_date', '')), '')::date;
      v_source_actual_date := nullif(trim(coalesce(v_source ->> 'actualPaymentDate', v_source ->> 'actual_payment_date', '')), '')::date;
    exception when others then
      raise exception 'Funding source dates must be valid dates.' using errcode = '22023';
    end;

    v_source_status := lower(nullif(trim(coalesce(v_source ->> 'status', '')), ''));
    if v_source_status not in ('planned', 'pending', 'paid', 'verified') then
      v_source_status := 'planned';
    end if;

    if v_source_amount is not null
      or v_source_expected_date is not null
      or v_source_actual_date is not null
      or nullif(trim(coalesce(v_source ->> 'proofDocument', v_source ->> 'proof_document', '')), '') is not null then
      insert into public.transaction_funding_sources (
        transaction_id,
        source_type,
        amount,
        expected_payment_date,
        actual_payment_date,
        proof_document,
        status,
        notes,
        updated_at
      )
      values (
        v_transaction.id,
        v_source_type,
        v_source_amount,
        v_source_expected_date,
        v_source_actual_date,
        nullif(left(trim(coalesce(v_source ->> 'proofDocument', v_source ->> 'proof_document', '')), 2000), ''),
        v_source_status,
        nullif(left(trim(coalesce(v_source ->> 'notes', '')), 4000), ''),
        v_now
      );
    end if;
  end loop;

  if v_onboarding.id is not null then
    update public.transaction_onboarding
    set status = case when p_submit then 'Submitted' when status = 'Not Started' then 'In Progress' else status end,
        purchaser_type = v_purchaser_type,
        submitted_at = case when p_submit then coalesce(submitted_at, v_now) else submitted_at end,
        updated_at = v_now
    where id = v_onboarding.id
    returning * into v_onboarding;
  end if;

  if p_submit and not exists (
    select 1
    from public.transaction_events event
    where event.transaction_id = v_transaction.id
      and event.event_type = 'buyer_onboarding_completed'
  ) then
    insert into public.transaction_events (
      transaction_id,
      event_type,
      event_data,
      created_by,
      created_by_role,
      visibility_scope,
      created_at,
      updated_at
    )
    values (
      v_transaction.id,
      'buyer_onboarding_completed',
      jsonb_build_object(
        'source', 'buyer_onboarding_token',
        'onboardingStatus', 'awaiting_signed_otp',
        'purchaserType', v_purchaser_type,
        'financeType', v_finance_type,
        'reservationRequired', v_reservation_required
      ),
      null,
      'client',
      'internal',
      v_now,
      v_now
    );
  end if;

  if v_onboarding_token is not null then
    v_portal := public.bridge_buyer_onboarding_portal_access();
  end if;

  return jsonb_build_object(
    'transactionId', v_transaction.id,
    'onboarding', case when v_onboarding.id is null then null else jsonb_build_object(
      'id', v_onboarding.id,
      'transaction_id', v_onboarding.transaction_id,
      'status', v_onboarding.status,
      'purchaser_type', v_onboarding.purchaser_type,
      'submitted_at', v_onboarding.submitted_at,
      'is_active', v_onboarding.is_active,
      'created_at', v_onboarding.created_at,
      'updated_at', v_onboarding.updated_at
    ) end,
    'portal', v_portal
  );
end;
$$;

revoke all on function public.bridge_save_buyer_onboarding_snapshot(jsonb, jsonb, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.bridge_save_buyer_onboarding_snapshot(jsonb, jsonb, jsonb, boolean, text) to anon, authenticated;

-- Repair existing buyer journeys so previously-issued onboarding links can
-- immediately hand users into a portal.  This respects a development-level
-- opt-out and the active-link uniqueness invariant.
insert into public.client_portal_links (
  development_id,
  unit_id,
  transaction_id,
  buyer_id,
  token,
  is_active
)
select
  transaction_row.development_id,
  transaction_row.unit_id,
  transaction_row.id,
  transaction_row.buyer_id,
  'clp' || replace(extensions.gen_random_uuid()::text, '-', ''),
  true
from public.transaction_onboarding onboarding
join public.transactions transaction_row on transaction_row.id = onboarding.transaction_id
left join public.development_settings settings on settings.development_id = transaction_row.development_id
where onboarding.is_active is true
  and transaction_row.development_id is not null
  and transaction_row.unit_id is not null
  and coalesce(settings.client_portal_enabled, true) is true
  and not exists (
    select 1
    from public.client_portal_links link
    where link.transaction_id = transaction_row.id
      and link.is_active is true
  )
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
