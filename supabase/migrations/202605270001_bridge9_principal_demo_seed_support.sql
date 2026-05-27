begin;

create extension if not exists "pgcrypto";

alter table if exists public.organisations
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_users
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_branches
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_settings
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_preferred_partners
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.contacts
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.leads
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists lead_score integer,
  add column if not exists finance_type text,
  add column if not exists min_budget numeric(14, 2),
  add column if not exists preferred_suburbs text[],
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.lead_activities
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.tasks
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.appointments
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.private_listings
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists bedrooms integer,
  add column if not exists bathrooms numeric(4, 1),
  add column if not exists erf_size_sqm integer,
  add column if not exists floor_size_sqm integer,
  add column if not exists levy_amount numeric(12, 2),
  add column if not exists rates_amount numeric(12, 2),
  add column if not exists view_count integer not null default 0,
  add column if not exists enquiry_count integer not null default 0,
  add column if not exists listing_age_days integer,
  add column if not exists bridge_listing_status text not null default 'not_published',
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.private_listing_activity
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.buyers
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists phone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.transactions
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists seller_name text,
  add column if not exists seller_email text,
  add column if not exists seller_phone text,
  add column if not exists seller_has_existing_bond boolean not null default false,
  add column if not exists current_bond_bank text,
  add column if not exists current_bond_account_number text,
  add column if not exists estimated_settlement_amount numeric,
  add column if not exists target_registration_date date,
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.transaction_finance_details
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_role_players
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_subprocesses
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_subprocess_steps
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists blocker_reason text,
  add column if not exists notes text,
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.documents
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists document_type text,
  add column if not exists visibility_scope text not null default 'internal',
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists stage_key text,
  add column if not exists lane_key text,
  add column if not exists review_status text;

alter table if exists public.document_requests
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists visibility_scope text not null default 'internal',
  add column if not exists created_by_role text,
  add column if not exists lane_key text,
  add column if not exists review_status text not null default 'requested';

alter table if exists public.transaction_comments
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_events
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists visibility_scope text not null default 'internal';

alter table if exists public.transaction_status_links
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_readiness_states
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_notifications
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_onboarding
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.onboarding_form_data
  add column if not exists is_demo_data boolean not null default false;

create table if not exists public.demo_canvassing_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  linked_lead_id uuid references public.leads(lead_id) on delete set null,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  prospect_name text not null,
  prospect_email text,
  prospect_phone text,
  prospect_type text not null default 'Seller',
  suburb text,
  address_line_1 text,
  estimated_value numeric(14, 2),
  status text not null,
  seller_personality text,
  intended_timeline text,
  canvassing_method text,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  is_demo_data boolean not null default true,
  demo_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demo_canvassing_activities (
  id uuid primary key default gen_random_uuid(),
  canvassing_record_id uuid not null references public.demo_canvassing_records(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  activity_note text,
  outcome text,
  activity_date timestamptz not null default now(),
  is_demo_data boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.client_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  client_portal_token text,
  client_role text not null default 'buyer',
  notification_type text not null,
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'unread',
  related_entity_type text,
  related_entity_id uuid,
  action_label text,
  action_route text,
  visibility text not null default 'client_visible',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null default '',
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  constraint client_portal_notifications_client_role_check check (client_role in ('buyer', 'seller', 'shared', 'both')),
  constraint client_portal_notifications_priority_check check (priority in ('urgent', 'high', 'normal', 'low', 'informational')),
  constraint client_portal_notifications_status_check check (status in ('unread', 'read', 'dismissed')),
  constraint client_portal_notifications_visibility_check check (visibility in ('client_visible', 'shared_role_players', 'internal_only'))
);

alter table if exists public.client_portal_notifications
  add column if not exists is_demo_data boolean not null default false;

create index if not exists organisations_bridge9_demo_idx on public.organisations (company_email) where is_demo_data = true;
create index if not exists contacts_bridge9_demo_idx on public.contacts (organisation_id, created_at desc) where is_demo_data = true;
create index if not exists leads_bridge9_demo_idx on public.leads (organisation_id, lead_category, stage) where is_demo_data = true;
create index if not exists private_listings_bridge9_demo_idx on public.private_listings (organisation_id, listing_status, created_at desc) where is_demo_data = true;
create index if not exists transactions_bridge9_demo_idx on public.transactions (organisation_id, current_main_stage, created_at desc) where is_demo_data = true;
create index if not exists demo_canvassing_records_org_status_idx on public.demo_canvassing_records (organisation_id, status, created_at desc);
create index if not exists demo_canvassing_activities_record_idx on public.demo_canvassing_activities (canvassing_record_id, activity_date desc);
create index if not exists client_portal_notifications_bridge9_demo_idx on public.client_portal_notifications (transaction_id, client_role, created_at desc) where is_demo_data = true;

commit;
