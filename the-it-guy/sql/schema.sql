create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  first_name text,
  last_name text,
  company_name text,
  phone_number text,
  role text not null default 'developer',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'attorney',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type in ('attorney', 'developer', 'agency'))
);

create table if not exists firm_memberships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'attorney',
  status text not null default 'active',
  invited_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, user_id),
  check (role in ('firm_admin', 'lead_attorney', 'attorney', 'paralegal', 'admin_staff', 'developer', 'agent', 'viewer')),
  check (status in ('invited', 'active', 'inactive'))
);

alter table if exists profiles add column if not exists email text;
alter table if exists profiles add column if not exists full_name text;
alter table if exists profiles add column if not exists first_name text;
alter table if exists profiles add column if not exists last_name text;
alter table if exists profiles add column if not exists company_name text;
alter table if exists profiles add column if not exists phone_number text;
alter table if exists profiles add column if not exists title text;
alter table if exists profiles add column if not exists timezone text;
alter table if exists profiles add column if not exists date_format text;
alter table if exists profiles add column if not exists notification_preferences_json jsonb not null default '{}'::jsonb;
alter table if exists profiles add column if not exists role text not null default 'developer';
alter table if exists profiles add column if not exists firm_id uuid references firms(id) on delete set null;
alter table if exists profiles add column if not exists firm_role text not null default 'attorney';
alter table if exists profiles add column if not exists onboarding_completed boolean not null default false;
alter table if exists profiles add column if not exists created_at timestamptz not null default now();
alter table if exists profiles add column if not exists updated_at timestamptz not null default now();

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check
  check (role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'internal_admin', 'buyer', 'seller'));

alter table profiles drop constraint if exists profiles_firm_role_check;
alter table profiles
  add constraint profiles_firm_role_check
  check (firm_role in ('firm_admin', 'lead_attorney', 'attorney', 'paralegal', 'admin_staff', 'developer', 'agent', 'viewer', 'buyer', 'seller'));

update profiles
set role = 'developer'
where role is null;

update profiles
set onboarding_completed = true
where onboarding_completed is null;

insert into profiles (id, email, full_name, first_name, last_name, role, onboarding_completed)
select
  au.id,
  au.email,
  nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')), '') as full_name,
  nullif(trim(coalesce(au.raw_user_meta_data ->> 'first_name', split_part(coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', ''), ' ', 1))), '') as first_name,
  nullif(trim(
    case
      when position(' ' in coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')) > 0
        then substr(
          coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', ''),
          position(' ' in coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')) + 1
        )
      else coalesce(au.raw_user_meta_data ->> 'last_name', '')
    end
  ), '') as last_name,
  'developer' as role,
  true as onboarding_completed
from auth.users au
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(profiles.full_name, excluded.full_name),
  first_name = coalesce(profiles.first_name, excluded.first_name),
  last_name = coalesce(profiles.last_name, excluded.last_name),
  role = coalesce(profiles.role, 'developer'),
  onboarding_completed = coalesce(profiles.onboarding_completed, true);

create index if not exists profiles_role_idx on profiles (role);

create table if not exists developments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  planned_units integer not null default 0 check (planned_units >= 0)
);

alter table if exists developments add column if not exists planned_units integer not null default 0;
alter table if exists developments add column if not exists organisation_id uuid;
alter table if exists developments add column if not exists code text;
alter table if exists developments add column if not exists location text;
alter table if exists developments add column if not exists suburb text;
alter table if exists developments add column if not exists city text;
alter table if exists developments add column if not exists province text;
alter table if exists developments add column if not exists country text not null default 'South Africa';
alter table if exists developments add column if not exists description text;
alter table if exists developments add column if not exists status text not null default 'active';
alter table if exists developments add column if not exists developer_company text;
alter table if exists developments add column if not exists total_units_expected integer not null default 0;
alter table if exists developments add column if not exists launch_date date;
alter table if exists developments add column if not exists expected_completion_date date;
alter table if exists developments add column if not exists assigned_attorney_id uuid;
alter table if exists developments add column if not exists handover_enabled boolean not null default true;
alter table if exists developments add column if not exists snag_tracking_enabled boolean not null default true;
alter table if exists developments add column if not exists alterations_enabled boolean not null default false;
alter table if exists developments add column if not exists onboarding_enabled boolean not null default true;
alter table developments drop constraint if exists developments_planned_units_check;
alter table developments drop constraint if exists developments_name_key;
alter table developments
  add constraint developments_planned_units_check
  check (planned_units >= 0);

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text,
  logo_url text,
  company_email text,
  company_phone text,
  website text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  country text not null default 'South Africa',
  support_email text,
  support_phone text,
  primary_contact_person text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table developments drop constraint if exists developments_organisation_id_fkey;
alter table developments
  add constraint developments_organisation_id_fkey
  foreign key (organisation_id) references organisations(id) on delete set null;

create table if not exists organisation_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references organisations(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organisation_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  first_name text,
  last_name text,
  email text not null,
  role text not null default 'viewer',
  status text not null default 'invited',
  permissions_json jsonb not null default '{}'::jsonb,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, email)
);

alter table organisation_users drop constraint if exists organisation_users_role_check;
alter table organisation_users
  add constraint organisation_users_role_check
  check (role in ('admin', 'developer', 'agent', 'attorney', 'bond_originator', 'viewer'));

alter table organisation_users drop constraint if exists organisation_users_status_check;
alter table organisation_users
  add constraint organisation_users_status_check
  check (status in ('invited', 'active', 'deactivated'));

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references organisations(id) on delete cascade,
  plan_name text not null default 'Professional',
  billing_type text not null default 'Monthly',
  monthly_amount numeric(12, 2) not null default 0,
  status text not null default 'active',
  renewal_date date,
  payment_method_last4 text,
  included_developments text,
  included_users text,
  provider_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  invoice_number text,
  amount numeric(12, 2) not null default 0,
  status text not null default 'issued',
  issued_at timestamptz,
  paid_at timestamptz,
  invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_financial_records (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  expected_fee numeric(12, 2),
  invoiced_amount numeric(12, 2),
  payment_status text not null default 'not_invoiced',
  invoice_reference text,
  invoice_date date,
  invoice_file_path text,
  invoice_filename text,
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id)
);

alter table if exists transaction_financial_records drop constraint if exists transaction_financial_records_payment_status_check;
alter table if exists transaction_financial_records
  add constraint transaction_financial_records_payment_status_check
  check (payment_status in ('not_invoiced', 'invoiced', 'paid', 'needs_attention'));

alter table billing_invoices drop constraint if exists billing_invoices_status_check;
alter table billing_invoices
  add constraint billing_invoices_status_check
  check (status in ('issued', 'paid', 'void', 'overdue'));

create table if not exists development_profiles (
  development_id uuid primary key references developments(id) on delete cascade,
  code text,
  location text,
  suburb text,
  city text,
  province text,
  country text,
  address text,
  description text,
  status text not null default 'Planning',
  developer_company text,
  launch_date date,
  expected_completion_date date,
  plans jsonb not null default '[]'::jsonb,
  site_plans jsonb not null default '[]'::jsonb,
  image_links jsonb not null default '[]'::jsonb,
  supporting_documents jsonb not null default '[]'::jsonb,
  marketing_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists development_profiles add column if not exists code text;
alter table if exists development_profiles add column if not exists suburb text;
alter table if exists development_profiles add column if not exists city text;
alter table if exists development_profiles add column if not exists province text;
alter table if exists development_profiles add column if not exists country text;
alter table if exists development_profiles add column if not exists developer_company text;
alter table if exists development_profiles add column if not exists launch_date date;
alter table if exists development_profiles add column if not exists expected_completion_date date;
alter table if exists development_profiles add column if not exists marketing_content jsonb not null default '{}'::jsonb;

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_number text not null,
  phase text,
  price numeric(12, 2) not null default 0,
  status text not null default 'Available',
  unique (development_id, unit_number)
);

alter table if exists units add column if not exists phase text;
alter table if exists units add column if not exists unit_label text;
alter table if exists units add column if not exists block text;
alter table if exists units add column if not exists unit_type text;
alter table if exists units add column if not exists bedrooms integer;
alter table if exists units add column if not exists bathrooms integer;
alter table if exists units add column if not exists parking_count integer;
alter table if exists units add column if not exists size_sqm numeric(10, 2);
alter table if exists units add column if not exists list_price numeric(12, 2) not null default 0;
alter table if exists units add column if not exists current_price numeric(12, 2);
alter table if exists units add column if not exists vat_applicable boolean;
alter table if exists units add column if not exists floorplan_id uuid;
alter table if exists units add column if not exists notes text;

create table if not exists development_financials (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null unique references developments(id) on delete cascade,
  land_cost numeric(14, 2) not null default 0,
  build_cost numeric(14, 2) not null default 0,
  professional_fees numeric(14, 2) not null default 0,
  marketing_cost numeric(14, 2) not null default 0,
  infrastructure_cost numeric(14, 2) not null default 0,
  other_costs numeric(14, 2) not null default 0,
  total_projected_cost numeric(14, 2) not null default 0,
  projected_gross_sales_value numeric(14, 2) not null default 0,
  projected_profit numeric(14, 2) not null default 0,
  target_margin numeric(8, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists development_documents (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  document_type text not null default 'other',
  title text not null,
  description text,
  file_url text,
  linked_unit_id uuid references units(id) on delete set null,
  linked_unit_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  development_id uuid references developments(id) on delete set null,
  unit_id uuid references units(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  transaction_reference text,
  transaction_type text not null default 'developer_sale',
  property_type text,
  property_address_line_1 text,
  property_address_line_2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  property_description text,
  matter_owner text,
  sales_price numeric(12, 2),
  purchase_price numeric(12, 2),
  finance_type text not null default 'cash',
  cash_amount numeric(12, 2),
  bond_amount numeric(12, 2),
  deposit_amount numeric(12, 2),
  reservation_required boolean not null default false,
  reservation_amount numeric(12, 2),
  reservation_status text not null default 'not_required',
  reservation_paid_date date,
  reservation_proof_document uuid,
  reservation_proof_uploaded_at timestamptz,
  reservation_payment_details jsonb not null default '{}'::jsonb,
  reservation_requested_at timestamptz,
  reservation_email_sent_at timestamptz,
  reservation_reviewed_at timestamptz,
  reservation_reviewed_by uuid references profiles(id) on delete set null,
  reservation_review_notes text,
  purchaser_type text not null default 'individual',
  stage text not null default 'Available',
  current_main_stage text not null default 'AVAIL',
  current_sub_stage_summary text,
  comment text,
  stage_date date,
  risk_status text not null default 'On Track',
  sale_date date,
  assigned_agent text,
  assigned_agent_email text,
  attorney text,
  assigned_attorney_email text,
  bond_originator text,
  assigned_bond_originator_email text,
  finance_managed_by text not null default 'bond_originator',
  bank text,
  expected_transfer_date date,
  next_action text,
  owner_user_id uuid references profiles(id) on delete set null,
  access_level text not null default 'shared',
  is_active boolean not null default true,
  lifecycle_state text not null default 'active',
  attorney_stage text,
  operational_state text,
  waiting_on_role text,
  registration_date date,
  title_deed_number text,
  registration_confirmation_document_id uuid,
  registered_by_user_id uuid references profiles(id) on delete set null,
  registered_at timestamptz,
  registration_reversed_at timestamptz,
  registration_reversed_by_user_id uuid references profiles(id) on delete set null,
  registration_reversal_reason text,
  completed_at timestamptz,
  completed_by_user_id uuid references profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by_user_id uuid references profiles(id) on delete set null,
  archive_reason text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references profiles(id) on delete set null,
  cancelled_reason text,
  last_meaningful_activity_at timestamptz,
  final_report_generated_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists transactions alter column unit_id drop not null;
alter table if exists transactions add column if not exists development_id uuid references developments(id) on delete set null;
alter table if exists transactions add column if not exists transaction_reference text;
alter table if exists transactions add column if not exists transaction_type text not null default 'developer_sale';
alter table if exists transactions add column if not exists property_type text;
alter table if exists transactions add column if not exists property_address_line_1 text;
alter table if exists transactions add column if not exists property_address_line_2 text;
alter table if exists transactions add column if not exists suburb text;
alter table if exists transactions add column if not exists city text;
alter table if exists transactions add column if not exists province text;
alter table if exists transactions add column if not exists postal_code text;
alter table if exists transactions add column if not exists property_description text;
alter table if exists transactions add column if not exists matter_owner text;
alter table if exists transactions add column if not exists sales_price numeric(12, 2);
alter table if exists transactions add column if not exists purchase_price numeric(12, 2);
alter table if exists transactions add column if not exists cash_amount numeric(12, 2);
alter table if exists transactions add column if not exists bond_amount numeric(12, 2);
alter table if exists transactions add column if not exists deposit_amount numeric(12, 2);
alter table if exists transactions add column if not exists reservation_required boolean not null default false;
alter table if exists transactions add column if not exists reservation_amount numeric(12, 2);
alter table if exists transactions add column if not exists reservation_status text not null default 'not_required';
alter table if exists transactions add column if not exists reservation_paid_date date;
alter table if exists transactions add column if not exists reservation_proof_document uuid;
alter table if exists transactions add column if not exists reservation_proof_uploaded_at timestamptz;
alter table if exists transactions add column if not exists reservation_payment_details jsonb not null default '{}'::jsonb;
alter table if exists transactions add column if not exists reservation_requested_at timestamptz;
alter table if exists transactions add column if not exists reservation_email_sent_at timestamptz;
alter table if exists transactions add column if not exists reservation_reviewed_at timestamptz;
alter table if exists transactions add column if not exists reservation_reviewed_by uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists reservation_review_notes text;
alter table if exists transactions add column if not exists purchaser_type text not null default 'individual';
alter table if exists transactions add column if not exists current_main_stage text not null default 'AVAIL';
alter table if exists transactions add column if not exists current_sub_stage_summary text;
alter table if exists transactions add column if not exists comment text;
alter table if exists transactions add column if not exists stage_date date;
alter table if exists transactions add column if not exists risk_status text;
alter table if exists transactions add column if not exists sale_date date;
alter table if exists transactions add column if not exists assigned_agent text;
alter table if exists transactions add column if not exists assigned_agent_email text;
alter table if exists transactions add column if not exists assigned_attorney_email text;
alter table if exists transactions add column if not exists assigned_bond_originator_email text;
alter table if exists transactions add column if not exists finance_managed_by text not null default 'bond_originator';
alter table if exists transactions add column if not exists bank text;
alter table if exists transactions add column if not exists expected_transfer_date date;
alter table if exists transactions add column if not exists owner_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists access_level text not null default 'shared';
alter table if exists transactions add column if not exists is_active boolean not null default true;
alter table if exists transactions add column if not exists lifecycle_state text not null default 'active';
alter table if exists transactions add column if not exists attorney_stage text;
alter table if exists transactions add column if not exists operational_state text;
alter table if exists transactions add column if not exists waiting_on_role text;
alter table if exists transactions add column if not exists registration_date date;
alter table if exists transactions add column if not exists title_deed_number text;
alter table if exists transactions add column if not exists registration_confirmation_document_id uuid;
alter table if exists transactions add column if not exists registered_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists registered_at timestamptz;
alter table if exists transactions add column if not exists registration_reversed_at timestamptz;
alter table if exists transactions add column if not exists registration_reversed_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists registration_reversal_reason text;
alter table if exists transactions add column if not exists completed_at timestamptz;
alter table if exists transactions add column if not exists completed_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists archived_at timestamptz;
alter table if exists transactions add column if not exists archived_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists archive_reason text;
alter table if exists transactions add column if not exists cancelled_at timestamptz;
alter table if exists transactions add column if not exists cancelled_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transactions add column if not exists cancelled_reason text;
alter table if exists transactions add column if not exists last_meaningful_activity_at timestamptz;
alter table if exists transactions add column if not exists final_report_generated_at timestamptz;

update transactions t
set development_id = u.development_id
from units u
where t.unit_id = u.id
  and t.development_id is null;

update transactions
set risk_status = 'On Track'
where risk_status is null;

update transactions
set purchaser_type = 'individual'
where purchaser_type is null;

update transactions
set purchase_price = sales_price
where purchase_price is null
  and sales_price is not null;

update transactions
set transaction_type = case when unit_id is null and development_id is null then 'private_property' else 'developer_sale' end
where transaction_type is null
   or transaction_type not in ('developer_sale', 'private_property');

update transactions
set reservation_status = 'not_required'
where reservation_status is null;

update transactions
set finance_managed_by = 'bond_originator'
where finance_managed_by is null;

update transactions
set access_level = 'shared'
where access_level is null;

update transactions
set lifecycle_state = case
  when is_active = false then 'archived'
  when current_main_stage = 'REG' or stage in ('Registered') then 'registered'
  else 'active'
end
where lifecycle_state is null;

update transactions
set attorney_stage = 'instruction_received'
where attorney_stage is null;

update transactions
set operational_state = 'on_track'
where operational_state is null;

update transactions
set waiting_on_role = null
where waiting_on_role is null;

update transactions
set last_meaningful_activity_at = coalesce(updated_at, created_at, now())
where last_meaningful_activity_at is null;

update transactions
set current_main_stage = case
  when stage = 'Available' then 'AVAIL'
  when stage in ('Reserved', 'Deposit Paid') then 'DEP'
  when stage = 'OTP Signed' then 'OTP'
  when stage in ('Finance Pending', 'Bond Approved / Proof of Funds') then 'FIN'
  when stage = 'Proceed to Attorneys' then 'ATTY'
  when stage in ('Transfer in Progress', 'Transfer In Progress', 'Transfer Lodged') then 'XFER'
  when stage = 'Registered' then 'REG'
  else 'AVAIL'
end
where current_main_stage is null;

alter table transactions alter column finance_type set default 'cash';
alter table transactions alter column reservation_status set default 'not_required';
alter table transactions alter column reservation_status set not null;
alter table transactions alter column purchaser_type set default 'individual';
alter table transactions alter column purchaser_type set not null;
alter table transactions alter column finance_managed_by set default 'bond_originator';
alter table transactions alter column finance_managed_by set not null;
alter table transactions alter column access_level set default 'shared';
alter table transactions alter column access_level set not null;
alter table transactions alter column risk_status set default 'On Track';
alter table transactions alter column risk_status set not null;
alter table transactions alter column current_main_stage set default 'AVAIL';
alter table transactions alter column current_main_stage set not null;

alter table transactions drop constraint if exists transactions_unit_id_key;
alter table transactions drop constraint if exists transactions_finance_type_check;
alter table transactions drop constraint if exists transactions_reservation_status_check;
alter table transactions drop constraint if exists transactions_purchaser_type_check;
alter table transactions drop constraint if exists transactions_finance_managed_by_check;
alter table transactions drop constraint if exists transactions_stage_check;
alter table transactions drop constraint if exists transactions_current_main_stage_check;
alter table transactions drop constraint if exists transactions_risk_status_check;
alter table transactions drop constraint if exists transactions_lifecycle_state_check;
alter table transactions drop constraint if exists transactions_attorney_stage_check;
alter table transactions drop constraint if exists transactions_operational_state_check;
alter table transactions drop constraint if exists transactions_waiting_on_role_check;
alter table transactions drop constraint if exists transactions_access_level_check;

alter table transactions
  add constraint transactions_finance_type_check
  check (finance_type in ('cash', 'bond', 'combination', 'hybrid'));

alter table transactions
  add constraint transactions_reservation_status_check
  check (reservation_status in ('not_required', 'pending', 'paid', 'verified', 'rejected'));

alter table transactions
  add constraint transactions_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table transactions
  add constraint transactions_finance_managed_by_check
  check (finance_managed_by in ('bond_originator', 'client', 'internal'));

alter table transactions
  add constraint transactions_stage_check
  check (
    stage in (
      'Available',
      'Reserved',
      'OTP Signed',
      'Deposit Paid',
      'Finance Pending',
      'Bond Approved / Proof of Funds',
      'Proceed to Attorneys',
      'Transfer in Progress',
      'Transfer In Progress',
      'Transfer Lodged',
      'Registered'
    )
  );

alter table transactions
  add constraint transactions_current_main_stage_check
  check (current_main_stage in ('AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG'));

alter table transactions
  add constraint transactions_risk_status_check
  check (risk_status in ('On Track', 'At Risk', 'Delayed', 'Blocked'));

alter table transactions
  add constraint transactions_lifecycle_state_check
  check (lifecycle_state in ('active', 'registered', 'completed', 'archived', 'cancelled'));

alter table transactions
  add constraint transactions_attorney_stage_check
  check (
    attorney_stage is null
    or attorney_stage in (
      'instruction_received',
      'fica_onboarding',
      'drafting',
      'signing',
      'guarantees',
      'clearances',
      'lodgement',
      'registration_preparation',
      'registered'
    )
  );

alter table transactions
  add constraint transactions_operational_state_check
  check (operational_state is null or operational_state in ('on_track', 'at_risk', 'blocked', 'waiting_on_client', 'waiting_on_attorney'));

alter table transactions
  add constraint transactions_waiting_on_role_check
  check (waiting_on_role is null or waiting_on_role in ('buyer', 'seller', 'client', 'attorney', 'bank', 'developer', 'agent', 'bond_originator'));

alter table transactions
  add constraint transactions_access_level_check
  check (access_level in ('private', 'shared', 'restricted'));

create unique index if not exists transactions_unit_active_unique_idx
  on transactions (unit_id)
  where is_active;
create index if not exists transactions_lifecycle_state_idx on transactions (lifecycle_state);
create index if not exists transactions_attorney_stage_idx on transactions (attorney_stage);
create index if not exists transactions_registered_at_idx on transactions (registered_at desc);
create index if not exists transactions_completed_at_idx on transactions (completed_at desc);
create index if not exists transactions_archived_at_idx on transactions (archived_at desc);
create index if not exists transactions_cancelled_at_idx on transactions (cancelled_at desc);

create table if not exists transaction_finance_details (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  proof_of_funds_received boolean,
  deposit_required boolean,
  deposit_paid boolean,
  bond_submitted boolean,
  bond_approved boolean,
  grant_signed boolean,
  proceed_to_attorneys boolean,
  cash_portion numeric(12, 2),
  bond_portion numeric(12, 2),
  bond_originator text,
  bank text,
  attorney text,
  expected_transfer_date date,
  next_action text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists transaction_subprocesses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  process_type text not null,
  owner_type text not null default 'internal',
  status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, process_type)
);

create table if not exists transaction_subprocess_steps (
  id uuid primary key default gen_random_uuid(),
  subprocess_id uuid not null references transaction_subprocesses(id) on delete cascade,
  step_key text not null,
  step_label text not null,
  status text not null default 'not_started',
  completed_at timestamptz,
  comment text,
  owner_type text not null default 'internal',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subprocess_id, step_key)
);

alter table if exists transaction_subprocesses add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_subprocesses add column if not exists process_type text;
alter table if exists transaction_subprocesses add column if not exists owner_type text not null default 'internal';
alter table if exists transaction_subprocesses add column if not exists status text not null default 'not_started';
alter table if exists transaction_subprocesses add column if not exists updated_at timestamptz not null default now();

alter table if exists transaction_subprocess_steps add column if not exists subprocess_id uuid references transaction_subprocesses(id) on delete cascade;
alter table if exists transaction_subprocess_steps add column if not exists step_key text;
alter table if exists transaction_subprocess_steps add column if not exists step_label text;
alter table if exists transaction_subprocess_steps add column if not exists status text not null default 'not_started';
alter table if exists transaction_subprocess_steps add column if not exists completed_at timestamptz;
alter table if exists transaction_subprocess_steps add column if not exists comment text;
alter table if exists transaction_subprocess_steps add column if not exists owner_type text not null default 'internal';
alter table if exists transaction_subprocess_steps add column if not exists sort_order integer not null default 0;
alter table if exists transaction_subprocess_steps add column if not exists updated_at timestamptz not null default now();

create unique index if not exists transaction_subprocesses_transaction_process_unique_idx
  on transaction_subprocesses (transaction_id, process_type);
create unique index if not exists transaction_subprocess_steps_subprocess_step_unique_idx
  on transaction_subprocess_steps (subprocess_id, step_key);

alter table transaction_subprocesses drop constraint if exists transaction_subprocesses_process_type_check;
alter table transaction_subprocesses
  add constraint transaction_subprocesses_process_type_check
  check (process_type in ('finance', 'attorney'));

alter table transaction_subprocesses drop constraint if exists transaction_subprocesses_owner_type_check;
alter table transaction_subprocesses
  add constraint transaction_subprocesses_owner_type_check
  check (owner_type in ('bond_originator', 'attorney', 'internal'));

alter table transaction_subprocesses drop constraint if exists transaction_subprocesses_status_check;
alter table transaction_subprocesses
  add constraint transaction_subprocesses_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked'));

alter table transaction_subprocess_steps drop constraint if exists transaction_subprocess_steps_owner_type_check;
alter table transaction_subprocess_steps
  add constraint transaction_subprocess_steps_owner_type_check
  check (owner_type in ('bond_originator', 'attorney', 'internal'));

alter table transaction_subprocess_steps drop constraint if exists transaction_subprocess_steps_status_check;
alter table transaction_subprocess_steps
  add constraint transaction_subprocess_steps_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked'));

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  name text not null,
  file_path text not null unique,
  category text not null default 'General',
  is_client_visible boolean not null default false,
  uploaded_by_role text,
  uploaded_by_email text,
  external_access_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists document_request_groups (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  category text not null,
  document_type text not null,
  title text not null,
  description text,
  priority text not null default 'required',
  due_date date,
  assigned_to_role text not null default 'client',
  assigned_to_user_id uuid references profiles(id) on delete set null,
  request_group_id uuid references document_request_groups(id) on delete set null,
  status text not null default 'requested',
  requires_review boolean not null default true,
  requested_document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_by_role text,
  completed_at timestamptz,
  rejected_reason text,
  resend_count integer not null default 0,
  last_resent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_checklist_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  stage text not null,
  label text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'required',
  owner_role text not null default 'attorney',
  owner_user_id uuid references profiles(id) on delete set null,
  linked_document_request_id uuid references document_requests(id) on delete set null,
  linked_document_id uuid references documents(id) on delete set null,
  auto_rule_key text,
  is_auto_managed boolean not null default false,
  completed_by uuid references profiles(id) on delete set null,
  completed_at timestamptz,
  overridden_by uuid references profiles(id) on delete set null,
  override_reason text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_issue_overrides (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  issue_type text not null,
  overridden_by uuid references profiles(id) on delete set null,
  override_reason text,
  resolve_by date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, issue_type)
);

alter table if exists document_request_groups add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists document_request_groups add column if not exists title text;
alter table if exists document_request_groups add column if not exists description text;
alter table if exists document_request_groups add column if not exists created_by uuid references profiles(id) on delete set null;
alter table if exists document_request_groups add column if not exists created_by_role text;
alter table if exists document_request_groups add column if not exists created_at timestamptz not null default now();
alter table if exists document_request_groups add column if not exists updated_at timestamptz not null default now();

alter table if exists document_requests add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists document_requests add column if not exists category text;
alter table if exists document_requests add column if not exists document_type text;
alter table if exists document_requests add column if not exists title text;
alter table if exists document_requests add column if not exists description text;
alter table if exists document_requests add column if not exists priority text not null default 'required';
alter table if exists document_requests add column if not exists due_date date;
alter table if exists document_requests add column if not exists assigned_to_role text not null default 'client';
alter table if exists document_requests add column if not exists assigned_to_user_id uuid references profiles(id) on delete set null;
alter table if exists document_requests add column if not exists request_group_id uuid references document_request_groups(id) on delete set null;
alter table if exists document_requests add column if not exists status text not null default 'requested';
alter table if exists document_requests add column if not exists requires_review boolean not null default true;
alter table if exists document_requests add column if not exists requested_document_id uuid references documents(id) on delete set null;
alter table if exists document_requests add column if not exists created_by uuid references profiles(id) on delete set null;
alter table if exists document_requests add column if not exists created_by_role text;
alter table if exists document_requests add column if not exists completed_at timestamptz;
alter table if exists document_requests add column if not exists rejected_reason text;
alter table if exists document_requests add column if not exists resend_count integer not null default 0;
alter table if exists document_requests add column if not exists last_resent_at timestamptz;
alter table if exists document_requests add column if not exists created_at timestamptz not null default now();
alter table if exists document_requests add column if not exists updated_at timestamptz not null default now();

alter table if exists transaction_checklist_items add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_checklist_items add column if not exists stage text;
alter table if exists transaction_checklist_items add column if not exists label text;
alter table if exists transaction_checklist_items add column if not exists description text;
alter table if exists transaction_checklist_items add column if not exists status text not null default 'pending';
alter table if exists transaction_checklist_items add column if not exists priority text not null default 'required';
alter table if exists transaction_checklist_items add column if not exists owner_role text not null default 'attorney';
alter table if exists transaction_checklist_items add column if not exists owner_user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_checklist_items add column if not exists linked_document_request_id uuid references document_requests(id) on delete set null;
alter table if exists transaction_checklist_items add column if not exists linked_document_id uuid references documents(id) on delete set null;
alter table if exists transaction_checklist_items add column if not exists auto_rule_key text;
alter table if exists transaction_checklist_items add column if not exists is_auto_managed boolean not null default false;
alter table if exists transaction_checklist_items add column if not exists completed_by uuid references profiles(id) on delete set null;
alter table if exists transaction_checklist_items add column if not exists completed_at timestamptz;
alter table if exists transaction_checklist_items add column if not exists overridden_by uuid references profiles(id) on delete set null;
alter table if exists transaction_checklist_items add column if not exists override_reason text;
alter table if exists transaction_checklist_items add column if not exists sort_order integer not null default 0;
alter table if exists transaction_checklist_items add column if not exists created_at timestamptz not null default now();
alter table if exists transaction_checklist_items add column if not exists updated_at timestamptz not null default now();

alter table if exists transaction_issue_overrides add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_issue_overrides add column if not exists issue_type text;
alter table if exists transaction_issue_overrides add column if not exists overridden_by uuid references profiles(id) on delete set null;
alter table if exists transaction_issue_overrides add column if not exists override_reason text;
alter table if exists transaction_issue_overrides add column if not exists resolve_by date;
alter table if exists transaction_issue_overrides add column if not exists is_active boolean not null default true;
alter table if exists transaction_issue_overrides add column if not exists created_at timestamptz not null default now();
alter table if exists transaction_issue_overrides add column if not exists updated_at timestamptz not null default now();

alter table if exists document_requests drop constraint if exists document_requests_priority_check;
alter table if exists document_requests
  add constraint document_requests_priority_check
  check (priority in ('required', 'important', 'optional'));

alter table if exists document_requests drop constraint if exists document_requests_status_check;
alter table if exists document_requests
  add constraint document_requests_status_check
  check (status in ('requested', 'uploaded', 'reviewed', 'rejected', 'completed'));

alter table if exists transaction_checklist_items drop constraint if exists transaction_checklist_items_status_check;
alter table if exists transaction_checklist_items
  add constraint transaction_checklist_items_status_check
  check (status in ('pending', 'in_progress', 'completed', 'blocked', 'waived'));

alter table if exists transaction_checklist_items drop constraint if exists transaction_checklist_items_priority_check;
alter table if exists transaction_checklist_items
  add constraint transaction_checklist_items_priority_check
  check (priority in ('required', 'important', 'optional'));

create index if not exists document_requests_txn_title_idx
  on document_requests (transaction_id, title);
create index if not exists document_requests_transaction_idx on document_requests (transaction_id);
create index if not exists document_requests_status_idx on document_requests (status);
create index if not exists document_requests_assigned_role_idx on document_requests (assigned_to_role);
create index if not exists transaction_checklist_items_transaction_idx on transaction_checklist_items (transaction_id);
create index if not exists transaction_checklist_items_stage_idx on transaction_checklist_items (transaction_id, stage);
create index if not exists transaction_issue_overrides_transaction_idx on transaction_issue_overrides (transaction_id);

alter table transactions drop constraint if exists transactions_reservation_proof_document_fkey;
alter table transactions
  add constraint transactions_reservation_proof_document_fkey
  foreign key (reservation_proof_document) references documents(id) on delete set null;

alter table transactions drop constraint if exists transactions_registration_confirmation_document_id_fkey;
alter table transactions
  add constraint transactions_registration_confirmation_document_id_fkey
  foreign key (registration_confirmation_document_id) references documents(id) on delete set null;

create table if not exists transaction_external_access (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  role text not null check (role in ('client', 'attorney', 'tuckers', 'bond_originator')),
  email text not null,
  access_token text not null unique,
  expires_at timestamptz,
  revoked boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists development_settings (
  development_id uuid primary key references developments(id) on delete cascade,
  client_portal_enabled boolean not null default true,
  snag_reporting_enabled boolean not null default true,
  alteration_requests_enabled boolean not null default false,
  service_reviews_enabled boolean not null default false,
  reservation_deposit_enabled_by_default boolean not null default false,
  reservation_deposit_amount numeric(12, 2),
  reservation_deposit_payment_details jsonb not null default '{}'::jsonb,
  reservation_deposit_notification_recipients jsonb not null default '[]'::jsonb,
  enabled_modules jsonb not null default '{"agent": true, "conveyancing": true, "bond_originator": true}'::jsonb,
  stakeholder_teams jsonb not null default '{"agents": [], "conveyancers": [], "bondOriginators": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists development_settings add column if not exists reservation_deposit_enabled_by_default boolean not null default false;
alter table if exists development_settings add column if not exists reservation_deposit_amount numeric(12, 2);
alter table if exists development_settings add column if not exists reservation_deposit_payment_details jsonb not null default '{}'::jsonb;
alter table if exists development_settings add column if not exists reservation_deposit_notification_recipients jsonb not null default '[]'::jsonb;

create table if not exists development_attorney_configs (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  attorney_firm_name text,
  attorney_firm_id uuid references profiles(id) on delete set null,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  fee_model_type text not null default 'fixed_fee',
  default_fee_amount numeric(12, 2),
  vat_included boolean not null default true,
  disbursements_included boolean not null default false,
  override_allowed boolean not null default true,
  notes text,
  active_from date,
  active_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id)
);

create table if not exists development_attorney_required_closeout_docs (
  id uuid primary key default gen_random_uuid(),
  development_attorney_config_id uuid not null references development_attorney_configs(id) on delete cascade,
  document_type_key text not null,
  label text not null,
  required_for_close_out boolean not null default true,
  visible_to_developer boolean not null default true,
  visible_to_attorney boolean not null default true,
  internal_only boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_attorney_config_id, document_type_key)
);

create table if not exists transaction_attorney_closeouts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  development_id uuid references developments(id) on delete set null,
  attorney_firm_id uuid references profiles(id) on delete set null,
  attorney_firm_name text,
  budgeted_amount numeric(12, 2),
  budget_source text not null default 'development_default',
  budget_notes text,
  actual_billed_amount numeric(12, 2),
  variance_amount numeric(12, 2),
  variance_percent numeric(8, 2),
  vat_included boolean not null default true,
  invoice_reference text,
  invoice_date date,
  statement_date date,
  close_out_status text not null default 'not_started',
  reconciliation_status text not null default 'not_budgeted',
  ready_for_review_at timestamptz,
  ready_for_review_by uuid references profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_attorney_closeout_documents (
  id uuid primary key default gen_random_uuid(),
  transaction_attorney_closeout_id uuid not null references transaction_attorney_closeouts(id) on delete cascade,
  document_type_key text not null,
  label text not null,
  file_path text,
  filename text,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz,
  is_required boolean not null default true,
  status text not null default 'missing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_attorney_closeout_id, document_type_key)
);

create table if not exists development_bond_configs (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  bond_originator_name text,
  bond_originator_id uuid references profiles(id) on delete set null,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  commission_model_type text not null default 'fixed_fee',
  default_commission_amount numeric(12, 2),
  vat_included boolean not null default true,
  override_allowed boolean not null default true,
  notes text,
  active_from date,
  active_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id)
);

create table if not exists development_bond_required_closeout_docs (
  id uuid primary key default gen_random_uuid(),
  development_bond_config_id uuid not null references development_bond_configs(id) on delete cascade,
  document_type_key text not null,
  label text not null,
  required_for_close_out boolean not null default true,
  visible_to_developer boolean not null default true,
  visible_to_bond_originator boolean not null default true,
  internal_only boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_bond_config_id, document_type_key)
);

create table if not exists transaction_bond_closeouts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  development_id uuid references developments(id) on delete set null,
  bond_originator_id uuid references profiles(id) on delete set null,
  bond_originator_name text,
  budgeted_amount numeric(12, 2),
  budget_source text not null default 'development_default',
  budget_notes text,
  actual_paid_amount numeric(12, 2),
  variance_amount numeric(12, 2),
  variance_percent numeric(8, 2),
  vat_included boolean not null default true,
  payout_reference text,
  payout_date date,
  statement_date date,
  close_out_status text not null default 'not_started',
  reconciliation_status text not null default 'not_budgeted',
  ready_for_review_at timestamptz,
  ready_for_review_by uuid references profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_bond_closeout_documents (
  id uuid primary key default gen_random_uuid(),
  transaction_bond_closeout_id uuid not null references transaction_bond_closeouts(id) on delete cascade,
  document_type_key text not null,
  label text not null,
  file_path text,
  filename text,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz,
  is_required boolean not null default true,
  status text not null default 'missing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_bond_closeout_id, document_type_key)
);

create table if not exists client_portal_links (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_issues (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  buyer_id uuid references buyers(id) on delete set null,
  category text not null,
  description text not null,
  location text,
  priority text,
  photo_path text,
  signed_off_by text,
  signed_off_at timestamptz,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists client_issues add column if not exists signed_off_by text;
alter table if exists client_issues add column if not exists signed_off_at timestamptz;

create table if not exists alteration_requests (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  buyer_id uuid references buyers(id) on delete set null,
  title text not null,
  category text,
  description text not null,
  budget_range text,
  preferred_timing text,
  reference_image_path text,
  amount_inc_vat numeric(12,2) default 0,
  invoice_path text,
  proof_of_payment_path text,
  status text not null default 'Pending Review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_reviews (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  buyer_id uuid references buyers(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  positives text,
  improvements text,
  allow_marketing_use boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trust_investment_forms (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  attorney_firm_name text,
  purchaser_full_name text,
  purchaser_identity_or_registration_number text,
  full_name text,
  identity_or_registration_number text,
  income_tax_number text,
  south_african_resident boolean,
  physical_address text,
  postal_address text,
  telephone_number text,
  fax_number text,
  balance_to text,
  bank_name text,
  account_number text,
  branch_number text,
  source_of_funds text,
  declaration_accepted boolean not null default false,
  signature_name text,
  signed_date date,
  status text not null default 'Not Started',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_handover (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  development_id uuid references developments(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  buyer_id uuid references buyers(id) on delete set null,
  status text not null default 'not_started',
  handover_date date,
  electricity_meter_reading text,
  water_meter_reading text,
  gas_meter_reading text,
  keys_handed_over boolean not null default false,
  remote_handed_over boolean not null default false,
  manuals_handed_over boolean not null default false,
  inspection_completed boolean not null default false,
  notes text,
  signature_name text,
  signature_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_onboarding (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  token text not null unique,
  purchaser_type text not null default 'individual',
  status text not null default 'Not Started',
  is_active boolean not null default true,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_form_data (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  purchaser_type text not null default 'individual',
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_client_visible boolean not null default true,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  group_key text not null references document_groups(key) on update cascade on delete restrict,
  expected_from_role text not null default 'client',
  default_visibility text not null default 'client',
  allow_multiple boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_requirement_rules (
  id uuid primary key default gen_random_uuid(),
  purchaser_type text not null,
  marital_structure text,
  finance_type text,
  reservation_required boolean,
  template_key text not null references document_templates(key) on update cascade on delete cascade,
  required boolean not null default true,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_required_documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  document_key text not null,
  document_label text not null,
  is_required boolean not null default true,
  is_uploaded boolean not null default false,
  status text not null default 'missing',
  enabled boolean not null default true,
  group_key text not null default 'buyer_fica',
  group_label text not null default 'Buyer & FICA',
  description text,
  required_from_role text not null default 'client',
  visibility_scope text not null default 'client',
  allow_multiple boolean not null default false,
  uploaded_document_id uuid references documents(id) on delete set null,
  uploaded_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, document_key)
);

create table if not exists transaction_participants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  role_type text not null,
  legal_role text not null default 'none',
  status text not null default 'draft',
  firm_id uuid references firms(id) on delete set null,
  invited_by_user_id uuid references profiles(id) on delete set null,
  invitation_token text,
  invitation_expires_at timestamptz,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  visibility_scope text not null default 'shared',
  participant_name text,
  participant_email text,
  can_view boolean not null default true,
  can_comment boolean not null default true,
  can_upload_documents boolean not null default true,
  can_edit_finance_workflow boolean not null default false,
  can_edit_attorney_workflow boolean not null default false,
  can_edit_core_transaction boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, role_type, legal_role),
  check (status in ('draft', 'invited', 'active', 'removed')),
  check (legal_role in ('none', 'transfer', 'bond', 'cancellation')),
  check (visibility_scope in ('internal', 'shared')),
  check (
    (role_type = 'attorney' and legal_role in ('transfer', 'bond', 'cancellation'))
    or (role_type <> 'attorney' and legal_role = 'none')
  )
);

create table if not exists transaction_comments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  author_name text not null,
  author_role text not null,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists transaction_status_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_readiness_states (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  onboarding_status text not null default 'Not Started',
  onboarding_complete boolean not null default false,
  docs_complete boolean not null default false,
  missing_required_docs integer not null default 0,
  uploaded_required_docs integer not null default 0,
  total_required_docs integer not null default 0,
  finance_lane_ready boolean not null default false,
  attorney_lane_ready boolean not null default false,
  stage_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role_type text not null,
  notification_type text not null,
  title text not null,
  message text not null default '',
  is_read boolean not null default false,
  read_at timestamptz,
  dedupe_key text,
  event_type text not null default 'TransactionUpdated',
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists trust_investment_forms add column if not exists development_id uuid references developments(id) on delete cascade;
alter table if exists trust_investment_forms add column if not exists unit_id uuid references units(id) on delete cascade;
alter table if exists trust_investment_forms add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists trust_investment_forms add column if not exists buyer_id uuid references buyers(id) on delete set null;
alter table if exists trust_investment_forms add column if not exists attorney_firm_name text;
alter table if exists trust_investment_forms add column if not exists purchaser_full_name text;
alter table if exists trust_investment_forms add column if not exists purchaser_identity_or_registration_number text;
alter table if exists trust_investment_forms add column if not exists full_name text;
alter table if exists trust_investment_forms add column if not exists identity_or_registration_number text;
alter table if exists trust_investment_forms add column if not exists income_tax_number text;
alter table if exists trust_investment_forms add column if not exists south_african_resident boolean;
alter table if exists trust_investment_forms add column if not exists physical_address text;
alter table if exists trust_investment_forms add column if not exists postal_address text;
alter table if exists trust_investment_forms add column if not exists telephone_number text;
alter table if exists trust_investment_forms add column if not exists fax_number text;
alter table if exists trust_investment_forms add column if not exists balance_to text;
alter table if exists trust_investment_forms add column if not exists bank_name text;
alter table if exists trust_investment_forms add column if not exists account_number text;
alter table if exists trust_investment_forms add column if not exists branch_number text;
alter table if exists trust_investment_forms add column if not exists source_of_funds text;
alter table if exists trust_investment_forms add column if not exists declaration_accepted boolean not null default false;
alter table if exists trust_investment_forms add column if not exists signature_name text;
alter table if exists trust_investment_forms add column if not exists signed_date date;
alter table if exists trust_investment_forms add column if not exists status text not null default 'Not Started';
alter table if exists trust_investment_forms add column if not exists submitted_at timestamptz;
alter table if exists trust_investment_forms add column if not exists reviewed_at timestamptz;
alter table if exists trust_investment_forms add column if not exists approved_at timestamptz;
alter table if exists trust_investment_forms add column if not exists updated_at timestamptz not null default now();

alter table if exists transaction_onboarding add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_onboarding add column if not exists token text;
alter table if exists transaction_onboarding add column if not exists purchaser_type text not null default 'individual';
alter table if exists transaction_onboarding add column if not exists status text not null default 'Not Started';
alter table if exists transaction_onboarding add column if not exists is_active boolean not null default true;
alter table if exists transaction_onboarding add column if not exists submitted_at timestamptz;
alter table if exists transaction_onboarding add column if not exists updated_at timestamptz not null default now();
update transaction_onboarding
set purchaser_type = 'individual'
where purchaser_type is null;
update transaction_onboarding
set status = 'Not Started'
where status is null;
update transaction_onboarding
set token = concat('onb_', id::text)
where token is null;
alter table transaction_onboarding alter column transaction_id set not null;
alter table transaction_onboarding alter column token set not null;
alter table transaction_onboarding alter column purchaser_type set not null;
alter table transaction_onboarding alter column status set not null;

alter table if exists onboarding_form_data add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists onboarding_form_data add column if not exists purchaser_type text not null default 'individual';
alter table if exists onboarding_form_data add column if not exists form_data jsonb not null default '{}'::jsonb;
alter table if exists onboarding_form_data add column if not exists updated_at timestamptz not null default now();
update onboarding_form_data
set purchaser_type = 'individual'
where purchaser_type is null;
update onboarding_form_data
set form_data = '{}'::jsonb
where form_data is null;
alter table onboarding_form_data alter column transaction_id set not null;
alter table onboarding_form_data alter column purchaser_type set not null;
alter table onboarding_form_data alter column form_data set not null;

alter table if exists document_groups add column if not exists key text;
alter table if exists document_groups add column if not exists label text;
alter table if exists document_groups add column if not exists description text;
alter table if exists document_groups add column if not exists sort_order integer not null default 0;
alter table if exists document_groups add column if not exists is_client_visible boolean not null default true;
alter table if exists document_groups add column if not exists is_enabled boolean not null default true;
alter table if exists document_groups add column if not exists updated_at timestamptz not null default now();
update document_groups set sort_order = 0 where sort_order is null;
update document_groups set is_client_visible = true where is_client_visible is null;
update document_groups set is_enabled = true where is_enabled is null;
alter table document_groups alter column key set not null;
alter table document_groups alter column label set not null;

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

alter table if exists document_templates add column if not exists key text;
alter table if exists document_templates add column if not exists label text;
alter table if exists document_templates add column if not exists description text;
alter table if exists document_templates add column if not exists group_key text references document_groups(key) on update cascade on delete restrict;
alter table if exists document_templates add column if not exists expected_from_role text not null default 'client';
alter table if exists document_templates add column if not exists default_visibility text not null default 'client';
alter table if exists document_templates add column if not exists allow_multiple boolean not null default false;
alter table if exists document_templates add column if not exists sort_order integer not null default 0;
alter table if exists document_templates add column if not exists is_active boolean not null default true;
alter table if exists document_templates add column if not exists updated_at timestamptz not null default now();
update document_templates set sort_order = 0 where sort_order is null;
update document_templates set expected_from_role = 'client' where expected_from_role is null;
update document_templates set default_visibility = 'client' where default_visibility is null;
update document_templates set allow_multiple = false where allow_multiple is null;
update document_templates set is_active = true where is_active is null;
update document_templates set group_key = 'buyer_fica' where group_key is null;
alter table document_templates alter column key set not null;
alter table document_templates alter column label set not null;
alter table document_templates alter column group_key set not null;

alter table if exists document_requirement_rules add column if not exists purchaser_type text;
alter table if exists document_requirement_rules add column if not exists marital_structure text;
alter table if exists document_requirement_rules add column if not exists finance_type text;
alter table if exists document_requirement_rules add column if not exists reservation_required boolean;
alter table if exists document_requirement_rules add column if not exists template_key text references document_templates(key) on update cascade on delete cascade;
alter table if exists document_requirement_rules add column if not exists required boolean not null default true;
alter table if exists document_requirement_rules add column if not exists enabled boolean not null default true;
alter table if exists document_requirement_rules add column if not exists notes text;
alter table if exists document_requirement_rules add column if not exists updated_at timestamptz not null default now();
update document_requirement_rules set required = true where required is null;
update document_requirement_rules set enabled = true where enabled is null;
update document_requirement_rules set purchaser_type = 'individual' where purchaser_type is null;
alter table document_requirement_rules alter column purchaser_type set not null;
alter table document_requirement_rules alter column template_key set not null;

alter table if exists transaction_required_documents add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_required_documents add column if not exists document_key text;
alter table if exists transaction_required_documents add column if not exists document_label text;
alter table if exists transaction_required_documents add column if not exists is_required boolean not null default true;
alter table if exists transaction_required_documents add column if not exists is_uploaded boolean not null default false;
alter table if exists transaction_required_documents add column if not exists status text not null default 'missing';
alter table if exists transaction_required_documents add column if not exists enabled boolean not null default true;
alter table if exists transaction_required_documents add column if not exists group_key text not null default 'buyer_fica';
alter table if exists transaction_required_documents add column if not exists group_label text not null default 'Buyer & FICA';
alter table if exists transaction_required_documents add column if not exists description text;
alter table if exists transaction_required_documents add column if not exists required_from_role text not null default 'client';
alter table if exists transaction_required_documents add column if not exists visibility_scope text not null default 'client';
alter table if exists transaction_required_documents add column if not exists allow_multiple boolean not null default false;
alter table if exists transaction_required_documents add column if not exists uploaded_document_id uuid references documents(id) on delete set null;
alter table if exists transaction_required_documents add column if not exists uploaded_at timestamptz;
alter table if exists transaction_required_documents add column if not exists verified_at timestamptz;
alter table if exists transaction_required_documents add column if not exists rejected_at timestamptz;
alter table if exists transaction_required_documents add column if not exists notes text;
alter table if exists transaction_required_documents add column if not exists sort_order integer not null default 0;
alter table if exists transaction_required_documents add column if not exists updated_at timestamptz not null default now();
update transaction_required_documents
set is_required = true
where is_required is null;
update transaction_required_documents
set is_uploaded = false
where is_uploaded is null;
update transaction_required_documents
set status = case when is_uploaded then 'uploaded' else 'missing' end
where status is null;
update transaction_required_documents
set enabled = true
where enabled is null;
update transaction_required_documents
set group_key = 'buyer_fica'
where group_key is null;
update transaction_required_documents
set group_label = 'Buyer & FICA'
where group_label is null;
update transaction_required_documents
set required_from_role = 'client'
where required_from_role is null;
update transaction_required_documents
set visibility_scope = 'client'
where visibility_scope is null;
update transaction_required_documents
set allow_multiple = false
where allow_multiple is null;
update transaction_required_documents
set sort_order = 0
where sort_order is null;
alter table transaction_required_documents alter column transaction_id set not null;
alter table transaction_required_documents alter column document_key set not null;
alter table transaction_required_documents alter column document_label set not null;
alter table transaction_required_documents alter column status set not null;
alter table transaction_required_documents alter column enabled set not null;
alter table transaction_required_documents alter column group_key set not null;
alter table transaction_required_documents alter column group_label set not null;
alter table transaction_required_documents alter column required_from_role set not null;
alter table transaction_required_documents alter column visibility_scope set not null;

alter table if exists transaction_participants add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_participants add column if not exists user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_participants add column if not exists role_type text;
alter table if exists transaction_participants add column if not exists legal_role text not null default 'none';
alter table if exists transaction_participants add column if not exists status text not null default 'draft';
alter table if exists transaction_participants add column if not exists firm_id uuid references firms(id) on delete set null;
alter table if exists transaction_participants add column if not exists invited_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_participants add column if not exists invitation_token text;
alter table if exists transaction_participants add column if not exists invitation_expires_at timestamptz;
alter table if exists transaction_participants add column if not exists invited_at timestamptz not null default now();
alter table if exists transaction_participants add column if not exists accepted_at timestamptz;
alter table if exists transaction_participants add column if not exists removed_at timestamptz;
alter table if exists transaction_participants add column if not exists visibility_scope text not null default 'shared';
alter table if exists transaction_participants add column if not exists participant_name text;
alter table if exists transaction_participants add column if not exists participant_email text;
alter table if exists transaction_participants add column if not exists can_view boolean not null default true;
alter table if exists transaction_participants add column if not exists can_comment boolean not null default true;
alter table if exists transaction_participants add column if not exists can_upload_documents boolean not null default true;
alter table if exists transaction_participants add column if not exists can_edit_finance_workflow boolean not null default false;
alter table if exists transaction_participants add column if not exists can_edit_attorney_workflow boolean not null default false;
alter table if exists transaction_participants add column if not exists can_edit_core_transaction boolean not null default false;
alter table if exists transaction_participants add column if not exists updated_at timestamptz not null default now();
update transaction_participants set can_view = true where can_view is null;
update transaction_participants set can_comment = true where can_comment is null;
update transaction_participants set can_upload_documents = true where can_upload_documents is null;
update transaction_participants set can_edit_finance_workflow = false where can_edit_finance_workflow is null;
update transaction_participants set can_edit_attorney_workflow = false where can_edit_attorney_workflow is null;
update transaction_participants set can_edit_core_transaction = false where can_edit_core_transaction is null;
update transaction_participants set status = 'active' where status is null;
update transaction_participants set legal_role = case when role_type = 'attorney' then 'transfer' else 'none' end where legal_role is null;
update transaction_participants set visibility_scope = 'shared' where visibility_scope is null;
update transaction_participants set accepted_at = coalesce(accepted_at, created_at) where status = 'active' and accepted_at is null;
update transaction_participants tp
set user_id = p.id
from profiles p
where tp.user_id is null
  and tp.participant_email is not null
  and lower(tp.participant_email) = lower(p.email);

alter table if exists transaction_comments add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_comments add column if not exists author_name text;
alter table if exists transaction_comments add column if not exists author_role text;
alter table if exists transaction_comments add column if not exists comment_text text;
update transaction_comments set author_name = coalesce(author_name, 'Samlin Team') where author_name is null;
update transaction_comments set author_role = coalesce(author_role, 'developer') where author_role is null;
update transaction_comments set comment_text = coalesce(comment_text, '') where comment_text is null;
alter table transaction_comments alter column transaction_id set not null;
alter table transaction_comments alter column author_name set not null;
alter table transaction_comments alter column author_role set not null;
alter table transaction_comments alter column comment_text set not null;

alter table if exists transaction_status_links add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_status_links add column if not exists token text;
alter table if exists transaction_status_links add column if not exists is_active boolean not null default true;
alter table if exists transaction_status_links add column if not exists created_by_role text;
alter table if exists transaction_status_links add column if not exists updated_at timestamptz not null default now();
update transaction_status_links
set token = concat('ts_', id::text)
where token is null;
alter table transaction_status_links alter column transaction_id set not null;
alter table transaction_status_links alter column token set not null;

alter table if exists transaction_events add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_events add column if not exists event_type text;
alter table if exists transaction_events add column if not exists event_data jsonb not null default '{}'::jsonb;
alter table if exists transaction_events add column if not exists created_by uuid references profiles(id) on delete set null;
alter table if exists transaction_events add column if not exists created_by_role text;
alter table if exists transaction_events add column if not exists updated_at timestamptz not null default now();
update transaction_events
set event_data = '{}'::jsonb
where event_data is null;
update transaction_events
set event_type = 'TransactionUpdated'
where event_type is null;
delete from transaction_events
where transaction_id is null;
alter table transaction_events alter column transaction_id set not null;
alter table transaction_events alter column event_type set not null;
alter table transaction_events alter column event_data set not null;

alter table if exists transaction_readiness_states add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_readiness_states add column if not exists onboarding_status text not null default 'Not Started';
alter table if exists transaction_readiness_states add column if not exists onboarding_complete boolean not null default false;
alter table if exists transaction_readiness_states add column if not exists docs_complete boolean not null default false;
alter table if exists transaction_readiness_states add column if not exists missing_required_docs integer not null default 0;
alter table if exists transaction_readiness_states add column if not exists uploaded_required_docs integer not null default 0;
alter table if exists transaction_readiness_states add column if not exists total_required_docs integer not null default 0;
alter table if exists transaction_readiness_states add column if not exists finance_lane_ready boolean not null default false;
alter table if exists transaction_readiness_states add column if not exists attorney_lane_ready boolean not null default false;
alter table if exists transaction_readiness_states add column if not exists stage_ready boolean not null default false;
alter table if exists transaction_readiness_states add column if not exists updated_at timestamptz not null default now();
update transaction_readiness_states
set onboarding_status = 'Not Started'
where onboarding_status is null;
update transaction_readiness_states
set onboarding_complete = false
where onboarding_complete is null;
update transaction_readiness_states
set docs_complete = false
where docs_complete is null;
update transaction_readiness_states
set missing_required_docs = 0
where missing_required_docs is null;
update transaction_readiness_states
set uploaded_required_docs = 0
where uploaded_required_docs is null;
update transaction_readiness_states
set total_required_docs = 0
where total_required_docs is null;
update transaction_readiness_states
set finance_lane_ready = false
where finance_lane_ready is null;
update transaction_readiness_states
set attorney_lane_ready = false
where attorney_lane_ready is null;
update transaction_readiness_states
set stage_ready = false
where stage_ready is null;
delete from transaction_readiness_states
where transaction_id is null;
alter table transaction_readiness_states alter column transaction_id set not null;

alter table if exists transaction_notifications add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_notifications add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table if exists transaction_notifications add column if not exists role_type text;
alter table if exists transaction_notifications add column if not exists notification_type text;
alter table if exists transaction_notifications add column if not exists title text;
alter table if exists transaction_notifications add column if not exists message text not null default '';
alter table if exists transaction_notifications add column if not exists is_read boolean not null default false;
alter table if exists transaction_notifications add column if not exists read_at timestamptz;
alter table if exists transaction_notifications add column if not exists dedupe_key text;
alter table if exists transaction_notifications add column if not exists event_type text not null default 'TransactionUpdated';
alter table if exists transaction_notifications add column if not exists event_data jsonb not null default '{}'::jsonb;
alter table if exists transaction_notifications add column if not exists updated_at timestamptz not null default now();
update transaction_notifications
set message = ''
where message is null;
update transaction_notifications
set is_read = false
where is_read is null;
update transaction_notifications
set event_type = 'TransactionUpdated'
where event_type is null;
update transaction_notifications
set event_data = '{}'::jsonb
where event_data is null;
delete from transaction_notifications
where user_id is null;
alter table transaction_notifications alter column user_id set not null;
alter table transaction_notifications alter column role_type set not null;
alter table transaction_notifications alter column notification_type set not null;
alter table transaction_notifications alter column title set not null;
alter table transaction_notifications alter column message set not null;
alter table transaction_notifications alter column event_type set not null;
alter table transaction_notifications alter column event_data set not null;

alter table transaction_participants drop constraint if exists transaction_participants_role_type_check;
alter table transaction_participants drop constraint if exists transaction_participants_transaction_id_role_type_key;
alter table transaction_participants drop constraint if exists transaction_participants_transaction_id_role_type_legal_role_key;
alter table transaction_participants
  add constraint transaction_participants_transaction_id_role_type_legal_role_key
  unique (transaction_id, role_type, legal_role);
alter table transaction_participants
  add constraint transaction_participants_role_type_check
  check (role_type in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin'));

alter table transaction_participants drop constraint if exists transaction_participants_status_check;
alter table transaction_participants
  add constraint transaction_participants_status_check
  check (status in ('draft', 'invited', 'active', 'removed'));

alter table transaction_participants drop constraint if exists transaction_participants_legal_role_check;
alter table transaction_participants
  add constraint transaction_participants_legal_role_check
  check (legal_role in ('none', 'transfer', 'bond', 'cancellation'));

alter table transaction_participants drop constraint if exists transaction_participants_role_legal_assignment_check;
alter table transaction_participants
  add constraint transaction_participants_role_legal_assignment_check
  check (
    (role_type = 'attorney' and legal_role in ('transfer', 'bond', 'cancellation'))
    or (role_type <> 'attorney' and legal_role = 'none')
  );

alter table transaction_participants drop constraint if exists transaction_participants_visibility_scope_check;
alter table transaction_participants
  add constraint transaction_participants_visibility_scope_check
  check (visibility_scope in ('internal', 'shared'));

alter table transaction_comments drop constraint if exists transaction_comments_author_role_check;
alter table transaction_comments
  add constraint transaction_comments_author_role_check
  check (author_role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin', 'system'));

alter table transaction_status_links drop constraint if exists transaction_status_links_created_by_role_check;
alter table transaction_status_links
  add constraint transaction_status_links_created_by_role_check
  check (
    created_by_role is null
    or created_by_role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin', 'system')
  );

alter table transaction_events drop constraint if exists transaction_events_event_type_check;
alter table transaction_events
  add constraint transaction_events_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated'
    )
  );

alter table transaction_events drop constraint if exists transaction_events_created_by_role_check;
alter table transaction_events
  add constraint transaction_events_created_by_role_check
  check (
    created_by_role is null
    or created_by_role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin', 'system')
  );

alter table transaction_readiness_states drop constraint if exists transaction_readiness_states_onboarding_status_check;
alter table transaction_readiness_states
  add constraint transaction_readiness_states_onboarding_status_check
  check (onboarding_status in ('Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved'));

alter table transaction_readiness_states drop constraint if exists transaction_readiness_states_missing_required_docs_check;
alter table transaction_readiness_states
  add constraint transaction_readiness_states_missing_required_docs_check
  check (missing_required_docs >= 0 and uploaded_required_docs >= 0 and total_required_docs >= 0);

alter table transaction_notifications drop constraint if exists transaction_notifications_role_type_check;
alter table transaction_notifications
  add constraint transaction_notifications_role_type_check
  check (role_type in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin'));

alter table transaction_notifications drop constraint if exists transaction_notifications_notification_type_check;
alter table transaction_notifications
  add constraint transaction_notifications_notification_type_check
  check (
    notification_type in (
      'participant_assigned',
      'document_uploaded',
      'readiness_updated',
      'lane_handoff',
      'registration_completed',
      'overdue_missing_docs'
    )
  );

alter table transaction_notifications drop constraint if exists transaction_notifications_event_type_check;
alter table transaction_notifications
  add constraint transaction_notifications_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated'
    )
  );

alter table trust_investment_forms drop constraint if exists trust_investment_forms_status_check;
alter table trust_investment_forms
  add constraint trust_investment_forms_status_check
  check (status in ('Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved'));

alter table if exists transaction_handover add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_handover add column if not exists development_id uuid references developments(id) on delete set null;
alter table if exists transaction_handover add column if not exists unit_id uuid references units(id) on delete set null;
alter table if exists transaction_handover add column if not exists buyer_id uuid references buyers(id) on delete set null;
alter table if exists transaction_handover add column if not exists status text not null default 'not_started';
alter table if exists transaction_handover add column if not exists handover_date date;
alter table if exists transaction_handover add column if not exists electricity_meter_reading text;
alter table if exists transaction_handover add column if not exists water_meter_reading text;
alter table if exists transaction_handover add column if not exists gas_meter_reading text;
alter table if exists transaction_handover add column if not exists keys_handed_over boolean not null default false;
alter table if exists transaction_handover add column if not exists remote_handed_over boolean not null default false;
alter table if exists transaction_handover add column if not exists manuals_handed_over boolean not null default false;
alter table if exists transaction_handover add column if not exists inspection_completed boolean not null default false;
alter table if exists transaction_handover add column if not exists notes text;
alter table if exists transaction_handover add column if not exists signature_name text;
alter table if exists transaction_handover add column if not exists signature_signed_at timestamptz;
alter table if exists transaction_handover add column if not exists updated_at timestamptz not null default now();
update transaction_handover
set status = 'not_started'
where status is null;
update transaction_handover
set keys_handed_over = false
where keys_handed_over is null;
update transaction_handover
set remote_handed_over = false
where remote_handed_over is null;
update transaction_handover
set manuals_handed_over = false
where manuals_handed_over is null;
update transaction_handover
set inspection_completed = false
where inspection_completed is null;
update transaction_handover
set transaction_id = transactions.id
from transactions
where transaction_handover.transaction_id is null
  and transaction_handover.unit_id = transactions.unit_id;

alter table transaction_handover drop constraint if exists transaction_handover_status_check;
alter table transaction_handover
  add constraint transaction_handover_status_check
  check (status in ('not_started', 'in_progress', 'completed'));

alter table transaction_onboarding drop constraint if exists transaction_onboarding_status_check;
alter table transaction_onboarding
  add constraint transaction_onboarding_status_check
  check (status in ('Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved'));

alter table transaction_onboarding drop constraint if exists transaction_onboarding_purchaser_type_check;
alter table transaction_onboarding
  add constraint transaction_onboarding_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table onboarding_form_data drop constraint if exists onboarding_form_data_purchaser_type_check;
alter table onboarding_form_data
  add constraint onboarding_form_data_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table document_groups drop constraint if exists document_groups_key_format_check;
alter table document_groups
  add constraint document_groups_key_format_check
  check (key ~ '^[a-z0-9_]+$');

alter table document_templates drop constraint if exists document_templates_expected_from_role_check;
alter table document_templates
  add constraint document_templates_expected_from_role_check
  check (expected_from_role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'system'));

alter table document_templates drop constraint if exists document_templates_default_visibility_check;
alter table document_templates
  add constraint document_templates_default_visibility_check
  check (default_visibility in ('internal', 'shared', 'client'));

alter table document_requirement_rules drop constraint if exists document_requirement_rules_purchaser_type_check;
alter table document_requirement_rules
  add constraint document_requirement_rules_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table document_requirement_rules drop constraint if exists document_requirement_rules_finance_type_check;
alter table document_requirement_rules
  add constraint document_requirement_rules_finance_type_check
  check (finance_type is null or finance_type in ('cash', 'bond', 'combination', 'hybrid'));

alter table transaction_required_documents drop constraint if exists transaction_required_documents_status_check;
alter table transaction_required_documents
  add constraint transaction_required_documents_status_check
  check (status in ('missing', 'uploaded', 'under_review', 'accepted', 'reupload_required', 'not_required'));

alter table transaction_required_documents drop constraint if exists transaction_required_documents_visibility_scope_check;
alter table transaction_required_documents
  add constraint transaction_required_documents_visibility_scope_check
  check (visibility_scope in ('internal', 'shared', 'client'));

alter table transaction_required_documents drop constraint if exists transaction_required_documents_required_from_role_check;
alter table transaction_required_documents
  add constraint transaction_required_documents_required_from_role_check
  check (required_from_role in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'system'));

create table if not exists snapshot_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_key text not null,
  token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists snapshot_links add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table if exists snapshot_links add column if not exists owner_key text;
alter table if exists snapshot_links add column if not exists token text;
alter table if exists snapshot_links add column if not exists is_active boolean not null default true;
alter table if exists snapshot_links add column if not exists updated_at timestamptz not null default now();
update snapshot_links
set owner_key = coalesce(owner_key, concat('legacy:', id::text))
where owner_key is null;
alter table snapshot_links alter column owner_key set not null;
alter table snapshot_links alter column token set not null;
alter table snapshot_links alter column is_active set default true;

alter table if exists documents add column if not exists uploaded_by_role text;
alter table if exists documents add column if not exists uploaded_by_email text;
alter table if exists documents add column if not exists external_access_id uuid;
alter table if exists documents add column if not exists is_client_visible boolean not null default false;
alter table if exists documents add column if not exists uploaded_by_user_id uuid references profiles(id) on delete set null;
alter table if exists documents add column if not exists document_type text;
alter table if exists documents add column if not exists visibility_scope text not null default 'internal';
alter table if exists documents add column if not exists stage_key text;
update documents
set document_type = coalesce(document_type, category, 'General')
where document_type is null;
update documents
set visibility_scope = case
  when coalesce(is_client_visible, false) then 'shared'
  else 'internal'
end
where visibility_scope is null;
alter table documents drop constraint if exists documents_visibility_scope_check;
alter table documents
  add constraint documents_visibility_scope_check
  check (visibility_scope in ('internal', 'shared', 'client'));
update documents d
set uploaded_by_user_id = p.id
from profiles p
where d.uploaded_by_user_id is null
  and d.uploaded_by_email is not null
  and lower(d.uploaded_by_email) = lower(p.email);
alter table documents drop constraint if exists documents_external_access_id_fkey;
alter table documents
  add constraint documents_external_access_id_fkey
  foreign key (external_access_id) references transaction_external_access(id) on delete set null;

alter table if exists development_settings add column if not exists client_portal_enabled boolean not null default true;
alter table if exists development_settings add column if not exists snag_reporting_enabled boolean not null default true;
alter table if exists development_settings add column if not exists alteration_requests_enabled boolean not null default false;
alter table if exists development_settings add column if not exists service_reviews_enabled boolean not null default false;
alter table if exists development_settings add column if not exists enabled_modules jsonb not null default '{"agent": true, "conveyancing": true, "bond_originator": true}'::jsonb;
alter table if exists development_settings add column if not exists stakeholder_teams jsonb not null default '{"agents": [], "conveyancers": [], "bondOriginators": []}'::jsonb;
alter table if exists development_settings add column if not exists updated_at timestamptz not null default now();
alter table if exists development_attorney_configs add column if not exists development_id uuid references developments(id) on delete cascade;
alter table if exists development_attorney_configs add column if not exists attorney_firm_name text;
alter table if exists development_attorney_configs add column if not exists attorney_firm_id uuid references profiles(id) on delete set null;
alter table if exists development_attorney_configs add column if not exists primary_contact_name text;
alter table if exists development_attorney_configs add column if not exists primary_contact_email text;
alter table if exists development_attorney_configs add column if not exists primary_contact_phone text;
alter table if exists development_attorney_configs add column if not exists fee_model_type text not null default 'fixed_fee';
alter table if exists development_attorney_configs add column if not exists default_fee_amount numeric(12, 2);
alter table if exists development_attorney_configs add column if not exists vat_included boolean not null default true;
alter table if exists development_attorney_configs add column if not exists disbursements_included boolean not null default false;
alter table if exists development_attorney_configs add column if not exists override_allowed boolean not null default true;
alter table if exists development_attorney_configs add column if not exists notes text;
alter table if exists development_attorney_configs add column if not exists active_from date;
alter table if exists development_attorney_configs add column if not exists active_to date;
alter table if exists development_attorney_configs add column if not exists is_active boolean not null default true;
alter table if exists development_attorney_configs add column if not exists updated_at timestamptz not null default now();
update development_attorney_configs set fee_model_type = 'fixed_fee' where fee_model_type is null;
update development_attorney_configs set vat_included = true where vat_included is null;
update development_attorney_configs set disbursements_included = false where disbursements_included is null;
update development_attorney_configs set override_allowed = true where override_allowed is null;
update development_attorney_configs set is_active = true where is_active is null;
alter table development_attorney_configs alter column development_id set not null;
alter table development_attorney_configs alter column fee_model_type set not null;

alter table if exists development_attorney_required_closeout_docs add column if not exists development_attorney_config_id uuid references development_attorney_configs(id) on delete cascade;
alter table if exists development_attorney_required_closeout_docs add column if not exists document_type_key text;
alter table if exists development_attorney_required_closeout_docs add column if not exists label text;
alter table if exists development_attorney_required_closeout_docs add column if not exists required_for_close_out boolean not null default true;
alter table if exists development_attorney_required_closeout_docs add column if not exists visible_to_developer boolean not null default true;
alter table if exists development_attorney_required_closeout_docs add column if not exists visible_to_attorney boolean not null default true;
alter table if exists development_attorney_required_closeout_docs add column if not exists internal_only boolean not null default false;
alter table if exists development_attorney_required_closeout_docs add column if not exists sort_order integer not null default 0;
alter table if exists development_attorney_required_closeout_docs add column if not exists is_active boolean not null default true;
alter table if exists development_attorney_required_closeout_docs add column if not exists updated_at timestamptz not null default now();
update development_attorney_required_closeout_docs set required_for_close_out = true where required_for_close_out is null;
update development_attorney_required_closeout_docs set visible_to_developer = true where visible_to_developer is null;
update development_attorney_required_closeout_docs set visible_to_attorney = true where visible_to_attorney is null;
update development_attorney_required_closeout_docs set internal_only = false where internal_only is null;
update development_attorney_required_closeout_docs set sort_order = 0 where sort_order is null;
update development_attorney_required_closeout_docs set is_active = true where is_active is null;
alter table development_attorney_required_closeout_docs alter column development_attorney_config_id set not null;
alter table development_attorney_required_closeout_docs alter column document_type_key set not null;
alter table development_attorney_required_closeout_docs alter column label set not null;

alter table if exists transaction_attorney_closeouts add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_attorney_closeouts add column if not exists development_id uuid references developments(id) on delete set null;
alter table if exists transaction_attorney_closeouts add column if not exists attorney_firm_id uuid references profiles(id) on delete set null;
alter table if exists transaction_attorney_closeouts add column if not exists attorney_firm_name text;
alter table if exists transaction_attorney_closeouts add column if not exists budgeted_amount numeric(12, 2);
alter table if exists transaction_attorney_closeouts add column if not exists budget_source text not null default 'development_default';
alter table if exists transaction_attorney_closeouts add column if not exists budget_notes text;
alter table if exists transaction_attorney_closeouts add column if not exists actual_billed_amount numeric(12, 2);
alter table if exists transaction_attorney_closeouts add column if not exists variance_amount numeric(12, 2);
alter table if exists transaction_attorney_closeouts add column if not exists variance_percent numeric(8, 2);
alter table if exists transaction_attorney_closeouts add column if not exists vat_included boolean not null default true;
alter table if exists transaction_attorney_closeouts add column if not exists invoice_reference text;
alter table if exists transaction_attorney_closeouts add column if not exists invoice_date date;
alter table if exists transaction_attorney_closeouts add column if not exists statement_date date;
alter table if exists transaction_attorney_closeouts add column if not exists close_out_status text not null default 'not_started';
alter table if exists transaction_attorney_closeouts add column if not exists reconciliation_status text not null default 'not_budgeted';
alter table if exists transaction_attorney_closeouts add column if not exists ready_for_review_at timestamptz;
alter table if exists transaction_attorney_closeouts add column if not exists ready_for_review_by uuid references profiles(id) on delete set null;
alter table if exists transaction_attorney_closeouts add column if not exists closed_at timestamptz;
alter table if exists transaction_attorney_closeouts add column if not exists closed_by uuid references profiles(id) on delete set null;
alter table if exists transaction_attorney_closeouts add column if not exists notes text;
alter table if exists transaction_attorney_closeouts add column if not exists updated_at timestamptz not null default now();
update transaction_attorney_closeouts set budget_source = 'development_default' where budget_source is null;
update transaction_attorney_closeouts set vat_included = true where vat_included is null;
update transaction_attorney_closeouts set close_out_status = 'not_started' where close_out_status is null;
update transaction_attorney_closeouts set reconciliation_status = 'not_budgeted' where reconciliation_status is null;
alter table transaction_attorney_closeouts alter column transaction_id set not null;
alter table transaction_attorney_closeouts alter column budget_source set not null;
alter table transaction_attorney_closeouts alter column close_out_status set not null;
alter table transaction_attorney_closeouts alter column reconciliation_status set not null;

alter table if exists transaction_attorney_closeout_documents add column if not exists transaction_attorney_closeout_id uuid references transaction_attorney_closeouts(id) on delete cascade;
alter table if exists transaction_attorney_closeout_documents add column if not exists document_type_key text;
alter table if exists transaction_attorney_closeout_documents add column if not exists label text;
alter table if exists transaction_attorney_closeout_documents add column if not exists file_path text;
alter table if exists transaction_attorney_closeout_documents add column if not exists filename text;
alter table if exists transaction_attorney_closeout_documents add column if not exists uploaded_by uuid references profiles(id) on delete set null;
alter table if exists transaction_attorney_closeout_documents add column if not exists uploaded_at timestamptz;
alter table if exists transaction_attorney_closeout_documents add column if not exists is_required boolean not null default true;
alter table if exists transaction_attorney_closeout_documents add column if not exists status text not null default 'missing';
alter table if exists transaction_attorney_closeout_documents add column if not exists updated_at timestamptz not null default now();
update transaction_attorney_closeout_documents set is_required = true where is_required is null;
update transaction_attorney_closeout_documents set status = 'missing' where status is null;
alter table transaction_attorney_closeout_documents alter column transaction_attorney_closeout_id set not null;
alter table transaction_attorney_closeout_documents alter column document_type_key set not null;
alter table transaction_attorney_closeout_documents alter column label set not null;
alter table transaction_attorney_closeout_documents alter column status set not null;

alter table if exists development_bond_configs add column if not exists development_id uuid references developments(id) on delete cascade;
alter table if exists development_bond_configs add column if not exists bond_originator_name text;
alter table if exists development_bond_configs add column if not exists bond_originator_id uuid references profiles(id) on delete set null;
alter table if exists development_bond_configs add column if not exists primary_contact_name text;
alter table if exists development_bond_configs add column if not exists primary_contact_email text;
alter table if exists development_bond_configs add column if not exists primary_contact_phone text;
alter table if exists development_bond_configs add column if not exists commission_model_type text not null default 'fixed_fee';
alter table if exists development_bond_configs add column if not exists default_commission_amount numeric(12, 2);
alter table if exists development_bond_configs add column if not exists vat_included boolean not null default true;
alter table if exists development_bond_configs add column if not exists override_allowed boolean not null default true;
alter table if exists development_bond_configs add column if not exists notes text;
alter table if exists development_bond_configs add column if not exists active_from date;
alter table if exists development_bond_configs add column if not exists active_to date;
alter table if exists development_bond_configs add column if not exists is_active boolean not null default true;
alter table if exists development_bond_configs add column if not exists updated_at timestamptz not null default now();
update development_bond_configs set commission_model_type = 'fixed_fee' where commission_model_type is null;
update development_bond_configs set vat_included = true where vat_included is null;
update development_bond_configs set override_allowed = true where override_allowed is null;
update development_bond_configs set is_active = true where is_active is null;
alter table development_bond_configs alter column development_id set not null;
alter table development_bond_configs alter column commission_model_type set not null;

alter table if exists development_bond_required_closeout_docs add column if not exists development_bond_config_id uuid references development_bond_configs(id) on delete cascade;
alter table if exists development_bond_required_closeout_docs add column if not exists document_type_key text;
alter table if exists development_bond_required_closeout_docs add column if not exists label text;
alter table if exists development_bond_required_closeout_docs add column if not exists required_for_close_out boolean not null default true;
alter table if exists development_bond_required_closeout_docs add column if not exists visible_to_developer boolean not null default true;
alter table if exists development_bond_required_closeout_docs add column if not exists visible_to_bond_originator boolean not null default true;
alter table if exists development_bond_required_closeout_docs add column if not exists internal_only boolean not null default false;
alter table if exists development_bond_required_closeout_docs add column if not exists sort_order integer not null default 0;
alter table if exists development_bond_required_closeout_docs add column if not exists is_active boolean not null default true;
alter table if exists development_bond_required_closeout_docs add column if not exists updated_at timestamptz not null default now();
update development_bond_required_closeout_docs set required_for_close_out = true where required_for_close_out is null;
update development_bond_required_closeout_docs set visible_to_developer = true where visible_to_developer is null;
update development_bond_required_closeout_docs set visible_to_bond_originator = true where visible_to_bond_originator is null;
update development_bond_required_closeout_docs set internal_only = false where internal_only is null;
update development_bond_required_closeout_docs set sort_order = 0 where sort_order is null;
update development_bond_required_closeout_docs set is_active = true where is_active is null;
alter table development_bond_required_closeout_docs alter column development_bond_config_id set not null;
alter table development_bond_required_closeout_docs alter column document_type_key set not null;
alter table development_bond_required_closeout_docs alter column label set not null;

alter table if exists transaction_bond_closeouts add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists transaction_bond_closeouts add column if not exists development_id uuid references developments(id) on delete set null;
alter table if exists transaction_bond_closeouts add column if not exists bond_originator_id uuid references profiles(id) on delete set null;
alter table if exists transaction_bond_closeouts add column if not exists bond_originator_name text;
alter table if exists transaction_bond_closeouts add column if not exists budgeted_amount numeric(12, 2);
alter table if exists transaction_bond_closeouts add column if not exists budget_source text not null default 'development_default';
alter table if exists transaction_bond_closeouts add column if not exists budget_notes text;
alter table if exists transaction_bond_closeouts add column if not exists actual_paid_amount numeric(12, 2);
alter table if exists transaction_bond_closeouts add column if not exists variance_amount numeric(12, 2);
alter table if exists transaction_bond_closeouts add column if not exists variance_percent numeric(8, 2);
alter table if exists transaction_bond_closeouts add column if not exists vat_included boolean not null default true;
alter table if exists transaction_bond_closeouts add column if not exists payout_reference text;
alter table if exists transaction_bond_closeouts add column if not exists payout_date date;
alter table if exists transaction_bond_closeouts add column if not exists statement_date date;
alter table if exists transaction_bond_closeouts add column if not exists close_out_status text not null default 'not_started';
alter table if exists transaction_bond_closeouts add column if not exists reconciliation_status text not null default 'not_budgeted';
alter table if exists transaction_bond_closeouts add column if not exists ready_for_review_at timestamptz;
alter table if exists transaction_bond_closeouts add column if not exists ready_for_review_by uuid references profiles(id) on delete set null;
alter table if exists transaction_bond_closeouts add column if not exists closed_at timestamptz;
alter table if exists transaction_bond_closeouts add column if not exists closed_by uuid references profiles(id) on delete set null;
alter table if exists transaction_bond_closeouts add column if not exists notes text;
alter table if exists transaction_bond_closeouts add column if not exists updated_at timestamptz not null default now();
update transaction_bond_closeouts set budget_source = 'development_default' where budget_source is null;
update transaction_bond_closeouts set vat_included = true where vat_included is null;
update transaction_bond_closeouts set close_out_status = 'not_started' where close_out_status is null;
update transaction_bond_closeouts set reconciliation_status = 'not_budgeted' where reconciliation_status is null;
alter table transaction_bond_closeouts alter column transaction_id set not null;
alter table transaction_bond_closeouts alter column budget_source set not null;
alter table transaction_bond_closeouts alter column close_out_status set not null;
alter table transaction_bond_closeouts alter column reconciliation_status set not null;

alter table if exists transaction_bond_closeout_documents add column if not exists transaction_bond_closeout_id uuid references transaction_bond_closeouts(id) on delete cascade;
alter table if exists transaction_bond_closeout_documents add column if not exists document_type_key text;
alter table if exists transaction_bond_closeout_documents add column if not exists label text;
alter table if exists transaction_bond_closeout_documents add column if not exists file_path text;
alter table if exists transaction_bond_closeout_documents add column if not exists filename text;
alter table if exists transaction_bond_closeout_documents add column if not exists uploaded_by uuid references profiles(id) on delete set null;
alter table if exists transaction_bond_closeout_documents add column if not exists uploaded_at timestamptz;
alter table if exists transaction_bond_closeout_documents add column if not exists is_required boolean not null default true;
alter table if exists transaction_bond_closeout_documents add column if not exists status text not null default 'missing';
alter table if exists transaction_bond_closeout_documents add column if not exists updated_at timestamptz not null default now();
update transaction_bond_closeout_documents set is_required = true where is_required is null;
update transaction_bond_closeout_documents set status = 'missing' where status is null;
alter table transaction_bond_closeout_documents alter column transaction_bond_closeout_id set not null;
alter table transaction_bond_closeout_documents alter column document_type_key set not null;
alter table transaction_bond_closeout_documents alter column label set not null;
alter table transaction_bond_closeout_documents alter column status set not null;

insert into development_bond_required_closeout_docs (
  development_bond_config_id,
  document_type_key,
  label,
  required_for_close_out,
  visible_to_developer,
  visible_to_bond_originator,
  internal_only,
  sort_order,
  is_active
)
select
  config.id,
  docs.document_type_key,
  docs.label,
  true,
  true,
  true,
  false,
  docs.sort_order,
  true
from development_bond_configs config
cross join (
  values
    ('commission_statement', 'Commission Statement', 1),
    ('bond_approval_confirmation', 'Bond Approval Confirmation', 2),
    ('commission_tax_invoice', 'Commission Tax Invoice', 3)
) as docs(document_type_key, label, sort_order)
on conflict (development_bond_config_id, document_type_key) do update
set
  label = excluded.label,
  required_for_close_out = excluded.required_for_close_out,
  visible_to_developer = excluded.visible_to_developer,
  visible_to_bond_originator = excluded.visible_to_bond_originator,
  internal_only = excluded.internal_only,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

alter table if exists client_portal_links add column if not exists development_id uuid references developments(id) on delete cascade;
alter table if exists client_portal_links add column if not exists unit_id uuid references units(id) on delete cascade;
alter table if exists client_portal_links add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table if exists client_portal_links add column if not exists buyer_id uuid references buyers(id) on delete set null;
alter table if exists client_portal_links add column if not exists token text;
alter table if exists client_portal_links add column if not exists is_active boolean not null default true;
alter table if exists client_portal_links add column if not exists updated_at timestamptz not null default now();
update client_portal_links set token = coalesce(token, concat('client_', id::text)) where token is null;
alter table client_portal_links alter column token set not null;

alter table if exists client_issues add column if not exists transaction_id uuid references transactions(id) on delete set null;
alter table if exists client_issues add column if not exists photo_path text;
alter table if exists client_issues add column if not exists status text not null default 'Open';
alter table if exists client_issues add column if not exists updated_at timestamptz not null default now();

alter table if exists alteration_requests add column if not exists transaction_id uuid references transactions(id) on delete set null;
alter table if exists alteration_requests add column if not exists reference_image_path text;
alter table if exists alteration_requests add column if not exists status text not null default 'Pending Review';
alter table if exists alteration_requests add column if not exists updated_at timestamptz not null default now();

alter table if exists service_reviews add column if not exists transaction_id uuid references transactions(id) on delete set null;
alter table if exists service_reviews add column if not exists allow_marketing_use boolean not null default false;
alter table if exists service_reviews add column if not exists updated_at timestamptz not null default now();

alter table client_issues drop constraint if exists client_issues_status_check;
alter table client_issues
  add constraint client_issues_status_check
  check (status in ('Open', 'In Progress', 'Resolved', 'Closed'));

alter table alteration_requests drop constraint if exists alteration_requests_status_check;
alter table alteration_requests
  add constraint alteration_requests_status_check
  check (status in ('Pending Review', 'Approved', 'Declined', 'Quote Sent', 'Accepted', 'In Progress', 'Completed'));

alter table if exists alteration_requests add column if not exists amount_inc_vat numeric(12,2) default 0;
alter table if exists alteration_requests add column if not exists invoice_path text;
alter table if exists alteration_requests add column if not exists proof_of_payment_path text;

create table if not exists document_requirements (
  id uuid primary key default gen_random_uuid(),
  development_id uuid references developments(id) on delete cascade,
  category_key text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace view transaction_notes
with (security_invoker = true) as
select id, transaction_id, body, created_at
from notes;

create index if not exists units_development_id_idx on units (development_id);
create index if not exists transactions_development_id_idx on transactions (development_id);
create index if not exists transactions_unit_updated_at_idx on transactions (unit_id, updated_at desc);
create index if not exists notes_transaction_id_created_at_idx on notes (transaction_id, created_at desc);
create index if not exists documents_transaction_id_created_at_idx on documents (transaction_id, created_at desc);
create index if not exists documents_transaction_id_client_visible_idx on documents (transaction_id, is_client_visible);
create index if not exists documents_transaction_id_visibility_scope_idx on documents (transaction_id, visibility_scope);
create index if not exists documents_transaction_id_document_type_idx on documents (transaction_id, document_type);
create index if not exists documents_transaction_id_stage_key_idx on documents (transaction_id, stage_key);
create index if not exists documents_uploaded_by_user_id_idx on documents (uploaded_by_user_id);
create index if not exists transaction_finance_details_transaction_id_idx on transaction_finance_details (transaction_id);
create index if not exists transaction_subprocesses_transaction_id_idx on transaction_subprocesses (transaction_id);
create index if not exists transaction_subprocesses_transaction_process_idx on transaction_subprocesses (transaction_id, process_type);
create index if not exists transaction_subprocess_steps_subprocess_sort_idx on transaction_subprocess_steps (subprocess_id, sort_order);
create index if not exists transaction_external_access_transaction_id_idx on transaction_external_access (transaction_id);
create index if not exists transaction_external_access_buyer_id_idx on transaction_external_access (buyer_id);
create index if not exists transaction_external_access_access_token_idx on transaction_external_access (access_token);
create index if not exists client_portal_links_transaction_id_idx on client_portal_links (transaction_id);
create index if not exists client_portal_links_unit_id_idx on client_portal_links (unit_id);
create index if not exists client_portal_links_buyer_id_idx on client_portal_links (buyer_id);
create unique index if not exists client_portal_links_active_transaction_idx
  on client_portal_links (transaction_id)
  where is_active;
create index if not exists client_issues_unit_id_created_at_idx on client_issues (unit_id, created_at desc);
create index if not exists alteration_requests_unit_id_created_at_idx on alteration_requests (unit_id, created_at desc);
create index if not exists service_reviews_unit_id_created_at_idx on service_reviews (unit_id, created_at desc);
create unique index if not exists service_reviews_unit_buyer_unique_idx on service_reviews (unit_id, buyer_id);
create index if not exists trust_investment_forms_transaction_id_idx on trust_investment_forms (transaction_id);
create index if not exists trust_investment_forms_unit_id_idx on trust_investment_forms (unit_id);
create index if not exists transaction_handover_transaction_id_idx on transaction_handover (transaction_id);
create index if not exists transaction_handover_unit_id_idx on transaction_handover (unit_id);
create index if not exists transaction_onboarding_transaction_id_idx on transaction_onboarding (transaction_id);
create index if not exists transaction_onboarding_token_idx on transaction_onboarding (token);
create unique index if not exists transaction_onboarding_active_transaction_idx
  on transaction_onboarding (transaction_id)
  where is_active;
create unique index if not exists onboarding_form_data_transaction_unique_idx on onboarding_form_data (transaction_id);
create index if not exists document_groups_sort_order_idx on document_groups (sort_order);
create unique index if not exists document_groups_key_idx on document_groups (key);
create index if not exists document_templates_group_sort_idx on document_templates (group_key, sort_order);
create unique index if not exists document_templates_key_idx on document_templates (key);
create index if not exists document_templates_is_active_idx on document_templates (is_active);
create index if not exists document_requirement_rules_lookup_idx
  on document_requirement_rules (purchaser_type, finance_type, reservation_required, enabled);
create index if not exists document_requirement_rules_template_idx on document_requirement_rules (template_key);
create index if not exists transaction_required_documents_transaction_sort_idx
  on transaction_required_documents (transaction_id, sort_order);
create unique index if not exists transaction_required_documents_transaction_key_idx
  on transaction_required_documents (transaction_id, document_key);
create index if not exists transaction_required_documents_group_status_idx
  on transaction_required_documents (transaction_id, group_key, status);
create index if not exists transaction_required_documents_required_from_role_idx
  on transaction_required_documents (transaction_id, required_from_role);
create index if not exists transaction_participants_transaction_id_idx on transaction_participants (transaction_id);
create index if not exists transaction_participants_user_id_idx on transaction_participants (user_id);
create index if not exists transaction_participants_status_idx on transaction_participants (transaction_id, status);
create index if not exists transaction_participants_legal_role_idx on transaction_participants (transaction_id, legal_role);
create index if not exists transaction_participants_invitation_token_idx on transaction_participants (invitation_token);
create index if not exists transactions_owner_user_id_idx on transactions (owner_user_id);
create index if not exists transactions_access_level_idx on transactions (access_level);
create index if not exists profiles_firm_id_idx on profiles (firm_id);
create index if not exists firm_memberships_firm_id_idx on firm_memberships (firm_id);
create index if not exists firm_memberships_user_id_idx on firm_memberships (user_id);
create index if not exists transaction_comments_transaction_id_created_at_idx on transaction_comments (transaction_id, created_at desc);
create index if not exists transaction_status_links_transaction_id_idx on transaction_status_links (transaction_id);
create unique index if not exists transaction_status_links_active_transaction_idx
  on transaction_status_links (transaction_id)
  where is_active;
create index if not exists transaction_events_transaction_id_created_at_idx on transaction_events (transaction_id, created_at desc);
create index if not exists transaction_events_event_type_idx on transaction_events (event_type);
create index if not exists transaction_events_created_by_idx on transaction_events (created_by);
create index if not exists transaction_readiness_states_transaction_id_idx on transaction_readiness_states (transaction_id);
create index if not exists transaction_readiness_states_stage_ready_idx on transaction_readiness_states (stage_ready);
create index if not exists transaction_notifications_user_id_created_at_idx
  on transaction_notifications (user_id, created_at desc);
create index if not exists transaction_notifications_user_id_is_read_idx
  on transaction_notifications (user_id, is_read, created_at desc);
create index if not exists transaction_notifications_transaction_id_idx
  on transaction_notifications (transaction_id, created_at desc);
create unique index if not exists transaction_notifications_user_dedupe_unread_idx
  on transaction_notifications (user_id, dedupe_key)
  where dedupe_key is not null and is_read = false;
create index if not exists snapshot_links_user_id_idx on snapshot_links (user_id);
create index if not exists snapshot_links_token_idx on snapshot_links (token);
create unique index if not exists snapshot_links_active_owner_key_idx
  on snapshot_links (owner_key)
  where is_active;
create unique index if not exists document_requirements_global_category_key_idx
  on document_requirements (category_key)
  where development_id is null;
create unique index if not exists document_requirements_scoped_category_key_idx
  on document_requirements (development_id, category_key)
  where development_id is not null;

create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
before update on profiles
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_firms_updated_at on firms;
create trigger trg_firms_updated_at
before update on firms
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_firm_memberships_updated_at on firm_memberships;
create trigger trg_firm_memberships_updated_at
before update on firm_memberships
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transactions_updated_at on transactions;
create trigger trg_transactions_updated_at
before update on transactions
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_finance_details_updated_at on transaction_finance_details;
create trigger trg_transaction_finance_details_updated_at
before update on transaction_finance_details
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_subprocesses_updated_at on transaction_subprocesses;
create trigger trg_transaction_subprocesses_updated_at
before update on transaction_subprocesses
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_subprocess_steps_updated_at on transaction_subprocess_steps;
create trigger trg_transaction_subprocess_steps_updated_at
before update on transaction_subprocess_stepsgit
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_snapshot_links_updated_at on snapshot_links;
create trigger trg_snapshot_links_updated_at
before update on snapshot_links
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_development_settings_updated_at on development_settings;
create trigger trg_development_settings_updated_at
before update on development_settings
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_client_portal_links_updated_at on client_portal_links;
create trigger trg_client_portal_links_updated_at
before update on client_portal_links
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_client_issues_updated_at on client_issues;
create trigger trg_client_issues_updated_at
before update on client_issues
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_alteration_requests_updated_at on alteration_requests;
create trigger trg_alteration_requests_updated_at
before update on alteration_requests
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_service_reviews_updated_at on service_reviews;
create trigger trg_service_reviews_updated_at
before update on service_reviews
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_trust_investment_forms_updated_at on trust_investment_forms;
create trigger trg_trust_investment_forms_updated_at
before update on trust_investment_forms
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_handover_updated_at on transaction_handover;
create trigger trg_transaction_handover_updated_at
before update on transaction_handover
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_onboarding_updated_at on transaction_onboarding;
create trigger trg_transaction_onboarding_updated_at
before update on transaction_onboarding
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_onboarding_form_data_updated_at on onboarding_form_data;
create trigger trg_onboarding_form_data_updated_at
before update on onboarding_form_data
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_document_groups_updated_at on document_groups;
create trigger trg_document_groups_updated_at
before update on document_groups
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_document_templates_updated_at on document_templates;
create trigger trg_document_templates_updated_at
before update on document_templates
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_document_requirement_rules_updated_at on document_requirement_rules;
create trigger trg_document_requirement_rules_updated_at
before update on document_requirement_rules
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_required_documents_updated_at on transaction_required_documents;
create trigger trg_transaction_required_documents_updated_at
before update on transaction_required_documents
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_participants_updated_at on transaction_participants;
create trigger trg_transaction_participants_updated_at
before update on transaction_participants
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_status_links_updated_at on transaction_status_links;
create trigger trg_transaction_status_links_updated_at
before update on transaction_status_links
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_events_updated_at on transaction_events;
create trigger trg_transaction_events_updated_at
before update on transaction_events
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_readiness_states_updated_at on transaction_readiness_states;
create trigger trg_transaction_readiness_states_updated_at
before update on transaction_readiness_states
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_notifications_updated_at on transaction_notifications;
create trigger trg_transaction_notifications_updated_at
before update on transaction_notifications
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_development_attorney_configs_updated_at on development_attorney_configs;
create trigger trg_development_attorney_configs_updated_at
before update on development_attorney_configs
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_development_attorney_required_closeout_docs_updated_at on development_attorney_required_closeout_docs;
create trigger trg_development_attorney_required_closeout_docs_updated_at
before update on development_attorney_required_closeout_docs
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_attorney_closeouts_updated_at on transaction_attorney_closeouts;
create trigger trg_transaction_attorney_closeouts_updated_at
before update on transaction_attorney_closeouts
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_attorney_closeout_documents_updated_at on transaction_attorney_closeout_documents;
create trigger trg_transaction_attorney_closeout_documents_updated_at
before update on transaction_attorney_closeout_documents
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_development_bond_configs_updated_at on development_bond_configs;
create trigger trg_development_bond_configs_updated_at
before update on development_bond_configs
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_development_bond_required_closeout_docs_updated_at on development_bond_required_closeout_docs;
create trigger trg_development_bond_required_closeout_docs_updated_at
before update on development_bond_required_closeout_docs
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_bond_closeouts_updated_at on transaction_bond_closeouts;
create trigger trg_transaction_bond_closeouts_updated_at
before update on transaction_bond_closeouts
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_bond_closeout_documents_updated_at on transaction_bond_closeout_documents;
create trigger trg_transaction_bond_closeout_documents_updated_at
before update on transaction_bond_closeout_documents
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_document_request_groups_updated_at on document_request_groups;
create trigger trg_document_request_groups_updated_at
before update on document_request_groups
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_document_requests_updated_at on document_requests;
create trigger trg_document_requests_updated_at
before update on document_requests
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_checklist_items_updated_at on transaction_checklist_items;
create trigger trg_transaction_checklist_items_updated_at
before update on transaction_checklist_items
for each row
execute function set_updated_at_timestamp();

drop trigger if exists trg_transaction_issue_overrides_updated_at on transaction_issue_overrides;
create trigger trg_transaction_issue_overrides_updated_at
before update on transaction_issue_overrides
for each row
execute function set_updated_at_timestamp();

alter table profiles enable row level security;
alter table firms enable row level security;
alter table firm_memberships enable row level security;
alter table developments enable row level security;
alter table units enable row level security;
alter table buyers enable row level security;
alter table transactions enable row level security;
alter table transaction_finance_details enable row level security;
alter table transaction_subprocesses enable row level security;
alter table transaction_subprocess_steps enable row level security;
alter table transaction_onboarding enable row level security;
alter table onboarding_form_data enable row level security;
alter table document_groups enable row level security;
alter table document_templates enable row level security;
alter table document_requirement_rules enable row level security;
alter table transaction_required_documents enable row level security;
alter table transaction_participants enable row level security;
alter table transaction_comments enable row level security;
alter table transaction_status_links enable row level security;
alter table transaction_events enable row level security;
alter table transaction_readiness_states enable row level security;
alter table transaction_notifications enable row level security;
alter table transaction_external_access enable row level security;
alter table document_request_groups enable row level security;
alter table document_requests enable row level security;
alter table transaction_checklist_items enable row level security;
alter table transaction_issue_overrides enable row level security;
alter table development_settings enable row level security;
alter table development_attorney_configs enable row level security;
alter table development_attorney_required_closeout_docs enable row level security;
alter table transaction_attorney_closeouts enable row level security;
alter table transaction_attorney_closeout_documents enable row level security;
alter table development_bond_configs enable row level security;
alter table development_bond_required_closeout_docs enable row level security;
alter table transaction_bond_closeouts enable row level security;
alter table transaction_bond_closeout_documents enable row level security;
alter table client_portal_links enable row level security;
alter table client_issues enable row level security;
alter table alteration_requests enable row level security;
alter table service_reviews enable row level security;
alter table trust_investment_forms enable row level security;
alter table transaction_handover enable row level security;
alter table snapshot_links enable row level security;
alter table notes enable row level security;
alter table documents enable row level security;
alter table document_requirements enable row level security;

drop policy if exists profiles_demo_all on profiles;
create policy profiles_demo_all on profiles
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists firms_demo_all on firms;
create policy firms_demo_all on firms
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists firm_memberships_demo_all on firm_memberships;
create policy firm_memberships_demo_all on firm_memberships
for all to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated;

drop policy if exists developments_demo_all on developments;
create policy developments_demo_all on developments
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists units_demo_all on units;
create policy units_demo_all on units
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists buyers_demo_all on buyers;
create policy buyers_demo_all on buyers
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transactions_demo_all on transactions;
create policy transactions_demo_all on transactions
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_finance_details_demo_all on transaction_finance_details;
create policy transaction_finance_details_demo_all on transaction_finance_details
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_subprocesses_demo_all on transaction_subprocesses;
create policy transaction_subprocesses_demo_all on transaction_subprocesses
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_subprocess_steps_demo_all on transaction_subprocess_steps;
create policy transaction_subprocess_steps_demo_all on transaction_subprocess_steps
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_onboarding_demo_all on transaction_onboarding;
create policy transaction_onboarding_demo_all on transaction_onboarding
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists onboarding_form_data_demo_all on onboarding_form_data;
create policy onboarding_form_data_demo_all on onboarding_form_data
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_groups_demo_all on document_groups;
create policy document_groups_demo_all on document_groups
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_templates_demo_all on document_templates;
create policy document_templates_demo_all on document_templates
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requirement_rules_demo_all on document_requirement_rules;
create policy document_requirement_rules_demo_all on document_requirement_rules
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_required_documents_demo_all on transaction_required_documents;
create policy transaction_required_documents_demo_all on transaction_required_documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_participants_demo_all on transaction_participants;
create policy transaction_participants_demo_all on transaction_participants
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_comments_demo_all on transaction_comments;
create policy transaction_comments_demo_all on transaction_comments
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_status_links_demo_all on transaction_status_links;
create policy transaction_status_links_demo_all on transaction_status_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_events_demo_all on transaction_events;
create policy transaction_events_demo_all on transaction_events
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_readiness_states_demo_all on transaction_readiness_states;
create policy transaction_readiness_states_demo_all on transaction_readiness_states
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_notifications_demo_all on transaction_notifications;
create policy transaction_notifications_demo_all on transaction_notifications
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_external_access_demo_all on transaction_external_access;
create policy transaction_external_access_demo_all on transaction_external_access
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_request_groups_demo_all on document_request_groups;
create policy document_request_groups_demo_all on document_request_groups
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requests_demo_all on document_requests;
create policy document_requests_demo_all on document_requests
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_checklist_items_demo_all on transaction_checklist_items;
create policy transaction_checklist_items_demo_all on transaction_checklist_items
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_issue_overrides_demo_all on transaction_issue_overrides;
create policy transaction_issue_overrides_demo_all on transaction_issue_overrides
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists development_settings_demo_all on development_settings;
create policy development_settings_demo_all on development_settings
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists development_attorney_configs_demo_all on development_attorney_configs;
create policy development_attorney_configs_demo_all on development_attorney_configs
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists development_attorney_required_closeout_docs_demo_all on development_attorney_required_closeout_docs;
create policy development_attorney_required_closeout_docs_demo_all on development_attorney_required_closeout_docs
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_attorney_closeouts_demo_all on transaction_attorney_closeouts;
create policy transaction_attorney_closeouts_demo_all on transaction_attorney_closeouts
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_attorney_closeout_documents_demo_all on transaction_attorney_closeout_documents;
create policy transaction_attorney_closeout_documents_demo_all on transaction_attorney_closeout_documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists development_bond_configs_demo_all on development_bond_configs;
create policy development_bond_configs_demo_all on development_bond_configs
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists development_bond_required_closeout_docs_demo_all on development_bond_required_closeout_docs;
create policy development_bond_required_closeout_docs_demo_all on development_bond_required_closeout_docs
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_bond_closeouts_demo_all on transaction_bond_closeouts;
create policy transaction_bond_closeouts_demo_all on transaction_bond_closeouts
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_bond_closeout_documents_demo_all on transaction_bond_closeout_documents;
create policy transaction_bond_closeout_documents_demo_all on transaction_bond_closeout_documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists client_portal_links_demo_all on client_portal_links;
create policy client_portal_links_demo_all on client_portal_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists client_issues_demo_all on client_issues;
create policy client_issues_demo_all on client_issues
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists alteration_requests_demo_all on alteration_requests;
create policy alteration_requests_demo_all on alteration_requests
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists service_reviews_demo_all on service_reviews;
create policy service_reviews_demo_all on service_reviews
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists trust_investment_forms_demo_all on trust_investment_forms;
create policy trust_investment_forms_demo_all on trust_investment_forms
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_handover_demo_all on transaction_handover;
create policy transaction_handover_demo_all on transaction_handover
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists snapshot_links_demo_all on snapshot_links;
create policy snapshot_links_demo_all on snapshot_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists notes_demo_all on notes;
create policy notes_demo_all on notes
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists documents_demo_all on documents;
create policy documents_demo_all on documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requirements_demo_all on document_requirements;
create policy document_requirements_demo_all on document_requirements
for all to anon, authenticated
using (true)
with check (true);

-- Storage setup is done in Supabase UI for this MVP:
-- 1) Create bucket: documents
-- 2) Add storage.objects policies for bucket_id = 'documents' (SELECT + INSERT)
