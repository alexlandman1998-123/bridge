import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  agencyPipeline: await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  auditSql: await readFile(new URL('./sql/seller-onboarding-profile-phase6-backfill-audit.sql', import.meta.url), 'utf8'),
  docs: await readFile(new URL('../docs/seller-onboarding-profile-migration-backfill-guardrails-phase6.md', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

assert.match(
  files.agencyPipeline,
  /function getMigrationGuardedSellerOnboardingSnapshot\(candidate = \{\}\)/,
  'Agency seller profile should expose a migration-guarded seller onboarding snapshot helper.',
)
assert.match(
  files.agencyPipeline,
  /function isSellerOnboardingLinkOnlyMigrationArtifact\(candidate = \{\}\)/,
  'Agency seller profile should classify link-only seller onboarding artifacts.',
)
assert.match(
  files.agencyPipeline,
  /function hasSellerOnboardingMigrationPayload\(candidate = \{\}\)/,
  'Agency seller profile should keep true form-data and submitted/progress snapshots.',
)
assert.match(files.agencyPipeline, /seller_onboarding_link/)
assert.match(files.agencyPipeline, /seller_portal_invite_token_hash/)
assert.match(files.agencyPipeline, /seller_portal_session_id/)
assert.match(
  files.agencyPipeline,
  /const onboarding = getMigrationGuardedSellerOnboardingSnapshot\(onboardingCandidate\)/,
  'Lead seller onboarding hydration should filter lead-level snapshots.',
)
assert.match(
  files.agencyPipeline,
  /const rawOnboarding = getMigrationGuardedSellerOnboardingSnapshot\(rawOnboardingCandidate\)/,
  'Lead seller onboarding hydration should filter raw-payload snapshots.',
)
assert.match(
  files.agencyPipeline,
  /const existingOnboarding = getMigrationGuardedSellerOnboardingSnapshot\(existingOnboardingCandidate\)/,
  'Seller profile save should preserve only guarded existing seller onboarding snapshots.',
)
assert.match(
  files.agencyPipeline,
  /const rawOnboarding = getMigrationGuardedSellerOnboardingSnapshot\(rawOnboardingCandidate\)/,
  'Seller profile save should preserve only guarded raw seller onboarding snapshots.',
)
assert.match(
  files.agencyPipeline,
  /existingOnboardingCandidate\.token/,
  'Seller profile save may still use legacy metadata for token discovery.',
)
assert.match(
  files.agencyPipeline,
  /persistSellerProfileOnboardingFormData/,
  'Seller profile save should still write through the canonical persistence helper.',
)

assert.match(files.auditSql, /migration\/backfill audit only/i)
assert.match(files.auditSql, /private_listing_seller_onboarding/)
assert.match(files.auditSql, /seller_onboarding_link/)
assert.match(files.auditSql, /seller_portal_invite_token_hash/)
assert.match(files.auditSql, /seller_portal_session_id/)
assert.match(files.auditSql, /already_canonical_skip/)
assert.match(files.auditSql, /link_artifact_skip/)
assert.match(files.auditSql, /true_seller_onboarding_candidate/)
assert.match(files.auditSql, /ambiguous_manual_review/)
assert.doesNotMatch(files.auditSql, /\b(update|insert|delete|upsert|merge)\b/i)

assert.match(files.docs, /audit-first mode/i)
assert.match(files.docs, /link-only artifacts/i)
assert.match(files.docs, /private_listing_seller_onboarding\.form_data/)
assert.match(files.docs, /Phase 4 protected-section merge rules still apply/)

assert.match(
  files.packageJson,
  /"test:seller-onboarding-profile-migration-backfill-phase6": "node scripts\/seller-onboarding-profile-migration-backfill-phase6\.test\.mjs"/,
  'package.json should expose the seller onboarding profile migration/backfill Phase 6 contract.',
)

console.log('seller onboarding profile migration/backfill phase 6 passed')
