-- Synthetic prerequisites for the seller document journey. Business commands
-- and guards are loaded unchanged from migrations by the test runner.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
create function extensions.digest(bytea,text) returns bytea language sql immutable as $$ select sha256($1) $$;
create function extensions.digest(text,text) returns bytea language sql immutable as $$ select sha256(convert_to($1,'UTF8')) $$;
create table organisations(id uuid primary key);
create function bridge_is_active_member(uuid) returns boolean language sql stable as $$
  select auth.uid() is not null and $1::text=current_setting('app.org',true)
$$;
create function bridge_is_org_admin(uuid) returns boolean language sql stable as $$ select false $$;
create function bridge_normalize_seller_document_key_p0_4(text) returns text language sql immutable as $$
  select trim(both '_' from lower(regexp_replace(coalesce($1,''),'[^a-zA-Z0-9]+','_','g')))
$$;
create table private_listings(
  id uuid primary key, organisation_id uuid, assigned_agent_id uuid, created_by uuid,
  updated_at timestamptz default now(), seller_type text, seller_onboarding_status text,
  seller_canonical_facts_json jsonb, seller_canonical_fact_readiness_json jsonb, seller_canonical_facts_updated_at timestamptz,
  address_line_1 text, asking_price numeric, mandate_type text, mandate_status text, listing_status text default 'draft'
);
create table private_listing_seller_onboarding(
  id uuid primary key default gen_random_uuid(), private_listing_id uuid unique, token text,
  form_data jsonb, status text, seller_type text, ownership_structure text, marital_regime text,
  canonical_facts_json jsonb, canonical_fact_readiness_json jsonb, canonical_facts_updated_at timestamptz,
  submitted_at timestamptz, updated_at timestamptz default now(), seller_portal_password_hash text,
  seller_portal_access_token_hash text, seller_portal_access_token_expires_at timestamptz,
  seller_portal_link_active boolean default true, seller_portal_link_expires_at timestamptz
);
create table document_requirement_instances(id uuid primary key, context_type text, context_id uuid, listing_id uuid,
  document_definition_key text, status text, satisfied_by_document_id uuid);
create table private_listing_document_requirements(
  id uuid primary key default gen_random_uuid(), private_listing_id uuid, requirement_key text, requirement_name text,
  request_stage text, status text default 'required', is_required boolean default true, request_revision integer default 1,
  last_request_reason text, request_metadata jsonb default '{}', canonical_requirement_instance_id uuid,
  satisfied_by_document_id uuid, satisfaction_verified_at timestamptz, satisfaction_method text,
  assurance_state text default 'unverified', assurance_metadata jsonb default '{}', updated_at timestamptz default now(),
  document_visibility text default 'seller_visible'
);
create table private_listing_documents(
  id uuid primary key default gen_random_uuid(), private_listing_id uuid, requirement_id uuid, document_type text,
  document_name text, status text, uploaded_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now(),
  canonical_requirement_instance_id uuid, storage_path text, file_url text, generated_html text, generated_file_name text,
  uploaded_by uuid, visibility text, reviewed_signing_version_id uuid, reviewed_signing_version_digest text,
  promoted_transaction_id uuid, promoted_document_id uuid, promotion_status text, promotion_error text
);
create table documents(id uuid, transaction_id uuid, canonical_requirement_instance_id uuid);
create table client_portal_contexts(id uuid primary key, listing_id uuid, context_type text, status text, client_email text, updated_at timestamptz);
create table private_listing_activity(id uuid primary key default gen_random_uuid(), private_listing_id uuid, activity_type text,
  activity_title text, activity_description text, performed_by uuid, visibility text, metadata jsonb);
create table notification_automation_definitions(automation_key text primary key, display_name text, category text, trigger_type text,
  recipient_role text, channels text[], implementation_status text, default_enabled boolean, dedupe_strategy text,
  reminder_policy jsonb, metadata_json jsonb, updated_at timestamptz);
create table notification_events(id uuid primary key default gen_random_uuid(), automation_key text references notification_automation_definitions,
  organisation_id uuid, assigned_user_id uuid, listing_id uuid, event_key text, category text, trigger_type text, channel text,
  status text, recipient_email text, recipient_role text, subject text, message_preview text, source text, dedupe_key text unique,
  payload_json jsonb, metadata_json jsonb, prepared_at timestamptz, queued_at timestamptz);
-- Session/membership and transaction promotion are external boundaries here.
-- These listings have no transaction; uploaded files remain pending promotion.
create function bridge_private_listing_seller_portal_link_is_active(jsonb,jsonb) returns boolean language sql stable as $$
  select coalesce(($1->>'seller_portal_link_active')::boolean,true)
    and (($1->>'seller_portal_link_expires_at') is null or ($1->>'seller_portal_link_expires_at')::timestamptz>now())
$$;
create function bridge_log_client_portal_access_event(text,text,text,uuid,text) returns void language sql as $$ select $$;
create function bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql as $$ select null::uuid $$;
create function bridge_promote_private_listing_document_row(uuid) returns jsonb language sql as $$ select '{"continuity":{"pending":true}}'::jsonb $$;
create function bridge_apply_seller_document_transaction_continuity_p0_6(uuid) returns jsonb language sql as $$ select '{"pending":true}'::jsonb $$;
