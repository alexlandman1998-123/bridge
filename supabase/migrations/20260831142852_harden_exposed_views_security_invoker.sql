-- Harden browser-exposed public views without removing authenticated product access.
--
-- All retained authenticated views resolve through RLS-enabled base tables with
-- explicit SELECT grants. Canonical document diagnostic views are operational
-- checks only and remain available to service_role, not browser roles.

alter view if exists public.attorney_invites set (security_invoker = true);
alter view if exists public.attorney_team_members set (security_invoker = true);
alter view if exists public.bridge_attorney_workflow_step_templates_v1 set (security_invoker = true);
alter view if exists public.canonical_document_approved_without_satisfier set (security_invoker = true);
alter view if exists public.canonical_document_duplicate_active_requirements set (security_invoker = true);
alter view if exists public.canonical_document_legacy_rows_without_canonical_link set (security_invoker = true);
alter view if exists public.canonical_document_requirements_missing_definitions set (security_invoker = true);
alter view if exists public.canonical_document_requirements_without_uploader set (security_invoker = true);
alter view if exists public.canonical_document_unlinked_documents set (security_invoker = true);
alter view if exists public.canonical_document_unlinked_packet_versions set (security_invoker = true);
alter view if exists public.commission_allocation_reporting_base_v1 set (security_invoker = true);
alter view if exists public.commission_allocation_review_queue_v1 set (security_invoker = true);
alter view if exists public.commission_allocation_review_summary_v1 set (security_invoker = true);
alter view if exists public.commission_closeout_reporting_v1 set (security_invoker = true);
alter view if exists public.commission_finance_summary_v1 set (security_invoker = true);
alter view if exists public.commission_participant_earnings_v1 set (security_invoker = true);
alter view if exists public.commission_referral_reporting_v1 set (security_invoker = true);
alter view if exists public.commission_structure_rule_pool_totals set (security_invoker = true);
alter view if exists public.commission_structure_validation_v1 set (security_invoker = true);
alter view if exists public.external_partner_referral_commission_accounting_v1 set (security_invoker = true);
alter view if exists public.internal_referral_commission_accounting_v1 set (security_invoker = true);
alter view if exists public.organisation_email_branding_readiness set (security_invoker = true);
alter view if exists public.otp_commercial_terms_persistence_readiness_v1 set (security_invoker = true);
alter view if exists public.partner_relationship_metrics set (security_invoker = true);
alter view if exists public.referral_commission_allocation_mapping_v1 set (security_invoker = true);
alter view if exists public.transaction_commission_closeout_readiness_v1 set (security_invoker = true);
alter view if exists public.transaction_commission_structure_allocations_v1 set (security_invoker = true);
alter view if exists public.transaction_conversion_commission_hook_v1 set (security_invoker = true);

-- None of these operational or financial views are public portal contracts.
-- Portal-facing access continues through token-scoped tables and RPCs.
revoke select on
  public.attorney_invites,
  public.attorney_team_members,
  public.bridge_attorney_workflow_step_templates_v1,
  public.canonical_document_approved_without_satisfier,
  public.canonical_document_duplicate_active_requirements,
  public.canonical_document_legacy_rows_without_canonical_link,
  public.canonical_document_requirements_missing_definitions,
  public.canonical_document_requirements_without_uploader,
  public.canonical_document_unlinked_documents,
  public.canonical_document_unlinked_packet_versions,
  public.commission_allocation_reporting_base_v1,
  public.commission_allocation_review_queue_v1,
  public.commission_allocation_review_summary_v1,
  public.commission_closeout_reporting_v1,
  public.commission_finance_summary_v1,
  public.commission_participant_earnings_v1,
  public.commission_referral_reporting_v1,
  public.commission_structure_rule_pool_totals,
  public.commission_structure_validation_v1,
  public.external_partner_referral_commission_accounting_v1,
  public.internal_referral_commission_accounting_v1,
  public.organisation_email_branding_readiness,
  public.otp_commercial_terms_persistence_readiness_v1,
  public.partner_relationship_metrics,
  public.referral_commission_allocation_mapping_v1,
  public.transaction_commission_closeout_readiness_v1,
  public.transaction_commission_structure_allocations_v1,
  public.transaction_conversion_commission_hook_v1
from public, anon;

-- These diagnostics depend on service-only canonical requirement state.
revoke select on
  public.canonical_document_approved_without_satisfier,
  public.canonical_document_duplicate_active_requirements,
  public.canonical_document_legacy_rows_without_canonical_link,
  public.canonical_document_requirements_missing_definitions,
  public.canonical_document_requirements_without_uploader,
  public.canonical_document_unlinked_documents,
  public.canonical_document_unlinked_packet_versions
from authenticated;

-- Preserve authenticated product/reporting access through base-table RLS.
grant select on
  public.attorney_invites,
  public.attorney_team_members,
  public.bridge_attorney_workflow_step_templates_v1,
  public.commission_allocation_reporting_base_v1,
  public.commission_allocation_review_queue_v1,
  public.commission_allocation_review_summary_v1,
  public.commission_closeout_reporting_v1,
  public.commission_finance_summary_v1,
  public.commission_participant_earnings_v1,
  public.commission_referral_reporting_v1,
  public.commission_structure_rule_pool_totals,
  public.commission_structure_validation_v1,
  public.external_partner_referral_commission_accounting_v1,
  public.internal_referral_commission_accounting_v1,
  public.organisation_email_branding_readiness,
  public.otp_commercial_terms_persistence_readiness_v1,
  public.partner_relationship_metrics,
  public.referral_commission_allocation_mapping_v1,
  public.transaction_commission_closeout_readiness_v1,
  public.transaction_commission_structure_allocations_v1,
  public.transaction_conversion_commission_hook_v1
to authenticated;

-- Preserve backend automation, diagnostics, and checked SECURITY DEFINER RPCs.
grant select on
  public.attorney_invites,
  public.attorney_team_members,
  public.bridge_attorney_workflow_step_templates_v1,
  public.canonical_document_approved_without_satisfier,
  public.canonical_document_duplicate_active_requirements,
  public.canonical_document_legacy_rows_without_canonical_link,
  public.canonical_document_requirements_missing_definitions,
  public.canonical_document_requirements_without_uploader,
  public.canonical_document_unlinked_documents,
  public.canonical_document_unlinked_packet_versions,
  public.commission_allocation_reporting_base_v1,
  public.commission_allocation_review_queue_v1,
  public.commission_allocation_review_summary_v1,
  public.commission_closeout_reporting_v1,
  public.commission_finance_summary_v1,
  public.commission_participant_earnings_v1,
  public.commission_referral_reporting_v1,
  public.commission_structure_rule_pool_totals,
  public.commission_structure_validation_v1,
  public.external_partner_referral_commission_accounting_v1,
  public.internal_referral_commission_accounting_v1,
  public.organisation_email_branding_readiness,
  public.otp_commercial_terms_persistence_readiness_v1,
  public.partner_relationship_metrics,
  public.referral_commission_allocation_mapping_v1,
  public.transaction_commission_closeout_readiness_v1,
  public.transaction_commission_structure_allocations_v1,
  public.transaction_conversion_commission_hook_v1
to service_role;

do $$
declare
  unsafe_views text[];
  anonymous_views text[];
  browser_diagnostics text[];
begin
  select array_agg(c.relname order by c.relname)
    into unsafe_views
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any (array[
       'attorney_invites',
       'attorney_team_members',
       'bridge_attorney_workflow_step_templates_v1',
       'canonical_document_approved_without_satisfier',
       'canonical_document_duplicate_active_requirements',
       'canonical_document_legacy_rows_without_canonical_link',
       'canonical_document_requirements_missing_definitions',
       'canonical_document_requirements_without_uploader',
       'canonical_document_unlinked_documents',
       'canonical_document_unlinked_packet_versions',
       'commission_allocation_reporting_base_v1',
       'commission_allocation_review_queue_v1',
       'commission_allocation_review_summary_v1',
       'commission_closeout_reporting_v1',
       'commission_finance_summary_v1',
       'commission_participant_earnings_v1',
       'commission_referral_reporting_v1',
       'commission_structure_rule_pool_totals',
       'commission_structure_validation_v1',
       'external_partner_referral_commission_accounting_v1',
       'internal_referral_commission_accounting_v1',
       'organisation_email_branding_readiness',
       'otp_commercial_terms_persistence_readiness_v1',
       'partner_relationship_metrics',
       'referral_commission_allocation_mapping_v1',
       'transaction_commission_closeout_readiness_v1',
       'transaction_commission_structure_allocations_v1',
       'transaction_conversion_commission_hook_v1'
     ])
     and not coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'];

  if coalesce(cardinality(unsafe_views), 0) > 0 then
    raise exception 'Expected security_invoker views, found unsafe: %', unsafe_views;
  end if;

  select array_agg(c.relname order by c.relname)
    into anonymous_views
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any (array[
       'attorney_invites',
       'attorney_team_members',
       'bridge_attorney_workflow_step_templates_v1',
       'canonical_document_approved_without_satisfier',
       'canonical_document_duplicate_active_requirements',
       'canonical_document_legacy_rows_without_canonical_link',
       'canonical_document_requirements_missing_definitions',
       'canonical_document_requirements_without_uploader',
       'canonical_document_unlinked_documents',
       'canonical_document_unlinked_packet_versions',
       'commission_allocation_reporting_base_v1',
       'commission_allocation_review_queue_v1',
       'commission_allocation_review_summary_v1',
       'commission_closeout_reporting_v1',
       'commission_finance_summary_v1',
       'commission_participant_earnings_v1',
       'commission_referral_reporting_v1',
       'commission_structure_rule_pool_totals',
       'commission_structure_validation_v1',
       'external_partner_referral_commission_accounting_v1',
       'internal_referral_commission_accounting_v1',
       'organisation_email_branding_readiness',
       'otp_commercial_terms_persistence_readiness_v1',
       'partner_relationship_metrics',
       'referral_commission_allocation_mapping_v1',
       'transaction_commission_closeout_readiness_v1',
       'transaction_commission_structure_allocations_v1',
       'transaction_conversion_commission_hook_v1'
     ])
     and has_table_privilege('anon', c.oid, 'select');

  if coalesce(cardinality(anonymous_views), 0) > 0 then
    raise exception 'Anonymous SELECT remains on hardened views: %', anonymous_views;
  end if;

  select array_agg(c.relname order by c.relname)
    into browser_diagnostics
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any (array[
       'canonical_document_approved_without_satisfier',
       'canonical_document_duplicate_active_requirements',
       'canonical_document_legacy_rows_without_canonical_link',
       'canonical_document_requirements_missing_definitions',
       'canonical_document_requirements_without_uploader',
       'canonical_document_unlinked_documents',
       'canonical_document_unlinked_packet_versions'
     ])
     and has_table_privilege('authenticated', c.oid, 'select');

  if coalesce(cardinality(browser_diagnostics), 0) > 0 then
    raise exception 'Canonical diagnostics remain browser-readable: %', browser_diagnostics;
  end if;
end
$$;
