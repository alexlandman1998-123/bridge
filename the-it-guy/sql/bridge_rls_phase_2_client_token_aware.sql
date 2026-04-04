begin;

-- Bridge RLS Phase 2: client-token-aware access
--
-- Purpose:
-- - replace temporary demo-open client-facing policies
-- - allow token-based client portal, onboarding, and status-share access
-- - preserve the internal scoped model from bridge_rls_phase_1_internal_only.sql
--
-- Requirements:
-- - the frontend must send token headers on token-based requests
-- - see src/lib/supabaseClient.js and src/lib/api.js
--
-- Header names used by this pack:
-- - x-bridge-client-portal-token
-- - x-bridge-onboarding-token
-- - x-bridge-status-token

-- ---------------------------------------------------------------------------
-- Request-header helpers
-- ---------------------------------------------------------------------------

create or replace function public.bridge_request_headers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function public.bridge_request_header(header_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(public.bridge_request_headers() ->> lower(coalesce(header_name, '')), ''))
$$;

create or replace function public.bridge_client_portal_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-client-portal-token')
$$;

create or replace function public.bridge_onboarding_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-onboarding-token')
$$;

create or replace function public.bridge_status_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-status-token')
$$;

create or replace function public.bridge_has_client_portal_token_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_portal_links cpl
    where cpl.transaction_id = target_transaction_id
      and cpl.is_active = true
      and cpl.token = public.bridge_client_portal_request_token()
  )
$$;

create or replace function public.bridge_has_onboarding_token_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_onboarding t_onb
    where t_onb.transaction_id = target_transaction_id
      and t_onb.is_active = true
      and t_onb.token = public.bridge_onboarding_request_token()
  )
$$;

create or replace function public.bridge_has_status_token_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_status_links tsl
    where tsl.transaction_id = target_transaction_id
      and tsl.is_active = true
      and tsl.token = public.bridge_status_request_token()
  )
$$;

create or replace function public.bridge_has_request_transaction_token_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_has_client_portal_token_transaction_access(target_transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(target_transaction_id)
    or public.bridge_has_status_token_transaction_access(target_transaction_id)
$$;

create or replace function public.bridge_has_request_unit_token_access(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.unit_id = target_unit_id
      and public.bridge_has_request_transaction_token_access(t.id)
  )
$$;

create or replace function public.bridge_has_request_development_token_access(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.development_id = target_development_id
      and public.bridge_has_request_transaction_token_access(t.id)
  )
$$;

create or replace function public.bridge_has_request_buyer_token_access(target_buyer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.buyer_id = target_buyer_id
      and public.bridge_has_request_transaction_token_access(t.id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Remove temporary client-facing demo-open policies from phase 1
-- ---------------------------------------------------------------------------

drop policy if exists buyers_demo_all on buyers;
drop policy if exists transaction_onboarding_demo_all on transaction_onboarding;
drop policy if exists onboarding_form_data_demo_all on onboarding_form_data;
drop policy if exists transaction_required_documents_demo_all on transaction_required_documents;
drop policy if exists transaction_comments_demo_all on transaction_comments;
drop policy if exists transaction_status_links_demo_all on transaction_status_links;
drop policy if exists transaction_events_demo_all on transaction_events;
drop policy if exists client_portal_links_demo_all on client_portal_links;
drop policy if exists client_issues_demo_all on client_issues;
drop policy if exists alteration_requests_demo_all on alteration_requests;
drop policy if exists service_reviews_demo_all on service_reviews;
drop policy if exists trust_investment_forms_demo_all on trust_investment_forms;
drop policy if exists transaction_handover_demo_all on transaction_handover;
drop policy if exists documents_demo_all on documents;

-- Leave these catalog/support tables open for now; they are low-risk and still
-- used by token-based onboarding/document helpers:
-- - document_groups
-- - document_templates
-- - document_requirement_rules
-- - document_requirements
-- - snapshot_links

-- ---------------------------------------------------------------------------
-- Add token-aware access to tables already scoped for internal users
-- ---------------------------------------------------------------------------

drop policy if exists developments_select_token_scoped on developments;
create policy developments_select_token_scoped on developments
for select to anon, authenticated
using (public.bridge_has_request_development_token_access(id));

drop policy if exists units_select_token_scoped on units;
create policy units_select_token_scoped on units
for select to anon, authenticated
using (public.bridge_has_request_unit_token_access(id));

drop policy if exists development_settings_select_token_scoped on development_settings;
create policy development_settings_select_token_scoped on development_settings
for select to anon, authenticated
using (public.bridge_has_request_development_token_access(development_id));

drop policy if exists development_settings_insert_token_scoped on development_settings;
create policy development_settings_insert_token_scoped on development_settings
for insert to anon, authenticated
with check (public.bridge_has_request_development_token_access(development_id));

drop policy if exists transaction_subprocesses_select_token_scoped on transaction_subprocesses;
create policy transaction_subprocesses_select_token_scoped on transaction_subprocesses
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists transaction_subprocess_steps_select_token_scoped on transaction_subprocess_steps;
create policy transaction_subprocess_steps_select_token_scoped on transaction_subprocess_steps
for select to anon, authenticated
using (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_has_request_transaction_token_access(tsp.transaction_id)
  )
);

-- ---------------------------------------------------------------------------
-- Transactions / buyer context
-- ---------------------------------------------------------------------------

drop policy if exists transactions_select_token_scoped on transactions;
create policy transactions_select_token_scoped on transactions
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(id));

drop policy if exists buyers_select_token_scoped on buyers;
create policy buyers_select_token_scoped on buyers
for select to anon, authenticated
using (public.bridge_has_request_buyer_token_access(id));

drop policy if exists transaction_status_links_select_token_scoped on transaction_status_links;
create policy transaction_status_links_select_token_scoped on transaction_status_links
for select to anon, authenticated
using (
  is_active = true
  and token = public.bridge_status_request_token()
);

drop policy if exists client_portal_links_select_token_scoped on client_portal_links;
create policy client_portal_links_select_token_scoped on client_portal_links
for select to anon, authenticated
using (
  is_active = true
  and token = public.bridge_client_portal_request_token()
);

drop policy if exists transaction_onboarding_select_token_scoped on transaction_onboarding;
create policy transaction_onboarding_select_token_scoped on transaction_onboarding
for select to anon, authenticated
using (
  (
    is_active = true
    and token = public.bridge_onboarding_request_token()
  )
  or public.bridge_has_request_transaction_token_access(transaction_id)
);

drop policy if exists transaction_onboarding_modify_token_scoped on transaction_onboarding;
create policy transaction_onboarding_modify_token_scoped on transaction_onboarding
for all to anon, authenticated
using (
  (
    is_active = true
    and token = public.bridge_onboarding_request_token()
  )
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  (
    is_active = true
    and token = public.bridge_onboarding_request_token()
  )
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists onboarding_form_data_select_token_scoped on onboarding_form_data;
create policy onboarding_form_data_select_token_scoped on onboarding_form_data
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists onboarding_form_data_modify_token_scoped on onboarding_form_data;
create policy onboarding_form_data_modify_token_scoped on onboarding_form_data
for all to anon, authenticated
using (
  public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

-- ---------------------------------------------------------------------------
-- Documents, requirements, comments, events
-- ---------------------------------------------------------------------------

drop policy if exists transaction_required_documents_select_token_scoped on transaction_required_documents;
create policy transaction_required_documents_select_token_scoped on transaction_required_documents
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists transaction_required_documents_modify_token_scoped on transaction_required_documents;
create policy transaction_required_documents_modify_token_scoped on transaction_required_documents
for all to anon, authenticated
using (
  public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists documents_select_token_scoped on documents;
create policy documents_select_token_scoped on documents
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists documents_insert_token_scoped on documents;
create policy documents_insert_token_scoped on documents
for insert to anon, authenticated
with check (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  or public.bridge_has_onboarding_token_transaction_access(transaction_id)
);

drop policy if exists documents_update_token_scoped on documents;
create policy documents_update_token_scoped on documents
for update to anon, authenticated
using (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  or public.bridge_has_onboarding_token_transaction_access(transaction_id)
)
with check (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  or public.bridge_has_onboarding_token_transaction_access(transaction_id)
);

drop policy if exists transaction_comments_select_token_scoped on transaction_comments;
create policy transaction_comments_select_token_scoped on transaction_comments
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists transaction_comments_insert_token_scoped on transaction_comments;
create policy transaction_comments_insert_token_scoped on transaction_comments
for insert to anon, authenticated
with check (public.bridge_has_client_portal_token_transaction_access(transaction_id));

drop policy if exists transaction_events_select_token_scoped on transaction_events;
create policy transaction_events_select_token_scoped on transaction_events
for select to anon, authenticated
using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists transaction_events_insert_token_scoped on transaction_events;
create policy transaction_events_insert_token_scoped on transaction_events
for insert to anon, authenticated
with check (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  or public.bridge_has_status_token_transaction_access(transaction_id)
);

-- ---------------------------------------------------------------------------
-- Client portal modules
-- ---------------------------------------------------------------------------

drop policy if exists transaction_handover_select_token_scoped on transaction_handover;
create policy transaction_handover_select_token_scoped on transaction_handover
for select to anon, authenticated
using (public.bridge_has_client_portal_token_transaction_access(transaction_id));

drop policy if exists transaction_handover_modify_token_scoped on transaction_handover;
create policy transaction_handover_modify_token_scoped on transaction_handover
for all to anon, authenticated
using (public.bridge_has_client_portal_token_transaction_access(transaction_id))
with check (public.bridge_has_client_portal_token_transaction_access(transaction_id));

drop policy if exists client_issues_select_token_scoped on client_issues;
create policy client_issues_select_token_scoped on client_issues
for select to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists client_issues_modify_token_scoped on client_issues;
create policy client_issues_modify_token_scoped on client_issues
for all to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists alteration_requests_select_token_scoped on alteration_requests;
create policy alteration_requests_select_token_scoped on alteration_requests
for select to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists alteration_requests_modify_token_scoped on alteration_requests;
create policy alteration_requests_modify_token_scoped on alteration_requests
for all to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists service_reviews_select_token_scoped on service_reviews;
create policy service_reviews_select_token_scoped on service_reviews
for select to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists service_reviews_modify_token_scoped on service_reviews;
create policy service_reviews_modify_token_scoped on service_reviews
for all to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists trust_investment_forms_select_token_scoped on trust_investment_forms;
create policy trust_investment_forms_select_token_scoped on trust_investment_forms
for select to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

drop policy if exists trust_investment_forms_modify_token_scoped on trust_investment_forms;
create policy trust_investment_forms_modify_token_scoped on trust_investment_forms
for all to anon, authenticated
using (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
)
with check (
  transaction_id is not null
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
);

commit;
