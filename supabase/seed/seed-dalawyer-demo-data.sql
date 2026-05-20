begin;

do $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_firm_id uuid;
  v_transfer_department_id uuid;
  v_bond_department_id uuid;
  v_admin_department_id uuid;
  v_tuckers_id uuid;
  v_meyer_id uuid;
  v_northside_id uuid;
  v_tx_ids uuid[] := array[]::uuid[];
  v_buyer_ids uuid[] := array[]::uuid[];
  v_subprocess_ids uuid[] := array[]::uuid[];
  rec record;
  v_tx_id uuid;
  v_buyer_id uuid;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_transfer_assignment_id uuid;
  v_bond_assignment_id uuid;
  v_cancellation_assignment_id uuid;
  v_lane_key text;
  v_lane_role text;
  v_lane_firm_id uuid;
  v_lane_department_id uuid;
  v_lane_assignment_id uuid;
  v_lane_progress integer;
  v_lane_blocked_step integer;
  v_lane_status text;
  v_current_stage text;
  v_subprocess_id uuid;
  v_step_keys text[];
  v_step_labels text[];
  v_step_count integer;
  v_step_index integer;
  v_step_status text;
  v_step_completed_at timestamptz;
  v_step_due_date date;
  v_is_registered boolean;
  v_matter_status text;
  v_external_firm_id uuid;
  v_now timestamptz := now();
begin
  select p.id
    into v_user_id
  from public.profiles p
  where lower(p.email) = lower('info@yakstack.co')
  limit 1;

  if v_user_id is null then
    raise exception 'Dalawyer demo seed aborted: profile info@yakstack.co was not found.';
  end if;

  select f.id
    into v_firm_id
  from public.attorney_firms f
  where lower(f.name) = lower('Dalawyer Lawyers')
     or f.id = (select p.primary_attorney_firm_id from public.profiles p where p.id = v_user_id)
  order by case when lower(f.name) = lower('Dalawyer Lawyers') then 0 else 1 end
  limit 1;

  if v_firm_id is null then
    raise exception 'Dalawyer demo seed aborted: attorney firm Dalawyer Lawyers was not found.';
  end if;

  select f.organisation_id
    into v_org_id
  from public.attorney_firms f
  where f.id = v_firm_id;

  if v_org_id is null then
    select ou.organisation_id
      into v_org_id
    from public.organisation_users ou
    where ou.user_id = v_user_id
      and coalesce(ou.status, 'active') = 'active'
    order by ou.created_at desc nulls last
    limit 1;
  end if;

  if v_org_id is null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organisations'
      and column_name = 'name'
  ) then
    execute $sql$
      select o.id
      from public.organisations o
      where lower(o.name) in (lower('Dalawyer Lawyers'), lower('Dalawyer Lawyers Inc'), lower('Dalawyer Lawyers Inc.'))
      order by o.created_at desc nulls last
      limit 1
    $sql$ into v_org_id;
  end if;

  if v_org_id is null then
    insert into public.organisations (
      name,
      display_name,
      company_email,
      company_phone,
      city,
      province,
      country,
      primary_contact_person,
      is_demo_data,
      created_at,
      updated_at
    )
    values (
      'Dalawyer Lawyers',
      'Dalawyer Lawyers',
      'info@yakstack.co',
      '+27 11 555 0190',
      'Johannesburg',
      'Gauteng',
      'South Africa',
      'Dalawyer Lawyers',
      true,
      v_now,
      v_now
    )
    returning id into v_org_id;
  end if;

  update public.attorney_firms
  set name = 'Dalawyer Lawyers',
      email = coalesce(email, 'info@yakstack.co'),
      phone = coalesce(phone, '+27 11 555 0190'),
      city = coalesce(city, 'Johannesburg'),
      province = coalesce(province, 'Gauteng'),
      organisation_id = coalesce(organisation_id, v_org_id),
      is_active = true,
      updated_at = v_now
  where id = v_firm_id;

  update public.organisation_users
  set status = 'active',
      updated_at = v_now
  where organisation_id = v_org_id
    and user_id = v_user_id;

  if not found then
    insert into public.organisation_users (
      organisation_id,
      user_id,
      email,
      role,
      status,
      accepted_at,
      created_at,
      updated_at,
      is_demo_data
    )
    values (
      v_org_id,
      v_user_id,
      'info@yakstack.co',
      'attorney',
      'active',
      v_now,
      v_now,
      v_now,
      true
    );
  end if;

  update public.profiles
  set primary_attorney_firm_id = coalesce(primary_attorney_firm_id, v_firm_id),
      attorney_role = coalesce(attorney_role, 'firm_admin')
  where id = v_user_id;

  insert into public.attorney_firm_members (
    firm_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    created_at,
    updated_at
  )
  values (v_firm_id, v_user_id, 'firm_admin', 'active', v_user_id, v_now, v_now, v_now)
  on conflict (firm_id, user_id)
  do update set
    role = case when public.attorney_firm_members.role in ('firm_admin', 'director_partner') then public.attorney_firm_members.role else 'firm_admin' end,
    status = 'active',
    updated_at = excluded.updated_at;

  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active, created_at, updated_at)
  values
    (v_firm_id, 'Transfer Department', 'transfer', true, v_now, v_now),
    (v_firm_id, 'Bond Department', 'bond', true, v_now, v_now),
    (v_firm_id, 'Admin Department', 'admin', true, v_now, v_now),
    (v_firm_id, 'Management', 'management', true, v_now, v_now)
  on conflict (firm_id, department_type)
  do update set is_active = true, updated_at = excluded.updated_at;

  select id into v_transfer_department_id
  from public.attorney_firm_departments
  where firm_id = v_firm_id and department_type = 'transfer'
  limit 1;

  select id into v_bond_department_id
  from public.attorney_firm_departments
  where firm_id = v_firm_id and department_type = 'bond'
  limit 1;

  select id into v_admin_department_id
  from public.attorney_firm_departments
  where firm_id = v_firm_id and department_type in ('admin', 'management')
  order by case when department_type = 'admin' then 0 else 1 end
  limit 1;

  -- Repeatability guard: clear only existing Dalawyer demo rows before reseeding.
  select coalesce(array_agg(distinct t.id), array[]::uuid[])
    into v_tx_ids
  from public.transactions t
  where t.is_demo_data = true
    and (
      t.organisation_id = v_org_id
      or exists (
        select 1
        from public.transaction_attorney_assignments taa
        where taa.transaction_id = t.id
          and coalesce(taa.attorney_firm_id, taa.firm_id) = v_firm_id
      )
    );

  select coalesce(array_agg(distinct t.buyer_id), array[]::uuid[])
    into v_buyer_ids
  from public.transactions t
  where t.id = any(v_tx_ids)
    and t.buyer_id is not null;

  select coalesce(array_agg(distinct ts.id), array[]::uuid[])
    into v_subprocess_ids
  from public.transaction_subprocesses ts
  where ts.transaction_id = any(v_tx_ids)
    and ts.is_demo_data = true;

  delete from public.transaction_attorney_lane_updates where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.transaction_attorney_lane_history where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.attorney_workflow_blockers where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.document_requests where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.documents where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.transaction_participants where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.transaction_subprocess_steps where is_demo_data = true and subprocess_id = any(v_subprocess_ids);
  delete from public.transaction_subprocesses where is_demo_data = true and id = any(v_subprocess_ids);
  delete from public.transaction_events where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.transaction_attorney_assignments where is_demo_data = true and transaction_id = any(v_tx_ids);
  delete from public.transactions where is_demo_data = true and id = any(v_tx_ids);
  delete from public.buyers where is_demo_data = true and id = any(v_buyer_ids);
  delete from public.attorney_firms where is_demo_data = true and name in ('Tuckers Inc', 'Meyer & Partners Conveyancers', 'Northside Bond Attorneys');

  insert into public.attorney_firms (
    name,
    email,
    phone,
    city,
    province,
    country,
    organisation_id,
    created_by,
    is_active,
    is_demo_data,
    created_at,
    updated_at
  )
  values
    ('Tuckers Inc', 'conveyancing@tuckers.example', '+27 11 555 1200', 'Johannesburg', 'Gauteng', 'South Africa', v_org_id, v_user_id, true, true, v_now, v_now),
    ('Meyer & Partners Conveyancers', 'matters@meyerpartners.example', '+27 12 555 4410', 'Pretoria', 'Gauteng', 'South Africa', v_org_id, v_user_id, true, true, v_now, v_now),
    ('Northside Bond Attorneys', 'bonds@northside.example', '+27 10 555 8760', 'Sandton', 'Gauteng', 'South Africa', v_org_id, v_user_id, true, true, v_now, v_now);

  select id into v_tuckers_id from public.attorney_firms where is_demo_data = true and name = 'Tuckers Inc' limit 1;
  select id into v_meyer_id from public.attorney_firms where is_demo_data = true and name = 'Meyer & Partners Conveyancers' limit 1;
  select id into v_northside_id from public.attorney_firms where is_demo_data = true and name = 'Northside Bond Attorneys' limit 1;

  for rec in
    select *
    from (
      values
        ('DL-2026-001','Unit 14, Ronique Estate','14 Ronique Lane','Olympus','Pretoria','Ronique Estate','Thabo Mokoena','thabo.mokoena@example.co.za','082 418 7781','Mariska Botha','mariska.botha@example.co.za','083 441 1267','cash',1850000,0,185000,false,null::text,null::text,null::numeric,'active','fica_received','normal',3,0,0,null::text,0,42,false,null::date,current_date + 28,null::text,null::text,null::text),
        ('DL-2026-002','Stand 22, Willow Creek Estate','22 Willow Creek Drive','Boksburg','Ekurhuleni','Willow Creek Estate','Naledi Khumalo','naledi.khumalo@example.co.za','072 221 9870','Pieter van Wyk','pieter.vw@example.co.za','083 223 8901','cash',2240000,0,224000,true,'FNB','FNB-4482-1190',642000,'active','guarantees_received','watch',5,0,3,null::text,0,55,false,null::date,current_date + 18,null::text,null::text,null::text),
        ('DL-2026-003','Apartment B12, Casselberry Estate','B12 Casselberry Estate','North Riding','Johannesburg','Casselberry Estate','Ayesha Patel','ayesha.patel@example.co.za','081 532 4421','Johan de Lange','johan.delange@example.co.za','084 904 4421','cash',1295000,0,129500,false,null::text,null::text,null::numeric,'active','transfer_documents_prepared','normal',4,0,0,null::text,0,31,false,null::date,current_date + 35,null::text,null::text,null::text),
        ('DL-2026-004','Unit 7, Juanic Estate','7 Juanic Crescent','Midrand','Johannesburg','Juanic Estate','Sipho Dlamini','sipho.dlamini@example.co.za','076 338 1020','Michelle Kruger','michelle.kruger@example.co.za','082 771 4400','bond',2780000,2224000,278000,false,null::text,null::text,null::numeric,'active','buyer_signed','normal',5,4,0,null::text,0,49,false,null::date,current_date + 24,null::text,null::text,null::text),
        ('DL-2026-005','Erf 31, Casselberry Estate','31 Casselberry Avenue','North Riding','Johannesburg','Casselberry Estate','Michael Naidoo','michael.naidoo@example.co.za','073 112 4588','Anneke Smit','anneke.smit@example.co.za','082 901 1188','bond',3150000,2520000,315000,true,'ABSA','ABSA-7710-3301',830000,'active','settlement_figures_requested','watch',4,3,2,null::text,0,63,false,null::date,current_date + 30,null::text,'Northside Bond Attorneys',null::text),
        ('DL-2026-006','Unit 3, Willow Creek Estate','3 Willow Creek Drive','Boksburg','Ekurhuleni','Willow Creek Estate','Lindiwe Ndlovu','lindiwe.ndlovu@example.co.za','079 330 1190','Gerhard Pretorius','gerhard.pretorius@example.co.za','083 650 9921','hybrid',2410000,1687000,723000,true,'Nedbank','NED-2214-5590',512000,'active','guarantees_issued','normal',6,5,4,null::text,0,57,false,null::date,current_date + 16,null::text,null::text,null::text),
        ('DL-2026-007','Penthouse 5, Juanic Estate','5 Juanic Crescent','Midrand','Johannesburg','Juanic Estate','Kabelo Molefe','kabelo.molefe@example.co.za','082 557 3309','Danelle Joubert','danelle.joubert@example.co.za','082 339 0109','bond',3650000,2920000,365000,false,null::text,null::text,null::numeric,'active','bond_documents_prepared','normal',4,3,0,null::text,0,29,false,null::date,current_date + 40,'Tuckers Inc',null::text,null::text),
        ('DL-2026-008','Stand 9, Ronique Estate','9 Ronique Lane','Olympus','Pretoria','Ronique Estate','Megan Jacobs','megan.jacobs@example.co.za','083 101 5532','Sibusiso Maseko','sibusiso.maseko@example.co.za','072 200 9911','bond',1950000,1560000,195000,true,'Standard Bank','STD-8841-2207',388000,'active','seller_signed','normal',5,4,3,null::text,0,37,false,null::date,current_date + 33,null::text,null::text,null::text),
        ('DL-2026-009','Unit 18, Casselberry Estate','18 Casselberry Avenue','North Riding','Johannesburg','Casselberry Estate','Nicolette Engelbrecht','nicolette.engelbrecht@example.co.za','082 902 5574','Bongani Cele','bongani.cele@example.co.za','073 500 3100','cash',1720000,0,172000,true,'Investec','INV-4390-2218',420000,'active','settlement_figures_received','normal',4,0,3,null::text,0,46,false,null::date,current_date + 25,'Meyer & Partners Conveyancers',null::text,null::text),
        ('DL-2026-010','Erf 48, Willow Creek Estate','48 Willow Creek Drive','Boksburg','Ekurhuleni','Willow Creek Estate','Priya Govender','priya.govender@example.co.za','082 779 0042','Hannes Meyer','hannes.meyer@example.co.za','082 889 4480','cash',2080000,0,208000,true,'FNB','FNB-6612-8804',575000,'active','cancellation_docs_prepared','normal',5,0,5,null::text,0,52,false,null::date,current_date + 21,null::text,null::text,null::text),
        ('DL-2026-011','Unit 2, Juanic Estate','2 Juanic Crescent','Midrand','Johannesburg','Juanic Estate','Armand Botha','armand.botha@example.co.za','073 445 2201','Zanele Dube','zanele.dube@example.co.za','079 224 7600','cash',2385000,0,238500,true,'Nedbank','NED-4491-2199',610000,'active','settlement_figures_requested','normal',3,0,2,null::text,0,34,false,null::date,current_date + 31,'Tuckers Inc',null::text,null::text),
        ('DL-2026-012','Stand 41, Ronique Estate','41 Ronique Lane','Olympus','Pretoria','Ronique Estate','Andre Coetzee','andre.coetzee@example.co.za','082 901 2210','Nokuthula Mthembu','nokuthula.mthembu@example.co.za','073 801 6610','bond',2890000,2312000,289000,false,null::text,null::text,null::numeric,'blocked','guarantees_received','high',5,4,0,'bond',5,71,false,null::date,current_date + 7,null::text,null::text,null::text),
        ('DL-2026-013','Apartment C4, Casselberry Estate','C4 Casselberry Estate','North Riding','Johannesburg','Casselberry Estate','Sarah-Jane Williams','sarah.williams@example.co.za','082 234 5578','Themba Nkosi','themba.nkosi@example.co.za','082 880 2244','cash',1490000,0,149000,true,'ABSA','ABSA-9188-0031',390000,'blocked','settlement_figures_requested','critical',4,0,2,'cancellation',3,84,false,null::date,current_date + 5,null::text,null::text,null::text),
        ('DL-2026-014','Unit 26, Willow Creek Estate','26 Willow Creek Drive','Boksburg','Ekurhuleni','Willow Creek Estate','David Wilson','david.wilson@example.co.za','071 456 7899','Lauren Petersen','lauren.petersen@example.co.za','082 771 6600','bond',2540000,2032000,254000,false,null::text,null::text,null::numeric,'registered','registration_confirmed','complete',8,7,0,null::text,0,88,true,current_date - 9,current_date - 9,null::text,null::text,null::text),
        ('DL-2026-015','Stand 6, Juanic Estate','6 Juanic Crescent','Midrand','Johannesburg','Juanic Estate','Alex Samlin','alex.samlin@example.co.za','082 123 4567','Portia Mokoena','portia.mokoena@example.co.za','083 445 9910','cash',3330000,0,333000,true,'Standard Bank','STD-4412-7755',704000,'registered','registration_confirmed','complete',8,0,7,null::text,0,91,true,current_date - 4,current_date - 4,null::text,null::text,null::text)
    ) as m(
      matter_ref, property_description, address, suburb, city, development, buyer_name, buyer_email, buyer_phone,
      seller_name, seller_email, seller_phone, finance_type, purchase_price, bond_amount, deposit_amount,
      seller_has_existing_bond, current_bond_bank, current_bond_account_number, estimated_settlement_amount,
      matter_status, current_stage, risk_status, transfer_progress, bond_progress, cancellation_progress,
      blocked_lane, blocked_step, days_active, is_registered, registration_date, target_registration_date,
      transfer_external_firm, bond_external_firm, cancellation_external_firm
    )
  loop
    v_tx_id := gen_random_uuid();
    v_buyer_id := gen_random_uuid();
    v_created_at := v_now - (rec.days_active || ' days')::interval;
    v_updated_at := case
      when rec.is_registered then coalesce(rec.registration_date::timestamptz, v_now - interval '4 days')
      when rec.matter_status = 'blocked' then v_now - interval '16 days'
      else v_now - ((greatest(1, rec.days_active / 5)) || ' days')::interval
    end;
    v_is_registered := rec.is_registered;
    v_matter_status := case when v_is_registered then 'registered' when rec.matter_status = 'blocked' then 'delayed' else 'active' end;

    insert into public.buyers (
      id,
      organisation_id,
      name,
      email,
      phone,
      created_at,
      updated_at,
      is_demo_data
    )
    values (
      v_buyer_id,
      v_org_id,
      rec.buyer_name,
      rec.buyer_email,
      rec.buyer_phone,
      v_created_at,
      v_updated_at,
      true
    );

    insert into public.transactions (
      id,
      organisation_id,
      owner_user_id,
      buyer_id,
      transaction_reference,
      title,
      property_description,
      property_address_line_1,
      suburb,
      city,
      province,
      seller_name,
      seller_email,
      seller_phone,
      finance_type,
      purchase_price,
      sales_price,
      bond_amount,
      deposit_amount,
      seller_has_existing_bond,
      current_bond_bank,
      current_bond_account_number,
      estimated_settlement_amount,
      stage,
      current_main_stage,
      current_sub_stage_summary,
      attorney_stage,
      risk_status,
      operational_state,
      next_action,
      expected_transfer_date,
      target_registration_date,
      registration_date,
      registered_at,
      lifecycle_state,
      is_active,
      last_meaningful_activity_at,
      assigned_attorney_email,
      attorney,
      created_at,
      updated_at,
      is_demo_data
    )
    values (
      v_tx_id,
      v_org_id,
      v_user_id,
      v_buyer_id,
      rec.matter_ref,
      rec.property_description,
      rec.property_description,
      rec.address,
      rec.suburb,
      rec.city,
      'Gauteng',
      rec.seller_name,
      rec.seller_email,
      rec.seller_phone,
      rec.finance_type,
      rec.purchase_price,
      rec.purchase_price,
      nullif(rec.bond_amount, 0),
      rec.deposit_amount,
      rec.seller_has_existing_bond,
      rec.current_bond_bank,
      rec.current_bond_account_number,
      rec.estimated_settlement_amount,
      case when v_is_registered then 'Registered' else 'Transfer in Progress' end,
      case when v_is_registered then 'REG' else 'ATTY' end,
      case
        when rec.matter_status = 'blocked' then 'Blocked workflow step needs attention'
        when v_is_registered then 'Registration confirmed and final pack approved'
        else 'Attorney workflow in progress'
      end,
      case
        when v_is_registered then 'registered'
        when rec.current_stage like '%fica%' then 'fica_onboarding'
        when rec.current_stage like '%document%' or rec.current_stage like '%docs%' then 'drafting'
        when rec.current_stage like '%signed%' then 'signing'
        when rec.current_stage like '%guarantee%' then 'guarantees'
        when rec.current_stage like '%settlement%' or rec.current_stage like '%cancellation%' then 'clearances'
        when rec.current_stage like '%lodg%' then 'lodgement'
        else 'instruction_received'
      end,
      case
        when rec.matter_status = 'blocked' and rec.risk_status = 'critical' then 'Blocked'
        when rec.matter_status = 'blocked' then 'Delayed'
        when rec.risk_status in ('watch', 'high', 'critical') then 'At Risk'
        else 'On Track'
      end,
      case
        when rec.matter_status = 'blocked' then 'blocked'
        when rec.risk_status in ('critical', 'high', 'watch') then 'at_risk'
        else 'on_track'
      end,
      case
        when rec.blocked_lane = 'bond' then 'Follow up outstanding guarantees with bank'
        when rec.blocked_lane = 'cancellation' then 'Escalate settlement figures with bank'
        when rec.seller_has_existing_bond then 'Track cancellation figures and guarantees'
        when rec.finance_type in ('bond', 'hybrid') then 'Monitor bond documents and guarantees'
        else 'Prepare transfer documents'
      end,
      rec.target_registration_date,
      rec.target_registration_date,
      rec.registration_date,
      case when v_is_registered then rec.registration_date::timestamptz + interval '10 hours' else null end,
      case when v_is_registered then 'registered' when rec.matter_status = 'blocked' then 'active' else 'active' end,
      true,
      v_updated_at,
      'info@yakstack.co',
      'Dalawyer Lawyers',
      v_created_at,
      v_updated_at,
      true
    );

    insert into public.transaction_participants (
      transaction_id,
      user_id,
      role_type,
      legal_role,
      status,
      participant_name,
      participant_email,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction,
      visibility_scope,
      participant_scope,
      is_primary,
      assignment_source,
      organisation_name,
      accepted_at,
      created_at,
      updated_at,
      is_demo_data
    )
    values
      (
        v_tx_id,
        null,
        'buyer',
        'none',
        'active',
        rec.buyer_name,
        lower(rec.buyer_email),
        true,
        true,
        true,
        false,
        false,
        false,
        'shared',
        'transaction',
        true,
        'dalawyer_demo_seed',
        null,
        v_created_at,
        v_created_at,
        v_updated_at,
        true
      ),
      (
        v_tx_id,
        null,
        'seller',
        'none',
        'active',
        rec.seller_name,
        lower(rec.seller_email),
        true,
        true,
        true,
        false,
        false,
        false,
        'shared',
        'transaction',
        true,
        'dalawyer_demo_seed',
        null,
        v_created_at,
        v_created_at,
        v_updated_at,
        true
      )
    on conflict (transaction_id, role_type, legal_role)
    do update set
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      status = 'active',
      removed_at = null,
      can_view = excluded.can_view,
      can_comment = excluded.can_comment,
      can_upload_documents = excluded.can_upload_documents,
      is_primary = excluded.is_primary,
      assignment_source = excluded.assignment_source,
      updated_at = excluded.updated_at,
      is_demo_data = true;

    v_transfer_assignment_id := null;
    v_bond_assignment_id := null;
    v_cancellation_assignment_id := null;

    if rec.transfer_external_firm is null then
      v_lane_firm_id := v_firm_id;
    elsif rec.transfer_external_firm = 'Tuckers Inc' then
      v_lane_firm_id := v_tuckers_id;
    else
      v_lane_firm_id := v_meyer_id;
    end if;

    insert into public.transaction_attorney_assignments (
      transaction_id,
      firm_id,
      assignment_type,
      department_id,
      primary_attorney_id,
      status,
      assigned_by,
      assigned_at,
      attorney_firm_id,
      attorney_user_id,
      attorney_department_id,
      attorney_role,
      assignment_status,
      is_primary,
      visibility_scope,
      can_edit,
      can_manage_documents,
      can_manage_signing,
      can_add_internal_notes,
      can_add_shared_updates,
      can_update_workflow_lane,
      created_at,
      updated_at,
      is_demo_data
    )
    values (
      v_tx_id,
      v_lane_firm_id,
      'transfer',
      case when v_lane_firm_id = v_firm_id then v_transfer_department_id else null end,
      case when v_lane_firm_id = v_firm_id then v_user_id else null end,
      'active',
      v_user_id,
      v_created_at,
      v_lane_firm_id,
      case when v_lane_firm_id = v_firm_id then v_user_id else null end,
      case when v_lane_firm_id = v_firm_id then v_transfer_department_id else null end,
      'transfer_attorney',
      'active',
      true,
      'firm_matter',
      v_lane_firm_id = v_firm_id,
      v_lane_firm_id = v_firm_id,
      v_lane_firm_id = v_firm_id,
      v_lane_firm_id = v_firm_id,
      true,
      v_lane_firm_id = v_firm_id,
      v_created_at,
      v_updated_at,
      true
    )
    returning id into v_transfer_assignment_id;

    if rec.finance_type in ('bond', 'hybrid') then
      if rec.bond_external_firm is null then
        v_lane_firm_id := v_firm_id;
      elsif rec.bond_external_firm = 'Northside Bond Attorneys' then
        v_lane_firm_id := v_northside_id;
      else
        v_lane_firm_id := v_meyer_id;
      end if;

      insert into public.transaction_attorney_assignments (
        transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, status, assigned_by, assigned_at,
        attorney_firm_id, attorney_user_id, attorney_department_id, attorney_role, assignment_status, is_primary,
        visibility_scope, can_edit, can_manage_documents, can_manage_signing, can_add_internal_notes, can_add_shared_updates,
        can_update_workflow_lane, created_at, updated_at, is_demo_data
      )
      values (
        v_tx_id, v_lane_firm_id, 'bond', case when v_lane_firm_id = v_firm_id then v_bond_department_id else null end,
        case when v_lane_firm_id = v_firm_id then v_user_id else null end, 'active', v_user_id, v_created_at,
        v_lane_firm_id, case when v_lane_firm_id = v_firm_id then v_user_id else null end,
        case when v_lane_firm_id = v_firm_id then v_bond_department_id else null end, 'bond_attorney', 'active', true,
        'firm_matter', v_lane_firm_id = v_firm_id, v_lane_firm_id = v_firm_id, v_lane_firm_id = v_firm_id,
        v_lane_firm_id = v_firm_id, true, v_lane_firm_id = v_firm_id, v_created_at, v_updated_at, true
      )
      returning id into v_bond_assignment_id;
    end if;

    if rec.seller_has_existing_bond then
      if rec.cancellation_external_firm is null then
        v_lane_firm_id := v_firm_id;
      elsif rec.cancellation_external_firm = 'Tuckers Inc' then
        v_lane_firm_id := v_tuckers_id;
      else
        v_lane_firm_id := v_meyer_id;
      end if;

      insert into public.transaction_attorney_assignments (
        transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, status, assigned_by, assigned_at,
        attorney_firm_id, attorney_user_id, attorney_department_id, attorney_role, assignment_status, is_primary,
        visibility_scope, can_edit, can_manage_documents, can_manage_signing, can_add_internal_notes, can_add_shared_updates,
        can_update_workflow_lane, created_at, updated_at, is_demo_data
      )
      values (
        v_tx_id, v_lane_firm_id, 'cancellation', case when v_lane_firm_id = v_firm_id then v_admin_department_id else null end,
        case when v_lane_firm_id = v_firm_id then v_user_id else null end, 'active', v_user_id, v_created_at,
        v_lane_firm_id, case when v_lane_firm_id = v_firm_id then v_user_id else null end,
        case when v_lane_firm_id = v_firm_id then v_admin_department_id else null end, 'cancellation_attorney', 'active', true,
        'firm_matter', v_lane_firm_id = v_firm_id, v_lane_firm_id = v_firm_id, v_lane_firm_id = v_firm_id,
        v_lane_firm_id = v_firm_id, true, v_lane_firm_id = v_firm_id, v_created_at, v_updated_at, true
      )
      returning id into v_cancellation_assignment_id;
    end if;

    foreach v_lane_key in array array['transfer','bond','cancellation']
    loop
      if v_lane_key = 'bond' and rec.finance_type not in ('bond', 'hybrid') then
        continue;
      end if;
      if v_lane_key = 'cancellation' and rec.seller_has_existing_bond is not true then
        continue;
      end if;

      if v_lane_key = 'transfer' then
        v_lane_role := 'transfer_attorney';
        v_lane_assignment_id := v_transfer_assignment_id;
        v_lane_progress := rec.transfer_progress;
        v_step_keys := array['instruction_received','fica_received','transfer_documents_prepared','buyer_signed','seller_signed','guarantees_received','lodgement_submitted','registration_confirmed'];
        v_step_labels := array['Instruction Received','FICA Received','Transfer Documents Prepared','Buyer Signed Documents','Seller Signed Documents','Guarantees Received','Lodgement Submitted','Registration Confirmed'];
      elsif v_lane_key = 'bond' then
        v_lane_role := 'bond_attorney';
        v_lane_assignment_id := v_bond_assignment_id;
        v_lane_progress := rec.bond_progress;
        v_step_keys := array['bond_instruction_received','buyer_fica_received','bond_documents_prepared','buyer_signed_bond_docs','guarantees_issued','bond_lodged','bond_registered'];
        v_step_labels := array['Bond Instruction Received','Buyer FICA Received','Bond Documents Prepared','Buyer Signed Bond Docs','Guarantees Issued','Bond Lodged','Bond Registered'];
      else
        v_lane_role := 'cancellation_attorney';
        v_lane_assignment_id := v_cancellation_assignment_id;
        v_lane_progress := rec.cancellation_progress;
        v_step_keys := array['cancellation_instruction_received','settlement_figures_requested','settlement_figures_received','guarantees_provided','cancellation_docs_prepared','cancellation_lodged','bond_cancelled'];
        v_step_labels := array['Cancellation Instruction Received','Settlement Figures Requested','Settlement Figures Received','Guarantees Provided','Cancellation Docs Prepared','Cancellation Lodged','Bond Cancelled'];
      end if;

      select coalesce(taa.attorney_firm_id, taa.firm_id), coalesce(taa.attorney_department_id, taa.department_id)
        into v_lane_firm_id, v_lane_department_id
      from public.transaction_attorney_assignments taa
      where taa.id = v_lane_assignment_id;

      insert into public.transaction_participants (
        transaction_id,
        user_id,
        role_type,
        legal_role,
        status,
        participant_name,
        participant_email,
        can_view,
        can_comment,
        can_upload_documents,
        can_edit_finance_workflow,
        can_edit_attorney_workflow,
        can_edit_core_transaction,
        visibility_scope,
        participant_scope,
        is_primary,
        assignment_source,
        organisation_name,
        accepted_at,
        created_at,
        updated_at,
        is_demo_data
      )
      select
        v_tx_id,
        case when v_lane_firm_id = v_firm_id then v_user_id else null end,
        'attorney',
        v_lane_key,
        'active',
        coalesce(f.name, 'Attorney firm'),
        lower(coalesce(f.email, case when v_lane_firm_id = v_firm_id then 'info@yakstack.co' else null end)),
        true,
        true,
        true,
        false,
        v_lane_firm_id = v_firm_id,
        false,
        'shared',
        'transaction',
        v_lane_firm_id = v_firm_id,
        'attorney_assignment',
        coalesce(f.name, 'Attorney firm'),
        v_created_at,
        v_created_at,
        v_updated_at,
        true
      from public.attorney_firms f
      where f.id = v_lane_firm_id
      on conflict (transaction_id, role_type, legal_role)
      do update set
        user_id = coalesce(excluded.user_id, public.transaction_participants.user_id),
        participant_name = excluded.participant_name,
        participant_email = excluded.participant_email,
        status = 'active',
        removed_at = null,
        can_view = excluded.can_view,
        can_comment = excluded.can_comment,
        can_upload_documents = excluded.can_upload_documents,
        can_edit_attorney_workflow = excluded.can_edit_attorney_workflow,
        is_primary = excluded.is_primary,
        assignment_source = excluded.assignment_source,
        organisation_name = excluded.organisation_name,
        updated_at = excluded.updated_at,
        is_demo_data = true;

      v_step_count := array_length(v_step_keys, 1);
      v_lane_blocked_step := case when rec.blocked_lane = v_lane_key then nullif(rec.blocked_step, 0) else null end;
      v_lane_status := case
        when v_lane_blocked_step is not null then 'blocked'
        when v_lane_progress >= v_step_count then 'completed'
        else 'in_progress'
      end;
      v_current_stage := case
        when v_lane_progress >= v_step_count then v_step_keys[v_step_count]
        else v_step_keys[greatest(1, least(v_step_count, v_lane_progress + 1))]
      end;

      insert into public.transaction_subprocesses (
        transaction_id,
        process_type,
        owner_type,
        status,
        attorney_role,
        attorney_assignment_id,
        current_stage,
        lane_status,
        due_date,
        completed_at,
        updated_by,
        lane_metadata,
        created_at,
        updated_at,
        is_demo_data
      )
      values (
        v_tx_id,
        v_lane_key,
        'attorney',
        v_lane_status,
        v_lane_role,
        v_lane_assignment_id,
        v_current_stage,
        v_lane_status,
        rec.target_registration_date,
        case when v_lane_status = 'completed' then coalesce(rec.registration_date::timestamptz, v_updated_at) else null end,
        v_user_id,
        jsonb_build_object('seed', 'dalawyer_demo', 'development', rec.development, 'progress_percentage', round((least(v_lane_progress, v_step_count)::numeric / v_step_count::numeric) * 100)),
        v_created_at,
        v_updated_at,
        true
      )
      returning id into v_subprocess_id;

      for v_step_index in 1..v_step_count
      loop
        v_step_status := case
          when v_lane_blocked_step = v_step_index then 'blocked'
          when v_step_index <= v_lane_progress then 'completed'
          when v_step_index = v_lane_progress + 1 then case when v_lane_key = 'cancellation' and rec.current_stage like '%settlement%' then 'waiting' else 'in_progress' end
          else 'not_started'
        end;

        v_step_completed_at := case
          when v_step_status = 'completed' then v_created_at + ((v_step_index * 4) || ' days')::interval
          else null
        end;
        v_step_due_date := (v_created_at + ((v_step_index * 5 + 5) || ' days')::interval)::date;

        insert into public.transaction_subprocess_steps (
          subprocess_id,
          step_key,
          step_label,
          status,
          owner_type,
          sort_order,
          visibility_scope,
          assigned_to,
          due_date,
          completed_at,
          completed_by,
          blocker_reason,
          notes,
          step_metadata,
          created_at,
          updated_at,
          is_demo_data
        )
        values (
          v_subprocess_id,
          v_step_keys[v_step_index],
          v_step_labels[v_step_index],
          v_step_status,
          'attorney',
          v_step_index,
          'internal',
          case when v_lane_assignment_id in (v_transfer_assignment_id, v_bond_assignment_id, v_cancellation_assignment_id) then v_user_id else null end,
          v_step_due_date,
          v_step_completed_at,
          case when v_step_status = 'completed' then v_user_id else null end,
          case when v_step_status = 'blocked' then
            case
              when v_lane_key = 'bond' then 'Guarantees have not been issued by the bank.'
              when v_lane_key = 'cancellation' then 'Settlement figures are overdue from the seller bank.'
              else 'Required signed documents are outstanding.'
            end
          else null end,
          case
            when v_step_status = 'waiting' then 'Waiting on an external party before this step can move forward.'
            when v_step_status = 'blocked' then 'Escalated for attorney follow-up.'
            else null
          end,
          jsonb_build_object('seed', 'dalawyer_demo', 'lane', v_lane_key),
          v_created_at,
          v_updated_at,
          true
        );
      end loop;

      insert into public.transaction_attorney_lane_updates (
        transaction_id,
        subprocess_id,
        lane_key,
        attorney_role,
        update_type,
        visibility,
        message,
        created_by,
        created_at,
        metadata,
        is_demo_data
      )
      values (
        v_tx_id,
        v_subprocess_id,
        v_lane_key,
        v_lane_role,
        case when v_lane_status = 'blocked' then 'blocker' when v_lane_status = 'completed' then 'stage_completed' else 'internal_note' end,
        case when v_lane_status = 'completed' then 'client_visible' else 'professional_shared' end,
        case
          when v_lane_status = 'blocked' then initcap(v_lane_key) || ' workflow is blocked and requires escalation.'
          when v_lane_status = 'completed' then initcap(v_lane_key) || ' workflow completed.'
          else initcap(v_lane_key) || ' workflow updated to ' || replace(v_current_stage, '_', ' ') || '.'
        end,
        v_user_id,
        v_updated_at,
        jsonb_build_object('seed', 'dalawyer_demo', 'stage', v_current_stage),
        true
      );

      insert into public.transaction_events (
        transaction_id,
        event_type,
        event_data,
        created_by,
        created_by_role,
        visibility_scope,
        created_at,
        is_demo_data
      )
      values (
        v_tx_id,
        case when v_lane_status = 'blocked' then 'AttorneyLaneBlocked' when v_lane_status = 'completed' then 'AttorneyLaneCompleted' else 'AttorneyLaneStageUpdated' end,
        jsonb_build_object('title', initcap(v_lane_key) || ' lane updated', 'description', initcap(v_lane_key) || ' workflow moved to ' || replace(v_current_stage, '_', ' '), 'laneKey', v_lane_key),
        v_user_id,
        'attorney',
        'shared',
        v_updated_at,
        true
      );
    end loop;

    insert into public.documents (
      transaction_id, name, file_path, category, document_type, status, visibility_scope, uploaded_by_user_id,
      uploaded_by_role, stage_key, is_client_visible, lane_key, attorney_role, review_status, created_at, updated_at, is_demo_data
    )
    values
      (v_tx_id, 'Buyer ID and proof of address.pdf', 'demo/dalawyer/' || rec.matter_ref || '/buyer-fica.pdf', 'Buyer Documents', 'buyer_fica', case when rec.blocked_lane = 'transfer' then 'rejected' else 'approved' end, 'shared', v_user_id, 'attorney', 'fica_received', false, 'transfer', 'transfer_attorney', case when rec.blocked_lane = 'transfer' then 'rejected' else 'approved' end, v_created_at + interval '2 days', v_updated_at, true),
      (v_tx_id, 'Seller FICA pack.pdf', 'demo/dalawyer/' || rec.matter_ref || '/seller-fica.pdf', 'Seller Documents', 'seller_fica', 'approved', 'shared', v_user_id, 'attorney', 'fica_received', false, 'transfer', 'transfer_attorney', 'approved', v_created_at + interval '3 days', v_updated_at, true),
      (v_tx_id, 'Signed Offer to Purchase.pdf', 'demo/dalawyer/' || rec.matter_ref || '/signed-otp.pdf', 'Transfer Documents', 'signed_otp', case when rec.transfer_progress >= 4 then 'approved' else 'uploaded' end, 'shared', v_user_id, 'attorney', 'instruction_received', false, 'transfer', 'transfer_attorney', case when rec.transfer_progress >= 4 then 'approved' else 'pending_review' end, v_created_at + interval '4 days', v_updated_at, true),
      (v_tx_id, 'Transfer document pack.pdf', 'demo/dalawyer/' || rec.matter_ref || '/transfer-pack.pdf', 'Generated Documents', 'transfer_document_pack', case when rec.transfer_progress >= 5 then 'approved' else 'requested' end, 'internal', v_user_id, 'attorney', 'transfer_documents_prepared', false, 'transfer', 'transfer_attorney', case when rec.transfer_progress >= 5 then 'approved' else 'requested' end, v_created_at + interval '8 days', v_updated_at, true),
      (v_tx_id, 'Internal matter note.pdf', 'demo/dalawyer/' || rec.matter_ref || '/internal-note.pdf', 'Internal Working Documents', 'internal_note', 'uploaded', 'internal', v_user_id, 'attorney', null, false, null, null, 'uploaded', v_created_at + interval '1 day', v_updated_at, true);

    if rec.finance_type in ('bond', 'hybrid') then
      insert into public.documents (
        transaction_id, name, file_path, category, document_type, status, visibility_scope, uploaded_by_user_id,
        uploaded_by_role, stage_key, is_client_visible, lane_key, attorney_role, review_status, created_at, updated_at, is_demo_data
      )
      values
        (v_tx_id, 'Bond instruction from bank.pdf', 'demo/dalawyer/' || rec.matter_ref || '/bond-instruction.pdf', 'Bond Documents', 'bond_instruction', case when rec.bond_progress >= 1 then 'approved' else 'requested' end, 'shared', v_user_id, 'attorney', 'bond_instruction_received', false, 'bond', 'bond_attorney', case when rec.bond_progress >= 1 then 'approved' else 'requested' end, v_created_at + interval '5 days', v_updated_at, true),
        (v_tx_id, 'Guarantees.pdf', 'demo/dalawyer/' || rec.matter_ref || '/guarantees.pdf', 'Bond Documents', 'guarantees', case when rec.bond_progress >= 5 then 'approved' when rec.blocked_lane = 'bond' then 'requested' else 'pending_review' end, 'shared', v_user_id, 'attorney', 'guarantees_issued', false, 'bond', 'bond_attorney', case when rec.bond_progress >= 5 then 'approved' when rec.blocked_lane = 'bond' then 'requested' else 'pending_review' end, v_created_at + interval '14 days', v_updated_at, true);
    end if;

    if rec.seller_has_existing_bond then
      insert into public.documents (
        transaction_id, name, file_path, category, document_type, status, visibility_scope, uploaded_by_user_id,
        uploaded_by_role, stage_key, is_client_visible, lane_key, attorney_role, review_status, created_at, updated_at, is_demo_data
      )
      values
        (v_tx_id, 'Cancellation instruction.pdf', 'demo/dalawyer/' || rec.matter_ref || '/cancellation-instruction.pdf', 'Cancellation Documents', 'cancellation_instruction', 'approved', 'shared', v_user_id, 'attorney', 'cancellation_instruction_received', false, 'cancellation', 'cancellation_attorney', 'approved', v_created_at + interval '6 days', v_updated_at, true),
        (v_tx_id, 'Settlement figures.pdf', 'demo/dalawyer/' || rec.matter_ref || '/settlement-figures.pdf', 'Cancellation Documents', 'settlement_figures', case when rec.cancellation_progress >= 3 then 'approved' when rec.blocked_lane = 'cancellation' then 'requested' else 'pending_review' end, 'shared', v_user_id, 'attorney', 'settlement_figures_received', false, 'cancellation', 'cancellation_attorney', case when rec.cancellation_progress >= 3 then 'approved' when rec.blocked_lane = 'cancellation' then 'requested' else 'pending_review' end, v_created_at + interval '12 days', v_updated_at, true);
    end if;

    if v_is_registered then
      insert into public.documents (
        transaction_id, name, file_path, category, document_type, status, visibility_scope, uploaded_by_user_id,
        uploaded_by_role, stage_key, is_client_visible, lane_key, attorney_role, review_status, created_at, updated_at, is_demo_data
      )
      values
        (v_tx_id, 'Registration confirmation.pdf', 'demo/dalawyer/' || rec.matter_ref || '/registration-confirmation.pdf', 'Signed Documents', 'registration_confirmation', 'approved', 'client', v_user_id, 'attorney', 'registration_confirmed', true, 'transfer', 'transfer_attorney', 'approved', coalesce(rec.registration_date::timestamptz, v_updated_at), v_updated_at, true),
        (v_tx_id, 'Final client closing pack.pdf', 'demo/dalawyer/' || rec.matter_ref || '/closing-pack.pdf', 'Signed Documents', 'closing_pack', 'approved', 'client', v_user_id, 'attorney', 'registration_confirmed', true, 'transfer', 'transfer_attorney', 'approved', coalesce(rec.registration_date::timestamptz, v_updated_at), v_updated_at, true);
    end if;

    if rec.blocked_lane is not null then
      insert into public.document_requests (
        transaction_id, category, document_type, title, description, priority, assigned_to_role, status, requires_review,
        visibility_scope, created_by, created_by_role, due_date, lane_key, attorney_role, requested_from, requested_by,
        review_status, requirement_id, rejection_reason, created_at, updated_at, is_demo_data
      )
      values (
        v_tx_id,
        case when rec.blocked_lane = 'bond' then 'Bond Documents' when rec.blocked_lane = 'cancellation' then 'Cancellation Documents' else 'Buyer Documents' end,
        case when rec.blocked_lane = 'bond' then 'guarantees' when rec.blocked_lane = 'cancellation' then 'settlement_figures' else 'corrected_proof_of_address' end,
        case when rec.blocked_lane = 'bond' then 'Outstanding bank guarantees' when rec.blocked_lane = 'cancellation' then 'Updated settlement figures required' else 'Corrected proof of address required' end,
        case when rec.blocked_lane = 'bond' then 'Guarantees are overdue and must be followed up with the bank.' when rec.blocked_lane = 'cancellation' then 'Seller bank has not supplied usable settlement figures.' else 'The uploaded proof of address was rejected and needs correction.' end,
        'required',
        case when rec.blocked_lane = 'bond' then 'bank' when rec.blocked_lane = 'cancellation' then 'seller_bank' else 'buyer' end,
        'requested',
        true,
        'professional_shared',
        v_user_id,
        'attorney',
        current_date - 3,
        rec.blocked_lane,
        case when rec.blocked_lane = 'bond' then 'bond_attorney' when rec.blocked_lane = 'cancellation' then 'cancellation_attorney' else 'transfer_attorney' end,
        case when rec.blocked_lane = 'bond' then 'bank' when rec.blocked_lane = 'cancellation' then 'seller_bank' else 'buyer' end,
        v_user_id,
        'requested',
        rec.blocked_lane || '_urgent_document',
        case when rec.blocked_lane = 'transfer' then 'Uploaded document did not match the residential address on the instruction.' else null end,
        v_updated_at - interval '10 days',
        v_updated_at,
        true
      );

      insert into public.attorney_workflow_blockers (
        transaction_id, title, description, lane_key, attorney_role, severity, owner, visibility, due_date,
        created_by, created_at, metadata, is_demo_data
      )
      values (
        v_tx_id,
        case when rec.blocked_lane = 'bond' then 'Guarantees overdue' when rec.blocked_lane = 'cancellation' then 'Settlement figures overdue' else 'Corrected FICA document required' end,
        case when rec.blocked_lane = 'bond' then 'Bank guarantees have not been issued within the expected SLA.' when rec.blocked_lane = 'cancellation' then 'Seller bank has not released settlement figures.' else 'Proof of address must be corrected before signing can proceed.' end,
        rec.blocked_lane,
        case when rec.blocked_lane = 'bond' then 'bond_attorney' when rec.blocked_lane = 'cancellation' then 'cancellation_attorney' else 'transfer_attorney' end,
        case when rec.risk_status = 'critical' then 'critical' else 'high' end,
        'attorney',
        'professional_shared',
        current_date - 2,
        v_user_id,
        v_updated_at - interval '8 days',
        jsonb_build_object('seed', 'dalawyer_demo', 'matterRef', rec.matter_ref),
        true
      );
    elsif not v_is_registered and rec.transfer_progress < 6 then
      insert into public.document_requests (
        transaction_id, category, document_type, title, description, priority, assigned_to_role, status, requires_review,
        visibility_scope, created_by, created_by_role, due_date, lane_key, attorney_role, requested_from, requested_by,
        review_status, requirement_id, created_at, updated_at, is_demo_data
      )
      values (
        v_tx_id, 'Signing Documents', 'signed_transfer_pack', 'Signed transfer documents', 'Signed buyer and seller transfer packs are required before lodgement.',
        'required', 'client', 'requested', true, 'shared', v_user_id, 'attorney', current_date + 4,
        'transfer', 'transfer_attorney', 'client', v_user_id, 'requested', 'signed_transfer_pack', v_updated_at - interval '2 days', v_updated_at, true
      );
    end if;

    insert into public.transaction_events (
      transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at, is_demo_data
    )
    values
      (v_tx_id, 'TransactionCreated', jsonb_build_object('title', 'Matter created', 'description', rec.matter_ref || ' opened for ' || rec.property_description), v_user_id, 'attorney', 'internal', v_created_at, true),
      (v_tx_id, 'AttorneyLaneCreated', jsonb_build_object('title', 'Transfer instruction received', 'description', 'Transfer workflow opened for buyer and seller onboarding.'), v_user_id, 'attorney', 'shared', v_created_at + interval '1 day', true),
      (v_tx_id, 'AttorneyDocumentUploaded', jsonb_build_object('title', 'Seller FICA uploaded', 'description', rec.seller_name || ' uploaded FICA documents.'), v_user_id, 'attorney', 'shared', v_created_at + interval '3 days', true),
      (v_tx_id, case when v_is_registered then 'AttorneyLaneCompleted' when rec.blocked_lane is not null then 'AttorneyCriticalBlockerCreated' else 'AttorneyLaneStageUpdated' end,
       jsonb_build_object('title', case when v_is_registered then 'Registration confirmed' when rec.blocked_lane is not null then 'Matter requires attention' else 'Workflow updated' end,
                          'description', case when v_is_registered then 'Final registration and close-out pack approved.' when rec.blocked_lane is not null then 'A critical workflow item is blocking progress.' else 'Matter moved to ' || replace(rec.current_stage, '_', ' ') || '.' end),
       v_user_id, 'attorney', 'shared', v_updated_at, true);
  end loop;

  raise notice 'Dalawyer demo seed complete. Seeded 15 attorney matters for firm % in organisation %.', v_firm_id, v_org_id;
end $$;

commit;
