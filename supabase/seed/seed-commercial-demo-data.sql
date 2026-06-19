begin;

create extension if not exists "pgcrypto";

create or replace function pg_temp.commercial_demo_uuid(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5('bridge9-commercial-demo:' || p_key), 1, 8) || '-' ||
    substr(md5('bridge9-commercial-demo:' || p_key), 9, 4) || '-4' ||
    substr(md5('bridge9-commercial-demo:' || p_key), 14, 3) || '-a' ||
    substr(md5('bridge9-commercial-demo:' || p_key), 18, 3) || '-' ||
    substr(md5('bridge9-commercial-demo:' || p_key), 21, 12)
  )::uuid;
$$;

do $$
declare
  v_org_id uuid;
  v_user_id uuid;
  v_now timestamptz := now();
  v_i integer;
  v_property_index integer;
  v_tenant_index integer;
  v_landlord_index integer;
  v_deal_id uuid;
  v_property_id uuid;
  v_landlord_id uuid;
  v_tenant_id uuid;
  v_status text;
  v_stage text;
  v_landlords text[] := array[
    'Growthpoint Demo Portfolio', 'Redefine Demo Assets', 'Attacq Waterfall Holdings', 'Investec Property Demo Fund',
    'Emira Urban Commercial', 'Fairvest Retail Holdings', 'Fortress Logistics Demo', 'Burstone Office Collective',
    'Abland Commercial Holdings', 'Zenprop Demo Properties', 'Vukile Retail Demo', 'Hyprop Mall Holdings',
    'Equites Industrial Demo', 'Resilient Retail Fund', 'Gauteng Private Property Co', 'Melrose Commercial Trust',
    'Pretoria East Asset Co', 'Rosebank Urban Holdings', 'Midrand Logistics Partners', 'Sandton Office Syndicate'
  ];
  v_tenants text[] := array[
    'NovaTech Solutions', 'Moya Logistics', 'Kopano Finance Group', 'Atlas Medical Supplies',
    'Urban Bean Roasters', 'Blue Crane Design Studio', 'SwiftCloud Africa', 'Ndlovu Legal Advisory',
    'Greenline Energy', 'Cedar Retail Group', 'OmniCall Contact Centre', 'Matrix Warehousing',
    'Pulse Fitness Holdings', 'Orchid Cosmetics', 'Apex Engineering', 'Tshwane Training Academy',
    'Kinetic Media', 'Summit Foods', 'BritePay Africa', 'Vantage Consulting',
    'Luma Labs', 'Sable Security', 'Foundry Workspace', 'EcoFleet Rentals'
  ];
  v_properties text[] := array[
    'Rosebank Corner Offices', 'Waterfall Logistics Park', 'Menlyn Retail Forum', 'Sandton Exchange',
    'Midrand Business Works', 'Fourways Retail Square', 'Centurion Gate Offices', 'East Rand Logistics Yard',
    'Melrose Arch Annex', 'Bryanston Office Pavilion', 'Hatfield Mixed-Use Hub', 'Longmeadow Distribution Centre',
    'Bedfordview Retail Terrace', 'Woodmead Corporate Park', 'Randburg Light Industrial'
  ];
  v_property_types text[] := array['office', 'industrial', 'retail', 'mixed_use'];
  v_requirement_stages text[] := array['new_requirement', 'shortlisting', 'viewing', 'proposal', 'negotiation', 'lease_stage'];
  v_deal_stages text[] := array['requirement', 'shortlist', 'proposal', 'heads_of_terms', 'lease_draft', 'signed'];
  v_vacancy_statuses text[] := array['available', 'reserved', 'under_negotiation', 'upcoming', 'leased'];
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
    or to_regclass('public.commercial_activity') is null then
    raise notice 'Commercial demo seed skipped: commercial tables are not available.';
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
    raise notice 'Commercial demo seed skipped: Bridge9 demo organisation was not found.';
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
    module_metadata = coalesce(module_metadata, '{}'::jsonb) || jsonb_build_object('seed', 'commercial_mvp_demo')
  where organisation_id = v_org_id
    and user_id = v_user_id;

  delete from public.commercial_activity
  where organisation_id = v_org_id
    and metadata->>'seed' = 'commercial_mvp_demo';
  delete from public.commercial_documents
  where organisation_id = v_org_id
    and notes = 'Commercial MVP demo seed';
  delete from public.commercial_document_requests
  where organisation_id = v_org_id
    and notes = 'Commercial MVP demo seed';
  delete from public.commercial_heads_of_terms
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('hot:' || generate_series(1, 15)));
  delete from public.commercial_leases
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('lease:' || generate_series(1, 20)));
  delete from public.commercial_deals
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('deal:' || generate_series(1, 25)));
  delete from public.commercial_requirements
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('requirement:' || generate_series(1, 30)));
  delete from public.commercial_vacancies
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('vacancy:' || generate_series(1, 45)));
  delete from public.commercial_properties
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('property:' || generate_series(1, 15)));
  delete from public.commercial_tenants
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('tenant:' || generate_series(1, 24)));
  delete from public.commercial_landlords
  where organisation_id = v_org_id
    and id in (select pg_temp.commercial_demo_uuid('landlord:' || generate_series(1, 20)));

  for v_i in 1..20 loop
    insert into public.commercial_landlords (
      id, organisation_id, created_by, updated_by, status, notes, name, contact_person, email, phone, website, landlord_type, portfolio_notes, preferred_contact_method, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('landlord:' || v_i), v_org_id, v_user_id, v_user_id, 'active',
      'Commercial MVP demo landlord record.', v_landlords[v_i], 'Portfolio Manager ' || v_i,
      'landlord' || lpad(v_i::text, 2, '0') || '@commercial-demo.bridge9.co.za', '+27 11 555 ' || lpad((2000 + v_i)::text, 4, '0'),
      'https://commercial-demo.bridge9.co.za/landlords/' || v_i,
      (array['listed_fund', 'property_company', 'private_owner', 'developer', 'institution'])[((v_i - 1) % 5) + 1],
      'Portfolio includes Gauteng office, retail and industrial stock for demo workflows.', 'email',
      v_now - ((40 - v_i) || ' days')::interval, v_now - ((20 - v_i % 10) || ' hours')::interval
    );
  end loop;

  for v_i in 1..24 loop
    insert into public.commercial_tenants (
      id, organisation_id, created_by, updated_by, status, notes, name, contact_person, email, phone, industry, company_size, current_location, current_lease_expiry, preferred_contact_method, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('tenant:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i in (23, 24) then 'inactive' else 'active' end,
      'Commercial MVP demo tenant/client record.', v_tenants[v_i], 'Operations Lead ' || v_i,
      'tenant' || lpad(v_i::text, 2, '0') || '@commercial-demo.bridge9.co.za', '+27 82 555 ' || lpad((3000 + v_i)::text, 4, '0'),
      (array['Technology', 'Logistics', 'Financial Services', 'Retail', 'Healthcare', 'Professional Services'])[((v_i - 1) % 6) + 1],
      (array['10-25', '25-50', '50-100', '100-250', '250+'])[((v_i - 1) % 5) + 1],
      (array['Rosebank', 'Waterfall', 'Menlyn', 'Sandton', 'Midrand'])[((v_i - 1) % 5) + 1],
      (v_now + ((60 + v_i * 18) || ' days')::interval)::date,
      case when v_i % 3 = 0 then 'whatsapp' when v_i % 3 = 1 then 'email' else 'phone' end,
      v_now - ((35 - v_i % 20) || ' days')::interval, v_now - ((v_i % 12) || ' hours')::interval
    );
  end loop;

  for v_i in 1..15 loop
    v_landlord_index := ((v_i - 1) % 20) + 1;
    insert into public.commercial_properties (
      id, organisation_id, created_by, updated_by, status, notes, landlord_id, property_name, property_type, address, suburb, city, province, country,
      gla_m2, available_space_m2, vacancy_percentage, zoning, parking_ratio, loading_bays, power_supply, height_m, asking_rental_per_m2, asking_sale_price, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('property:' || v_i), v_org_id, v_user_id, v_user_id, 'active',
      'Commercial MVP demo property with linked vacancies and leases.',
      pg_temp.commercial_demo_uuid('landlord:' || v_landlord_index), v_properties[v_i],
      v_property_types[((v_i - 1) % array_length(v_property_types, 1)) + 1],
      (100 + v_i)::text || ' Demo Commercial Road',
      (array['Rosebank', 'Waterfall', 'Menlyn', 'Sandton', 'Midrand', 'Fourways', 'Centurion', 'Longmeadow'])[((v_i - 1) % 8) + 1],
      case when v_i in (3, 7, 11) then 'Pretoria' else 'Johannesburg' end,
      'Gauteng', 'South Africa',
      5200 + (v_i * 850), 0, 0,
      case when v_i % 4 = 0 then 'Mixed-use' when v_i % 3 = 0 then 'Retail' else 'Commercial' end,
      case when v_i % 2 = 0 then '4 bays / 100m²' else '3 bays / 100m²' end,
      case when v_i % 3 = 0 then 6 else 2 end,
      case when v_i % 2 = 0 then 'Three phase' else 'Standard municipal' end,
      case when v_i % 3 = 0 then 8.5 else 3.8 end,
      95 + (v_i * 7),
      case when v_i % 5 = 0 then 18000000 + (v_i * 750000) else null end,
      v_now - ((50 - v_i) || ' days')::interval, v_now - ((v_i % 18) || ' hours')::interval
    );
  end loop;

  for v_i in 1..45 loop
    v_property_index := ((v_i - 1) % 15) + 1;
    v_landlord_index := ((v_property_index - 1) % 20) + 1;
    v_status := v_vacancy_statuses[((v_i - 1) % array_length(v_vacancy_statuses, 1)) + 1];
    insert into public.commercial_vacancies (
      id, organisation_id, created_by, updated_by, status, notes, property_id, landlord_id, vacancy_name, unit_or_floor, available_area_m2, asking_rental, availability_date, broker_assignment, incentives, fit_out_allowance, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('vacancy:' || v_i), v_org_id, v_user_id, v_user_id, v_status,
      'Commercial MVP demo vacancy linked to property stock.',
      pg_temp.commercial_demo_uuid('property:' || v_property_index), pg_temp.commercial_demo_uuid('landlord:' || v_landlord_index),
      v_properties[v_property_index] || ' - Unit ' || lpad(v_i::text, 2, '0'),
      case when v_i % 3 = 0 then 'Floor ' || ((v_i % 8) + 1) else 'Unit ' || chr(64 + ((v_i - 1) % 20) + 1) end,
      180 + ((v_i % 9) * 85),
      105 + ((v_i % 11) * 12),
      (v_now + ((v_i % 120) || ' days')::interval)::date,
      v_user_id,
      case when v_i % 4 = 0 then 'Tenant installation contribution available.' else null end,
      case when v_i % 5 = 0 then 120000 + (v_i * 3500) else null end,
      v_now - ((45 - v_i % 30) || ' days')::interval, v_now - ((v_i % 15) || ' hours')::interval
    );
  end loop;

  update public.commercial_properties p
  set available_space_m2 = coalesce(v.available_area, 0),
      vacancy_percentage = case when coalesce(p.gla_m2, 0) > 0 then round((coalesce(v.available_area, 0) / p.gla_m2) * 100, 1) else 0 end,
      updated_at = v_now
  from (
    select property_id, sum(available_area_m2) filter (where status in ('available', 'reserved', 'under_negotiation', 'upcoming')) as available_area
    from public.commercial_vacancies
    where organisation_id = v_org_id
    group by property_id
  ) v
  where p.id = v.property_id
    and p.organisation_id = v_org_id;

  for v_i in 1..30 loop
    v_tenant_index := ((v_i - 1) % 24) + 1;
    v_stage := v_requirement_stages[((v_i - 1) % array_length(v_requirement_stages, 1)) + 1];
    insert into public.commercial_requirements (
      id, organisation_id, created_by, updated_by, status, notes, requirement_type, client_type, tenant_id, requirement_name, property_type,
      preferred_locations, min_size_m2, max_size_m2, budget_min, budget_max, target_occupation_date, lease_term_months, special_requirements, assigned_broker, stage, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('requirement:' || v_i), v_org_id, v_user_id, v_user_id, 'active',
      'Commercial MVP demo requirement matched against live vacancies.',
      case when v_i % 8 = 0 then 'purchase' when v_i % 7 = 0 then 'investment' else 'lease' end,
      case when v_i % 8 = 0 then 'owner_occupier' when v_i % 7 = 0 then 'investor' else 'tenant' end,
      pg_temp.commercial_demo_uuid('tenant:' || v_tenant_index),
      v_tenants[v_tenant_index] || ' ' || initcap(v_property_types[((v_i - 1) % array_length(v_property_types, 1)) + 1]) || ' Requirement',
      v_property_types[((v_i - 1) % array_length(v_property_types, 1)) + 1],
      array[(array['Rosebank', 'Waterfall', 'Menlyn', 'Sandton', 'Midrand', 'Fourways'])[((v_i - 1) % 6) + 1], (array['Centurion', 'Longmeadow', 'Woodmead', 'Bryanston'])[((v_i - 1) % 4) + 1]],
      250 + ((v_i % 10) * 100),
      650 + ((v_i % 12) * 150),
      45000 + (v_i * 3500),
      95000 + (v_i * 5500),
      (v_now + ((30 + v_i * 4) || ' days')::interval)::date,
      24 + ((v_i % 4) * 12),
      case when v_i % 5 = 0 then 'Backup power and branding visibility required.' else 'Standard commercial fit-out acceptable.' end,
      v_user_id, v_stage,
      v_now - ((28 - v_i % 20) || ' days')::interval, v_now - ((v_i % 16) || ' hours')::interval
    );
  end loop;

  for v_i in 1..25 loop
    v_property_index := ((v_i - 1) % 15) + 1;
    v_tenant_index := ((v_i - 1) % 24) + 1;
    v_landlord_index := ((v_property_index - 1) % 20) + 1;
    v_stage := v_deal_stages[((v_i - 1) % array_length(v_deal_stages, 1)) + 1];
    insert into public.commercial_deals (
      id, organisation_id, created_by, updated_by, status, notes, deal_name, deal_type, requirement_id, tenant_id, landlord_id, property_id,
      assigned_broker, stage, deal_value, estimated_commission, expected_close_date, probability_percentage, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('deal:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i in (24, 25) then 'closed_lost' else 'active' end,
      'Commercial MVP demo deal with linked demand and supply records.',
      v_tenants[v_tenant_index] || ' / ' || v_properties[v_property_index],
      case when v_i % 5 = 0 then 'sale' else 'lease' end,
      pg_temp.commercial_demo_uuid('requirement:' || (((v_i - 1) % 30) + 1)),
      pg_temp.commercial_demo_uuid('tenant:' || v_tenant_index),
      pg_temp.commercial_demo_uuid('landlord:' || v_landlord_index),
      pg_temp.commercial_demo_uuid('property:' || v_property_index),
      v_user_id, v_stage,
      case when v_i % 5 = 0 then 12500000 + (v_i * 425000) else 85000 + (v_i * 6200) end,
      case when v_i % 5 = 0 then 280000 + (v_i * 7500) else 42000 + (v_i * 1900) end,
      (v_now + ((14 + v_i * 3) || ' days')::interval)::date,
      least(95, 25 + (v_i * 3)),
      v_now - ((25 - v_i % 18) || ' days')::interval, v_now - ((v_i % 14) || ' hours')::interval
    );
  end loop;

  for v_i in 1..15 loop
    v_deal_id := pg_temp.commercial_demo_uuid('deal:' || v_i);
    insert into public.commercial_heads_of_terms (
      id, organisation_id, deal_id, tenant_id, landlord_id, property_id, premises_description, lease_commencement_date, lease_term_months,
      monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months,
      beneficial_occupation_date, permitted_use, special_conditions, broker_commission_notes, status, created_by, updated_by, created_at, updated_at
    )
    select
      pg_temp.commercial_demo_uuid('hot:' || v_i), v_org_id, d.id, d.tenant_id, d.landlord_id, d.property_id,
      'Premises linked to ' || d.deal_name || ' with demo commercial terms.',
      (v_now + ((20 + v_i * 2) || ' days')::interval)::date,
      36 + ((v_i % 3) * 12),
      d.deal_value,
      115 + ((v_i % 8) * 9),
      7 + (v_i % 4),
      d.deal_value * 2,
      case when v_i % 4 = 0 then 150000 else null end,
      case when v_i % 5 = 0 then 2 else 0 end,
      (v_now + ((10 + v_i) || ' days')::interval)::date,
      case when v_i % 3 = 0 then 'Light industrial and ancillary office use' else 'Commercial office use' end,
      case when v_i % 4 = 0 then 'Subject to landlord approval of tenant installation budget.' else 'Standard Bridge9 demo HOT special conditions.' end,
      'Demo broker commission notes captured for commercial MVP.',
      (array['draft', 'sent_for_review', 'approved_by_landlord', 'approved_by_tenant', 'ready_for_lease'])[((v_i - 1) % 5) + 1],
      v_user_id, v_user_id,
      v_now - ((15 - v_i % 10) || ' days')::interval, v_now - ((v_i % 12) || ' hours')::interval
    from public.commercial_deals d
    where d.id = v_deal_id
    on conflict (id) do update set
      status = excluded.status,
      monthly_rental = excluded.monthly_rental,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end loop;

  for v_i in 1..20 loop
    select d.tenant_id, d.landlord_id, d.property_id
      into v_tenant_id, v_landlord_id, v_property_id
    from public.commercial_deals d
    where d.id = pg_temp.commercial_demo_uuid('deal:' || v_i);

    insert into public.commercial_leases (
      id, organisation_id, created_by, updated_by, status, notes, deal_id, tenant_id, landlord_id, property_id, lease_start_date, lease_end_date,
      occupation_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance,
      rent_free_period_months, renewal_option, renewal_notice_date, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('lease:' || v_i), v_org_id, v_user_id, v_user_id,
      case when v_i in (18, 19, 20) then 'expiring_soon' when v_i % 6 = 0 then 'draft' else 'active' end,
      'Commercial MVP demo lease linked to signed and near-signed deal records.',
      pg_temp.commercial_demo_uuid('deal:' || v_i), v_tenant_id, v_landlord_id, v_property_id,
      (v_now - ((120 - v_i * 2) || ' days')::interval)::date,
      (v_now + ((90 + v_i * 27) || ' days')::interval)::date,
      (v_now - ((90 - v_i * 2) || ' days')::interval)::date,
      24 + ((v_i % 4) * 12),
      78000 + (v_i * 5200),
      105 + ((v_i % 7) * 8),
      7 + (v_i % 4),
      156000 + (v_i * 10400),
      case when v_i % 4 = 0 then 125000 else null end,
      case when v_i % 5 = 0 then 1 else 0 end,
      v_i % 3 = 0,
      (v_now + ((45 + v_i * 20) || ' days')::interval)::date,
      v_now - ((18 - v_i % 12) || ' days')::interval, v_now - ((v_i % 10) || ' hours')::interval
    );
  end loop;

  for v_i in 1..50 loop
    insert into public.commercial_documents (
      id, organisation_id, entity_type, entity_id, document_name, category, status, notes, file_name, file_path, file_bucket, file_size,
      mime_type, uploaded_by, uploaded_at, created_by, updated_by, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('document:' || v_i), v_org_id,
      case when v_i % 4 = 0 then 'commercial_property' when v_i % 4 = 1 then 'commercial_deal' when v_i % 4 = 2 then 'commercial_lease' else 'commercial_requirement' end,
      case when v_i % 4 = 0 then pg_temp.commercial_demo_uuid('property:' || (((v_i - 1) % 15) + 1))
           when v_i % 4 = 1 then pg_temp.commercial_demo_uuid('deal:' || (((v_i - 1) % 25) + 1))
           when v_i % 4 = 2 then pg_temp.commercial_demo_uuid('lease:' || (((v_i - 1) % 20) + 1))
           else pg_temp.commercial_demo_uuid('requirement:' || (((v_i - 1) % 30) + 1)) end,
      'Commercial demo document ' || lpad(v_i::text, 2, '0'),
      case when v_i % 4 = 0 then 'property_pack' when v_i % 4 = 1 then 'proposal' when v_i % 4 = 2 then 'signed_lease_agreement' else 'tenant_brief' end,
      (array['uploaded', 'under_review', 'approved', 'completed'])[((v_i - 1) % 4) + 1],
      'Commercial MVP demo seed',
      'commercial-demo-' || lpad(v_i::text, 2, '0') || '.pdf',
      'commercial/demo/commercial-demo-' || lpad(v_i::text, 2, '0') || '.pdf',
      'documents',
      124000 + (v_i * 900),
      'application/pdf',
      v_user_id,
      v_now - ((v_i % 20) || ' days')::interval,
      v_user_id, v_user_id,
      v_now - ((v_i % 20) || ' days')::interval, v_now - ((v_i % 8) || ' hours')::interval
    );
  end loop;

  for v_i in 1..30 loop
    insert into public.commercial_document_requests (
      id, organisation_id, entity_type, entity_id, document_name, category, requested_from, due_date, notes, status, created_by, updated_by, created_at, updated_at
    )
    values (
      pg_temp.commercial_demo_uuid('document-request:' || v_i), v_org_id,
      case when v_i % 3 = 0 then 'commercial_deal' when v_i % 3 = 1 then 'commercial_requirement' else 'commercial_lease' end,
      case when v_i % 3 = 0 then pg_temp.commercial_demo_uuid('deal:' || (((v_i - 1) % 25) + 1))
           when v_i % 3 = 1 then pg_temp.commercial_demo_uuid('requirement:' || (((v_i - 1) % 30) + 1))
           else pg_temp.commercial_demo_uuid('lease:' || (((v_i - 1) % 20) + 1)) end,
      'Commercial requested document ' || lpad(v_i::text, 2, '0'),
      case when v_i % 3 = 0 then 'landlord_approval' when v_i % 3 = 1 then 'financial_qualification' else 'deposit_proof' end,
      case when v_i % 2 = 0 then 'Tenant' else 'Landlord' end,
      (v_now + ((v_i - 10) || ' days')::interval)::date,
      'Commercial MVP demo seed',
      case when v_i in (1, 2, 3, 4) then 'requested' when v_i % 5 = 0 then 'under_review' else 'completed' end,
      v_user_id, v_user_id,
      v_now - ((v_i % 12) || ' days')::interval, v_now - ((v_i % 6) || ' hours')::interval
    );
  end loop;

  for v_i in 1..80 loop
    insert into public.commercial_activity (
      id, organisation_id, entity_type, entity_id, activity_type, title, body, metadata, created_by, created_at
    )
    values (
      pg_temp.commercial_demo_uuid('activity:' || v_i), v_org_id,
      case when v_i % 4 = 0 then 'commercial_property' when v_i % 4 = 1 then 'commercial_requirement' when v_i % 4 = 2 then 'commercial_deal' else 'commercial_lease' end,
      case when v_i % 4 = 0 then pg_temp.commercial_demo_uuid('property:' || (((v_i - 1) % 15) + 1))
           when v_i % 4 = 1 then pg_temp.commercial_demo_uuid('requirement:' || (((v_i - 1) % 30) + 1))
           when v_i % 4 = 2 then pg_temp.commercial_demo_uuid('deal:' || (((v_i - 1) % 25) + 1))
           else pg_temp.commercial_demo_uuid('lease:' || (((v_i - 1) % 20) + 1)) end,
      (array['note_added', 'stage_changed', 'document_uploaded', 'record_updated'])[((v_i - 1) % 4) + 1],
      (array['Broker note added', 'Stage changed', 'Document uploaded', 'Commercial record updated'])[((v_i - 1) % 4) + 1],
      'Commercial MVP demo activity event ' || v_i || '.',
      jsonb_build_object('seed', 'commercial_mvp_demo', 'sequence', v_i),
      v_user_id,
      v_now - ((v_i % 24) || ' hours')::interval
    );
  end loop;

  raise notice 'Commercial MVP demo seed complete for organisation %. landlords 20, tenants 24, properties 15, vacancies 45, requirements 30, deals 25, HOTs 15, leases 20.', v_org_id;
end $$;

commit;
