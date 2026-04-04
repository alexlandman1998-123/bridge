-- Real operational seed for Junoah Estate
-- Source: Deals Working On - 9 March 2026

-- Compatibility guard for older databases
alter table if exists units add column if not exists phase text;
alter table if exists transactions add column if not exists purchaser_type text;
alter table if exists transactions add column if not exists finance_managed_by text;
alter table if exists transactions add column if not exists assigned_agent text;
alter table if exists transactions add column if not exists assigned_agent_email text;
alter table if exists transactions add column if not exists assigned_attorney_email text;
alter table if exists transactions add column if not exists assigned_bond_originator_email text;

-- Clear all data so only real Junoah sheet data remains
-- (child -> parent; optional tables cleared only when present)
do $$
declare
  optional_table text;
begin
  foreach optional_table in array array[
    'transaction_subprocess_steps',
    'transaction_subprocesses',
    'transaction_comments',
    'transaction_participants',
    'transaction_notifications',
    'transaction_readiness_states',
    'transaction_status_links',
    'documents',
    'transaction_finance_details',
    'transaction_external_access',
    'trust_investment_forms',
    'transaction_handover',
    'transaction_onboarding',
    'onboarding_form_data',
    'transaction_required_documents',
    'service_reviews',
    'alteration_requests',
    'client_issues',
    'client_portal_links',
    'snapshot_links',
    'development_settings',
    'document_requirement_rules',
    'document_templates',
    'document_groups',
    'document_requirements'
  ]
  loop
    if to_regclass('public.' || optional_table) is not null then
      execute format('delete from %I', optional_table);
    end if;
  end loop;
end $$;

delete from notes;
delete from transactions;
delete from buyers;
delete from units;
delete from developments;

do $$
begin
  if to_regclass('public.development_profiles') is not null then
    execute 'delete from development_profiles';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_agent'
  ) then
    update transactions set assigned_agent = 'Brendan';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_agent_email'
  ) then
    update transactions set assigned_agent_email = 'brendan@samlinconstruction.co.za';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_attorney_email'
  ) then
    update transactions
    set assigned_attorney_email = 'status@tuckers.co.za',
        attorney = coalesce(attorney, 'Tuckers Conveyancing');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_bond_originator_email'
  ) then
    update transactions
    set assigned_bond_originator_email = 'ops@primebond.co.za'
    where finance_type in ('bond', 'combination', 'hybrid');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'finance_managed_by'
  ) then
    update transactions set finance_managed_by = 'bond_originator';
    update transactions
    set finance_managed_by = 'client'
    where id in ('c0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000019');
    update transactions
    set finance_managed_by = 'internal'
    where id in ('c0000000-0000-0000-0000-000000000011');
  end if;
end $$;

insert into developments (id, name, planned_units)
values
  ('d0000000-0000-0000-0000-000000000001', 'Junoah Estate', 21);

insert into units (id, development_id, unit_number, phase, price, status)
values
  -- Phase 4
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '1', 'Phase 4', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '2', 'Phase 4', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', '3', 'Phase 4', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', '4', 'Phase 4', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', '5', 'Phase 4', 0.00, 'Available'),

  -- Phase 3
  ('a0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', '6', 'Phase 3', 0.00, 'OTP Signed'),
  ('a0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', '7', 'Phase 3', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', '8', 'Phase 3', 0.00, 'Available'),
  ('a0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001', '9', 'Phase 3', 2190000.00, 'Reserved'),
  ('a0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000001', '10', 'Phase 3', 2190000.00, 'OTP Signed'),
  ('a0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000001', '11', 'Phase 3', 2190000.00, 'Deposit Paid'),
  ('a0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000001', '12', 'Phase 3', 2190000.00, 'Bond Approved / Proof of Funds'),
  ('a0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000001', '13', 'Phase 3', 2190000.00, 'Proceed to Attorneys'),

  -- Phase 2
  ('a0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000001', '14', 'Phase 2', 2100000.00, 'Proceed to Attorneys'),
  ('a0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000001', '15', 'Phase 2', 2190000.00, 'Registered'),
  ('a0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000001', '16', 'Phase 2', 2190000.00, 'Registered'),
  ('a0000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000001', '19', 'Phase 2', 2190000.00, 'Reserved'),
  ('a0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000001', '20', 'Phase 2', 2160000.00, 'Proceed to Attorneys'),
  ('a0000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000001', '21', 'Phase 2', 2190000.00, 'Proceed to Attorneys');

insert into buyers (id, name, phone, email)
values
  ('b0000000-0000-0000-0000-000000000001', 'Yusuf', null, null),
  ('b0000000-0000-0000-0000-000000000002', 'Bhavna', null, null),
  ('b0000000-0000-0000-0000-000000000003', 'Zunaid', null, null),
  ('b0000000-0000-0000-0000-000000000004', 'Jannie', null, null),
  ('b0000000-0000-0000-0000-000000000005', 'Marlizelle', null, null),
  ('b0000000-0000-0000-0000-000000000006', 'Cheneil', null, null),
  ('b0000000-0000-0000-0000-000000000007', 'Mr Singh', null, null),
  ('b0000000-0000-0000-0000-000000000008', 'Linda', null, null),
  ('b0000000-0000-0000-0000-000000000009', 'Arian (Discovery)', null, null),
  ('b0000000-0000-0000-0000-000000000010', 'Salome', null, null),
  ('b0000000-0000-0000-0000-000000000011', 'Karina', null, null),
  ('b0000000-0000-0000-0000-000000000012', 'Sheila Govan', null, null),
  ('b0000000-0000-0000-0000-000000000013', 'Ryan', null, null),
  ('b0000000-0000-0000-0000-000000000014', 'Naledi Mokoena', '0820001122', 'naledi@example.com');

insert into transactions (
  id,
  development_id,
  unit_id,
  buyer_id,
  sales_price,
  finance_type,
  stage,
  current_main_stage,
  comment,
  next_action,
  risk_status,
  is_active,
  created_at,
  updated_at
)
values
  (
    'c0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    null,
    'cash',
    'Available',
    'AVAIL',
    'Asked Brendan for the Information',
    'Asked Brendan for the Information',
    'On Track',
    true,
    timestamp '2026-03-09 08:00:00+00',
    timestamp '2026-03-09 08:00:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000006',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    'b0000000-0000-0000-0000-000000000002',
    null,
    'bond',
    'OTP Signed',
    'OTP',
    'Pre Approval Done - just wants to come view',
    'Pre Approval Done - just wants to come view',
    'On Track',
    true,
    timestamp '2026-03-09 08:05:00+00',
    timestamp '2026-03-09 08:05:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000009',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000009',
    'b0000000-0000-0000-0000-000000000003',
    2190000.00,
    'combination',
    'Reserved',
    'DEP',
    'Received info sheet - now waiting for split',
    'Received info sheet - now waiting for split',
    'On Track',
    true,
    timestamp '2026-03-09 08:10:00+00',
    timestamp '2026-03-09 08:10:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000010',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000010',
    'b0000000-0000-0000-0000-000000000004',
    2190000.00,
    'bond',
    'OTP Signed',
    'OTP',
    'Signed with FNB',
    'Signed with FNB',
    'On Track',
    true,
    timestamp '2026-03-09 08:15:00+00',
    timestamp '2026-03-09 08:15:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000011',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000011',
    'b0000000-0000-0000-0000-000000000005',
    2190000.00,
    'combination',
    'Deposit Paid',
    'DEP',
    'Deposit Paid - Waiting for Cash/Bond Split',
    'Deposit Paid - Waiting for Cash/Bond Split',
    'On Track',
    true,
    timestamp '2026-03-09 08:20:00+00',
    timestamp '2026-03-09 08:20:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000012',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000012',
    'b0000000-0000-0000-0000-000000000006',
    2190000.00,
    'bond',
    'Bond Approved / Proof of Funds',
    'FIN',
    'Info Sheet Received, Contract Completed',
    'Info Sheet Received, Contract Completed',
    'On Track',
    true,
    timestamp '2026-03-09 08:25:00+00',
    timestamp '2026-03-09 08:25:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000013',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000013',
    'b0000000-0000-0000-0000-000000000007',
    2190000.00,
    'cash',
    'Proceed to Attorneys',
    'ATTY',
    'With Tuckers',
    'With Tuckers',
    'On Track',
    true,
    timestamp '2026-03-09 08:30:00+00',
    timestamp '2026-03-09 08:30:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000014',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000014',
    'b0000000-0000-0000-0000-000000000008',
    2100000.00,
    'cash',
    'Proceed to Attorneys',
    'ATTY',
    'With Tuckers',
    'With Tuckers',
    'On Track',
    true,
    timestamp '2026-03-09 08:35:00+00',
    timestamp '2026-03-09 08:35:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000015',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000015',
    'b0000000-0000-0000-0000-000000000009',
    2190000.00,
    'cash',
    'Registered',
    'REG',
    'Done',
    'Done',
    'On Track',
    true,
    timestamp '2026-03-09 08:40:00+00',
    timestamp '2026-03-09 08:40:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000016',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000016',
    'b0000000-0000-0000-0000-000000000010',
    2190000.00,
    'cash',
    'Registered',
    'REG',
    'Done',
    'Done',
    'On Track',
    true,
    timestamp '2026-03-09 08:45:00+00',
    timestamp '2026-03-09 08:45:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000019',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000019',
    'b0000000-0000-0000-0000-000000000011',
    2190000.00,
    'bond',
    'Reserved',
    'DEP',
    'Deposit Paid - now doing bond application',
    'Deposit Paid - now doing bond application',
    'On Track',
    true,
    timestamp '2026-03-09 08:50:00+00',
    timestamp '2026-03-09 08:50:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000020',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000020',
    'b0000000-0000-0000-0000-000000000012',
    2160000.00,
    'cash',
    'Proceed to Attorneys',
    'ATTY',
    'With Tuckers',
    'With Tuckers',
    'On Track',
    true,
    timestamp '2026-03-09 08:55:00+00',
    timestamp '2026-03-09 08:55:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000021',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000021',
    'b0000000-0000-0000-0000-000000000013',
    2190000.00,
    'cash',
    'Proceed to Attorneys',
    'ATTY',
    'With Tuckers',
    'With Tuckers',
    'On Track',
    true,
    timestamp '2026-03-09 09:00:00+00',
    timestamp '2026-03-09 09:00:00+00'
  ),
  (
    'c0000000-0000-0000-0000-000000000022',
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000014',
    2290000.00,
    'bond',
    'Transfer in Progress',
    'XFER',
    'Transfer pack complete. Awaiting municipal clearance confirmation.',
    'Follow up with municipality on outstanding rates clearance.',
    'Needs Attention',
    true,
    timestamp '2026-03-10 09:30:00+00',
    timestamp '2026-03-10 09:30:00+00'
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_agent'
  ) then
    update transactions
    set assigned_agent = coalesce(assigned_agent, 'Brendan');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_agent_email'
  ) then
    update transactions
    set assigned_agent_email = coalesce(assigned_agent_email, 'brendan@samlinconstruction.co.za');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_attorney_email'
  ) then
    update transactions
    set assigned_attorney_email = coalesce(assigned_attorney_email, 'status@tuckers.co.za'),
        attorney = coalesce(attorney, 'Tuckers Conveyancing');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'assigned_bond_originator_email'
  ) then
    update transactions
    set assigned_bond_originator_email = coalesce(assigned_bond_originator_email, 'ops@primebond.co.za')
    where finance_type in ('bond', 'combination', 'hybrid');
  end if;
end $$;

update transactions
set finance_type = 'combination'
where finance_type = 'hybrid';

update transactions
set purchase_price = sales_price
where purchase_price is null
  and sales_price is not null;

update transactions
set cash_amount = purchase_price
where finance_type = 'cash'
  and purchase_price is not null;

update transactions
set bond_amount = purchase_price,
    deposit_amount = coalesce(deposit_amount, 0)
where finance_type = 'bond'
  and purchase_price is not null;

update transactions
set bond_amount = 1500000,
    cash_amount = 690000
where id in ('c0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000011');

update transactions
set reservation_required = true,
    reservation_amount = 10000,
    reservation_status = 'paid',
    reservation_paid_date = date '2026-03-08'
where id in ('c0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000013');

update transactions
set reservation_required = true,
    reservation_amount = 10000,
    reservation_status = 'pending',
    reservation_paid_date = null
where id in ('c0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000021');

-- Attorney demo coverage: keep legal queue spread visible
update transactions
set stage = 'Transfer Lodged',
    current_main_stage = 'XFER',
    next_action = 'Lodged at deeds office - waiting examination.',
    comment = 'Lodgement submitted and deeds reference captured.',
    updated_at = timestamp '2026-03-10 10:20:00+00'
where id = 'c0000000-0000-0000-0000-000000000020';

update transactions
set stage = 'Transfer in Progress',
    current_main_stage = 'XFER',
    next_action = 'Ready for lodgement once municipal clearance is received.',
    comment = 'Guarantees received. Awaiting municipal clearance.',
    updated_at = timestamp '2026-03-10 09:15:00+00'
where id = 'c0000000-0000-0000-0000-000000000021';

update transactions
set stage = 'Proceed to Attorneys',
    current_main_stage = 'ATTY',
    next_action = 'Ready for lodgement. Guarantees and signed transfer docs received.',
    comment = 'Municipal clearance received. Levy clearance verified.',
    updated_at = timestamp '2026-03-10 08:40:00+00'
where id = 'c0000000-0000-0000-0000-000000000014';

update units
set status = 'Transfer Lodged'
where id = 'a0000000-0000-0000-0000-000000000020';

update units
set status = 'Transfer in Progress'
where id = 'a0000000-0000-0000-0000-000000000021';

update units
set status = 'Transfer in Progress'
where id = 'a0000000-0000-0000-0000-000000000002';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'purchaser_type'
  ) then
    update transactions set purchaser_type = 'individual';

    update transactions set purchaser_type = 'married_anc'
    where id in ('c0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000019');

    update transactions set purchaser_type = 'company'
    where id in ('c0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000014');

    update transactions set purchaser_type = 'trust'
    where id in ('c0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000021');
  end if;
end $$;

do $$
begin
  if to_regclass('public.transaction_onboarding') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'purchaser_type'
    ) then
      insert into transaction_onboarding (transaction_id, token, purchaser_type, status, is_active, submitted_at)
      select
        t.id,
        concat('onb', replace(t.id::text, '-', '')),
        coalesce(t.purchaser_type, 'individual'),
        case
          when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013') then 'Submitted'
          else 'In Progress'
        end,
        true,
        case
          when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013') then timestamp '2026-03-09 10:30:00+00'
          else null
        end
      from transactions t;
    else
      insert into transaction_onboarding (transaction_id, token, purchaser_type, status, is_active, submitted_at)
      select
        t.id,
        concat('onb', replace(t.id::text, '-', '')),
        'individual',
        case
          when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013') then 'Submitted'
          else 'In Progress'
        end,
        true,
        case
          when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013') then timestamp '2026-03-09 10:30:00+00'
          else null
        end
      from transactions t;
    end if;
  end if;

  if to_regclass('public.onboarding_form_data') is not null then
    insert into onboarding_form_data (transaction_id, purchaser_type, form_data)
    values
      (
        'c0000000-0000-0000-0000-000000000012',
        'individual',
        jsonb_build_object(
          'full_name', 'Cheneil',
          'id_number', '9001010000000',
          'phone', '+27 72 000 1200',
          'email', 'cheneil@example.com',
          'residential_address', 'Junoah Estate, Unit 12'
        )
      ),
      (
        'c0000000-0000-0000-0000-000000000013',
        'company',
        jsonb_build_object(
          'company_name', 'Singh Holdings (Pty) Ltd',
          'company_registration_number', '2024/001234/07',
          'company_address', 'Cape Town, Western Cape',
          'director_full_name', 'Mr Singh',
          'director_id_number', '8205050000000',
          'director_email', 'mr.singh@example.com',
          'director_phone', '+27 82 000 1300'
        )
      );
  end if;

  if to_regclass('public.document_groups') is not null then
    insert into document_groups (key, label, description, sort_order, is_client_visible, is_enabled)
    values
      ('sale', 'Sale', 'Reservation, OTP, and sale agreement pack.', 1, true, true),
      ('buyer_fica', 'Buyer & FICA', 'Purchaser identity, compliance, and structure documents.', 2, true, true),
      ('finance', 'Finance', 'Finance application and funding-related documents.', 3, true, true),
      ('transfer', 'Transfer', 'Attorney and conveyancing transfer file documents.', 4, true, true),
      ('handover', 'Handover', 'Post-transfer handover, snag, and homeowner documents.', 5, true, true)
    on conflict (key) do update
    set
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_client_visible = excluded.is_client_visible,
      is_enabled = excluded.is_enabled;
  end if;

  if to_regclass('public.document_templates') is not null then
    insert into document_templates (
      key,
      label,
      description,
      group_key,
      expected_from_role,
      default_visibility,
      allow_multiple,
      sort_order,
      is_active
    )
    values
      ('otp', 'Offer to Purchase (OTP)', 'Offer to purchase agreement issued to the client.', 'sale', 'agent', 'shared', false, 1, true),
      ('signed_otp', 'Signed OTP', 'Signed OTP required before transfer preparation can proceed.', 'sale', 'client', 'shared', false, 2, true),
      ('reservation_deposit_proof', 'Reservation / Security Deposit Proof', 'Proof of reservation or security deposit payment.', 'sale', 'client', 'shared', false, 3, true),
      ('sale_annexure', 'Sale Annexure', 'Supporting annexure to the sale agreement.', 'sale', 'agent', 'shared', true, 4, true),
      ('id_document', 'ID Document', 'Certified identity document for compliance checks.', 'buyer_fica', 'client', 'client', false, 5, true),
      ('proof_of_address', 'Proof of Address', 'Recent proof of residential address for FICA.', 'buyer_fica', 'client', 'client', false, 6, true),
      ('marriage_certificate', 'Marriage Certificate', 'Marriage certificate required for married purchaser structures.', 'buyer_fica', 'client', 'client', false, 7, true),
      ('anc_document', 'ANC Document', 'Ante-nuptial contract where applicable.', 'buyer_fica', 'client', 'client', false, 8, true),
      ('trust_deed', 'Trust Deed', 'Trust deed to verify trust structure.', 'buyer_fica', 'client', 'shared', false, 9, true),
      ('letters_of_authority', 'Letters of Authority', 'Letters of authority for trustee powers.', 'buyer_fica', 'client', 'shared', false, 10, true),
      ('company_registration', 'Company Registration Documents', 'CIPC company registration pack.', 'buyer_fica', 'client', 'shared', false, 11, true),
      ('director_resolution', 'Director / Board Resolution', 'Board or director resolution authorizing purchase.', 'buyer_fica', 'client', 'shared', false, 12, true),
      ('bank_statements_3_months', 'Last 3 Months Bank Statements', 'Required for bond affordability checks.', 'finance', 'client', 'shared', false, 13, true),
      ('payslips_3_months', 'Last 3 Months Payslips', 'Required for bond affordability checks.', 'finance', 'client', 'shared', false, 14, true),
      ('employment_confirmation_letter', 'Employment Confirmation Letter', 'Required for bond underwriting.', 'finance', 'client', 'shared', false, 15, true),
      ('proof_of_funds', 'Proof of Funds', 'Required for cash transactions or cash contribution.', 'finance', 'client', 'shared', false, 16, true),
      ('bond_approval', 'Bond Approval', 'Bank bond approval letter and terms.', 'finance', 'bond_originator', 'shared', false, 17, true),
      ('grant_signed', 'Grant Signed', 'Grant acceptance confirmation.', 'finance', 'bond_originator', 'shared', false, 18, true),
      ('transfer_documents', 'Transfer Documents', 'Transfer drafting and signed legal pack.', 'transfer', 'attorney', 'shared', true, 19, true),
      ('guarantees', 'Guarantees', 'Guarantee and proceeds confirmations.', 'transfer', 'attorney', 'shared', true, 20, true),
      ('municipal_clearance', 'Municipal Clearance Certificate', 'Municipal clearance certificate.', 'transfer', 'attorney', 'shared', false, 21, true),
      ('levy_clearance', 'Levy / Body Corporate Clearance', 'Levy or body corporate clearance certificate.', 'transfer', 'attorney', 'shared', false, 22, true),
      ('transfer_duty_receipt', 'Transfer Duty Receipt', 'SARS transfer duty receipt.', 'transfer', 'attorney', 'shared', false, 23, true),
      ('handover_form', 'Handover Form', 'Final handover acceptance form.', 'handover', 'developer', 'shared', false, 24, true),
      ('snag_list', 'Snag List', 'Post-handover snag tracking list.', 'handover', 'client', 'shared', true, 25, true),
      ('warranty_documents', 'Warranty Documents', 'Home warranty and warranty support pack.', 'handover', 'developer', 'shared', true, 26, true)
    on conflict (key) do update
    set
      label = excluded.label,
      description = excluded.description,
      group_key = excluded.group_key,
      expected_from_role = excluded.expected_from_role,
      default_visibility = excluded.default_visibility,
      allow_multiple = excluded.allow_multiple,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;
  end if;

  if to_regclass('public.document_requirement_rules') is not null then
    insert into document_requirement_rules (
      purchaser_type,
      marital_structure,
      finance_type,
      reservation_required,
      template_key,
      required,
      enabled,
      notes
    )
    values
      ('individual', null, null, null, 'otp', true, true, 'Core sale agreement'),
      ('individual', null, null, null, 'signed_otp', true, true, 'Core sale agreement'),
      ('individual', null, null, null, 'id_document', true, true, 'Identity core'),
      ('individual', null, null, null, 'proof_of_address', true, true, 'FICA core'),
      ('individual', null, 'bond', null, 'bank_statements_3_months', true, true, 'Bond supporting docs'),
      ('individual', null, 'bond', null, 'payslips_3_months', true, true, 'Bond supporting docs'),
      ('individual', null, 'bond', null, 'employment_confirmation_letter', true, true, 'Bond supporting docs'),
      ('individual', null, 'bond', null, 'bond_approval', true, true, 'Bond outcome'),
      ('individual', null, 'cash', null, 'proof_of_funds', true, true, 'Cash funding proof'),
      ('individual', null, 'combination', null, 'proof_of_funds', true, true, 'Cash contribution proof'),
      ('individual', null, null, true, 'reservation_deposit_proof', true, true, 'Reservation proof'),
      ('married_coc', null, null, null, 'marriage_certificate', true, true, 'Marriage structure'),
      ('married_anc', null, null, null, 'anc_document', true, true, 'ANC structure'),
      ('trust', null, null, null, 'trust_deed', true, true, 'Trust structure'),
      ('trust', null, null, null, 'letters_of_authority', true, true, 'Trust structure'),
      ('company', null, null, null, 'company_registration', true, true, 'Company structure'),
      ('company', null, null, null, 'director_resolution', true, true, 'Company authority'),
      ('foreign_purchaser', null, null, null, 'id_document', true, true, 'Foreign buyer identity baseline'),
      ('foreign_purchaser', null, 'cash', null, 'proof_of_funds', true, true, 'Foreign funds proof'),
      ('individual', null, null, null, 'transfer_documents', true, true, 'Transfer lane core'),
      ('individual', null, null, null, 'guarantees', true, true, 'Transfer lane core'),
      ('individual', null, null, null, 'municipal_clearance', true, true, 'Transfer lane core'),
      ('individual', null, null, null, 'transfer_duty_receipt', true, true, 'Transfer lane core')
    on conflict do nothing;
  end if;

  if to_regclass('public.transaction_required_documents') is not null then
    with persona_docs as (
      select *
      from (
        values
          ('individual', 'id_document', 'ID Document', 1),
          ('individual', 'proof_of_address', 'Proof of Address', 2),
          ('individual', 'information_sheet', 'Information Sheet', 3),
          ('married_anc', 'purchaser_1_id', 'Purchaser 1 ID', 1),
          ('married_anc', 'purchaser_2_id', 'Purchaser 2 ID', 2),
          ('married_anc', 'purchaser_1_proof_of_address', 'Purchaser 1 Proof of Address', 3),
          ('married_anc', 'purchaser_2_proof_of_address', 'Purchaser 2 Proof of Address', 4),
          ('married_anc', 'marriage_certificate', 'Marriage Certificate', 5),
          ('married_anc', 'anc_contract', 'ANC Contract', 6),
          ('married_anc', 'information_sheet', 'Information Sheet', 7),
          ('married_coc', 'spouse_1_id', 'Spouse 1 ID', 1),
          ('married_coc', 'spouse_2_id', 'Spouse 2 ID', 2),
          ('married_coc', 'spouse_1_proof_of_address', 'Spouse 1 Proof of Address', 3),
          ('married_coc', 'spouse_2_proof_of_address', 'Spouse 2 Proof of Address', 4),
          ('married_coc', 'marriage_certificate', 'Marriage Certificate', 5),
          ('married_coc', 'information_sheet', 'Information Sheet', 6),
          ('company', 'company_registration_docs', 'Company Registration Documents', 1),
          ('company', 'director_id', 'Director ID', 2),
          ('company', 'director_proof_of_address', 'Director Proof of Address', 3),
          ('company', 'company_proof_of_address', 'Company Proof of Address', 4),
          ('company', 'resolution_to_purchase', 'Resolution to Purchase', 5),
          ('company', 'information_sheet', 'Information Sheet', 6),
          ('trust', 'trust_deed', 'Trust Deed', 1),
          ('trust', 'trustee_ids', 'Trustee IDs', 2),
          ('trust', 'trustee_proofs_of_address', 'Trustee Proofs of Address', 3),
          ('trust', 'trustee_resolution', 'Trustee Resolution', 4),
          ('trust', 'letters_of_authority', 'Letters of Authority', 5),
          ('trust', 'information_sheet', 'Information Sheet', 6)
      ) as d(purchaser_type, document_key, document_label, sort_order)
    )
    insert into transaction_required_documents (
      transaction_id,
      document_key,
      document_label,
      is_required,
      is_uploaded,
      status,
      enabled,
      group_key,
      group_label,
      description,
      required_from_role,
      visibility_scope,
      allow_multiple,
      sort_order
    )
    select
      t.id,
      d.document_key,
      d.document_label,
      true,
      case
        when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013')
             and d.document_key in ('information_sheet', 'id_document', 'proof_of_address', 'company_registration_docs')
          then true
        else false
      end,
      case
        when t.id in ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000013')
             and d.document_key in ('information_sheet', 'id_document', 'proof_of_address', 'company_registration_docs')
          then 'uploaded'
        else 'missing'
      end,
      true,
      case
        when d.document_key in ('otp', 'signed_otp', 'reservation_deposit_proof', 'sale_annexure', 'information_sheet') then 'sale'
        when d.document_key ~ '(bank|bond|payslip|funds|grant|employment)' then 'finance'
        when d.document_key ~ '(transfer|guarantee|clearance|duty|lodgement)' then 'transfer'
        when d.document_key ~ '(handover|snag|warranty|occupation)' then 'handover'
        else 'buyer_fica'
      end,
      case
        when d.document_key in ('otp', 'signed_otp', 'reservation_deposit_proof', 'sale_annexure', 'information_sheet') then 'Sale'
        when d.document_key ~ '(bank|bond|payslip|funds|grant|employment)' then 'Finance'
        when d.document_key ~ '(transfer|guarantee|clearance|duty|lodgement)' then 'Transfer'
        when d.document_key ~ '(handover|snag|warranty|occupation)' then 'Handover'
        else 'Buyer & FICA'
      end,
      concat('Required: ', d.document_label),
      case
        when d.document_key ~ '(transfer|guarantee|clearance|duty|lodgement)' then 'attorney'
        when d.document_key ~ '(bond|grant)' then 'bond_originator'
        when d.document_key in ('otp', 'sale_annexure') then 'agent'
        else 'client'
      end,
      case
        when d.document_key ~ '(transfer|guarantee|clearance|duty|lodgement)' then 'shared'
        else 'client'
      end,
      false,
      d.sort_order
    from transactions t
    join persona_docs d
      on d.purchaser_type = case
        when exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'transactions'
            and column_name = 'purchaser_type'
        ) then coalesce(t.purchaser_type, 'individual')
        else 'individual'
      end;
  end if;
end $$;

do $$
begin
  if to_regclass('public.documents') is not null then
    insert into documents (
      id,
      transaction_id,
      name,
      file_path,
      category,
      is_client_visible,
      uploaded_by_role,
      uploaded_by_email,
      created_at
    )
    values
      -- c13: attorney lane active but still waiting for bond instruction
      ('d1000000-0000-0000-0000-000000000131', 'c0000000-0000-0000-0000-000000000013', 'OTP Signed - Unit 13.pdf', 'seed/c13/otp-signed.pdf', 'OTP', true, 'agent', 'brendan@samlinconstruction.co.za', timestamp '2026-03-09 10:05:00+00'),
      ('d1000000-0000-0000-0000-000000000132', 'c0000000-0000-0000-0000-000000000013', 'Director ID - Singh.pdf', 'seed/c13/director-id.pdf', 'ID Document', true, 'client', 'mr.singh@example.com', timestamp '2026-03-09 10:20:00+00'),
      ('d1000000-0000-0000-0000-000000000133', 'c0000000-0000-0000-0000-000000000013', 'Transfer Pack Draft v1.pdf', 'seed/c13/transfer-pack-draft-v1.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-09 11:40:00+00'),

      -- c14: ready for lodgement
      ('d1000000-0000-0000-0000-000000000141', 'c0000000-0000-0000-0000-000000000014', 'OTP Signed - Unit 14.pdf', 'seed/c14/otp-signed.pdf', 'OTP', true, 'agent', 'brendan@samlinconstruction.co.za', timestamp '2026-03-09 09:30:00+00'),
      ('d1000000-0000-0000-0000-000000000142', 'c0000000-0000-0000-0000-000000000014', 'Proof of Address - Linda.pdf', 'seed/c14/proof-of-address.pdf', 'Proof of Address', true, 'client', 'linda@example.com', timestamp '2026-03-09 09:42:00+00'),
      ('d1000000-0000-0000-0000-000000000143', 'c0000000-0000-0000-0000-000000000014', 'Bond Approval Letter.pdf', 'seed/c14/bond-approval-letter.pdf', 'Bond Approval', true, 'bond_originator', 'ops@primebond.co.za', timestamp '2026-03-09 10:50:00+00'),
      ('d1000000-0000-0000-0000-000000000144', 'c0000000-0000-0000-0000-000000000014', 'Signed Transfer Documents.pdf', 'seed/c14/signed-transfer-documents.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 08:10:00+00'),
      ('d1000000-0000-0000-0000-000000000145', 'c0000000-0000-0000-0000-000000000014', 'Municipal Clearance Certificate.pdf', 'seed/c14/municipal-clearance-certificate.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 08:20:00+00'),
      ('d1000000-0000-0000-0000-000000000146', 'c0000000-0000-0000-0000-000000000014', 'Levy Clearance Certificate.pdf', 'seed/c14/levy-clearance-certificate.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 08:24:00+00'),
      ('d1000000-0000-0000-0000-000000000147', 'c0000000-0000-0000-0000-000000000014', 'Transfer Duty Receipt.pdf', 'seed/c14/transfer-duty-receipt.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 08:30:00+00'),
      ('d1000000-0000-0000-0000-000000000148', 'c0000000-0000-0000-0000-000000000014', 'Guarantees Received.pdf', 'seed/c14/guarantees-received.pdf', 'Bond Approval', false, 'bond_originator', 'ops@primebond.co.za', timestamp '2026-03-10 08:35:00+00'),

      -- c20: lodged at deeds
      ('d1000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000020', 'Deeds Lodgement Slip.pdf', 'seed/c20/deeds-lodgement-slip.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 10:20:00+00'),
      ('d1000000-0000-0000-0000-000000000202', 'c0000000-0000-0000-0000-000000000020', 'Body Corporate Rules - Unit 20.pdf', 'seed/c20/body-corporate-rules.pdf', 'Body Corporate Rules', true, 'developer', 'devops@samlinconstruction.co.za', timestamp '2026-03-10 09:05:00+00'),

      -- c21: transfer in progress with pending municipal clearance
      ('d1000000-0000-0000-0000-000000000211', 'c0000000-0000-0000-0000-000000000021', 'Signed Transfer Documents.pdf', 'seed/c21/signed-transfer-documents.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 09:00:00+00'),
      ('d1000000-0000-0000-0000-000000000212', 'c0000000-0000-0000-0000-000000000021', 'Bond Approval Letter.pdf', 'seed/c21/bond-approval-letter.pdf', 'Bond Approval', false, 'bond_originator', 'ops@primebond.co.za', timestamp '2026-03-10 09:02:00+00'),

      -- c22: fresh transfer item for attorney queue preview
      ('d1000000-0000-0000-0000-000000000221', 'c0000000-0000-0000-0000-000000000022', 'Signed OTP - Unit 2.pdf', 'seed/c22/signed-otp.pdf', 'OTP', true, 'agent', 'brendan@samlinconstruction.co.za', timestamp '2026-03-10 09:15:00+00'),
      ('d1000000-0000-0000-0000-000000000222', 'c0000000-0000-0000-0000-000000000022', 'Bond Approval Letter.pdf', 'seed/c22/bond-approval-letter.pdf', 'Bond Approval', true, 'bond_originator', 'ops@primebond.co.za', timestamp '2026-03-10 09:18:00+00'),
      ('d1000000-0000-0000-0000-000000000223', 'c0000000-0000-0000-0000-000000000022', 'Signed Transfer Documents.pdf', 'seed/c22/signed-transfer-documents.pdf', 'Transfer Documents', false, 'attorney', 'status@tuckers.co.za', timestamp '2026-03-10 09:25:00+00')
    on conflict (id) do update
    set
      name = excluded.name,
      file_path = excluded.file_path,
      category = excluded.category,
      is_client_visible = excluded.is_client_visible,
      uploaded_by_role = excluded.uploaded_by_role,
      uploaded_by_email = excluded.uploaded_by_email,
      created_at = excluded.created_at;
  end if;
end $$;

insert into notes (id, transaction_id, body, created_at)
values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Progress label: Available. Asked Brendan for the Information.', timestamp '2026-03-09 08:00:00+00'),
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', 'Progress label: OTP. Pre Approval Done - just wants to come view.', timestamp '2026-03-09 08:05:00+00'),
  ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 'Progress label: To Sign. Received info sheet - now waiting for split.', timestamp '2026-03-09 08:10:00+00'),
  ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', 'Progress label: Signed. Signed with FNB.', timestamp '2026-03-09 08:15:00+00'),
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000011', 'Progress label: Deposit Paid. Deposit Paid - Waiting for Cash/Bond Split.', timestamp '2026-03-09 08:20:00+00'),
  ('e0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000012', 'Progress label: Bank Approval. Info Sheet Received, Contract Completed.', timestamp '2026-03-09 08:25:00+00'),
  ('e0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000013', 'Progress label: With Tuckers. Waiting for bond instruction before guarantees.', timestamp '2026-03-09 08:30:00+00'),
  ('e0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000014', 'Progress label: With Tuckers. Ready for lodgement. Guarantees received, municipal clearance received, levy clearance verified.', timestamp '2026-03-09 08:35:00+00'),
  ('e0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000015', 'Progress label: Registered. Done.', timestamp '2026-03-09 08:40:00+00'),
  ('e0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000016', 'Progress label: Registered. Done.', timestamp '2026-03-09 08:45:00+00'),
  ('e0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000019', 'Progress label: To Sign. Deposit Paid - now doing bond application.', timestamp '2026-03-09 08:50:00+00'),
  ('e0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', 'Progress label: Lodged. Lodged at deeds office. Deeds reference captured, awaiting examination.', timestamp '2026-03-10 10:20:00+00'),
  ('e0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021', 'Progress label: Transfer. Guarantees received. Municipal clearance requested and pending.', timestamp '2026-03-10 09:00:00+00'),
  ('e0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000022', 'Progress label: Transfer. Awaiting municipal clearance confirmation before lodgement.', timestamp '2026-03-10 09:35:00+00');

do $$
begin
  if to_regclass('public.transaction_participants') is not null then
    insert into transaction_participants (
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    select
      t.id,
      'developer',
      'Samlin Internal Team',
      null,
      true,
      true,
      true,
      t.finance_managed_by in ('internal', 'client'),
      false,
      true
    from transactions t
    on conflict (transaction_id, role_type) do update
    set
      participant_name = excluded.participant_name,
      can_edit_finance_workflow = excluded.can_edit_finance_workflow,
      can_edit_attorney_workflow = excluded.can_edit_attorney_workflow,
      can_edit_core_transaction = excluded.can_edit_core_transaction;

    insert into transaction_participants (
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    select
      t.id,
      'agent',
      coalesce(t.assigned_agent, 'Sales Agent'),
      t.assigned_agent_email,
      true,
      true,
      true,
      false,
      false,
      true
    from transactions t
    on conflict (transaction_id, role_type) do update
    set
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      can_edit_core_transaction = excluded.can_edit_core_transaction;

    insert into transaction_participants (
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    select
      t.id,
      'attorney',
      coalesce(t.attorney, 'Tuckers Conveyancing'),
      t.assigned_attorney_email,
      true,
      true,
      true,
      false,
      true,
      false
    from transactions t
    on conflict (transaction_id, role_type) do update
    set
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      can_edit_attorney_workflow = excluded.can_edit_attorney_workflow,
      can_edit_core_transaction = excluded.can_edit_core_transaction;

    insert into transaction_participants (
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    select
      t.id,
      'bond_originator',
      coalesce(t.bond_originator, 'Prime Bond Partners'),
      t.assigned_bond_originator_email,
      true,
      true,
      true,
      t.finance_managed_by = 'bond_originator',
      false,
      false
    from transactions t
    on conflict (transaction_id, role_type) do update
    set
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      can_edit_finance_workflow = excluded.can_edit_finance_workflow,
      can_edit_core_transaction = excluded.can_edit_core_transaction;

    insert into transaction_participants (
      transaction_id,
      role_type,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    select
      t.id,
      'client',
      b.name,
      b.email,
      true,
      true,
      true,
      false,
      false,
      false
    from transactions t
    join buyers b on b.id = t.buyer_id
    on conflict (transaction_id, role_type) do update
    set
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      can_edit_core_transaction = excluded.can_edit_core_transaction;
  end if;

  if to_regclass('public.transaction_comments') is not null then
    insert into transaction_comments (id, transaction_id, author_name, author_role, comment_text, created_at)
    values
      ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000012', 'Prime Bond Partners', 'bond_originator', 'Submitted to FNB today. Awaiting bank feedback.', timestamp '2026-03-09 10:45:00+00'),
      ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000013', 'Tuckers Conveyancing', 'attorney', 'Waiting for bond instruction before guarantees.', timestamp '2026-03-09 11:10:00+00'),
      ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000019', 'Karina', 'client', 'Uploaded proof of address this morning.', timestamp '2026-03-09 11:20:00+00'),
      ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000020', 'Samlin Internal Team', 'developer', 'Awaiting split confirmation and signed transfer pack.', timestamp '2026-03-09 11:35:00+00'),
      ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000014', 'Tuckers Conveyancing', 'attorney', 'Ready for lodgement. Guarantees and clearances verified.', timestamp '2026-03-10 08:42:00+00'),
      ('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000020', 'Tuckers Conveyancing', 'attorney', 'Matter lodged at deeds office. Reference captured.', timestamp '2026-03-10 10:21:00+00'),
      ('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000021', 'Tuckers Conveyancing', 'attorney', 'Municipal clearance requested. Transfer pack otherwise complete.', timestamp '2026-03-10 09:05:00+00'),
      ('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000022', 'Tuckers Conveyancing', 'attorney', 'Transfer file prepared. Waiting on municipality clearance to mark ready for lodgement.', timestamp '2026-03-10 09:40:00+00')
    on conflict (id) do nothing;
  end if;

  if to_regclass('public.transaction_status_links') is not null then
    insert into transaction_status_links (transaction_id, token, is_active, created_by_role)
    select
      t.id,
      concat('status', replace(t.id::text, '-', '')),
      true,
      'attorney'
    from transactions t
    where t.stage in ('Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged', 'Registered')
    on conflict (token) do update
    set
      is_active = excluded.is_active,
      created_by_role = excluded.created_by_role;
  end if;

  if to_regclass('public.transaction_readiness_states') is not null then
    insert into transaction_readiness_states (
      transaction_id,
      onboarding_status,
      onboarding_complete,
      docs_complete,
      missing_required_docs,
      uploaded_required_docs,
      total_required_docs,
      finance_lane_ready,
      attorney_lane_ready,
      stage_ready
    )
    values
      ('c0000000-0000-0000-0000-000000000012', 'Submitted', true, true, 0, 3, 3, true, false, true),
      ('c0000000-0000-0000-0000-000000000013', 'Submitted', true, true, 0, 6, 6, true, true, true),
      ('c0000000-0000-0000-0000-000000000019', 'In Progress', false, false, 4, 2, 6, false, false, false)
    on conflict (transaction_id) do update
    set
      onboarding_status = excluded.onboarding_status,
      onboarding_complete = excluded.onboarding_complete,
      docs_complete = excluded.docs_complete,
      missing_required_docs = excluded.missing_required_docs,
      uploaded_required_docs = excluded.uploaded_required_docs,
      total_required_docs = excluded.total_required_docs,
      finance_lane_ready = excluded.finance_lane_ready,
      attorney_lane_ready = excluded.attorney_lane_ready,
      stage_ready = excluded.stage_ready;
  end if;

  if to_regclass('public.transaction_notifications') is not null then
    insert into transaction_notifications (
      transaction_id,
      user_id,
      role_type,
      notification_type,
      title,
      message,
      is_read,
      event_type,
      event_data,
      created_at
    )
    select
      p.transaction_id,
      p.user_id,
      p.role_type,
      'lane_handoff',
      'Attorney lane active',
      'Finance lane completed and transfer file is ready for legal processing.',
      false,
      'TransactionUpdated',
      jsonb_build_object('trigger', 'seed_demo', 'lane', 'attorney'),
      timestamp '2026-03-09 11:12:00+00'
    from transaction_participants p
    where p.role_type = 'attorney'
      and p.transaction_id = 'c0000000-0000-0000-0000-000000000013'
      and p.user_id is not null
    on conflict do nothing;

    insert into transaction_notifications (
      transaction_id,
      user_id,
      role_type,
      notification_type,
      title,
      message,
      is_read,
      event_type,
      event_data,
      created_at
    )
    select
      p.transaction_id,
      p.user_id,
      p.role_type,
      'overdue_missing_docs',
      'Missing documents reminder',
      '4 required documents are still outstanding for Unit 19.',
      false,
      'TransactionUpdated',
      jsonb_build_object('trigger', 'seed_demo', 'missingDocuments', 4),
      timestamp '2026-03-10 09:00:00+00'
    from transaction_participants p
    where p.role_type in ('agent', 'bond_originator')
      and p.transaction_id = 'c0000000-0000-0000-0000-000000000019'
      and p.user_id is not null
    on conflict do nothing;
  end if;

  if to_regclass('public.transaction_handover') is not null then
    insert into transaction_handover (
      transaction_id,
      development_id,
      unit_id,
      buyer_id,
      status,
      handover_date,
      electricity_meter_reading,
      water_meter_reading,
      gas_meter_reading,
      keys_handed_over,
      remote_handed_over,
      manuals_handed_over,
      inspection_completed,
      notes,
      signature_name,
      signature_signed_at
    )
    values
      (
        'c0000000-0000-0000-0000-000000000015',
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000015',
        'b0000000-0000-0000-0000-000000000009',
        'completed',
        date '2026-03-09',
        '002341',
        '000987',
        '000112',
        true,
        true,
        true,
        true,
        'Handover completed on site. Homeowner dashboard now active.',
        'Arian (Discovery)',
        timestamp '2026-03-09 14:30:00+00'
      ),
      (
        'c0000000-0000-0000-0000-000000000013',
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000013',
        'b0000000-0000-0000-0000-000000000007',
        'in_progress',
        null,
        null,
        null,
        null,
        false,
        false,
        false,
        false,
        'Handover checklist opened and awaiting meter capture.',
        null,
        null
      )
    on conflict (transaction_id) do update
    set
      status = excluded.status,
      handover_date = excluded.handover_date,
      electricity_meter_reading = excluded.electricity_meter_reading,
      water_meter_reading = excluded.water_meter_reading,
      gas_meter_reading = excluded.gas_meter_reading,
      keys_handed_over = excluded.keys_handed_over,
      remote_handed_over = excluded.remote_handed_over,
      manuals_handed_over = excluded.manuals_handed_over,
      inspection_completed = excluded.inspection_completed,
      notes = excluded.notes,
      signature_name = excluded.signature_name,
      signature_signed_at = excluded.signature_signed_at;
  end if;

  if to_regclass('public.client_issues') is not null then
    insert into client_issues (
      id,
      development_id,
      unit_id,
      transaction_id,
      buyer_id,
      category,
      description,
      location,
      priority,
      status,
      created_at,
      updated_at
    )
    values
      (
        'i1000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000015',
        'c0000000-0000-0000-0000-000000000015',
        'b0000000-0000-0000-0000-000000000009',
        'Paint / Finishes',
        'Touch-up required on lounge wall near window.',
        'Lounge',
        'Low',
        'Open',
        timestamp '2026-03-10 07:20:00+00',
        timestamp '2026-03-10 07:20:00+00'
      )
    on conflict (id) do nothing;
  end if;
end $$;
