begin;

create extension if not exists "pgcrypto";

create or replace function pg_temp.commercial_launch_uuid(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5('bridge9-commercial-launch-demo:' || p_key), 1, 8) || '-' ||
    substr(md5('bridge9-commercial-launch-demo:' || p_key), 9, 4) || '-4' ||
    substr(md5('bridge9-commercial-launch-demo:' || p_key), 14, 3) || '-a' ||
    substr(md5('bridge9-commercial-launch-demo:' || p_key), 18, 3) || '-' ||
    substr(md5('bridge9-commercial-launch-demo:' || p_key), 21, 12)
  )::uuid;
$$;

do $$
declare
  v_org_id uuid;
  v_user_id uuid;
  v_now timestamptz := now();
  v_i integer;
  v_property_index integer;
  v_landlord_index integer;
  v_tenant_index integer;
  v_requirement_index integer;
  v_deal_index integer;
  v_hot_index integer;
  v_property_id uuid;
  v_landlord_id uuid;
  v_tenant_id uuid;
  v_requirement_id uuid;
  v_deal_id uuid;
  v_hot_id uuid;
  v_vacancy_id uuid;
  v_team_id uuid;
  v_status text;
  v_entity_type text;
  v_entity_id uuid;
  v_tx_id text;
  v_asset_types text[] := array['industrial', 'retail', 'office', 'mixed_use', 'logistics', 'business_park', 'warehouse'];
  v_areas text[] := array['Sandton', 'Rosebank', 'Waterfall', 'Midrand', 'Centurion', 'Longmeadow', 'Woodmead', 'Bryanston', 'Menlyn', 'Fourways'];
  v_requirement_stages text[] := array['new', 'qualified', 'matching', 'viewing', 'negotiating', 'converted', 'lost'];
  v_deal_stages text[] := array['new', 'qualified', 'negotiation', 'hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending', 'converted', 'lost'];
  v_hot_statuses text[] := array['draft', 'sent', 'under_review', 'accepted', 'rejected', 'signed', 'converted'];
  v_lease_statuses text[] := array['draft', 'pending_signature', 'executed', 'active', 'renewal_pending', 'expired'];
  v_vacancy_statuses text[] := array['available', 'marketing', 'under_offer', 'hot_in_progress', 'lease_pending', 'occupied'];
begin
  if to_regclass('public.commercial_landlords') is null
    or to_regclass('public.commercial_tenants') is null
    or to_regclass('public.commercial_properties') is null
    or to_regclass('public.commercial_requirements') is null
    or to_regclass('public.commercial_deals') is null
    or to_regclass('public.commercial_leases') is null
    or to_regclass('public.commercial_vacancies') is null
    or to_regclass('public.commercial_heads_of_terms') is null
    or to_regclass('public.commercial_documents') is null
    or to_regclass('public.commercial_document_requests') is null
    or to_regclass('public.commercial_activity') is null
    or to_regclass('public.commercial_teams') is null then
    raise notice 'Commercial launch readiness seed skipped: Phase 1-7 commercial tables are not available.';
    return;
  end if;

  select ou.organisation_id
    into v_org_id
  from public.organisation_users ou
  join public.organisations o
    on o.id = ou.organisation_id
   and coalesce(o.is_demo_data, false) = true
  left join public.profiles p on p.id = ou.user_id
  where lower(coalesce(ou.email, p.email, '')) in (lower('bond.demo@bridgenine.co.za'), lower('principal.demo@bridgenine.co.za'))
    and lower(coalesce(ou.status, 'active')) = 'active'
  order by ou.updated_at desc nulls last, ou.created_at desc nulls last
  limit 1;

  if v_org_id is null then
    select o.id
      into v_org_id
    from public.organisations o
    where coalesce(o.is_demo_data, false) = true
      and (
        lower(coalesce(o.company_email, '')) in (lower('bond.demo@bridgenine.co.za'), lower('principal.demo@bridgenine.co.za'))
        or lower(o.name) = lower('Bridge9 Realty')
      )
    order by o.created_at desc nulls last
    limit 1;
  end if;

  if v_org_id is null then
    raise notice 'Commercial launch readiness seed skipped: Bridge9 demo organisation was not found.';
    return;
  end if;

  select ou.user_id
    into v_user_id
  from public.organisation_users ou
  left join public.profiles p on p.id = ou.user_id
  where ou.organisation_id = v_org_id
    and lower(coalesce(ou.email, p.email, '')) in (lower('bond.demo@bridgenine.co.za'), lower('principal.demo@bridgenine.co.za'))
  order by ou.updated_at desc nulls last, ou.created_at desc nulls last
  limit 1;

  update public.organisation_users
  set
    module_context = 'commercial',
    workspace_role = coalesce(workspace_role, 'commercial_hq_admin'),
    organisation_role = coalesce(organisation_role, 'commercial_hq_admin'),
    module_metadata = coalesce(module_metadata, '{}'::jsonb) || jsonb_build_object(
      'seed', 'commercial_launch_readiness_demo',
      'demoPersonas', array['large brokerage', 'medium brokerage', 'independent broker', 'corporate landlord', 'corporate tenant']
    )
  where organisation_id = v_org_id
    and user_id = v_user_id;

  if to_regclass('public.commercial_portal_notifications') is not null then
    delete from public.commercial_portal_notifications
    where id in (select pg_temp.commercial_launch_uuid('portal-notification:' || i::text) from generate_series(1, 40) as i);
  end if;
  if to_regclass('public.commercial_portal_messages') is not null then
    delete from public.commercial_portal_messages
    where id in (select pg_temp.commercial_launch_uuid('portal-message:' || i::text) from generate_series(1, 40) as i);
  end if;
  if to_regclass('public.commercial_portal_access') is not null then
    delete from public.commercial_portal_access
    where id in (select pg_temp.commercial_launch_uuid('portal-access:' || i::text) from generate_series(1, 20) as i);
  end if;
  if to_regclass('public.commercial_portal_contacts') is not null then
    delete from public.commercial_portal_contacts
    where id in (select pg_temp.commercial_launch_uuid('portal-contact:' || i::text) from generate_series(1, 20) as i);
  end if;

  delete from public.commercial_activity
  where metadata->>'seed' = 'commercial_launch_readiness_demo';
  delete from public.commercial_document_requests
  where id in (select pg_temp.commercial_launch_uuid('document-request:' || i::text) from generate_series(1, 160) as i);
  delete from public.commercial_documents
  where id in (select pg_temp.commercial_launch_uuid('document:' || i::text) from generate_series(1, 220) as i);
  delete from public.commercial_leases
  where id in (select pg_temp.commercial_launch_uuid('lease:' || i::text) from generate_series(1, 100) as i);
  delete from public.commercial_heads_of_terms
  where id in (select pg_temp.commercial_launch_uuid('hot:' || i::text) from generate_series(1, 50) as i);
  delete from public.commercial_deals
  where id in (select pg_temp.commercial_launch_uuid('deal:' || i::text) from generate_series(1, 75) as i);
  delete from public.commercial_requirements
  where id in (select pg_temp.commercial_launch_uuid('requirement:' || i::text) from generate_series(1, 100) as i);
  delete from public.commercial_vacancies
  where id in (select pg_temp.commercial_launch_uuid('vacancy:' || i::text) from generate_series(1, 150) as i);
  delete from public.commercial_properties
  where id in (select pg_temp.commercial_launch_uuid('property:' || i::text) from generate_series(1, 50) as i);
  delete from public.commercial_tenants
  where id in (select pg_temp.commercial_launch_uuid('tenant:' || i::text) from generate_series(1, 100) as i);
  delete from public.commercial_landlords
  where id in (select pg_temp.commercial_launch_uuid('landlord:' || i::text) from generate_series(1, 50) as i);
  delete from public.commercial_teams
  where id in (select pg_temp.commercial_launch_uuid('team:' || i::text) from generate_series(1, 4) as i);

  for v_i in 1..4 loop
    insert into public.commercial_teams (id, organisation_id, name, status, created_at, updated_at)
    values (
      pg_temp.commercial_launch_uuid('team:' || v_i),
      v_org_id,
      (array['National Industrial', 'Sandton Office', 'Retail Growth', 'Occupier Advisory'])[v_i],
      'active',
      v_now - ((30 + v_i) || ' days')::interval,
      v_now - (v_i || ' hours')::interval
    );
  end loop;

  for v_i in 1..50 loop
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_landlords (
      id, organisation_id, created_by, updated_by, status, notes, name, contact_person, email, phone, website, landlord_type,
      portfolio_notes, preferred_contact_method, team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('landlord:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i % 13 = 0 then 'inactive' else 'active' end,
      'Phase 8 launch demo landlord for enterprise readiness and support diagnostics.',
      (array['Cedarstone', 'UrbanEdge', 'Growthpoint Demo', 'Redwood', 'Northstar', 'Axis', 'Summit', 'PrimePort', 'Harbour', 'MetroHold'])[((v_i - 1) % 10) + 1] || ' Portfolio ' || lpad(v_i::text, 2, '0'),
      'Landlord Contact ' || lpad(v_i::text, 2, '0'),
      'landlord' || lpad(v_i::text, 2, '0') || '@commercial-demo.bridge9.local',
      '+27 10 555 ' || lpad(v_i::text, 4, '0'),
      'https://commercial-demo.bridge9.local/landlords/' || v_i,
      case when v_i % 5 = 0 then 'corporate_landlord' when v_i % 3 = 0 then 'listed_fund' else 'private_portfolio' end,
      case when v_i in (1, 2, 3) then 'Large brokerage demo anchor portfolio. Corporate landlord scenario.' else 'Launch readiness demo portfolio.' end,
      case when v_i % 3 = 0 then 'phone' else 'email' end,
      v_team_id, v_user_id,
      v_now - ((180 - v_i) || ' days')::interval,
      v_now - ((v_i % 72) || ' hours')::interval
    );
  end loop;

  for v_i in 1..100 loop
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_tenants (
      id, organisation_id, created_by, updated_by, status, notes, name, contact_person, email, phone, industry, company_size,
      current_location, current_lease_expiry, preferred_contact_method, team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('tenant:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i % 17 = 0 then 'inactive' else 'active' end,
      case when v_i in (1, 2, 3) then 'Corporate tenant demo account for portal and executive demos.' else 'Phase 8 launch demo tenant.' end,
      (array['Nova', 'Kopano', 'Moya', 'Atlas', 'Pulse', 'Apex', 'Cedar', 'Omni', 'Blue Crane', 'Summit'])[((v_i - 1) % 10) + 1] || ' ' ||
        (array['Logistics', 'Finance', 'Retail', 'Technology', 'Healthcare', 'Manufacturing', 'Studios', 'Advisory', 'Foods', 'Energy'])[((v_i - 1) % 10) + 1] || ' ' || lpad(v_i::text, 3, '0'),
      'Tenant Contact ' || lpad(v_i::text, 3, '0'),
      'tenant' || lpad(v_i::text, 3, '0') || '@commercial-demo.bridge9.local',
      '+27 11 555 ' || lpad(v_i::text, 4, '0'),
      (array['Logistics', 'Financial Services', 'Retail', 'Technology', 'Healthcare', 'Manufacturing', 'Creative Services', 'Professional Services'])[((v_i - 1) % 8) + 1],
      case when v_i % 4 = 0 then 'enterprise' when v_i % 4 = 1 then 'mid_market' when v_i % 4 = 2 then 'growth' else 'sme' end,
      v_areas[((v_i - 1) % array_length(v_areas, 1)) + 1],
      (v_now + ((30 + v_i * 5) || ' days')::interval)::date,
      case when v_i % 4 = 0 then 'phone' else 'email' end,
      v_team_id, v_user_id,
      v_now - ((160 - v_i % 100) || ' days')::interval,
      v_now - ((v_i % 96) || ' hours')::interval
    );
  end loop;

  for v_i in 1..50 loop
    v_landlord_index := ((v_i - 1) % 50) + 1;
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_properties (
      id, organisation_id, created_by, updated_by, status, notes, landlord_id, property_name, property_type, address, suburb, city, province,
      gla_m2, available_space_m2, vacancy_percentage, zoning, parking_ratio, loading_bays, power_supply, height_m, asking_rental_per_m2,
      asking_sale_price, team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('property:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i % 19 = 0 then 'archived' else 'active' end,
      'Phase 8 launch portfolio asset. Asset classes include industrial, retail, office, mixed use, logistics, business park, and warehouse.',
      pg_temp.commercial_launch_uuid('landlord:' || v_landlord_index),
      v_areas[((v_i - 1) % array_length(v_areas, 1)) + 1] || ' ' ||
        initcap(replace(v_asset_types[((v_i - 1) % array_length(v_asset_types, 1)) + 1], '_', ' ')) || ' Centre ' || lpad(v_i::text, 2, '0'),
      v_asset_types[((v_i - 1) % array_length(v_asset_types, 1)) + 1],
      (10 + v_i)::text || ' Demo Commercial Road',
      v_areas[((v_i - 1) % array_length(v_areas, 1)) + 1],
      case when v_i % 5 = 0 then 'Pretoria' else 'Johannesburg' end,
      'Gauteng',
      2500 + (v_i * 310),
      250 + ((v_i % 9) * 180),
      round(((250 + ((v_i % 9) * 180)) / (2500 + (v_i * 310))::numeric) * 100, 1),
      case when v_i % 3 = 0 then 'Industrial 1' when v_i % 3 = 1 then 'Business 4' else 'Commercial' end,
      '1:' || (25 + (v_i % 12)),
      case when v_i % 2 = 0 then 2 + (v_i % 8) else null end,
      case when v_i % 4 = 0 then '3 phase / backup power' else 'Municipal supply' end,
      case when v_i % 2 = 0 then 8 + (v_i % 6) else null end,
      85 + (v_i % 28),
      case when v_i % 7 = 0 then 8500000 + (v_i * 150000) else null end,
      v_team_id, v_user_id,
      v_now - ((140 - v_i) || ' days')::interval,
      v_now - ((v_i % 80) || ' hours')::interval
    );
  end loop;

  for v_i in 1..150 loop
    v_property_index := ((v_i - 1) % 50) + 1;
    v_landlord_index := ((v_property_index - 1) % 50) + 1;
    v_status := v_vacancy_statuses[((v_i - 1) % array_length(v_vacancy_statuses, 1)) + 1];
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_vacancies (
      id, organisation_id, created_by, updated_by, status, notes, property_id, landlord_id, vacancy_name, unit_or_floor,
      available_area_m2, asking_rental, availability_date, broker_assignment, incentives, fit_out_allowance, team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('vacancy:' || v_i), v_org_id, v_user_id, v_user_id,
      v_status,
      'Phase 8 launch vacancy. Used for matching, pipeline, large-list performance, and demo readiness.',
      pg_temp.commercial_launch_uuid('property:' || v_property_index),
      pg_temp.commercial_launch_uuid('landlord:' || v_landlord_index),
      'Unit ' || lpad(v_i::text, 3, '0') || ' at Property ' || lpad(v_property_index::text, 2, '0'),
      case when v_i % 3 = 0 then 'Warehouse ' || ((v_i % 12) + 1) else 'Suite ' || ((v_i % 24) + 1) end,
      180 + ((v_i % 18) * 95),
      85 + ((v_i % 26) * 4),
      (v_now + ((v_i % 90) || ' days')::interval)::date,
      v_user_id,
      case when v_i % 8 = 0 then 'Tenant installation allowance available' else null end,
      case when v_i % 8 = 0 then 75000 + (v_i * 500) else null end,
      v_team_id, v_user_id,
      v_now - ((90 - v_i % 80) || ' days')::interval,
      v_now - ((v_i % 64) || ' hours')::interval
    );
  end loop;

  for v_i in 1..100 loop
    v_tenant_index := ((v_i - 1) % 100) + 1;
    v_status := v_requirement_stages[((v_i - 1) % array_length(v_requirement_stages, 1)) + 1];
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_requirements (
      id, organisation_id, created_by, updated_by, status, notes, requirement_type, client_type, tenant_id, requirement_name,
      property_type, preferred_locations, min_size_m2, max_size_m2, budget_min, budget_max, target_occupation_date, lease_term_months,
      special_requirements, assigned_broker, stage, team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('requirement:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_status = 'lost' then 'closed_lost' else 'active' end,
      'Phase 8 launch requirement with deterministic matchable data.',
      case when v_i % 6 = 0 then 'purchase' else 'lease' end,
      'tenant',
      pg_temp.commercial_launch_uuid('tenant:' || v_tenant_index),
      'Requirement ' || lpad(v_i::text, 3, '0') || ' - ' || initcap(replace(v_asset_types[((v_i - 1) % array_length(v_asset_types, 1)) + 1], '_', ' ')),
      v_asset_types[((v_i - 1) % array_length(v_asset_types, 1)) + 1],
      array[
        v_areas[((v_i - 1) % array_length(v_areas, 1)) + 1],
        v_areas[(v_i % array_length(v_areas, 1)) + 1]
      ],
      180 + ((v_i % 10) * 120),
      650 + ((v_i % 15) * 180),
      35000 + (v_i * 2100),
      85000 + (v_i * 3400),
      (v_now + ((20 + v_i * 2) || ' days')::interval)::date,
      24 + ((v_i % 5) * 12),
      case when v_i % 9 = 0 then 'Backup power, loading access, and client-facing signage required.' else 'Standard commercial requirements.' end,
      v_user_id, v_status, v_team_id, v_user_id,
      v_now - ((85 - v_i % 70) || ' days')::interval,
      v_now - ((v_i % 48) || ' hours')::interval
    );
  end loop;

  for v_i in 1..75 loop
    v_requirement_index := ((v_i - 1) % 100) + 1;
    v_property_index := ((v_i - 1) % 50) + 1;
    v_tenant_index := ((v_requirement_index - 1) % 100) + 1;
    v_landlord_index := ((v_property_index - 1) % 50) + 1;
    v_vacancy_id := pg_temp.commercial_launch_uuid('vacancy:' || (((v_i - 1) % 150) + 1));
    v_status := v_deal_stages[((v_i - 1) % array_length(v_deal_stages, 1)) + 1];
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));
    insert into public.commercial_deals (
      id, organisation_id, created_by, updated_by, status, notes, deal_name, deal_type, requirement_id, tenant_id, landlord_id,
      property_id, vacancy_id, assigned_broker, stage, deal_value, estimated_commission, expected_close_date, probability_percentage,
      team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('deal:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_status = 'lost' then 'closed_lost' else 'active' end,
      'Phase 8 launch deal linking requirement, vacancy, property, tenant, landlord, owner, and commercial terms.',
      'Commercial Deal ' || lpad(v_i::text, 3, '0'),
      case when v_i % 6 = 0 then 'sale' else 'lease' end,
      pg_temp.commercial_launch_uuid('requirement:' || v_requirement_index),
      pg_temp.commercial_launch_uuid('tenant:' || v_tenant_index),
      pg_temp.commercial_launch_uuid('landlord:' || v_landlord_index),
      pg_temp.commercial_launch_uuid('property:' || v_property_index),
      v_vacancy_id,
      v_user_id, v_status,
      case when v_i % 6 = 0 then 12000000 + (v_i * 280000) else 65000 + (v_i * 5400) end,
      case when v_i % 6 = 0 then 300000 + (v_i * 7200) else 36000 + (v_i * 1800) end,
      (v_now + ((12 + v_i * 3) || ' days')::interval)::date,
      least(95, 20 + (v_i % 16) * 5),
      v_team_id, v_user_id,
      v_now - ((70 - v_i % 60) || ' days')::interval,
      v_now - ((v_i % 42) || ' hours')::interval
    );
  end loop;

  for v_i in 1..50 loop
    v_deal_id := pg_temp.commercial_launch_uuid('deal:' || v_i);
    v_status := v_hot_statuses[((v_i - 1) % array_length(v_hot_statuses, 1)) + 1];
    select d.tenant_id, d.landlord_id, d.property_id, d.vacancy_id, d.team_id
      into v_tenant_id, v_landlord_id, v_property_id, v_vacancy_id, v_team_id
    from public.commercial_deals d
    where d.id = v_deal_id;

    insert into public.commercial_heads_of_terms (
      id, organisation_id, deal_id, tenant_id, landlord_id, property_id, vacancy_id, premises_description, lease_commencement_date,
      lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance,
      rent_free_period_months, beneficial_occupation_date, permitted_use, special_conditions, broker_commission_notes, status,
      sent_at, accepted_at, rejected_at, signed_at, converted_at, team_id, broker_id, created_by, updated_by, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('hot:' || v_i), v_org_id, v_deal_id, v_tenant_id, v_landlord_id, v_property_id, v_vacancy_id,
      'Phase 8 launch HOT for deal ' || lpad(v_i::text, 3, '0'),
      (v_now + ((18 + v_i) || ' days')::interval)::date,
      36 + ((v_i % 4) * 12),
      72000 + (v_i * 4300),
      95 + ((v_i % 18) * 5),
      7 + (v_i % 4),
      (72000 + (v_i * 4300)) * 2,
      case when v_i % 5 = 0 then 150000 + (v_i * 1000) else null end,
      case when v_i % 6 = 0 then 2 else 0 end,
      (v_now + ((8 + v_i) || ' days')::interval)::date,
      case when v_i % 3 = 0 then 'Light industrial with ancillary office use' else 'Commercial business use' end,
      'Launch demo HOT terms. Ready for broker review, client review, and conversion validation.',
      'Expected commission recorded for visibility only. Payroll accounting deferred.',
      v_status,
      case when v_status in ('sent', 'under_review', 'accepted', 'rejected', 'signed', 'converted') then v_now - ((20 - v_i % 12) || ' days')::interval else null end,
      case when v_status in ('accepted', 'signed', 'converted') then v_now - ((14 - v_i % 9) || ' days')::interval else null end,
      case when v_status = 'rejected' then v_now - ((12 - v_i % 8) || ' days')::interval else null end,
      case when v_status in ('signed', 'converted') then v_now - ((10 - v_i % 7) || ' days')::interval else null end,
      case when v_status = 'converted' then v_now - ((6 - v_i % 4) || ' days')::interval else null end,
      v_team_id, v_user_id, v_user_id, v_user_id,
      v_now - ((50 - v_i % 45) || ' days')::interval,
      v_now - ((v_i % 36) || ' hours')::interval
    );
  end loop;

  for v_i in 1..100 loop
    v_deal_index := ((v_i - 1) % 75) + 1;
    v_hot_index := ((v_i - 1) % 50) + 1;
    v_deal_id := pg_temp.commercial_launch_uuid('deal:' || v_deal_index);
    v_hot_id := case when v_i <= 50 then pg_temp.commercial_launch_uuid('hot:' || v_hot_index) else null end;
    select d.tenant_id, d.landlord_id, d.property_id, d.vacancy_id, d.team_id
      into v_tenant_id, v_landlord_id, v_property_id, v_vacancy_id, v_team_id
    from public.commercial_deals d
    where d.id = v_deal_id;
    v_status := v_lease_statuses[((v_i - 1) % array_length(v_lease_statuses, 1)) + 1];

    insert into public.commercial_leases (
      id, organisation_id, created_by, updated_by, status, notes, deal_id, heads_of_terms_id, tenant_id, landlord_id, property_id,
      vacancy_id, lease_start_date, lease_end_date, occupation_date, lease_term_months, monthly_rental, rental_per_m2,
      escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, renewal_option, renewal_notice_date,
      team_id, broker_id, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('lease:' || v_i), v_org_id, v_user_id, v_user_id,
      v_status,
      'Phase 8 launch lease for renewal visibility, active lease reporting, portal lease visibility, and demo saturation.',
      v_deal_id, v_hot_id, v_tenant_id, v_landlord_id, v_property_id, v_vacancy_id,
      (v_now - ((45 + v_i) || ' days')::interval)::date,
      (v_now + ((30 + v_i * 9) || ' days')::interval)::date,
      (v_now - ((30 + v_i) || ' days')::interval)::date,
      24 + ((v_i % 5) * 12),
      62000 + (v_i * 4100),
      90 + ((v_i % 22) * 4),
      7 + (v_i % 4),
      (62000 + (v_i * 4100)) * 2,
      case when v_i % 7 = 0 then 120000 + (v_i * 900) else null end,
      case when v_i % 6 = 0 then 1 else 0 end,
      v_i % 3 = 0,
      (v_now + ((15 + v_i * 5) || ' days')::interval)::date,
      v_team_id, v_user_id,
      v_now - ((42 - v_i % 38) || ' days')::interval,
      v_now - ((v_i % 32) || ' hours')::interval
    );
  end loop;

  for v_i in 1..220 loop
    v_entity_type := case
      when v_i % 8 = 0 then 'commercial_landlord'
      when v_i % 8 = 1 then 'commercial_tenant'
      when v_i % 8 = 2 then 'commercial_property'
      when v_i % 8 = 3 then 'commercial_vacancy'
      when v_i % 8 = 4 then 'commercial_requirement'
      when v_i % 8 = 5 then 'commercial_deal'
      when v_i % 8 = 6 then 'commercial_heads_of_terms'
      else 'commercial_lease'
    end;
    v_entity_id := case v_entity_type
      when 'commercial_landlord' then pg_temp.commercial_launch_uuid('landlord:' || (((v_i - 1) % 50) + 1))
      when 'commercial_tenant' then pg_temp.commercial_launch_uuid('tenant:' || (((v_i - 1) % 100) + 1))
      when 'commercial_property' then pg_temp.commercial_launch_uuid('property:' || (((v_i - 1) % 50) + 1))
      when 'commercial_vacancy' then pg_temp.commercial_launch_uuid('vacancy:' || (((v_i - 1) % 150) + 1))
      when 'commercial_requirement' then pg_temp.commercial_launch_uuid('requirement:' || (((v_i - 1) % 100) + 1))
      when 'commercial_deal' then pg_temp.commercial_launch_uuid('deal:' || (((v_i - 1) % 75) + 1))
      when 'commercial_heads_of_terms' then pg_temp.commercial_launch_uuid('hot:' || (((v_i - 1) % 50) + 1))
      else pg_temp.commercial_launch_uuid('lease:' || (((v_i - 1) % 100) + 1))
    end;
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));

    insert into public.commercial_documents (
      id, organisation_id, entity_type, entity_id, document_name, category, status, notes, file_name, file_path, file_bucket,
      file_size, mime_type, uploaded_by, uploaded_at, version_number, expires_at, reviewed_by, reviewed_at, team_id, broker_id,
      created_by, updated_by, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('document:' || v_i), v_org_id, v_entity_type, v_entity_id,
      'Launch demo document ' || lpad(v_i::text, 3, '0'),
      (array['fica', 'company_registration', 'zoning_certificate', 'floor_plan', 'proposal', 'draft_hot', 'signed_hot', 'signed_lease'])[((v_i - 1) % 8) + 1],
      (array['uploaded', 'under_review', 'approved', 'rejected', 'superseded', 'archived'])[((v_i - 1) % 6) + 1],
      'Phase 8 launch document for document centre, compliance, portal, and support readiness.',
      'commercial-launch-demo-' || lpad(v_i::text, 3, '0') || '.pdf',
      'commercial/launch-demo/commercial-launch-demo-' || lpad(v_i::text, 3, '0') || '.pdf',
      'documents',
      128000 + (v_i * 1100),
      'application/pdf',
      v_user_id,
      v_now - ((v_i % 60) || ' days')::interval,
      1 + (v_i % 3),
      case when v_i % 11 = 0 then v_now + ((30 + v_i) || ' days')::interval else null end,
      case when v_i % 4 in (0, 1) then v_user_id else null end,
      case when v_i % 4 in (0, 1) then v_now - ((v_i % 14) || ' days')::interval else null end,
      v_team_id, v_user_id, v_user_id, v_user_id,
      v_now - ((v_i % 60) || ' days')::interval,
      v_now - ((v_i % 24) || ' hours')::interval
    );
  end loop;

  for v_i in 1..160 loop
    v_entity_type := case
      when v_i % 6 = 0 then 'commercial_landlord'
      when v_i % 6 = 1 then 'commercial_tenant'
      when v_i % 6 = 2 then 'commercial_property'
      when v_i % 6 = 3 then 'commercial_deal'
      when v_i % 6 = 4 then 'commercial_heads_of_terms'
      else 'commercial_lease'
    end;
    v_entity_id := case v_entity_type
      when 'commercial_landlord' then pg_temp.commercial_launch_uuid('landlord:' || (((v_i - 1) % 50) + 1))
      when 'commercial_tenant' then pg_temp.commercial_launch_uuid('tenant:' || (((v_i - 1) % 100) + 1))
      when 'commercial_property' then pg_temp.commercial_launch_uuid('property:' || (((v_i - 1) % 50) + 1))
      when 'commercial_deal' then pg_temp.commercial_launch_uuid('deal:' || (((v_i - 1) % 75) + 1))
      when 'commercial_heads_of_terms' then pg_temp.commercial_launch_uuid('hot:' || (((v_i - 1) % 50) + 1))
      else pg_temp.commercial_launch_uuid('lease:' || (((v_i - 1) % 100) + 1))
    end;
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));

    insert into public.commercial_document_requests (
      id, organisation_id, entity_type, entity_id, document_name, category, requested_from, due_date, notes, status, priority,
      requested_by, completed_document_id, team_id, broker_id, created_by, updated_by, created_at, updated_at
    )
    values (
      pg_temp.commercial_launch_uuid('document-request:' || v_i), v_org_id, v_entity_type, v_entity_id,
      'Launch requested document ' || lpad(v_i::text, 3, '0'),
      (array['fica', 'financial_statements', 'bank_confirmation', 'zoning_certificate', 'draft_hot', 'signed_lease'])[((v_i - 1) % 6) + 1],
      case when v_i % 2 = 0 then 'Tenant' else 'Landlord' end,
      (v_now + (((v_i % 45) - 10)::text || ' days')::interval)::date,
      'Phase 8 launch request for compliance and portal workflows.',
      (array['requested', 'uploaded', 'under_review', 'approved', 'rejected', 'expired'])[((v_i - 1) % 6) + 1],
      (array['urgent', 'high', 'normal', 'low'])[((v_i - 1) % 4) + 1],
      v_user_id,
      case when v_i % 6 in (2, 3) then pg_temp.commercial_launch_uuid('document:' || (((v_i - 1) % 220) + 1)) else null end,
      v_team_id, v_user_id, v_user_id, v_user_id,
      v_now - ((v_i % 50) || ' days')::interval,
      v_now - ((v_i % 20) || ' hours')::interval
    );
  end loop;

  for v_i in 1..320 loop
    v_entity_type := case
      when v_i % 6 = 0 then 'commercial_property'
      when v_i % 6 = 1 then 'commercial_vacancy'
      when v_i % 6 = 2 then 'commercial_requirement'
      when v_i % 6 = 3 then 'commercial_deal'
      when v_i % 6 = 4 then 'commercial_heads_of_terms'
      else 'commercial_lease'
    end;
    v_entity_id := case v_entity_type
      when 'commercial_property' then pg_temp.commercial_launch_uuid('property:' || (((v_i - 1) % 50) + 1))
      when 'commercial_vacancy' then pg_temp.commercial_launch_uuid('vacancy:' || (((v_i - 1) % 150) + 1))
      when 'commercial_requirement' then pg_temp.commercial_launch_uuid('requirement:' || (((v_i - 1) % 100) + 1))
      when 'commercial_deal' then pg_temp.commercial_launch_uuid('deal:' || (((v_i - 1) % 75) + 1))
      when 'commercial_heads_of_terms' then pg_temp.commercial_launch_uuid('hot:' || (((v_i - 1) % 50) + 1))
      else pg_temp.commercial_launch_uuid('lease:' || (((v_i - 1) % 100) + 1))
    end;
    v_team_id := pg_temp.commercial_launch_uuid('team:' || (((v_i - 1) % 4) + 1));

    insert into public.commercial_activity (
      id, organisation_id, entity_type, entity_id, activity_type, title, body, metadata, created_by, branch_id, team_id, broker_id, created_at
    )
    values (
      pg_temp.commercial_launch_uuid('activity:' || v_i), v_org_id, v_entity_type, v_entity_id,
      (array['record_created', 'stage_changed', 'document_uploaded', 'assignment_changed', 'portal_message', 'notification_sent', 'workflow_completed'])[((v_i - 1) % 7) + 1],
      (array['Record created', 'Stage changed', 'Document uploaded', 'Assignment changed', 'Portal message received', 'Notification sent', 'Workflow completed'])[((v_i - 1) % 7) + 1],
      'Phase 8 launch activity event ' || v_i || '.',
      jsonb_build_object('seed', 'commercial_launch_readiness_demo', 'sequence', v_i),
      v_user_id, null, v_team_id, v_user_id,
      v_now - ((v_i % 120) || ' hours')::interval
    );
  end loop;

  if to_regclass('public.commercial_portal_contacts') is not null
    and to_regclass('public.commercial_portal_access') is not null
    and to_regclass('public.commercial_portal_messages') is not null
    and to_regclass('public.commercial_portal_notifications') is not null then
    for v_i in 1..20 loop
      v_deal_index := ((v_i - 1) % 20) + 1;
      v_hot_index := ((v_i - 1) % 20) + 1;
      v_tx_id := 'ctx-deal-' || pg_temp.commercial_launch_uuid('deal:' || v_deal_index)::text;
      v_tenant_id := pg_temp.commercial_launch_uuid('tenant:' || v_deal_index);
      v_landlord_id := pg_temp.commercial_launch_uuid('landlord:' || (((v_deal_index - 1) % 50) + 1));
      v_property_id := pg_temp.commercial_launch_uuid('property:' || (((v_deal_index - 1) % 50) + 1));
      v_vacancy_id := pg_temp.commercial_launch_uuid('vacancy:' || (((v_deal_index - 1) % 150) + 1));
      v_deal_id := pg_temp.commercial_launch_uuid('deal:' || v_deal_index);
      v_hot_id := pg_temp.commercial_launch_uuid('hot:' || v_hot_index);

      insert into public.commercial_portal_contacts (
        id, organisation_id, commercial_transaction_id, portal_role, entity_type, entity_id, contact_name, contact_email, contact_phone,
        company_name, status, metadata, created_by, updated_by, created_at, updated_at
      )
      values (
        pg_temp.commercial_launch_uuid('portal-contact:' || v_i), v_org_id, v_tx_id,
        case when v_i % 2 = 0 then 'landlord' else 'tenant' end,
        case when v_i % 2 = 0 then 'commercial_landlord' else 'commercial_tenant' end,
        case when v_i % 2 = 0 then v_landlord_id else v_tenant_id end,
        'Portal Contact ' || lpad(v_i::text, 2, '0'),
        'portal.contact' || lpad(v_i::text, 2, '0') || '@commercial-demo.bridge9.local',
        '+27 12 555 ' || lpad(v_i::text, 4, '0'),
        case when v_i % 2 = 0 then 'Corporate Landlord Demo' else 'Corporate Tenant Demo' end,
        'active',
        jsonb_build_object('seed', 'commercial_launch_readiness_demo', 'persona', case when v_i % 2 = 0 then 'corporate landlord' else 'corporate tenant' end),
        v_user_id, v_user_id, v_now - ((v_i % 20) || ' days')::interval, v_now - ((v_i % 12) || ' hours')::interval
      );

      insert into public.commercial_portal_access (
        id, organisation_id, contact_id, commercial_transaction_id, portal_role, token, status, expires_at, invitation_sent_at,
        visibility, deal_id, heads_of_terms_id, lease_id, requirement_id, tenant_id, landlord_id, property_id, vacancy_id,
        created_by, updated_by, created_at, updated_at
      )
      values (
        pg_temp.commercial_launch_uuid('portal-access:' || v_i), v_org_id, pg_temp.commercial_launch_uuid('portal-contact:' || v_i), v_tx_id,
        case when v_i % 2 = 0 then 'landlord' else 'tenant' end,
        'launch-demo-token-' || lpad(v_i::text, 2, '0'),
        case when v_i in (18, 19) then 'revoked' when v_i = 20 then 'expired' else 'active' end,
        v_now + ((14 + v_i) || ' days')::interval,
        v_now - ((v_i % 8) || ' days')::interval,
        '{"documents": true, "timeline": true, "messages": true, "lease": true}'::jsonb,
        v_deal_id, v_hot_id, pg_temp.commercial_launch_uuid('lease:' || v_i), pg_temp.commercial_launch_uuid('requirement:' || v_deal_index),
        v_tenant_id, v_landlord_id, v_property_id, v_vacancy_id,
        v_user_id, v_user_id, v_now - ((v_i % 20) || ' days')::interval, v_now - ((v_i % 12) || ' hours')::interval
      );

      insert into public.commercial_portal_messages (
        id, organisation_id, access_id, commercial_transaction_id, portal_role, sender_role, sender_name, sender_email, message_body,
        status, visibility, linked_entity_type, linked_entity_id, metadata, created_at, updated_at
      )
      values (
        pg_temp.commercial_launch_uuid('portal-message:' || v_i), v_org_id, pg_temp.commercial_launch_uuid('portal-access:' || v_i), v_tx_id,
        case when v_i % 2 = 0 then 'landlord' else 'tenant' end,
        'external', 'Portal Contact ' || lpad(v_i::text, 2, '0'), 'portal.contact' || lpad(v_i::text, 2, '0') || '@commercial-demo.bridge9.local',
        'Please review the outstanding commercial document request for this transaction.',
        case when v_i % 3 = 0 then 'responded' else 'open' end,
        'broker_visible',
        'commercial_deal',
        v_deal_id,
        jsonb_build_object('seed', 'commercial_launch_readiness_demo'),
        v_now - ((v_i % 30) || ' hours')::interval, v_now - ((v_i % 10) || ' hours')::interval
      );

      insert into public.commercial_portal_notifications (
        id, organisation_id, access_id, commercial_transaction_id, portal_role, notification_type, title, description, status, priority,
        action_route, related_entity_type, related_entity_id, metadata, created_at, updated_at
      )
      values (
        pg_temp.commercial_launch_uuid('portal-notification:' || v_i), v_org_id, pg_temp.commercial_launch_uuid('portal-access:' || v_i), v_tx_id,
        case when v_i % 2 = 0 then 'landlord' else 'tenant' end,
        case when v_i % 3 = 0 then 'document_request' else 'transaction_update' end,
        'Commercial portal update',
        'A commercial transaction update is ready for review.',
        case when v_i % 4 = 0 then 'read' else 'unread' end,
        case when v_i % 5 = 0 then 'high' else 'normal' end,
        '/commercial/portal/launch-demo-token-' || lpad(v_i::text, 2, '0'),
        'commercial_deal',
        v_deal_id,
        jsonb_build_object('seed', 'commercial_launch_readiness_demo'),
        v_now - ((v_i % 30) || ' hours')::interval, v_now - ((v_i % 10) || ' hours')::interval
      );
    end loop;
  end if;

  raise notice 'Commercial Phase 8 launch readiness seed complete for organisation %. landlords 50, tenants 100, properties 50, vacancies 150, requirements 100, deals 75, HOTs 50, leases 100.', v_org_id;
end $$;

commit;
