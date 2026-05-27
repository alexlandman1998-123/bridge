begin;

create extension if not exists "pgcrypto";

-- Demo seeds are often run manually against staging/demo databases that may be
-- a migration or two behind the current app bundle. Keep this script
-- self-healing for the runtime fields the principal dashboard selects.
alter table if exists public.leads
  add column if not exists branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists created_by uuid,
  add column if not exists assigned_agent_email text,
  add column if not exists converted_transaction_id uuid,
  add column if not exists converted_at timestamptz,
  add column if not exists estimated_value numeric,
  add column if not exists seller_onboarding_status text not null default 'not_started',
  add column if not exists mandate_packet_id uuid,
  add column if not exists listing_id uuid;

alter table if exists public.transactions
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists lifecycle_state text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz,
  add column if not exists bond_workspace_id uuid,
  add column if not exists bond_region_id uuid,
  add column if not exists bond_workspace_unit_id uuid,
  add column if not exists primary_bond_consultant_user_id uuid,
  add column if not exists assigned_bond_processor_user_id uuid,
  add column if not exists assigned_bond_manager_user_id uuid,
  add column if not exists assigned_bond_compliance_user_id uuid,
  add column if not exists bond_assignment_status text,
  add column if not exists bond_assignment_source text,
  add column if not exists finance_status text,
  add column if not exists compliance_status text,
  add column if not exists compliance_review_required boolean not null default false,
  add column if not exists application_prepared boolean not null default false,
  add column if not exists submitted_to_banks boolean not null default false,
  add column if not exists documents_complete boolean not null default false,
  add column if not exists finance_documents_complete boolean not null default false,
  add column if not exists documents_missing boolean not null default false,
  add column if not exists required_documents_missing boolean not null default false,
  add column if not exists finance_documents_missing boolean not null default false,
  add column if not exists missing_documents_count integer not null default 0,
  add column if not exists uploaded_documents_count integer not null default 0,
  add column if not exists total_required_documents integer not null default 0,
  add column if not exists bank_feedback_pending boolean not null default false,
  add column if not exists bank_feedback_status text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists finance_due_at timestamptz,
  add column if not exists processor_name text,
  add column if not exists assigned_bond_processor_name text,
  add column if not exists compliance_name text,
  add column if not exists gross_commission_percentage numeric,
  add column if not exists gross_commission_amount numeric,
  add column if not exists agent_split_percentage_snapshot numeric,
  add column if not exists agency_split_percentage_snapshot numeric,
  add column if not exists agent_commission_amount numeric,
  add column if not exists agency_commission_amount numeric;

create or replace function pg_temp.bridge9_demo_uuid(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5('bridge9-principal-demo:' || p_key), 1, 8) || '-' ||
    substr(md5('bridge9-principal-demo:' || p_key), 9, 4) || '-4' ||
    substr(md5('bridge9-principal-demo:' || p_key), 14, 3) || '-a' ||
    substr(md5('bridge9-principal-demo:' || p_key), 18, 3) || '-' ||
    substr(md5('bridge9-principal-demo:' || p_key), 21, 12)
  )::uuid
$$;

create temporary table bridge9_demo_staff (
  sort_order integer primary key,
  email text not null,
  full_name text not null,
  workspace_role text not null,
  profile_role text not null default 'agent',
  phone text not null,
  branch_key text not null
) on commit drop;

insert into bridge9_demo_staff (sort_order, email, full_name, workspace_role, profile_role, phone, branch_key)
values
  (1, 'principal.demo@bridgenine.co.za', 'Maya Pillay', 'principal', 'agent', '+27 82 440 1001', 'hq'),
  (2, 'lerato.mokoena@bridgenine.co.za', 'Lerato Mokoena', 'agent', 'agent', '+27 82 440 1002', 'hq'),
  (3, 'daniel.vandermerwe@bridgenine.co.za', 'Daniel van der Merwe', 'agent', 'agent', '+27 82 440 1003', 'pretoria'),
  (4, 'aisha.patel@bridgenine.co.za', 'Aisha Patel', 'agent', 'agent', '+27 82 440 1004', 'waterfall'),
  (5, 'thabo.ndlovu@bridgenine.co.za', 'Thabo Ndlovu', 'agent', 'agent', '+27 82 440 1005', 'pretoria'),
  (6, 'bianca.meyer@bridgenine.co.za', 'Bianca Meyer', 'agent', 'agent', '+27 82 440 1006', 'hq'),
  (7, 'zanele.mabaso@bridgenine.co.za', 'Zanele Mabaso', 'agent', 'agent', '+27 82 440 1007', 'east-rand'),
  (8, 'nandi.khumalo@bridgenine.co.za', 'Nandi Khumalo', 'admin', 'agent', '+27 82 440 1008', 'hq'),
  (9, 'keagan.botha@bridgenine.co.za', 'Keagan Botha', 'admin', 'agent', '+27 82 440 1009', 'waterfall'),
  (10, 'sihle.dlamini@bridgenine.co.za', 'Sihle Dlamini', 'agent', 'agent', '+27 82 440 1010', 'pretoria')
on conflict (sort_order) do nothing;

do $$
declare
  v_now timestamptz := now();
  v_org_id uuid;
  v_hq_branch_id uuid := pg_temp.bridge9_demo_uuid('branch:hq');
  v_pretoria_branch_id uuid := pg_temp.bridge9_demo_uuid('branch:pretoria');
  v_waterfall_branch_id uuid := pg_temp.bridge9_demo_uuid('branch:waterfall');
  v_east_branch_id uuid := pg_temp.bridge9_demo_uuid('branch:east-rand');
  v_principal_id uuid;
  v_suburbs text[] := array['Waterkloof Ridge', 'Menlyn', 'Midstream Estate', 'Irene', 'Waterfall', 'Kyalami', 'Sandton', 'Morningside', 'Bryanston', 'Boksburg', 'Parkrand', 'Centurion'];
  v_sources text[] := array['Property24', 'Private Property', 'Facebook', 'Website', 'Referral', 'Walk-in', 'WhatsApp'];
  v_buyer_names text[] := array['Nomsa Nkosi', 'Jaco Pretorius', 'Priya Naidoo', 'Michael Sithole', 'Claire Jacobs', 'Sibusiso Mthembu', 'Tanya le Roux', 'Ahmed Khan', 'Nicole de Beer', 'Sipho Dlamini', 'Megan Barnard', 'Karabo Molefe', 'Liam Petersen', 'Anika Swart', 'Farah Moosa', 'Warren Botha'];
  v_seller_names text[] := array['Karen Peters', 'Brandon Jacobs', 'Nadine Swart', 'Thulani Sithole', 'Melissa du Toit', 'Gareth Naidoo', 'Nokuthula Zuma', 'Evan Botha', 'Jenna Williams', 'Andre Venter', 'Lindiwe Khosa', 'Ruan Steyn', 'Sipho Khumalo', 'Marlene Ferreira', 'Aiden Naidoo'];
  v_canvass_statuses text[] := array['New', 'Attempted', 'Follow Up', 'Interested', 'Not Interested', 'Valuation Booked', 'Mandate Pending', 'Converted to Listing'];
  v_lead_statuses text[] := array['New', 'Contacted', 'Viewing Booked', 'Negotiating', 'Lost', 'Converted'];
  v_listing_status text;
  v_requested_listing_status text;
  v_stage text;
  v_main_stage text;
  v_attorney_stage text;
  v_risk_status text;
  v_operational_state text;
  v_lifecycle_state text;
  v_finance_type text;
  v_agent record;
  v_staff record;
  v_i integer;
  v_agent_id uuid;
  v_branch_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_listing_id uuid;
  v_canvassing_id uuid;
  v_tx_id uuid;
  v_buyer_id uuid;
  v_subprocess_id uuid;
  v_price numeric;
  v_budget numeric;
  v_suburb text;
  v_city text;
  v_reference text;
begin
  select o.id
    into v_org_id
  from public.organisations o
  where lower(coalesce(o.company_email, '')) = lower('principal.demo@bridgenine.co.za')
     or lower(o.name) = lower('Bridge9 Realty')
  order by o.created_at desc nulls last
  limit 1;

  v_org_id := coalesce(v_org_id, pg_temp.bridge9_demo_uuid('org:bridge9-realty'));

  -- Repeatability guard: clear only existing Bridge9 demo data before reseeding.
  delete from public.transaction_notifications where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  if to_regclass('public.transaction_readiness_states') is not null then
    delete from public.transaction_readiness_states where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  end if;
  delete from public.transaction_status_links where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.transaction_events where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.transaction_comments where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.document_requests where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.documents where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.transaction_participants where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  delete from public.transaction_subprocess_steps where is_demo_data = true and subprocess_id in (select id from public.transaction_subprocesses where transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true));
  delete from public.transaction_subprocesses where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  if to_regclass('public.transaction_finance_details') is not null then
    delete from public.transaction_finance_details where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  end if;
  if to_regclass('public.transaction_role_players') is not null then
    delete from public.transaction_role_players where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  end if;
  if to_regclass('public.transaction_onboarding') is not null then
    delete from public.transaction_onboarding where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  end if;
  if to_regclass('public.onboarding_form_data') is not null then
    delete from public.onboarding_form_data where is_demo_data = true and transaction_id in (select id from public.transactions where organisation_id = v_org_id and is_demo_data = true);
  end if;
  delete from public.buyers where is_demo_data = true and organisation_id = v_org_id;
  delete from public.transactions where is_demo_data = true and organisation_id = v_org_id;
  delete from public.private_listing_activity where is_demo_data = true and private_listing_id in (select id from public.private_listings where organisation_id = v_org_id and is_demo_data = true);
  delete from public.private_listing_seller_onboarding where is_demo_data = true and private_listing_id in (select id from public.private_listings where organisation_id = v_org_id and is_demo_data = true);
  delete from public.private_listings where is_demo_data = true and organisation_id = v_org_id;
  delete from public.demo_canvassing_activities where is_demo_data = true and organisation_id = v_org_id;
  delete from public.demo_canvassing_records where is_demo_data = true and organisation_id = v_org_id;
  delete from public.canvassing_activities where is_demo_data = true and organisation_id = v_org_id;
  delete from public.canvassing_prospects where is_demo_data = true and organisation_id = v_org_id;
  delete from public.appointments where is_demo_data = true and organisation_id = v_org_id;
  delete from public.tasks where is_demo_data = true and organisation_id = v_org_id;
  delete from public.lead_activities where is_demo_data = true and organisation_id = v_org_id;
  delete from public.leads where is_demo_data = true and organisation_id = v_org_id;
  delete from public.contacts where is_demo_data = true and organisation_id = v_org_id;
  if to_regclass('public.organisation_preferred_partners') is not null then
    delete from public.organisation_preferred_partners where is_demo_data = true and organisation_id = v_org_id;
  end if;
  delete from public.organisation_users where is_demo_data = true and organisation_id = v_org_id;
  delete from public.organisation_branches where is_demo_data = true and organisation_id = v_org_id;
  delete from public.organisation_settings where is_demo_data = true and organisation_id = v_org_id;

  insert into public.organisations (
    id, name, display_name, company_email, company_phone, website, address_line_1, city, province, country,
    support_email, support_phone, primary_contact_person, is_demo_data, created_at, updated_at
  )
  values (
    v_org_id, 'Bridge9 Realty', 'Bridge9 Realty', 'principal.demo@bridgenine.co.za', '+27 12 555 0199',
    'https://bridgenine.co.za', 'Suite 4, Bridge9 House, 138 West Street', 'Sandton', 'Gauteng', 'South Africa',
    'support.demo@bridgenine.co.za', '+27 12 555 0198', 'Maya Pillay', true, v_now - interval '190 days', v_now
  )
  on conflict (id) do update set
    name = excluded.name,
    display_name = excluded.display_name,
    company_email = excluded.company_email,
    company_phone = excluded.company_phone,
    website = excluded.website,
    address_line_1 = excluded.address_line_1,
    city = excluded.city,
    province = excluded.province,
    primary_contact_person = excluded.primary_contact_person,
    is_demo_data = true,
    updated_at = excluded.updated_at;

  insert into public.organisation_settings (organisation_id, settings_json, is_demo_data, created_at, updated_at)
  values (
    v_org_id,
    jsonb_build_object(
      'onboardingRules', jsonb_build_object('enableEmploymentTypeForBond', true, 'allowHybridFinance', true, 'allowTrustOnboarding', true, 'allowCompanyOnboarding', true),
      'workflowDefaults', jsonb_build_object('financeWorkflowEnabled', true, 'transferWorkflowEnabled', true, 'closeOutWorkflowEnabled', true, 'handoverWorkflowEnabledAfterRegistration', true),
      'automationSettings', jsonb_build_object('autoNotifyOnWorkflowStageChange', false, 'autoCreateDocumentRequirements', true, 'autoLockOnboardingAfterClientSubmission', true, 'allowInternalOnboardingEdits', true),
      'demoProtection', jsonb_build_object('disableEmails', true, 'disableWhatsAppSends', true, 'disableWebhookPushes', true, 'disableExternalIntegrations', true, 'disableLiveNotifications', true),
      'organisationHierarchy', jsonb_build_object('branchesEnabled', true, 'reportingMode', 'branch_hierarchy', 'visibilityMode', 'role_based'),
      'commissionStructures', jsonb_build_array(
        jsonb_build_object('name', 'Principal split', 'agentSplitPercent', 55, 'agencySplitPercent', 45),
        jsonb_build_object('name', 'Senior agent accelerator', 'agentSplitPercent', 65, 'agencySplitPercent', 35)
      )
    ),
    true,
    v_now - interval '190 days',
    v_now
  )
  on conflict (organisation_id) do update set
    settings_json = excluded.settings_json,
    is_demo_data = true,
    updated_at = excluded.updated_at;

  insert into public.organisation_branches (id, organisation_id, name, location, manager_name, agent_count, is_head_office, is_active, metadata_json, is_demo_data, created_at, updated_at)
  values
    (v_hq_branch_id, v_org_id, 'Bridge9 Sandton HQ', 'Sandton', 'Maya Pillay', 4, true, true, '{"territory":"Sandton, Bryanston, Morningside"}', true, v_now - interval '185 days', v_now),
    (v_pretoria_branch_id, v_org_id, 'Pretoria & Centurion Office', 'Pretoria East', 'Daniel van der Merwe', 3, false, true, '{"territory":"Pretoria, Centurion, Irene, Midstream"}', true, v_now - interval '170 days', v_now),
    (v_waterfall_branch_id, v_org_id, 'Waterfall Desk', 'Waterfall', 'Aisha Patel', 2, false, true, '{"territory":"Waterfall, Kyalami, Midrand"}', true, v_now - interval '145 days', v_now),
    (v_east_branch_id, v_org_id, 'East Rand Desk', 'Boksburg', 'Zanele Mabaso', 1, false, true, '{"territory":"Boksburg, Parkrand, Beyers Park"}', true, v_now - interval '120 days', v_now)
  on conflict (id) do update set
    name = excluded.name,
    location = excluded.location,
    manager_name = excluded.manager_name,
    agent_count = excluded.agent_count,
    is_active = true,
    metadata_json = excluded.metadata_json,
    is_demo_data = true,
    updated_at = excluded.updated_at;

  for v_staff in select * from bridge9_demo_staff order by sort_order loop
    select p.id
      into v_agent_id
    from public.profiles p
    where lower(p.email) = lower(v_staff.email)
    limit 1;

    if v_agent_id is null then
      select au.id
        into v_agent_id
      from auth.users au
      where lower(au.email) = lower(v_staff.email)
      limit 1;
    end if;

    v_agent_id := coalesce(v_agent_id, pg_temp.bridge9_demo_uuid('user:' || lower(v_staff.email)));
    v_branch_id := case v_staff.branch_key
      when 'hq' then v_hq_branch_id
      when 'pretoria' then v_pretoria_branch_id
      when 'waterfall' then v_waterfall_branch_id
      else v_east_branch_id
    end;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_agent_id,
      'authenticated',
      'authenticated',
      lower(v_staff.email),
      crypt('Bridge9Demo!2026', gen_salt('bf')),
      v_now - interval '180 days',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_staff.full_name, 'demo_persona', 'bridge9_principal_demo'),
      v_now - interval '180 days',
      v_now
    )
    on conflict (id) do update set
      email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = excluded.updated_at;

    insert into public.profiles (id, email, full_name, first_name, last_name, company_name, phone_number, role, firm_role, onboarding_completed, created_at, updated_at)
    values (
      v_agent_id,
      lower(v_staff.email),
      v_staff.full_name,
      split_part(v_staff.full_name, ' ', 1),
      nullif(regexp_replace(v_staff.full_name, '^[^ ]+ ?', ''), ''),
      'Bridge9 Realty',
      v_staff.phone,
      v_staff.profile_role,
      'agent',
      true,
      v_now - interval '180 days',
      v_now
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      company_name = excluded.company_name,
      phone_number = excluded.phone_number,
      role = excluded.role,
      onboarding_completed = true,
      updated_at = excluded.updated_at;

    insert into public.organisation_users (
      organisation_id, user_id, branch_id, first_name, last_name, email, role, status, permissions_json,
      accepted_at, joined_at, last_active_at, is_demo_data, created_at, updated_at
    )
    values (
      v_org_id,
      v_agent_id,
      v_branch_id,
      split_part(v_staff.full_name, ' ', 1),
      nullif(regexp_replace(v_staff.full_name, '^[^ ]+ ?', ''), ''),
      lower(v_staff.email),
      v_staff.workspace_role,
      'active',
      jsonb_build_object('demoPersona', true, 'scope', case when v_staff.workspace_role = 'principal' then 'all_branches' else 'assigned_branch' end),
      v_now - interval '175 days',
      v_now - interval '175 days',
      v_now - ((v_staff.sort_order || ' hours')::interval),
      true,
      v_now - interval '175 days',
      v_now
    )
    on conflict (organisation_id, email) do update set
      user_id = excluded.user_id,
      branch_id = excluded.branch_id,
      role = excluded.role,
      status = 'active',
      permissions_json = excluded.permissions_json,
      last_active_at = excluded.last_active_at,
      is_demo_data = true,
      updated_at = excluded.updated_at;
  end loop;

  select p.id
    into v_principal_id
  from public.profiles p
  where lower(p.email) = lower('principal.demo@bridgenine.co.za')
  limit 1;

  if v_principal_id is null then
    raise exception 'Bridge9 principal demo seed aborted: profile principal.demo@bridgenine.co.za was not found after demo user setup.';
  end if;

  insert into public.organisation_preferred_partners (organisation_id, partner_type, company_name, contact_person, email_address, phone_number, website, physical_address, province, notes, is_active, is_preferred_default, is_demo_data, created_at, updated_at)
  values
    (v_org_id, 'bond_originator', 'Aurum Bond Originators', 'Rene van Zyl', 'rene@aurumbonds.co.za', '+27 11 555 0310', 'https://aurumbonds.co.za', 'Waterfall Corporate Campus, Midrand', 'Gauteng', 'Demo partner. External submissions disabled for Bridge9 demo org.', true, true, true, v_now - interval '160 days', v_now),
    (v_org_id, 'transfer_attorney', 'Tuckers Inc Conveyancers', 'Claire Hendricks', 'claire@tuckers-demo.co.za', '+27 12 555 0320', 'https://tuckers-demo.co.za', 'Brooklyn Bridge Office Park, Pretoria', 'Gauteng', 'Preferred transfer attorney for demo matters.', true, true, true, v_now - interval '160 days', v_now),
    (v_org_id, 'bond_attorney', 'Meyer & Partners Bond Attorneys', 'Wikus Meyer', 'wikus@meyerpartners-demo.co.za', '+27 11 555 0330', 'https://meyerpartners-demo.co.za', 'Alice Lane, Sandton', 'Gauteng', 'Preferred bond attorney for demo matters.', true, true, true, v_now - interval '160 days', v_now);

  for v_i in 1..120 loop
    select p.id, p.email, p.full_name
      into v_agent
    from public.profiles p
    join bridge9_demo_staff s on lower(s.email) = lower(p.email)
    where s.workspace_role = 'agent'
    order by s.sort_order
    offset ((v_i - 1) % 7)
    limit 1;

    v_suburb := v_suburbs[((v_i - 1) % array_length(v_suburbs, 1)) + 1];
    v_contact_id := pg_temp.bridge9_demo_uuid('canvassing-contact:' || v_i);
    v_lead_id := pg_temp.bridge9_demo_uuid('canvassing-lead:' || v_i);
    v_canvassing_id := pg_temp.bridge9_demo_uuid('canvassing-record:' || v_i);
    v_price := 950000 + (v_i * 43500) + ((v_i % 9) * 125000);

    insert into public.contacts (contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, is_demo_data, demo_metadata, created_at, updated_at)
    values (
      v_contact_id,
      v_org_id,
      v_agent.id,
      split_part(v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], ' ', 1),
      nullif(regexp_replace(v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], '^[^ ]+ ?', ''), ''),
      '+27 82 ' || lpad((5000000 + v_i)::text, 7, '0'),
      'seller' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      'seller',
      'Canvassing prospect for ' || v_suburb || '.',
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo', 'canvassingRecordId', v_canvassing_id),
      v_now - ((150 - (v_i % 145)) || ' days')::interval,
      v_now - ((v_i % 21) || ' days')::interval
    );

    insert into public.leads (lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, estimated_value, area_interest, seller_property_address, notes, is_demo_data, lead_score, demo_metadata, created_at, updated_at)
    values (
      v_lead_id,
      v_org_id,
      v_agent.id,
      v_contact_id,
      'Seller',
      'Outbound',
      'Canvassing',
      case v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1]
        when 'Converted to Listing' then 'Converted To Listing'
        when 'Mandate Pending' then 'Mandate Ready'
        when 'Valuation Booked' then 'Appointment Scheduled'
        when 'Interested' then 'Qualified'
        when 'Not Interested' then 'Lost'
        else 'Lead'
      end,
      v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1],
      case when v_i % 8 in (4, 5, 6, 7) then 'High' else 'Medium' end,
      v_price,
      v_suburb,
      (18 + v_i) || ' ' || v_suburb || ' Drive',
      'Seller personality: ' || (array['Analytical and detail-heavy', 'Time-poor executive', 'Warm referral-led seller', 'Price-sensitive investor', 'Elderly owner, family involved'])[((v_i - 1) % 5) + 1] || '. Timeline: ' || (array['ready this month', '60 to 90 days', 'after school term', 'waiting for bank settlement', 'open to valuation first'])[((v_i - 1) % 5) + 1] || '.',
      true,
      42 + (v_i % 55),
      jsonb_build_object('seed', 'bridge9_principal_demo', 'canvassingStatus', v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1]),
      v_now - ((150 - (v_i % 145)) || ' days')::interval,
      v_now - ((v_i % 21) || ' days')::interval
    );

    insert into public.demo_canvassing_records (id, organisation_id, linked_lead_id, assigned_agent_id, prospect_name, prospect_email, prospect_phone, prospect_type, suburb, address_line_1, estimated_value, status, seller_personality, intended_timeline, canvassing_method, last_contact_at, next_follow_up_at, notes, is_demo_data, demo_metadata, created_at, updated_at)
    values (
      v_canvassing_id,
      v_org_id,
      v_lead_id,
      v_agent.id,
      v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1],
      'seller' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      '+27 82 ' || lpad((5000000 + v_i)::text, 7, '0'),
      'Seller',
      v_suburb,
      (18 + v_i) || ' ' || v_suburb || ' Drive',
      v_price,
      v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1],
      (array['Analytical and detail-heavy', 'Time-poor executive', 'Warm referral-led seller', 'Price-sensitive investor', 'Elderly owner, family involved'])[((v_i - 1) % 5) + 1],
      (array['ready this month', '60 to 90 days', 'after school term', 'waiting for bank settlement', 'open to valuation first'])[((v_i - 1) % 5) + 1],
      (array['Cold Call', 'Door Knock', 'Referral Follow-up', 'Area Prospecting', 'WhatsApp Outreach'])[((v_i - 1) % 5) + 1],
      v_now - ((v_i % 32) || ' days')::interval,
      case when v_i % 4 = 0 then v_now + ((v_i % 10) || ' days')::interval else null end,
      'Owner responded to local Bridge9 activity. Keep communication concise and value-led.',
      true,
      jsonb_build_object('estimatedCommission', round(v_price * 0.035, 2)),
      v_now - ((150 - (v_i % 145)) || ' days')::interval,
      v_now - ((v_i % 21) || ' days')::interval
    );

    insert into public.canvassing_prospects (
      id, organisation_id, assigned_agent_id, assigned_user_id, assigned_agent_name, assigned_agent_email,
      first_name, last_name, phone, email, prospect_type, area, property_type, canvassing_method, status,
      next_follow_up_date, follow_up_priority, follow_up_note, estimated_value, notes, converted_lead_id, converted_at,
      created_by, is_demo_data, demo_metadata, created_at, updated_at
    )
    values (
      v_canvassing_id,
      v_org_id,
      v_agent.id,
      v_agent.id,
      v_agent.full_name,
      v_agent.email,
      split_part(v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], ' ', 1),
      nullif(regexp_replace(v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], '^[^ ]+ ?', ''), ''),
      '+27 82 ' || lpad((5000000 + v_i)::text, 7, '0'),
      'seller' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      'Seller Prospect',
      v_suburb,
      case when v_i % 3 = 0 then 'House' when v_i % 3 = 1 then 'Apartment' else 'Townhouse' end,
      (array['Cold Call', 'Door Knock', 'Referral Follow-Up', 'Area Farming', 'WhatsApp Outreach'])[((v_i - 1) % 5) + 1],
      case v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1]
        when 'Attempted' then 'Contacted'
        when 'Follow Up' then 'Follow-Up Later'
        when 'Mandate Pending' then 'Interested'
        when 'Valuation Booked' then 'Interested'
        when 'Converted to Listing' then 'Converted to Lead'
        else v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1]
      end,
      case when v_i % 4 = 0 then (v_now + ((v_i % 10) || ' days')::interval)::date else null end,
      case when v_i % 8 in (4, 5, 6, 7) then 'High' else 'Medium' end,
      case when v_i % 4 = 0 then 'Book valuation follow-up and prepare CMA.' else null end,
      v_price,
      'Seller personality: ' || (array['Analytical and detail-heavy', 'Time-poor executive', 'Warm referral-led seller', 'Price-sensitive investor', 'Elderly owner, family involved'])[((v_i - 1) % 5) + 1] || '. Timeline: ' || (array['ready this month', '60 to 90 days', 'after school term', 'waiting for bank settlement', 'open to valuation first'])[((v_i - 1) % 5) + 1] || '.',
      case when v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1] = 'Converted to Listing' then v_lead_id else null end,
      case when v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1] = 'Converted to Listing' then v_now - ((v_i % 21) || ' days')::interval else null end,
      v_agent.id,
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo', 'legacyStatus', v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1], 'estimatedCommission', round(v_price * 0.035, 2)),
      v_now - ((150 - (v_i % 145)) || ' days')::interval,
      v_now - ((v_i % 21) || ' days')::interval
    );

    insert into public.demo_canvassing_activities (id, canvassing_record_id, organisation_id, agent_id, activity_type, activity_note, outcome, activity_date, is_demo_data)
    values
      (pg_temp.bridge9_demo_uuid('canvassing-activity-a:' || v_i), v_canvassing_id, v_org_id, v_agent.id, (array['Call', 'Door Knock', 'WhatsApp', 'Email'])[((v_i - 1) % 4) + 1], 'Initial canvassing touchpoint logged from area campaign.', 'Contact captured', v_now - ((v_i % 35) || ' days')::interval, true),
      (pg_temp.bridge9_demo_uuid('canvassing-activity-b:' || v_i), v_canvassing_id, v_org_id, v_agent.id, 'Follow-up', 'Follow-up note: valuation appetite and timing confirmed.', v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1], v_now - ((v_i % 18) || ' days')::interval, true);

    insert into public.canvassing_activities (id, prospect_id, organisation_id, agent_id, agent_name, activity_type, activity_note, outcome, activity_date, created_by, is_demo_data, demo_metadata, created_at)
    values
      (pg_temp.bridge9_demo_uuid('canvassing-activity-a:' || v_i), v_canvassing_id, v_org_id, v_agent.id, v_agent.full_name, (array['Call', 'Door Knock', 'WhatsApp', 'Email'])[((v_i - 1) % 4) + 1], 'Initial canvassing touchpoint logged from area campaign.', 'Contact captured', v_now - ((v_i % 35) || ' days')::interval, v_agent.id, true, jsonb_build_object('seed', 'bridge9_principal_demo'), v_now - ((v_i % 35) || ' days')::interval),
      (pg_temp.bridge9_demo_uuid('canvassing-activity-b:' || v_i), v_canvassing_id, v_org_id, v_agent.id, v_agent.full_name, 'Follow-Up', 'Follow-up note: valuation appetite and timing confirmed.', v_canvass_statuses[((v_i - 1) % array_length(v_canvass_statuses, 1)) + 1], v_now - ((v_i % 18) || ' days')::interval, v_agent.id, true, jsonb_build_object('seed', 'bridge9_principal_demo'), v_now - ((v_i % 18) || ' days')::interval);
  end loop;

  for v_i in 1..160 loop
    select p.id, p.email, p.full_name
      into v_agent
    from public.profiles p
    join bridge9_demo_staff s on lower(s.email) = lower(p.email)
    where s.workspace_role = 'agent'
    order by s.sort_order
    offset ((v_i - 1) % 7)
    limit 1;

    v_suburb := v_suburbs[((v_i - 1) % array_length(v_suburbs, 1)) + 1];
    v_contact_id := pg_temp.bridge9_demo_uuid('buyer-contact:' || v_i);
    v_lead_id := pg_temp.bridge9_demo_uuid('buyer-lead:' || v_i);
    v_budget := 850000 + (v_i * 37500) + ((v_i % 11) * 95000);
    v_finance_type := case when v_i % 10 in (0, 1, 2) then 'cash' when v_i % 10 = 3 then 'hybrid' else 'bond' end;

    insert into public.contacts (contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, is_demo_data, demo_metadata, created_at, updated_at)
    values (
      v_contact_id,
      v_org_id,
      v_agent.id,
      split_part(v_buyer_names[((v_i - 1) % array_length(v_buyer_names, 1)) + 1], ' ', 1),
      nullif(regexp_replace(v_buyer_names[((v_i - 1) % array_length(v_buyer_names, 1)) + 1], '^[^ ]+ ?', ''), ''),
      '+27 83 ' || lpad((6000000 + v_i)::text, 7, '0'),
      'buyer' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      'buyer',
      'Buyer lead sourced via ' || v_sources[((v_i - 1) % array_length(v_sources, 1)) + 1] || '.',
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo'),
      v_now - ((175 - (v_i % 170)) || ' days')::interval,
      v_now - ((v_i % 28) || ' days')::interval
    );

    insert into public.leads (lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, min_budget, area_interest, property_interest, notes, is_demo_data, lead_score, finance_type, preferred_suburbs, demo_metadata, created_at, updated_at)
    values (
      v_lead_id,
      v_org_id,
      v_agent.id,
      v_contact_id,
      'Buyer',
      'Inbound',
      v_sources[((v_i - 1) % array_length(v_sources, 1)) + 1],
      v_lead_statuses[((v_i - 1) % array_length(v_lead_statuses, 1)) + 1],
      v_lead_statuses[((v_i - 1) % array_length(v_lead_statuses, 1)) + 1],
      case when v_i % 9 in (0, 1) then 'Urgent' when v_i % 4 = 0 then 'High' else 'Medium' end,
      v_budget,
      greatest(v_budget - 450000, 600000),
      v_suburb,
      (2 + (v_i % 4)) || ' bed ' || case when v_i % 3 = 0 then 'freehold home' else 'sectional title apartment' end,
      'Finance: ' || v_finance_type || '. Preferred suburbs: ' || v_suburb || ', ' || v_suburbs[(v_i % array_length(v_suburbs, 1)) + 1] || '. Lead score reflects affordability, urgency and engagement.',
      true,
      38 + (v_i % 61),
      v_finance_type,
      array[v_suburb, v_suburbs[(v_i % array_length(v_suburbs, 1)) + 1]],
      jsonb_build_object('seed', 'bridge9_principal_demo', 'affordabilityRange', jsonb_build_object('min', greatest(v_budget - 450000, 600000), 'max', v_budget), 'cashBuyer', v_finance_type = 'cash'),
      v_now - ((175 - (v_i % 170)) || ' days')::interval,
      v_now - ((v_i % 28) || ' days')::interval
    );

    insert into public.lead_activities (activity_id, organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome, is_demo_data, demo_metadata, created_at)
    values
      (pg_temp.bridge9_demo_uuid('buyer-activity-a:' || v_i), v_org_id, v_lead_id, v_agent.id, (array['WhatsApp', 'Call', 'Email', 'Viewing'])[((v_i - 1) % 4) + 1], 'Buyer qualification completed. Affordability and preferred suburbs captured.', v_now - ((v_i % 30) || ' days')::interval, 'Qualified', true, jsonb_build_object('seed', 'bridge9_principal_demo'), v_now - ((v_i % 30) || ' days')::interval),
      (pg_temp.bridge9_demo_uuid('buyer-activity-b:' || v_i), v_org_id, v_lead_id, v_agent.id, 'Follow-up', 'Next step confirmed: send shortlist and viewing slots.', v_now - ((v_i % 14) || ' days')::interval, 'Follow-up set', true, jsonb_build_object('seed', 'bridge9_principal_demo'), v_now - ((v_i % 14) || ' days')::interval);
  end loop;

  for v_i in 1..45 loop
    select p.id, p.email, p.full_name
      into v_agent
    from public.profiles p
    join bridge9_demo_staff s on lower(s.email) = lower(p.email)
    where s.workspace_role = 'agent'
    order by s.sort_order
    offset ((v_i - 1) % 7)
    limit 1;

    v_listing_id := pg_temp.bridge9_demo_uuid('listing:' || v_i);
    v_lead_id := pg_temp.bridge9_demo_uuid('canvassing-lead:' || ((v_i - 1) % 120 + 1));
    v_suburb := v_suburbs[((v_i - 1) % array_length(v_suburbs, 1)) + 1];
    v_price := 1100000 + (v_i * 82000) + ((v_i % 7) * 145000);
    v_listing_status := case
      when v_i <= 20 then 'active'
      when v_i <= 26 then 'under_offer'
      when v_i <= 31 then 'transaction_created'
      when v_i <= 40 then 'sold'
      else 'withdrawn'
    end;
    v_requested_listing_status := case
      when v_i <= 20 then 'Active'
      when v_i <= 26 then 'Under Offer'
      when v_i <= 31 then 'Pending OTP'
      when v_i <= 36 then 'Sold'
      when v_i <= 40 then 'Registered'
      else 'Withdrawn'
    end;

    insert into public.private_listings (
      id, organisation_id, assigned_agent_id, originating_crm_lead_id, listing_reference, listing_status, listing_visibility,
      property_type, listing_category, title, description, asking_price, estimated_value, address_line_1, suburb, city, province, postal_code,
      seller_type, finance_context, mandate_type, mandate_status, seller_onboarding_status, is_active, created_by,
      bedrooms, bathrooms, erf_size_sqm, floor_size_sqm, levy_amount, rates_amount, view_count, enquiry_count, listing_age_days, bridge_listing_status,
      is_demo_data, demo_metadata, created_at, updated_at
    )
    values (
      v_listing_id,
      v_org_id,
      v_agent.id,
      v_lead_id::text,
      'B9-LST-' || lpad(v_i::text, 3, '0'),
      v_listing_status,
      case when v_listing_status in ('active', 'under_offer', 'transaction_created') then 'active_market' else 'archived' end,
      case when v_i % 4 = 0 then 'Freehold' when v_i % 4 = 1 then 'Sectional Title' when v_i % 4 = 2 then 'Residential Sales' else 'New Development' end,
      'Residential Sales',
      (2 + (v_i % 4)) || ' Bedroom ' || case when v_i % 3 = 0 then 'Freehold Home' else 'Sectional Title Apartment' end || ' in ' || v_suburb,
      'Professionally staged Bridge9 demo listing with verified seller onboarding, mandate history, enquiry metrics and linked transaction readiness.',
      v_price,
      v_price * 0.98,
      (30 + v_i) || ' ' || v_suburb || ' Avenue',
      v_suburb,
      case when v_suburb in ('Waterkloof Ridge', 'Menlyn') then 'Pretoria' when v_suburb in ('Boksburg', 'Parkrand') then 'Boksburg' else 'Johannesburg' end,
      'Gauteng',
      '2001',
      case when v_i % 6 = 0 then 'Trust' when v_i % 5 = 0 then 'Company' else 'Individual' end,
      case when v_i % 5 = 0 then 'Existing bond with settlement required' else 'Rates and levy clearance ready' end,
      case when v_i % 3 = 0 then 'Sole Mandate' else 'Open Mandate' end,
      case when v_listing_status = 'withdrawn' then 'expired' else 'signed' end,
      'completed',
      v_listing_status in ('active', 'under_offer', 'transaction_created'),
      v_agent.id,
      2 + (v_i % 4),
      1 + ((v_i % 4)::numeric * 0.5),
      case when v_i % 4 = 0 then 520 + (v_i * 17) else null end,
      68 + (v_i * 4),
      case when v_i % 4 = 1 then 1650 + (v_i * 28) else 0 end,
      780 + (v_i * 19),
      6 + (v_i * 3),
      2 + (v_i * 2),
      8 + (v_i % 90),
      case when v_listing_status in ('active', 'under_offer', 'transaction_created') then 'published' when v_listing_status = 'withdrawn' then 'removed' else 'paused' end,
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo', 'requestedStatus', v_requested_listing_status, 'listingMix', case when v_i % 3 = 0 then 'Sole mandate' else 'Open mandate' end),
      v_now - ((8 + (v_i % 120)) || ' days')::interval,
      v_now - ((v_i % 20) || ' days')::interval
    );

    insert into public.private_listing_seller_onboarding (id, private_listing_id, token, token_expires_at, seller_type, ownership_structure, marital_regime, form_data, status, submitted_at, is_demo_data, created_at, updated_at)
    values (
      pg_temp.bridge9_demo_uuid('listing-onboarding:' || v_i),
      v_listing_id,
      'seller_demo_' || lpad(v_i::text, 3, '0'),
      v_now + interval '120 days',
      case when v_i % 6 = 0 then 'Trust' when v_i % 5 = 0 then 'Company' else 'Individual' end,
      case when v_i % 6 = 0 then 'Trust' when v_i % 5 = 0 then 'Company' else 'Single Owner' end,
      case when v_i % 4 = 0 then 'Married ANC' else 'Not Applicable' end,
      jsonb_build_object('sellerName', v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], 'ratesAccount', 'City of Tshwane / CoJ current', 'mandateSigned', true),
      'completed',
      v_now - ((v_i % 35) || ' days')::interval,
      true,
      v_now - ((45 + (v_i % 70)) || ' days')::interval,
      v_now - ((v_i % 20) || ' days')::interval
    );

    insert into public.private_listing_activity (id, private_listing_id, activity_type, activity_title, activity_description, performed_by, visibility, metadata, is_demo_data, created_at)
    values
      (pg_temp.bridge9_demo_uuid('listing-activity-a:' || v_i), v_listing_id, 'mandate_signed', 'Mandate signed', 'Seller mandate completed and filed for demo listing.', v_agent.id, 'shared', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - ((v_i % 45) || ' days')::interval),
      (pg_temp.bridge9_demo_uuid('listing-activity-b:' || v_i), v_listing_id, 'listing_status_changed', v_requested_listing_status, 'Listing moved to ' || v_requested_listing_status || ' after latest workflow update.', v_agent.id, 'internal', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - ((v_i % 18) || ' days')::interval);
  end loop;

  for v_i in 1..22 loop
    select p.id, p.email, p.full_name
      into v_agent
    from public.profiles p
    join bridge9_demo_staff s on lower(s.email) = lower(p.email)
    where s.workspace_role = 'agent'
    order by s.sort_order
    offset ((v_i - 1) % 7)
    limit 1;

    v_tx_id := pg_temp.bridge9_demo_uuid('transaction:' || v_i);
    v_buyer_id := pg_temp.bridge9_demo_uuid('buyer:' || v_i);
    v_lead_id := pg_temp.bridge9_demo_uuid('buyer-lead:' || v_i);
    v_listing_id := pg_temp.bridge9_demo_uuid('listing:' || v_i);
    v_suburb := v_suburbs[((v_i - 1) % array_length(v_suburbs, 1)) + 1];
    v_price := 1450000 + (v_i * 110000) + ((v_i % 6) * 175000);
    v_reference := case when v_i = 1 then 'B9-HERO-2026-001' else 'B9-TRX-' || lpad(v_i::text, 3, '0') end;

    if v_i <= 4 then
      v_stage := 'OTP Signed'; v_main_stage := 'OTP'; v_attorney_stage := 'instruction_received'; v_risk_status := 'On Track'; v_operational_state := 'on_track'; v_lifecycle_state := 'active';
    elsif v_i <= 10 then
      v_stage := 'Finance Pending'; v_main_stage := 'FIN'; v_attorney_stage := 'fica_onboarding'; v_risk_status := 'On Track'; v_operational_state := 'on_track'; v_lifecycle_state := 'active';
    elsif v_i <= 14 then
      v_stage := 'Proceed to Attorneys'; v_main_stage := 'ATTY'; v_attorney_stage := 'drafting'; v_risk_status := 'On Track'; v_operational_state := 'waiting_on_attorney'; v_lifecycle_state := 'active';
    elsif v_i <= 17 then
      v_stage := 'Transfer Lodged'; v_main_stage := 'XFER'; v_attorney_stage := 'lodgement'; v_risk_status := 'On Track'; v_operational_state := 'on_track'; v_lifecycle_state := 'active';
    elsif v_i <= 19 then
      v_stage := 'Registered'; v_main_stage := 'REG'; v_attorney_stage := 'registered'; v_risk_status := 'On Track'; v_operational_state := 'on_track'; v_lifecycle_state := 'registered';
    else
      v_stage := case when v_i = 20 then 'Finance Pending' else 'Transfer in Progress' end;
      v_main_stage := case when v_i = 20 then 'FIN' else 'XFER' end;
      v_attorney_stage := case when v_i = 20 then 'fica_onboarding' else 'clearances' end;
      v_risk_status := case when v_i = 22 then 'Blocked' else 'Delayed' end;
      v_operational_state := case when v_i = 22 then 'blocked' else 'at_risk' end;
      v_lifecycle_state := 'active';
    end if;
    v_finance_type := case when v_i % 5 = 0 then 'cash' when v_i % 4 = 0 then 'hybrid' else 'bond' end;

    insert into public.buyers (id, organisation_id, name, phone, email, is_demo_data, demo_metadata, created_at, updated_at)
    values (
      v_buyer_id,
      v_org_id,
      v_buyer_names[((v_i - 1) % array_length(v_buyer_names, 1)) + 1],
      '+27 83 ' || lpad((7000000 + v_i)::text, 7, '0'),
      'buyer.tx' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo', 'portalReady', true),
      v_now - ((65 - v_i) || ' days')::interval,
      v_now - ((v_i % 6) || ' days')::interval
    );

    insert into public.transactions (
      id, organisation_id, assigned_branch_id, assigned_user_id, buyer_id, matter_number, transaction_reference, transaction_type,
      property_type, property_address_line_1, suburb, city, province, postal_code, property_description, matter_owner,
      sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, purchaser_type, stage, current_main_stage,
      current_sub_stage_summary, comment, stage_date, risk_status, sale_date, assigned_agent, assigned_agent_email, attorney,
      assigned_attorney_email, bond_originator, assigned_bond_originator_email, finance_managed_by, bank, expected_transfer_date,
      target_registration_date, next_action, owner_user_id, access_level, is_active, lifecycle_state, attorney_stage, operational_state,
      waiting_on_role, registration_date, registered_by_user_id, registered_at, last_meaningful_activity_at, seller_name, seller_email,
      seller_phone, seller_has_existing_bond, current_bond_bank, estimated_settlement_amount, is_demo_data, demo_metadata, created_at, updated_at
    )
    values (
      v_tx_id,
      v_org_id,
      case when v_agent.email in ('daniel.vandermerwe@bridgenine.co.za', 'thabo.ndlovu@bridgenine.co.za', 'sihle.dlamini@bridgenine.co.za') then v_pretoria_branch_id when v_agent.email = 'zanele.mabaso@bridgenine.co.za' then v_east_branch_id when v_agent.email = 'aisha.patel@bridgenine.co.za' then v_waterfall_branch_id else v_hq_branch_id end,
      v_agent.id,
      v_buyer_id,
      v_reference,
      v_reference,
      'private_property',
      case when v_i % 3 = 0 then 'Freehold' else 'Sectional Title' end,
      case when v_i = 1 then '48 Waterfall View Drive' else (40 + v_i) || ' ' || v_suburb || ' Avenue' end,
      case when v_i = 1 then 'Waterfall' else v_suburb end,
      case when v_suburb in ('Waterkloof Ridge', 'Menlyn') then 'Pretoria' when v_suburb in ('Boksburg', 'Parkrand') then 'Boksburg' else 'Johannesburg' end,
      'Gauteng',
      '2001',
      case when v_i = 1 then 'Premium Waterfall estate home with polished buyer, seller, bond and attorney demo workflow.' else 'Bridge9 Realty private property sale linked to listing, buyer lead and workflow activity.' end,
      v_agent.full_name,
      v_price,
      v_price,
      v_finance_type,
      case when v_finance_type = 'cash' then v_price else greatest(v_price * 0.12, 150000) end,
      case when v_finance_type = 'cash' then 0 else v_price * 0.88 end,
      v_price * 0.10,
      case when v_i % 8 = 0 then 'trust' when v_i % 7 = 0 then 'company' else 'individual' end,
      v_stage,
      v_main_stage,
      case when v_i = 1 then 'Bond approval received; guarantees in progress; transfer attorney preparing lodgement pack.' else 'Current workflow update synced from Bridge9 demo seed.' end,
      case when v_i in (20, 21, 22) then 'Problematic demo transaction for delay/risk dashboards.' else 'Seeded Bridge9 Realty demo transaction.' end,
      (v_now - ((42 - (v_i % 24)) || ' days')::interval)::date,
      v_risk_status,
      (v_now - ((58 - (v_i % 40)) || ' days')::interval)::date,
      v_agent.full_name,
      v_agent.email,
      'Tuckers Inc Conveyancers',
      'claire@tuckers-demo.co.za',
      'Aurum Bond Originators',
      'rene@aurumbonds.co.za',
      case when v_finance_type = 'cash' then 'client' else 'bond_originator' end,
      case when v_finance_type = 'cash' then null when v_i % 3 = 0 then 'FNB' when v_i % 3 = 1 then 'Standard Bank' else 'ABSA' end,
      (v_now + ((22 + v_i) || ' days')::interval)::date,
      (v_now + ((35 + v_i) || ' days')::interval)::date,
      case when v_i = 1 then 'Attorney to confirm guarantees and prepare lodgement readiness note for buyer portal.' when v_i in (20, 21, 22) then 'Escalate outstanding condition and update all role players.' else 'Continue next workflow milestone.' end,
      v_principal_id,
      'shared',
      v_lifecycle_state <> 'archived',
      v_lifecycle_state,
      v_attorney_stage,
      v_operational_state,
      case when v_i = 20 then 'bank' when v_i = 21 then 'attorney' when v_i = 22 then 'seller' else null end,
      case when v_lifecycle_state = 'registered' then (v_now - ((v_i - 17) || ' days')::interval)::date else null end,
      case when v_lifecycle_state = 'registered' then v_principal_id else null end,
      case when v_lifecycle_state = 'registered' then v_now - ((v_i - 17) || ' days')::interval else null end,
      v_now - ((v_i % 5) || ' days')::interval,
      v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1],
      'seller.tx' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za',
      '+27 82 ' || lpad((8000000 + v_i)::text, 7, '0'),
      v_i % 3 = 0,
      case when v_i % 3 = 0 then 'Nedbank' else null end,
      case when v_i % 3 = 0 then v_price * 0.42 else null end,
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo', 'hero', v_i = 1, 'breakdown', case when v_i <= 4 then 'newly_created' when v_i <= 10 then 'finance' when v_i <= 14 then 'attorneys' when v_i <= 17 then 'lodged' when v_i <= 19 then 'registered' else 'delayed_problematic' end),
      v_now - ((70 - v_i) || ' days')::interval,
      v_now - ((v_i % 5) || ' days')::interval
    );

    update public.leads
    set converted_transaction_id = v_tx_id,
        converted_at = v_now - ((v_i % 20) || ' days')::interval,
        stage = case when v_lifecycle_state = 'registered' then 'Registered / Closed' else 'Converted to Transaction' end,
        status = case when v_lifecycle_state = 'registered' then 'Registered / Closed' else 'Converted' end,
        updated_at = v_now
    where lead_id = v_lead_id;

    update public.private_listings
    set listing_status = case when v_lifecycle_state = 'registered' then 'sold' when v_i <= 4 then 'transaction_created' else 'sold' end,
        listing_visibility = case when v_lifecycle_state = 'registered' then 'archived' else listing_visibility end,
        is_active = v_lifecycle_state <> 'registered',
        updated_at = v_now,
        demo_metadata = coalesce(demo_metadata, '{}'::jsonb) || jsonb_build_object('linkedTransactionId', v_tx_id, 'linkedTransactionReference', v_reference)
    where id = v_listing_id;

    insert into public.transaction_finance_details (id, transaction_id, proof_of_funds_received, deposit_required, deposit_paid, bond_submitted, bond_approved, grant_signed, proceed_to_attorneys, cash_portion, bond_portion, bond_originator, bank, attorney, expected_transfer_date, next_action, is_demo_data, created_at, updated_at)
    values (
      pg_temp.bridge9_demo_uuid('finance-detail:' || v_i), v_tx_id, v_finance_type = 'cash', true, v_i not in (20, 22), v_finance_type <> 'cash', v_i in (1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19), v_i in (1, 9, 10, 12, 15, 16, 17, 18, 19), v_i > 10 or v_i = 1, case when v_finance_type = 'cash' then v_price else v_price * 0.12 end, case when v_finance_type = 'cash' then 0 else v_price * 0.88 end, 'Aurum Bond Originators', case when v_finance_type = 'cash' then null else 'Standard Bank' end, 'Tuckers Inc Conveyancers', (v_now + ((22 + v_i) || ' days')::interval)::date, case when v_i = 1 then 'Issue guarantees to transfer attorney' else 'Follow next finance milestone' end, true, v_now - interval '20 days', v_now
    );

    insert into public.transaction_role_players (id, transaction_id, role_type, selection_source, partner_name, contact_person, email_address, phone_number, province, notes, snapshot_json, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('role-player-bo:' || v_i), v_tx_id, 'bond_originator', 'agency_preferred', 'Aurum Bond Originators', 'Rene van Zyl', 'rene@aurumbonds.co.za', '+27 11 555 0310', 'Gauteng', 'Demo role player. External bank submission simulated only.', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - interval '18 days', v_now),
      (pg_temp.bridge9_demo_uuid('role-player-ta:' || v_i), v_tx_id, 'transfer_attorney', 'agency_preferred', 'Tuckers Inc Conveyancers', 'Claire Hendricks', 'claire@tuckers-demo.co.za', '+27 12 555 0320', 'Gauteng', 'Preferred transfer attorney.', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - interval '18 days', v_now),
      (pg_temp.bridge9_demo_uuid('role-player-ba:' || v_i), v_tx_id, 'bond_attorney', 'agency_preferred', 'Meyer & Partners Bond Attorneys', 'Wikus Meyer', 'wikus@meyerpartners-demo.co.za', '+27 11 555 0330', 'Gauteng', 'Preferred bond attorney.', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - interval '18 days', v_now);

    insert into public.transaction_participants (id, transaction_id, user_id, role_type, legal_role, status, participant_name, participant_email, visibility_scope, can_view, can_comment, can_upload_documents, can_edit_finance_workflow, can_edit_attorney_workflow, can_edit_core_transaction, participant_scope, is_primary, assignment_source, organisation_name, accepted_at, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('participant-agent:' || v_i), v_tx_id, v_agent.id, 'agent', 'none', 'active', v_agent.full_name, v_agent.email, 'shared', true, true, true, false, false, true, 'transaction', true, 'transaction_direct', 'Bridge9 Realty', v_now - interval '12 days', true, v_now - interval '12 days', v_now),
      (pg_temp.bridge9_demo_uuid('participant-buyer:' || v_i), v_tx_id, null, 'buyer', 'none', 'active', v_buyer_names[((v_i - 1) % array_length(v_buyer_names, 1)) + 1], 'buyer.tx' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za', 'shared', true, true, true, false, false, false, 'transaction', true, 'transaction_direct', null, v_now - interval '12 days', true, v_now - interval '12 days', v_now),
      (pg_temp.bridge9_demo_uuid('participant-seller:' || v_i), v_tx_id, null, 'seller', 'none', 'active', v_seller_names[((v_i - 1) % array_length(v_seller_names, 1)) + 1], 'seller.tx' || lpad(v_i::text, 3, '0') || '@bridge9-demo.co.za', 'shared', true, true, true, false, false, false, 'transaction', true, 'transaction_direct', null, v_now - interval '12 days', true, v_now - interval '12 days', v_now),
      (pg_temp.bridge9_demo_uuid('participant-transfer-attorney:' || v_i), v_tx_id, null, 'attorney', 'transfer', 'active', 'Claire Hendricks', 'claire@tuckers-demo.co.za', 'shared', true, true, true, false, true, false, 'transaction', true, 'transaction_direct', 'Tuckers Inc Conveyancers', v_now - interval '10 days', true, v_now - interval '10 days', v_now),
      (pg_temp.bridge9_demo_uuid('participant-bond:' || v_i), v_tx_id, null, 'bond_originator', 'none', 'active', 'Rene van Zyl', 'rene@aurumbonds.co.za', 'shared', true, true, true, true, false, false, 'transaction', true, 'transaction_direct', 'Aurum Bond Originators', v_now - interval '10 days', true, v_now - interval '10 days', v_now);

    foreach v_stage in array array['sale', 'buyer_fica', 'finance', 'transfer'] loop
      insert into public.documents (id, transaction_id, name, file_path, category, document_type, visibility_scope, is_client_visible, uploaded_by_role, uploaded_by_email, uploaded_by_user_id, stage_key, lane_key, review_status, is_demo_data, created_at)
      values (
        pg_temp.bridge9_demo_uuid('document:' || v_i || ':' || v_stage),
        v_tx_id,
        case v_stage
          when 'sale' then 'Signed Offer to Purchase - ' || v_reference || '.pdf'
          when 'buyer_fica' then 'Buyer FICA Pack - ' || v_reference || '.pdf'
          when 'finance' then 'Bond Approval Letter - ' || v_reference || '.pdf'
          else 'Transfer Instruction Pack - ' || v_reference || '.pdf'
        end,
        'demo/bridge9/' || lower(v_reference) || '/' || v_stage || '.pdf',
        case v_stage when 'sale' then 'Sale Documents' when 'buyer_fica' then 'Buyer Documents' when 'finance' then 'Bond Documents' else 'Transfer Documents' end,
        v_stage,
        case when v_stage in ('sale', 'buyer_fica', 'finance') then 'client' else 'shared' end,
        v_stage in ('sale', 'buyer_fica', 'finance'),
        case when v_stage = 'finance' then 'bond_originator' when v_stage = 'transfer' then 'attorney' else 'agent' end,
        case when v_stage = 'finance' then 'rene@aurumbonds.co.za' when v_stage = 'transfer' then 'claire@tuckers-demo.co.za' else v_agent.email end,
        case when v_stage in ('sale', 'buyer_fica') then v_agent.id else null end,
        v_stage,
        case when v_stage = 'finance' then 'bond' when v_stage = 'transfer' then 'transfer' else null end,
        case when v_i in (20, 21, 22) and v_stage in ('finance', 'transfer') then 'pending_review' else 'approved' end,
        true,
        v_now - ((v_i % 15) || ' days')::interval
      );
    end loop;

    insert into public.transaction_onboarding (id, transaction_id, token, purchaser_type, status, is_active, submitted_at, is_demo_data, created_at, updated_at)
    values (pg_temp.bridge9_demo_uuid('onboarding:' || v_i), v_tx_id, 'buyer_demo_' || lower(replace(v_reference, '-', '_')), case when v_i % 8 = 0 then 'trust' when v_i % 7 = 0 then 'company' else 'individual' end, 'Submitted', true, v_now - ((v_i % 18) || ' days')::interval, true, v_now - interval '25 days', v_now);

    insert into public.onboarding_form_data (id, transaction_id, purchaser_type, form_data, is_demo_data, created_at, updated_at)
    values (pg_temp.bridge9_demo_uuid('onboarding-form:' || v_i), v_tx_id, case when v_i % 8 = 0 then 'trust' when v_i % 7 = 0 then 'company' else 'individual' end, jsonb_build_object('buyerName', v_buyer_names[((v_i - 1) % array_length(v_buyer_names, 1)) + 1], 'ficaComplete', v_i not in (20, 22), 'portalActive', true, 'financeType', v_finance_type), true, v_now - interval '25 days', v_now);

    insert into public.transaction_readiness_states (id, transaction_id, onboarding_status, onboarding_complete, docs_complete, missing_required_docs, uploaded_required_docs, total_required_docs, finance_lane_ready, attorney_lane_ready, stage_ready, is_demo_data, created_at, updated_at)
    values (pg_temp.bridge9_demo_uuid('readiness:' || v_i), v_tx_id, 'Submitted', true, v_i not in (20, 21, 22), case when v_i in (20, 21, 22) then 2 else 0 end, case when v_i in (20, 21, 22) then 5 else 7 end, 7, v_i not in (20, 22), v_i not in (21, 22), v_i not in (20, 21, 22), true, v_now - interval '20 days', v_now);

    insert into public.transaction_status_links (id, transaction_id, token, is_active, created_by_role, is_demo_data, created_at, updated_at)
    values (pg_temp.bridge9_demo_uuid('status-link:' || v_i), v_tx_id, 'portal_' || lower(replace(v_reference, '-', '_')), true, 'agent', true, v_now - interval '18 days', v_now);

    insert into public.transaction_comments (id, transaction_id, author_name, author_role, comment_text, is_demo_data, created_at)
    values
      (pg_temp.bridge9_demo_uuid('comment-agent:' || v_i), v_tx_id, v_agent.full_name, 'agent', case when v_i = 1 then 'Buyer portal is polished and active. Seller has asked for Wednesday update after guarantees.' else 'Agent follow-up completed and next workflow owner confirmed.' end, true, v_now - interval '5 days'),
      (pg_temp.bridge9_demo_uuid('comment-bond:' || v_i), v_tx_id, 'Rene van Zyl', 'bond_originator', case when v_i = 1 then 'Approval confirmed. Bank conditions satisfied; guarantees requested from bond attorney.' else 'Bond lane updated from simulated bank feedback.' end, true, v_now - interval '3 days'),
      (pg_temp.bridge9_demo_uuid('comment-attorney:' || v_i), v_tx_id, 'Claire Hendricks', 'attorney', case when v_i = 1 then 'Transfer instruction received. Preparing FICA verification and lodgement readiness note.' else 'Attorney milestone updated and visible to Bridge9 team.' end, true, v_now - interval '2 days');

    insert into public.transaction_events (id, transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('event-created:' || v_i), v_tx_id, 'TransactionCreated', jsonb_build_object('reference', v_reference, 'seed', 'bridge9_principal_demo'), v_agent.id, 'agent', 'shared', true, v_now - interval '18 days', v_now - interval '18 days'),
      (pg_temp.bridge9_demo_uuid('event-finance:' || v_i), v_tx_id, 'FinanceUpdated', jsonb_build_object('financeType', v_finance_type, 'bank', case when v_finance_type = 'cash' then 'Proof of funds' else 'Standard Bank' end), v_agent.id, 'bond_originator', 'shared', true, v_now - interval '8 days', v_now - interval '8 days'),
      (pg_temp.bridge9_demo_uuid('event-portal:' || v_i), v_tx_id, 'ClientPortalUpdated', jsonb_build_object('milestone', v_stage, 'clientVisible', true), v_agent.id, 'system', 'client', true, v_now - interval '1 day', v_now - interval '1 day');

    insert into public.transaction_notifications (id, transaction_id, user_id, role_type, notification_type, title, message, is_read, dedupe_key, event_type, event_data, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('notification-principal:' || v_i), v_tx_id, v_principal_id, 'principal', case when v_i in (20, 21, 22) then 'risk_alert' else 'workflow_update' end, case when v_i in (20, 21, 22) then 'Deal needs attention' else 'Workflow updated' end, case when v_i = 1 then 'Hero transaction is presentation-ready: bond approval, attorney instruction and buyer portal are active.' else 'Bridge9 demo transaction activity updated.' end, v_i % 3 = 0, 'bridge9-principal-' || v_reference, 'TransactionUpdated', jsonb_build_object('seed', 'bridge9_principal_demo', 'reference', v_reference), true, v_now - ((v_i % 7) || ' days')::interval, v_now),
      (pg_temp.bridge9_demo_uuid('notification-agent:' || v_i), v_tx_id, v_agent.id, 'agent', 'next_action', 'Next action due', case when v_i in (20, 21, 22) then 'Please update the delayed workflow note before the principal review.' else 'Client-facing milestone is ready for review.' end, false, 'bridge9-agent-' || v_reference, 'NextActionDue', jsonb_build_object('seed', 'bridge9_principal_demo'), true, v_now - ((v_i % 5) || ' days')::interval, v_now);

    insert into public.client_portal_notifications (id, transaction_id, client_portal_token, client_role, notification_type, title, description, priority, status, related_entity_type, related_entity_id, action_label, action_route, visibility, metadata, dedupe_key, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('portal-notification-buyer:' || v_i), v_tx_id, 'portal_' || lower(replace(v_reference, '-', '_')), 'buyer', case when v_i = 1 then 'milestone_completed' else 'progress_update' end, case when v_i = 1 then 'Bond approval confirmed' else 'Transaction progress updated' end, case when v_i = 1 then 'Your bond approval is recorded and guarantees are being prepared for the transfer attorney.' else 'A new Bridge9 milestone is available in your transaction timeline.' end, case when v_i in (20, 21, 22) then 'high' else 'normal' end, case when v_i % 4 = 0 then 'read' else 'unread' end, 'transaction', v_tx_id, 'View progress', '/client-portal/transactions/' || v_tx_id::text, 'client_visible', jsonb_build_object('seed', 'bridge9_principal_demo', 'reference', v_reference), 'buyer-progress-' || v_reference, true, v_now - ((v_i % 6) || ' days')::interval, v_now),
      (pg_temp.bridge9_demo_uuid('portal-notification-seller:' || v_i), v_tx_id, 'portal_' || lower(replace(v_reference, '-', '_')), 'seller', 'attorney_update', case when v_i = 1 then 'Transfer attorney instructed' else 'Seller file updated' end, case when v_i = 1 then 'Tuckers has received instruction and is preparing the lodgement readiness pack.' else 'Your seller-side file has a new update from the Bridge9 team.' end, 'normal', case when v_i % 5 = 0 then 'read' else 'unread' end, 'transaction', v_tx_id, 'Open timeline', '/client-portal/transactions/' || v_tx_id::text, 'client_visible', jsonb_build_object('seed', 'bridge9_principal_demo', 'reference', v_reference), 'seller-progress-' || v_reference, true, v_now - ((v_i % 5) || ' days')::interval, v_now);

    foreach v_stage in array array['finance', 'transfer'] loop
      v_subprocess_id := pg_temp.bridge9_demo_uuid('subprocess:' || v_i || ':' || v_stage);
      insert into public.transaction_subprocesses (id, transaction_id, process_type, owner_type, status, is_demo_data, created_at, updated_at)
      values (v_subprocess_id, v_tx_id, v_stage, case when v_stage = 'finance' then 'bond_originator' else 'attorney' end, case when v_i in (20, 21, 22) then 'blocked' when v_main_stage in ('REG') then 'completed' else 'in_progress' end, true, v_now - interval '16 days', v_now)
      on conflict (transaction_id, process_type) do update set status = excluded.status, is_demo_data = true, updated_at = excluded.updated_at;

      insert into public.transaction_subprocess_steps (id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, assigned_to, due_date, blocker_reason, notes, is_demo_data, created_at, updated_at)
      values
        (pg_temp.bridge9_demo_uuid('subprocess-step:' || v_i || ':' || v_stage || ':1'), v_subprocess_id, v_stage || '_instruction', initcap(v_stage) || ' instruction received', 'completed', v_now - interval '12 days', 'Instruction captured in Bridge9.', case when v_stage = 'finance' then 'bond_originator' else 'attorney' end, 1, v_agent.id, (v_now - interval '10 days')::date, null, null, true, v_now - interval '12 days', v_now),
        (pg_temp.bridge9_demo_uuid('subprocess-step:' || v_i || ':' || v_stage || ':2'), v_subprocess_id, v_stage || '_documents', initcap(v_stage) || ' documents reviewed', case when v_i in (20, 21, 22) then 'blocked' when v_i <= 4 and v_stage = 'transfer' then 'in_progress' else 'completed' end, case when v_i in (20, 21, 22) or (v_i <= 4 and v_stage = 'transfer') then null else v_now - interval '5 days' end, 'Document readiness updated for demo workflow.', case when v_stage = 'finance' then 'bond_originator' else 'attorney' end, 2, v_agent.id, (v_now + interval '3 days')::date, case when v_i in (20, 21, 22) then 'Awaiting outstanding condition' else null end, null, true, v_now - interval '10 days', v_now),
        (pg_temp.bridge9_demo_uuid('subprocess-step:' || v_i || ':' || v_stage || ':3'), v_subprocess_id, v_stage || '_handoff', initcap(v_stage) || ' handoff complete', case when v_main_stage in ('XFER', 'REG') and v_i not in (20, 21, 22) then 'completed' else 'not_started' end, case when v_main_stage in ('XFER', 'REG') and v_i not in (20, 21, 22) then v_now - interval '2 days' else null end, 'Handoff milestone visible in the client portal timeline.', case when v_stage = 'finance' then 'bond_originator' else 'attorney' end, 3, v_agent.id, (v_now + interval '8 days')::date, null, null, true, v_now - interval '8 days', v_now);
    end loop;

    insert into public.document_requests (id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, requires_review, created_by, created_by_role, visibility_scope, lane_key, review_status, is_demo_data, created_at, updated_at)
    values
      (pg_temp.bridge9_demo_uuid('doc-request-fica:' || v_i), v_tx_id, 'Buyer & FICA', 'proof_of_address', 'Updated proof of address', 'Buyer portal request for current proof of address.', 'required', (v_now + interval '4 days')::date, 'client', case when v_i in (20, 22) then 'requested' else 'completed' end, true, v_agent.id, 'agent', 'client', 'buyer_fica', case when v_i in (20, 22) then 'requested' else 'approved' end, true, v_now - interval '9 days', v_now),
      (pg_temp.bridge9_demo_uuid('doc-request-guarantees:' || v_i), v_tx_id, 'Bond Documents', 'guarantees', 'Guarantees', 'Attorney request for bank guarantees.', 'required', (v_now + interval '7 days')::date, 'bond_originator', case when v_i in (1, 20) then 'requested' else 'completed' end, true, v_principal_id, 'agent', 'shared', 'bond', case when v_i in (1, 20) then 'requested' else 'approved' end, true, v_now - interval '7 days', v_now);

    insert into public.appointments (appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, linked_workflow, linked_workflow_stage, visibility_scope, status, notes, outcome_summary, next_step, follow_up_date, created_by, is_demo_data, demo_metadata, created_at, updated_at)
    values (
      pg_temp.bridge9_demo_uuid('appointment:' || v_i),
      v_org_id,
      v_lead_id,
      v_agent.id,
      case when v_i % 3 = 0 then 'Seller Valuation' else 'Viewing' end,
      case when v_i % 3 = 0 then 'Seller valuation - ' || v_suburb else 'Buyer viewing - ' || v_suburb end,
      (v_now + (((v_i % 14) - 3) || ' days')::interval)::date,
      '10:00',
      '10:45',
      v_now + (((v_i % 14) - 3) || ' days')::interval,
      case when v_i = 1 then '48 Waterfall View Drive, Waterfall' else (40 + v_i) || ' ' || v_suburb || ' Avenue' end,
      pg_temp.bridge9_demo_uuid('buyer-contact:' || v_i),
      v_listing_id::text,
      v_tx_id,
      'transaction',
      v_main_stage,
      'shared_role_players',
      case when v_i % 6 = 0 then 'completed' when v_i % 5 = 0 then 'requested' else 'confirmed' end,
      'Demo appointment linked to live workflow.',
      case when v_i % 6 = 0 then 'Client positive; next step captured.' else null end,
      'Send concise WhatsApp-style update in portal.',
      (v_now + ((v_i % 9) || ' days')::interval)::date,
      v_agent.id,
      true,
      jsonb_build_object('seed', 'bridge9_principal_demo'),
      v_now - interval '12 days',
      v_now
    );
  end loop;

  update public.transactions
  set current_sub_stage_summary = 'Hero demo: seller mandate, buyer onboarding, FICA, bond approval, attorney instruction, guarantees and portal milestones are all active.',
      next_action = 'Open buyer portal, review guarantees request, then show attorney handoff timeline.',
      demo_metadata = demo_metadata || jsonb_build_object(
        'heroNarrative', jsonb_build_object(
          'seller', 'Karen Peters signed a sole mandate after Waterfall valuation.',
          'buyer', 'Nomsa Nkosi completed FICA and bond onboarding through the portal.',
          'bond', 'Aurum submitted to Standard Bank and approval conditions are satisfied.',
          'attorney', 'Tuckers received transfer instruction and is preparing lodgement readiness.',
          'portal', 'Client-facing milestones, documents, notifications and next steps are visible.'
        )
      )
  where id = pg_temp.bridge9_demo_uuid('transaction:1');

  insert into public.demo_seed_manifests (environment, demo_key, workspace_type, account_role, account_email, expected_records, reset_notes, status, created_at, updated_at)
  values (
    'demo',
    'bridge9_principal_demo',
    'agency',
    'principal',
    'principal.demo@bridgenine.co.za',
    jsonb_build_object(
      'users', 10,
      'canvassingRecords', 120,
      'listings', 45,
      'buyerLeads', 160,
      'transactions', 22,
      'heroTransactions', 1,
      'documentsMinimum', 88,
      'activityEventsMinimum', 500
    ),
    'Run supabase/seed/reset-bridge9-principal-demo-data.sql before reseeding. External sends are disabled by organisation demoProtection settings.',
    'seeded',
    v_now,
    v_now
  )
  on conflict (environment, demo_key) do update set
    workspace_type = excluded.workspace_type,
    account_role = excluded.account_role,
    account_email = excluded.account_email,
    expected_records = excluded.expected_records,
    reset_notes = excluded.reset_notes,
    status = 'seeded',
    updated_at = excluded.updated_at;

  raise notice 'Bridge9 principal demo seed complete. Organisation %, users 10, canvassing 120, listings 45, buyer leads 160, transactions 22.', v_org_id;
end $$;

commit;
