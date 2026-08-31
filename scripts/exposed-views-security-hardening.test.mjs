import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260831142852_harden_exposed_views_security_invoker.sql', import.meta.url),
  'utf8',
)

const exposedViews = [
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
  'transaction_conversion_commission_hook_v1',
]

for (const view of exposedViews) {
  assert.match(
    migration,
    new RegExp(`alter view if exists public\\.${view} set \\(security_invoker = true\\);`),
    `${view} must enforce underlying RLS`,
  )
}

assert.match(migration, /from public, anon;/)
assert.match(migration, /grant select on[\s\S]*otp_commercial_terms_persistence_readiness_v1[\s\S]*to authenticated;/)
assert.match(migration, /revoke select on[\s\S]*canonical_document_unlinked_packet_versions[\s\S]*from authenticated;/)
assert.match(migration, /grant select on[\s\S]*transaction_conversion_commission_hook_v1[\s\S]*to service_role;/)
assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function[\s\S]*security\s+definer/i)

console.log('Exposed view security hardening contract passed.')
