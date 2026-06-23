import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const workspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const leadWorkspaceServiceSource = await readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
const agencyCrmRepositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const legalWorkspaceSource = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const mandateMapperSource = await readFile(new URL('../src/core/documents/mandateDataMapper.js', import.meta.url), 'utf8')

for (const section of [
  'Mandate Type',
  'Mandate Period',
  'Commission Structure',
  'VAT Treatment',
  'Marketing Authorisation',
  'Special Mandate Conditions',
  'Additional Conditions',
]) {
  assert.ok(workspaceSource.includes(section), `seller mandate tab should render ${section}`)
}

for (const field of [
  'mandate_type',
  'mandate_start_date',
  'mandate_end_date',
  'mandate_duration_days',
  'commission_type',
  'commission_percentage',
  'commission_amount',
  'vat_handling',
  'allow_online_marketing',
  'allow_property_portals',
  'allow_social_media',
  'allow_show_boards',
  'special_mandate_conditions',
  'additional_conditions',
]) {
  assert.ok(workspaceSource.includes(field), `seller mandate save should persist ${field}`)
}

assert.ok(workspaceSource.includes('SELLER_MANDATE_TYPE_OPTIONS'), 'mandate type should use structured options')
assert.ok(workspaceSource.includes('SELLER_SPECIAL_MANDATE_CONDITION_OPTIONS'), 'special conditions should use structured options')
assert.ok(workspaceSource.includes('validateSellerMandateDraft'), 'mandate save should validate required structured fields')
assert.match(workspaceSource, /commission_percentage:\s*commissionType === 'percentage'/, 'mandate save should persist the canonical commission_percentage key')
assert.match(workspaceSource, /formData\.commission_percentage/, 'mandate reload should hydrate the canonical commission_percentage key')
assert.ok(workspaceSource.includes('getSellerListingHydrationWeight'), 'seller mandate reload should prefer hydrated seller listings')
assert.match(workspaceSource, /getSellerListingHydrationWeight\(right\) - getSellerListingHydrationWeight\(left\)/, 'seller listing picker should rank hydrated records before thin summary records')
assert.match(workspaceSource, /\.\.\.\(data\?\.listings \|\| \[\]\), \.\.\.\(row\.listings \|\| \[\]\)/, 'seller listing matches should consider workspace listings before row summary listings')
assert.ok(leadWorkspaceServiceSource.includes('safeReadSellerOnboardingForListing'), 'lead workspace should fall back to seller onboarding by listing id')
assert.ok(leadWorkspaceServiceSource.includes('fallbackSellerOnboarding'), 'lead workspace should attach fallback seller onboarding data')
assert.ok(leadWorkspaceServiceSource.includes('sellerOnboarding: fallbackSellerOnboarding'), 'fallback listing should expose sellerOnboarding form data to the mandate tab')
assert.ok(agencyCrmRepositorySource.includes('LEAD_SELECT_FIELDS_SELLER_BRIDGE'), 'lead select fallback should preserve seller bridge fields')
assert.match(agencyCrmRepositorySource, /LEAD_SELECT_FIELDS_EXTENDED[\s\S]+LEAD_SELECT_FIELDS_SELLER_BRIDGE[\s\S]+LEAD_SELECT_FIELDS_WITH_AGENT_EMAIL/, 'lead select fallback should try seller bridge fields before dropping to legacy agent fields')
assert.ok(workspaceSource.includes('updatePrivateListing(listingId'), 'mandate save should sync listing mandate_type')
assert.ok(workspaceSource.includes('updatePrivateListingOnboardingFormData'), 'mandate save should persist to onboarding form data')
assert.ok(workspaceSource.includes('Save Mandate'), 'mandate tab should keep a manual Save Mandate action')
assert.ok(!workspaceSource.includes('placeholder="Sole mandate, payable on registration"'), 'mandate terms should not be captured as a free-form legal text field')
assert.ok(!workspaceSource.includes('title="Mandate Status"'), 'mandate tab should not render the old mandate status container')
assert.ok(!workspaceSource.includes('title="Mandate History"'), 'mandate tab should not render the old mandate history container')

for (const legalField of [
  'onboarding.mandate_type',
  'onboarding.mandate_start_date',
  'onboarding.mandate_end_date',
  'onboarding.commission_type',
  'onboarding.commission_percentage',
  'onboarding.commission_amount',
  'onboarding.vat_handling',
  'onboarding.additional_conditions',
]) {
  assert.ok(legalWorkspaceSource.includes(legalField), `legal workspace defaults should hydrate ${legalField}`)
}

for (const mapperMarker of [
  'buildMarketingPermissionsText',
  'buildSpecialMandateConditionsText',
  'mandate_marketing_permissions',
  'special_conditions',
]) {
  assert.ok(mandateMapperSource.includes(mapperMarker), `mandate mapper should expose ${mapperMarker}`)
}

const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { mapSellerOnboardingToMandateData } = await server.ssrLoadModule('/src/core/documents/mandateDataMapper.js')
  const mandateData = mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      mandateType: 'sole',
      mandateStartDate: '2026-07-01',
      mandateEndDate: '2026-12-31',
      commissionType: 'percentage',
      commissionPercentage: '5',
      vatHandling: 'inclusive',
      marketingAuthorisations: {
        allowOnlineMarketing: true,
        allowPropertyPortals: true,
      },
      specialMandateConditions: {
        existingLease: true,
        sellerApprovalRequired: true,
      },
      additionalConditions: 'Generator excluded.',
    },
    lead: {
      sellerName: 'Seller Lead',
      assignedAgentName: 'Alex Agent',
    },
  })

  assert.equal(mandateData.mandate.type, 'sole')
  assert.equal(mandateData.mandate.startDate, '2026-07-01')
  assert.equal(mandateData.mandate.expiryDate, '2026-12-31')
  assert.equal(mandateData.mandate.commissionStructure, 'percentage')
  assert.equal(mandateData.mandate.commissionPercentage, 5)
  assert.equal(mandateData.mandate.vatHandling, 'inclusive')
  assert.match(mandateData.placeholders.mandate_marketing_permissions, /Agency Website/)
  assert.match(mandateData.placeholders.mandate_marketing_permissions, /Property portals/)
  assert.match(mandateData.placeholders.special_conditions, /existing lease/i)
  assert.match(mandateData.placeholders.special_conditions, /seller approval/i)
  assert.match(mandateData.placeholders.special_conditions, /Generator excluded/)

  const snakeCaseMandateData = mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      mandate_type: 'open',
      mandate_start_date: '2026-08-01',
      mandate_end_date: '2027-02-01',
      commission_type: 'fixed',
      commission_percentage: '0',
      commission_amount: '125000',
      vat_handling: 'exclusive',
      allow_online_marketing: true,
      allow_social_media: true,
      special_mandate_conditions: {
        tenantRightsApply: true,
      },
      additional_conditions: 'Curtains excluded.',
    },
  })

  assert.equal(snakeCaseMandateData.mandate.type, 'open')
  assert.equal(snakeCaseMandateData.mandate.startDate, '2026-08-01')
  assert.equal(snakeCaseMandateData.mandate.expiryDate, '2027-02-01')
  assert.equal(snakeCaseMandateData.mandate.commissionStructure, 'fixed')
  assert.equal(snakeCaseMandateData.mandate.commissionPercentage, null)
  assert.equal(snakeCaseMandateData.mandate.commissionAmount, 125000)
  assert.equal(snakeCaseMandateData.mandate.vatHandling, 'exclusive')
  assert.match(snakeCaseMandateData.placeholders.mandate_marketing_permissions, /Agency Website/)
  assert.match(snakeCaseMandateData.placeholders.mandate_marketing_permissions, /Social Media/)
  assert.match(snakeCaseMandateData.placeholders.special_conditions, /Tenant rights apply/)
  assert.match(snakeCaseMandateData.placeholders.special_conditions, /Curtains excluded/)
} finally {
  await server.close()
}

console.log('seller mandate tab refactor tests passed')
