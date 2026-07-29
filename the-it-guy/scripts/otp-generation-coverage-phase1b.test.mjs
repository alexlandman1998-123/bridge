import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  OTP_DOCUMENT_VARIANTS,
  OTP_GENERATION_COVERAGE_AUDIT_VERSION,
  OTP_ROUTE_DIMENSIONS,
  buildOtpGenerationCoverageAudit,
  formatOtpGenerationCoverageAuditMarkdown,
} from '../src/core/documents/otpGenerationCoverageAudit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:otp-generation-coverage-phase1b'],
  'node scripts/otp-generation-coverage-phase1b.test.mjs',
  'package.json should expose the OTP generation coverage Phase 1B contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-generation-coverage'],
  'node scripts/report-otp-generation-coverage.mjs',
  'package.json should expose the OTP generation coverage report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-generation-coverage-phase1b'),
  'OTP vNext verification should include Phase 1B generation coverage.',
)

const audit = buildOtpGenerationCoverageAudit({ checkedAt: '2026-07-29T13:00:00.000Z' })
assert.equal(audit.version, OTP_GENERATION_COVERAGE_AUDIT_VERSION)
assert.equal(audit.mutatedData, false)
assert.equal(audit.status, 'OTP_GENERATION_COVERAGE_REMEDIATION_REQUIRED')
assert.deepEqual(OTP_DOCUMENT_VARIANTS.map((variant) => variant.key), ['resale_existing_property', 'new_development'])
assert.ok(audit.documentVariants.some((variant) => variant.key === 'new_development' && variant.recommendation.includes('distinct variant')))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('company_or_cc'))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('trust'))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('individual_customary_marriage'))
assert.ok(OTP_ROUTE_DIMENSIONS.propertyTitle.includes('sectional_title_unit'))
assert.ok(OTP_ROUTE_DIMENSIONS.propertyTitle.includes('new_development_unit'))
assert.ok(OTP_ROUTE_DIMENSIONS.finance.includes('subject_to_sale_of_purchaser_property'))
assert.ok(audit.buyerOnboarding.branches.includes('company'))
assert.ok(audit.buyerOnboarding.branches.includes('trust'))
assert.ok(audit.buyerOnboarding.branches.includes('foreign_purchaser'))
assert.ok(audit.buyerOnboarding.financeBranches.includes('hybrid'))
assert.ok(audit.buyerOnboarding.capturedFieldCount > 80)

const byKey = new Map(audit.coverageItems.map((item) => [item.key, item]))
assert.equal(byKey.get('buyer_identity_contact')?.status, 'covered')
assert.equal(byKey.get('buyer_company_authority')?.status, 'covered')
assert.equal(byKey.get('buyer_trust_authority')?.status, 'covered')
assert.equal(byKey.get('buyer_marital_status_regime')?.status, 'partial')
assert.equal(byKey.get('purchaser_property_sale_suspensive_condition')?.status, 'missing')
assert.equal(byKey.get('irrevocable_offer_and_guarantees')?.status, 'missing')
assert.equal(byKey.get('fixtures_fittings_inclusions_exclusions')?.status, 'missing')
assert.equal(byKey.get('new_development_terms')?.status, 'partial')
assert.ok(byKey.get('occupation_rental_terms')?.gap.includes('occupational rent'))
assert.ok(byKey.get('bond_employment_documents')?.recommendation.includes('applicant-aware'))

assert.ok(audit.recommendedDecisions.some((item) => item.key === 'two_primary_otp_variants'))
assert.ok(audit.recommendedDecisions.some((item) => item.key === 'commercial_terms_capture'))
assert.ok(audit.recommendedDecisions.some((item) => item.key === 'marital_regime_expansion'))

const markdown = formatOtpGenerationCoverageAuditMarkdown(audit)
for (const token of [
  'OTP vNext Phase 1B Generation Coverage Audit',
  'Existing / resale property OTP',
  'New development OTP',
  'Route Universe',
  "Purchaser's existing property sale condition",
  'Buyer-Onboarding Field Gaps',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP generation coverage Phase 1B contract passed.')
