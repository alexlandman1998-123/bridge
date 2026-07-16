-- Read-only checks after 202607160003_admin_intake_lead_contract_phase1.sql.

select
  count(*) filter (where column_name in (
    'intake_kind', 'form_key', 'form_version', 'submission_key',
    'preferred_contact_method', 'services_interested',
    'popia_consent_given', 'popia_consent_at', 'privacy_policy_version',
    'marketing_consent', 'request_fingerprint', 'dedupe_status',
    'duplicate_of_enquiry_id', 'normalized_email', 'normalized_phone',
    'normalized_company', 'dedupe_key'
  )) as contract_columns,
  count(*) filter (
    where column_name in ('normalized_email', 'normalized_phone', 'normalized_company', 'dedupe_key')
      and is_generated = 'ALWAYS'
  ) as generated_identity_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'demo_enquiries';

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'demo_enquiries'
  and indexname in (
    'demo_enquiries_submission_key_unique_idx',
    'demo_enquiries_normalized_email_idx',
    'demo_enquiries_normalized_phone_idx',
    'demo_enquiries_normalized_company_idx',
    'demo_enquiries_dedupe_queue_idx',
    'demo_enquiries_admin_filters_idx'
  )
order by indexname;

select
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.demo_enquiries'::regclass
  and conname like 'demo_enquiries_%'
order by conname;

select
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.demo_enquiries'::regclass;

select
  count(*) as total_leads,
  count(*) filter (where submission_key is not null) as idempotent_submissions,
  count(*) filter (where popia_consent_given) as popia_consented,
  count(*) filter (where dedupe_status <> 'canonical') as dedupe_review_queue
from public.demo_enquiries;
