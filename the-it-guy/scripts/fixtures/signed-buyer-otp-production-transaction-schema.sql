-- Captured from production on 2026-10-31: transaction columns, defaults,
-- nullability, CHECK constraints and creation lifecycle trigger. Foreign-key
-- infrastructure, auth and downstream workspaces remain explicit test fixtures.
-- Do not derive this schema from the function under test: doing so masked an
-- insert into a nonexistent creation_mode column during the hosted dry run.
CREATE OR REPLACE FUNCTION public.bridge_normalize_transaction_stage(p_stage text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO ''
AS $function$
  select case regexp_replace(lower(btrim(p_stage)), '[\s/_-]+', ' ', 'g')
    when 'buyer onboarding pending' then 'Buyer Onboarding Pending'
    when 'available' then 'Available'
    when 'avail' then 'Available'
    when 'reserved' then 'Reserved'
    when 'offer accepted' then 'Offer Accepted'
    when 'otp signed' then 'OTP Signed'
    when 'otp' then 'OTP Signed'
    when 'signed otp' then 'OTP Signed'
    when 'offer to purchase signed' then 'OTP Signed'
    when 'deposit' then 'Deposit'
    when 'deposit paid' then 'Deposit Paid'
    when 'dep' then 'Deposit Paid'
    when 'finance' then 'Finance'
    when 'finance in progress' then 'Finance'
    when 'finance pending' then 'Finance Pending'
    when 'fin' then 'Finance Pending'
    when 'bond approved proof of funds' then 'Bond Approved / Proof of Funds'
    when 'bond approved' then 'Bond Approved / Proof of Funds'
    when 'proof of funds' then 'Bond Approved / Proof of Funds'
    when 'proceed to attorneys' then 'Proceed to Attorneys'
    when 'atty' then 'Proceed to Attorneys'
    when 'legal preparation' then 'Proceed to Attorneys'
    when 'transfer preparation' then 'Proceed to Attorneys'
    when 'with attorneys' then 'Proceed to Attorneys'
    when 'transfer' then 'Transfer'
    when 'transfer in progress' then 'Transfer in Progress'
    when 'xfer' then 'Transfer in Progress'
    when 'transfer lodged' then 'Transfer Lodged'
    when 'registration' then 'Registration'
    when 'registered' then 'Registered'
    when 'reg' then 'Registered'
    else null
  end
$function$;

create table public.transactions (
  id uuid default gen_random_uuid() not null primary key,
  unit_id uuid,
  buyer_id uuid,
  stage text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  finance_type text default 'cash'::text,
  attorney text,
  bond_originator text,
  next_action text,
  updated_at timestamp with time zone default now(),
  risk_status text default 'On Track'::text not null,
  development_id uuid,
  sales_price numeric,
  current_main_stage text default 'AVAIL'::text not null,
  current_sub_stage_summary text,
  comment text,
  stage_date date,
  sale_date date,
  assigned_agent text,
  bank text,
  expected_transfer_date date,
  is_active boolean default true not null,
  purchaser_type text default 'individual'::text not null,
  assigned_agent_email text,
  assigned_attorney_email text,
  assigned_bond_originator_email text,
  finance_managed_by text default 'bond_originator'::text,
  purchase_price numeric,
  cash_amount numeric,
  bond_amount numeric,
  deposit_amount numeric,
  reservation_required boolean default false not null,
  reservation_amount numeric,
  reservation_status text default 'not_required'::text not null,
  reservation_paid_date date,
  reservation_proof_document uuid,
  transaction_reference text,
  transaction_type text default 'development'::text not null,
  property_address_line_1 text,
  property_address_line_2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  property_description text,
  matter_owner text,
  transaction_origin_role text,
  transaction_origin_source text,
  buyer_attorney_name text,
  buyer_attorney_email text,
  seller_attorney_name text,
  seller_attorney_email text,
  primary_transfer_conveyancer_name text,
  primary_transfer_conveyancer_email text,
  main_stage_key text,
  completed_at timestamp with time zone,
  archived_at timestamp with time zone,
  archived_by uuid,
  owner_user_id uuid,
  lifecycle_state text default 'active'::text not null,
  property_type text,
  reservation_proof_uploaded_at timestamp with time zone,
  reservation_payment_details jsonb default '{}'::jsonb not null,
  reservation_requested_at timestamp with time zone,
  reservation_email_sent_at timestamp with time zone,
  reservation_reviewed_at timestamp with time zone,
  reservation_reviewed_by uuid,
  reservation_review_notes text,
  access_level text default 'shared'::text not null,
  attorney_stage text,
  operational_state text,
  waiting_on_role text,
  registration_date date,
  title_deed_number text,
  registration_confirmation_document_id uuid,
  registered_by_user_id uuid,
  registered_at timestamp with time zone,
  registration_reversed_at timestamp with time zone,
  registration_reversed_by_user_id uuid,
  registration_reversal_reason text,
  completed_by_user_id uuid,
  archived_by_user_id uuid,
  archive_reason text,
  cancelled_at timestamp with time zone,
  cancelled_by_user_id uuid,
  cancelled_reason text,
  last_meaningful_activity_at timestamp with time zone,
  final_report_generated_at timestamp with time zone,
  organisation_id uuid,
  assigned_branch_id uuid,
  seller_has_existing_bond boolean default false not null,
  current_bond_bank text,
  current_bond_account_number text,
  estimated_settlement_amount numeric,
  cancellation_attorney_id uuid,
  cancellation_firm_id uuid,
  is_demo_data boolean default false not null,
  title text,
  seller_name text,
  seller_email text,
  seller_phone text,
  target_registration_date date,
  accepted_offer_id uuid,
  originating_buyer_lead_id uuid,
  buyer_contact_id uuid,
  listing_id uuid,
  originating_lead_id uuid,
  seller_contact_id uuid,
  assigned_agent_id uuid,
  onboarding_status text default 'awaiting_client_onboarding'::text not null,
  development_name text,
  listing_title text,
  property_title text,
  unit_number text,
  buyer_name text,
  purchaser_name text,
  client_name text,
  gross_commission_percentage numeric,
  gross_commission_amount numeric,
  agent_commission_amount numeric,
  agency_commission_amount numeric,
  matter_number text,
  assigned_user_id uuid,
  created_by uuid,
  deleted_at timestamp with time zone,
  originating_partner_organisation_id uuid,
  referral_source_organisation_id uuid,
  relationship_owner_user_id uuid,
  partner_relationship_id uuid,
  finance_status text,
  demo_metadata jsonb default '{}'::jsonb not null,
  bond_workspace_id uuid,
  bond_region_id uuid,
  bond_workspace_unit_id uuid,
  primary_bond_consultant_user_id uuid,
  assigned_bond_processor_user_id uuid,
  assigned_bond_manager_user_id uuid,
  assigned_bond_compliance_user_id uuid,
  bond_assignment_status text,
  bond_assignment_source text,
  bond_assignment_updated_at timestamp with time zone,
  bond_assignment_updated_by uuid,
  compliance_status text,
  compliance_review_required boolean default false not null,
  application_prepared boolean default false not null,
  submitted_to_banks boolean default false not null,
  documents_complete boolean default false not null,
  finance_documents_complete boolean default false not null,
  documents_missing boolean default false not null,
  required_documents_missing boolean default false not null,
  finance_documents_missing boolean default false not null,
  missing_documents_count integer default 0 not null,
  uploaded_documents_count integer default 0 not null,
  total_required_documents integer default 0 not null,
  bank_feedback_pending boolean default false not null,
  bank_feedback_status text,
  next_action_due_at timestamp with time zone,
  finance_due_at timestamp with time zone,
  processor_name text,
  assigned_bond_processor_name text,
  compliance_name text,
  agent_split_percentage_snapshot numeric,
  agency_split_percentage_snapshot numeric,
  external_onboarding_submitted_at timestamp with time zone,
  onboarding_completed_at timestamp with time zone,
  bond_assignment_rule_id uuid,
  bond_assignment_method text,
  assigned_region_id uuid,
  assigned_organisation_id uuid,
  assigned_at timestamp with time zone,
  assignment_status text default 'pending'::text not null,
  reservation_amount_type text,
  reservation_treatment text,
  reservation_payable_to text,
  alteration_charge_treatment text,
  seller_onboarding_status text default 'not_started'::text not null,
  cancellation_notice_status text default 'unknown'::text not null,
  cancellation_notice_date date,
  attorney_intake_context_json jsonb default '{}'::jsonb not null,
  platform_reference text,
  creation_idempotency_key text,
  property_tenure text,
  seller_type text,
  existing_bond boolean default false not null,
  cancellation_required boolean default false not null,
  vat_treatment text,
  routing_profile_version text,
  routing_profile_json jsonb default '{}'::jsonb not null,
  otp_packet_id uuid,
  mandate_packet_id uuid,
  commission_snapshot_id uuid,
  instruction_date date,
  instruction_at timestamp with time zone,
  instructed_at timestamp with time zone,
  agreement_date date,
  offer_accepted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  obligation_date date,
  finance_clause_expiry_date date,
  suspensive_condition_due_date date,
  transfer_duty_due_date date,
  transfer_duty_due_at timestamp with time zone,
  lodgement_date date,
  lodged_at timestamp with time zone,
  expected_lodgement_date date,
  expected_lodgement_at timestamp with time zone,
  expected_registration_date date,
  branch_id uuid,
  primary_buyer_participant_id uuid,
  buyer_parties_model_version text default 'transaction_buyers_phase1_v1'::text not null,
  sale_route text,
  sale_channel text,
  seller_party_type text,
  lead_owner text,
  ownership_model text,
  source_agency_org_id uuid,
  creation_status text default 'initializing'::text not null,
  creation_started_at timestamp with time zone default now() not null,
  creation_completed_at timestamp with time zone,
  creation_incomplete_at timestamp with time zone,
  creation_steps jsonb default '{}'::jsonb not null,
  creation_error jsonb default '{}'::jsonb not null,
  quarantined_at timestamp with time zone,
  quarantine_batch_id uuid,
  quarantine_reason text,
  current_detailed_stage text,
  arch9_listing_reference text,
  originating_seller_lead_id uuid,
  deal_review_details jsonb default '{}'::jsonb not null,
  constraint transactions_access_level_check CHECK ((access_level = ANY (ARRAY['private'::text, 'shared'::text, 'restricted'::text]))),
  constraint transactions_alteration_charge_treatment_check CHECK (((alteration_charge_treatment IS NULL) OR (alteration_charge_treatment = ANY (ARRAY['included_in_purchase_price'::text, 'separate_invoice'::text, 'no_charge'::text])))),
  constraint transactions_arch9_listing_reference_format_check CHECK (((arch9_listing_reference IS NULL) OR (arch9_listing_reference ~ '^A9-[A-Z0-9]{2,12}-[0-9]{6,}$'::text))),
  constraint transactions_attorney_intake_context_json_check CHECK (((jsonb_typeof(attorney_intake_context_json) = 'object'::text) AND (octet_length((attorney_intake_context_json)::text) <= 8192))),
  constraint transactions_attorney_stage_check CHECK (((attorney_stage IS NULL) OR (attorney_stage = ANY (ARRAY['instruction_received'::text, 'fica_onboarding'::text, 'drafting'::text, 'signing'::text, 'guarantees'::text, 'clearances'::text, 'lodgement'::text, 'registration_preparation'::text, 'registered'::text])))),
  constraint transactions_bond_assignment_source_check CHECK (((bond_assignment_source IS NULL) OR (bond_assignment_source = ANY (ARRAY['manual'::text, 'legacy_backfill'::text, 'participant_sync'::text, 'invite_acceptance'::text, 'workflow_assignment'::text, 'system_repair'::text, 'buyer_onboarding_send'::text])))),
  constraint transactions_bond_assignment_status_check CHECK (((bond_assignment_status IS NULL) OR (bond_assignment_status = ANY (ARRAY['unassigned'::text, 'awaiting_buyer_onboarding'::text, 'workspace_assigned'::text, 'consultant_assigned'::text, 'processor_assigned'::text, 'fully_assigned'::text, 'inactive'::text])))),
  constraint transactions_cancellation_notice_status_check CHECK ((cancellation_notice_status = ANY (ARRAY['unknown'::text, 'not_applicable'::text, 'not_given'::text, 'given'::text]))),
  constraint transactions_creation_error_object_check CHECK ((jsonb_typeof(creation_error) = 'object'::text)),
  constraint transactions_creation_status_check CHECK ((creation_status = ANY (ARRAY['initializing'::text, 'complete'::text, 'incomplete'::text]))),
  constraint transactions_creation_steps_object_check CHECK ((jsonb_typeof(creation_steps) = 'object'::text)),
  constraint transactions_creation_terminal_timestamp_check CHECK ((((creation_status = 'initializing'::text) AND (creation_completed_at IS NULL) AND (creation_incomplete_at IS NULL)) OR ((creation_status = 'complete'::text) AND (creation_completed_at IS NOT NULL) AND (creation_incomplete_at IS NULL)) OR ((creation_status = 'incomplete'::text) AND (creation_incomplete_at IS NOT NULL) AND (creation_completed_at IS NULL)))),
  constraint transactions_current_main_stage_check CHECK ((current_main_stage = ANY (ARRAY['AVAIL'::text, 'DEP'::text, 'OTP'::text, 'FIN'::text, 'ATTY'::text, 'XFER'::text, 'REG'::text, 'instruction'::text, 'documents'::text, 'finance'::text, 'transfer_duty'::text, 'lodgement'::text, 'registration'::text, 'post_registration'::text]))),
  constraint transactions_deal_review_details_check CHECK ((jsonb_typeof(deal_review_details) = 'object'::text)),
  constraint transactions_finance_managed_by_check CHECK ((finance_managed_by = ANY (ARRAY['bond_originator'::text, 'client'::text, 'internal'::text]))),
  constraint transactions_finance_type_check CHECK ((finance_type = ANY (ARRAY['cash'::text, 'bond'::text, 'combination'::text, 'hybrid'::text]))),
  constraint transactions_incomplete_creation_inactive_check CHECK (((creation_status = 'complete'::text) OR (COALESCE(is_active, false) = false))),
  constraint transactions_lead_owner_check CHECK (((lead_owner IS NULL) OR (lead_owner = ANY (ARRAY['developer'::text, 'agency'::text])))),
  constraint transactions_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['active'::text, 'registered'::text, 'completed'::text, 'archived'::text, 'cancelled'::text]))),
  constraint transactions_main_stage_key_check CHECK (((main_stage_key IS NULL) OR (main_stage_key = ANY (ARRAY['AVAIL'::text, 'BUYER_SECURED'::text, 'AGREEMENT_SIGNED'::text, 'FINANCE_SECURED'::text, 'TRANSFER_PREP'::text, 'LODGE_TRANSFER'::text, 'REGISTERED'::text])))),
  constraint transactions_operational_state_check CHECK (((operational_state IS NULL) OR (operational_state = ANY (ARRAY['on_track'::text, 'at_risk'::text, 'blocked'::text, 'waiting_on_client'::text, 'waiting_on_attorney'::text])))),
  constraint transactions_ownership_model_check CHECK (((ownership_model IS NULL) OR (ownership_model = ANY (ARRAY['developer_direct'::text, 'developer_assigned'::text, 'agency_introduced'::text])))),
  constraint transactions_phase6_assignment_status_check CHECK ((assignment_status = ANY (ARRAY['pending'::text, 'queued'::text, 'assigned'::text, 'completed'::text, 'cancelled'::text]))),
  constraint transactions_platform_reference_not_blank_check CHECK (((platform_reference IS NULL) OR (NULLIF(btrim(platform_reference), ''::text) IS NOT NULL))),
  constraint transactions_purchaser_type_check CHECK ((purchaser_type = ANY (ARRAY['individual'::text, 'married_anc'::text, 'married_coc'::text, 'company'::text, 'trust'::text, 'foreign_purchaser'::text]))),
  constraint transactions_quarantine_state_check CHECK ((((quarantined_at IS NULL) AND (quarantine_batch_id IS NULL) AND (quarantine_reason IS NULL)) OR ((quarantined_at IS NOT NULL) AND (quarantine_batch_id IS NOT NULL) AND (NULLIF(btrim(quarantine_reason), ''::text) IS NOT NULL)))),
  constraint transactions_reservation_amount_type_check CHECK (((reservation_amount_type IS NULL) OR (reservation_amount_type = ANY (ARRAY['fixed'::text, 'percentage'::text])))),
  constraint transactions_reservation_payable_to_check CHECK (((reservation_payable_to IS NULL) OR (reservation_payable_to = ANY (ARRAY['developer'::text, 'agency_trust'::text, 'attorney_trust'::text])))),
  constraint transactions_reservation_status_check CHECK ((reservation_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'paid'::text, 'verified'::text, 'rejected'::text]))),
  constraint transactions_reservation_treatment_check CHECK (((reservation_treatment IS NULL) OR (reservation_treatment = ANY (ARRAY['credited_to_purchase_price'::text, 'separate_invoice'::text, 'refundable_hold'::text])))),
  constraint transactions_risk_status_check CHECK ((risk_status = ANY (ARRAY['On Track'::text, 'At Risk'::text, 'Delayed'::text, 'Blocked'::text]))),
  constraint transactions_sale_channel_check CHECK (((sale_channel IS NULL) OR (sale_channel = ANY (ARRAY['developer_direct'::text, 'developer_assigned'::text, 'agency_introduced'::text])))),
  constraint transactions_sale_route_check CHECK (((sale_route IS NULL) OR (sale_route = ANY (ARRAY['internal_developer_sale'::text, 'developer_assigned_sale'::text, 'external_agency_sale'::text, 'private_property_sale'::text])))),
  constraint transactions_seller_party_type_check CHECK (((seller_party_type IS NULL) OR (seller_party_type = ANY (ARRAY['developer'::text, 'private_seller'::text])))),
  constraint transactions_stage_check CHECK (((stage IS NULL) OR ((bridge_normalize_transaction_stage(stage) IS NOT NULL) AND (stage = bridge_normalize_transaction_stage(stage))))),
  constraint transactions_transaction_origin_role_check CHECK (((transaction_origin_role IS NULL) OR (transaction_origin_role = ANY (ARRAY['developer'::text, 'agent'::text, 'attorney'::text, 'internal_admin'::text])))),
  constraint transactions_transaction_origin_source_check CHECK (((transaction_origin_source IS NULL) OR (transaction_origin_source = ANY (ARRAY['developer'::text, 'agent'::text, 'attorney'::text])))),
  constraint transactions_waiting_on_role_check CHECK (((waiting_on_role IS NULL) OR (waiting_on_role = ANY (ARRAY['buyer'::text, 'seller'::text, 'client'::text, 'attorney'::text, 'bank'::text, 'developer'::text, 'agent'::text, 'bond_originator'::text]))))
);
CREATE OR REPLACE FUNCTION public.bridge_finalize_legacy_active_transaction_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_active
    and new.creation_status = 'initializing' then
    new.creation_status := 'complete';
    new.creation_completed_at := coalesce(new.creation_completed_at, now());
    new.creation_incomplete_at := null;
    new.creation_error := '{}'::jsonb;
  end if;

  return new;
end;
$function$;

create trigger trg_finalize_legacy_active_transaction_creation before insert on public.transactions for each row execute function public.bridge_finalize_legacy_active_transaction_creation();
