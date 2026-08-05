import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
  OTP_STRUCTURED_TERMS_VERSION,
  buildOtpStructuredTermsAudit,
  buildOtpStructuredTermsManifest,
  formatOtpStructuredTermsAuditMarkdown,
  listOtpStructuredTermGroups,
  normalizeOtpStructuredTerms,
} from '../src/core/documents/otpStructuredTerms.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-structured-terms-phase7'],
  'node scripts/otp-structured-terms-phase7.test.mjs',
  'package.json should expose the OTP structured terms Phase 7 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-structured-terms'],
  'node scripts/report-otp-structured-terms.mjs',
  'package.json should expose the OTP structured terms report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-structured-terms-phase7'),
  'OTP vNext verification should include Phase 7 structured terms checks.',
)

assert.equal(OTP_STRUCTURED_TERMS_VERSION, 'otp_structured_terms_phase7_v1')
assert.equal(OTP_STRUCTURED_TERMS_RECORD_CONTRACT, 'otp_structured_terms_record_phase7_v1')

assert.deepEqual(
  listOtpStructuredTermGroups().map((group) => group.key),
  [
    'purchase_economics',
    'finance_and_guarantees',
    'structured_suspensive_conditions',
    'offer_validity',
    'transfer_conveyancer',
    'otp_commission_variation',
    'buyer_cost_obligations',
    'resale_subject_to_sale',
    'resale_occupation_rent',
    'resale_disclosure_fixtures',
    'development_vat_pricing',
    'development_handover',
    'development_levies_and_compliance',
  ],
)

const resaleManifest = buildOtpStructuredTermsManifest({ variant: 'resale_existing_property' })
const developmentManifest = buildOtpStructuredTermsManifest({ variant: 'new_development' })

assert.equal(resaleManifest.recordContract, OTP_STRUCTURED_TERMS_RECORD_CONTRACT)
assert.equal(developmentManifest.recordContract, OTP_STRUCTURED_TERMS_RECORD_CONTRACT)
assert.ok(resaleManifest.groups.some((group) => group.key === 'resale_subject_to_sale'))
assert.ok(resaleManifest.groups.some((group) => group.key === 'resale_occupation_rent'))
assert.ok(resaleManifest.groups.some((group) => group.key === 'otp_commission_variation'))
assert.ok(resaleManifest.groups.some((group) => group.key === 'buyer_cost_obligations'))
assert.equal(resaleManifest.groups.some((group) => group.key === 'development_vat_pricing'), false)
assert.ok(developmentManifest.groups.some((group) => group.key === 'development_vat_pricing'))
assert.ok(developmentManifest.groups.some((group) => group.key === 'development_handover'))
assert.ok(developmentManifest.groups.some((group) => group.key === 'otp_commission_variation'))
assert.ok(developmentManifest.groups.some((group) => group.key === 'buyer_cost_obligations'))
assert.equal(developmentManifest.groups.some((group) => group.key === 'resale_occupation_rent'), false)

const suspensiveGroup = listOtpStructuredTermGroups().find((group) => group.key === 'structured_suspensive_conditions')
assert.equal(suspensiveGroup.structuredRecordType, 'repeatable_condition_records')
assert.equal(suspensiveGroup.freeTextFallbackAllowed, false)
assert.ok(suspensiveGroup.allowedConditionTypes.includes('bond_approval'))
assert.ok(suspensiveGroup.allowedConditionTypes.includes('subject_to_sale'))
assert.ok(suspensiveGroup.allowedConditionTypes.includes('counsel_approved_special_condition'))

for (const manifest of [resaleManifest, developmentManifest]) {
  assert.equal(manifest.renderingBoundary, 'structured_terms_only_no_free_text_fallback')
  assert.ok(manifest.sourceOwners.includes('transaction_offer_terms'))
  assert.equal(manifest.sourceOwners.includes('buyer_onboarding'), false)
  if (manifest.documentVariant === 'new_development') assert.equal(manifest.sourceOwners.includes('seller_onboarding'), false)
  for (const group of manifest.groups) {
    assert.equal(group.recordContract, OTP_STRUCTURED_TERMS_RECORD_CONTRACT)
    assert.equal(group.renderPolicy, 'structured_record_only')
    assert.equal(group.freeTextFallbackAllowed, false)
    assert.ok(group.fieldKeys.length > 0, `${group.key} should bind fields.`)
    assert.ok(group.legalSectionKeys.length > 0, `${group.key} should bind legal sections.`)
  }
}

const resaleSections = listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalContentTemplateSections({ variant: 'new_development' })
const resaleSectionKeys = new Set(resaleSections.map((section) => section.section_key))
const developmentSectionKeys = new Set(developmentSections.map((section) => section.section_key))

for (const group of resaleManifest.groups) {
  assert.equal(group.legalSectionKeys.some((sectionKey) => resaleSectionKeys.has(sectionKey)), true, `${group.key} should bind a resale legal section.`)
}
for (const group of developmentManifest.groups) {
  assert.equal(group.legalSectionKeys.some((sectionKey) => developmentSectionKeys.has(sectionKey)), true, `${group.key} should bind a development legal section.`)
}

const transferSection = resaleSections.find((section) => section.section_key === 'transfer_conveyancer')
for (const token of ['transfer_attorney_contact_person', 'transfer_attorney_email', 'transfer_attorney_phone']) {
  assert.ok(transferSection.placeholder_keys.includes(token), `transfer section should include ${token}.`)
}

const normalizedResale = normalizeOtpStructuredTerms({
  transaction: {
    purchase_price: 'R 1 850 000',
    transferAttorneyCompanyName: 'Tuckers Inc.',
    transferAttorneyContactPerson: 'N. Conveyancer',
    transferAttorneyEmail: 'transfer@example.test',
    transferAttorneyPhone: '+27 11 000 0000',
    trustAccountRecipient: 'Tuckers Trust Account',
    grossCommissionAmount: 'R 92 500',
  },
  commercialTerms: {
    commission: {
      mandateCommissionSnapshot: '5.00% mandate commission',
      proposedOtpCommission: '5.00% OTP commission',
      approval: {
        status: 'not_required',
        approvalReference: 'NOT_REQUIRED',
      },
    },
    costObligations: {
      buyerVisibleItems: ['Transfer costs pending attorney quote', 'Levies estimated R 2 150'],
      pendingItems: ['Transfer duty pending SARS calculation'],
    },
    matterAttorneyCostQuote: {
      status: 'pending_upload',
    },
  },
  computed: {
    purchasePriceWords: 'One million eight hundred and fifty thousand rand',
  },
  residentialOfferTerms: {
    finance: {
      depositAmount: 'R 185 000',
      depositDueDate: '2026-09-01',
      financeType: 'bond',
      bondAmount: 'R 1 665 000',
      bondApprovalDeadline: '2026-09-15',
      cashContribution: 'R 185 000',
      cashProofDeadline: '2026-09-02',
      guaranteeDeliveryDeadline: '2026-09-20',
      guaranteeDeliveryPeriod: '14 days',
    },
    terms: {
      expiryDate: '2026-08-10',
      occupationDate: '2026-10-01',
      occupationalRent: 'Yes',
      occupationalRentAmount: 'R 18 500',
      subjectSaleProperty: '10 Example Road',
      subjectSaleMinimumPrice: 'R 1 200 000',
      subjectSaleFulfilmentDate: '2026-09-30',
    },
    conditionRequests: {
      structuredConditions: [
        { type: 'bond_approval', deadline: '2026-09-15' },
        { type: 'subject_to_sale', deadline: '2026-09-30' },
      ],
    },
  },
  seller: {
    propertyDisclosure: {
      status: 'Attached',
      annexureTitle: 'Annexure A',
      comments: 'No known latent defects disclosed beyond annexure.',
    },
    fixturesIncluded: 'Curtain rails',
    fixturesExcluded: 'Garden pots',
    complianceCertificates: 'Electrical, gas',
  },
}, { variant: 'resale_existing_property' })

assert.equal(normalizedResale.version, OTP_STRUCTURED_TERMS_VERSION)
assert.equal(normalizedResale.recordContract, OTP_STRUCTURED_TERMS_RECORD_CONTRACT)
assert.equal(normalizedResale.mutatedData, false)
assert.equal(normalizedResale.missingRequiredRecords.length, 0)
assert.equal(normalizedResale.records.find((record) => record.fieldKey === 'purchase_price')?.value, 'R 1 850 000')
assert.equal(normalizedResale.records.find((record) => record.fieldKey === 'structured_suspensive_conditions')?.sourcePath, 'residentialOfferTerms.conditionRequests.structuredConditions')
assert.equal(Array.isArray(normalizedResale.records.find((record) => record.fieldKey === 'structured_suspensive_conditions')?.value), true)
assert.equal(normalizedResale.records.some((record) => record.fieldKey === 'vat_inclusive_purchase_price'), false)

const normalizedDevelopment = normalizeOtpStructuredTerms({
  transaction: {
    purchase_price: 'R 2 450 000',
    transferAttorneyCompanyName: 'Tuckers Inc.',
    trustAccountRecipient: 'Tuckers Trust Account',
    grossCommissionAmount: 'R 122 500',
  },
  commercialTerms: {
    commission: {
      mandateCommissionSnapshot: 'Project commission instruction',
      proposedOtpCommission: 'Project commission instruction',
      approval: {
        status: 'not_required',
        approvalReference: 'NOT_REQUIRED',
      },
    },
    costObligations: {
      buyerVisibleItems: ['Utility connection charges estimated R 15 000'],
      pendingItems: ['Transfer costs pending attorney quote'],
    },
    matterAttorneyCostQuote: {
      status: 'pending_upload',
    },
  },
  computed: {
    purchasePriceWords: 'Two million four hundred and fifty thousand rand',
  },
  development: {
    vatInclusivePurchasePrice: 'R 2 450 000 VAT inclusive',
    snaggingPeriodDays: '30',
    nhbrcCertificateNumber: 'NHBRC-123',
    complianceCertificates: 'NHBRC enrolment and occupation certificate',
  },
  unit: {
    levyEstimate: 'R 2 100',
    ratesEstimate: 'R 1 500',
    utilityConnectionCharges: 'R 15 000',
  },
  residentialOfferTerms: {
    finance: {
      financeType: 'cash',
      cashContribution: 'R 2 450 000',
      cashProofDeadline: '2026-08-20',
      guaranteeDeliveryDeadline: '2026-09-01',
      guaranteeDeliveryPeriod: '7 days',
    },
    terms: {
      occupationDate: 'On practical completion',
      expiryDate: '2026-08-10',
    },
    conditionRequests: {
      structuredConditions: [{ type: 'development_document_approval', deadline: '2026-08-30' }],
    },
  },
}, { variant: 'new_development' })

assert.equal(normalizedDevelopment.records.some((record) => record.fieldKey === 'vat_inclusive_purchase_price'), true)
assert.equal(normalizedDevelopment.records.some((record) => record.fieldKey === 'occupational_rent_amount'), false)
assert.equal(normalizedDevelopment.records.find((record) => record.fieldKey === 'vat_inclusive_purchase_price')?.value, 'R 2 450 000 VAT inclusive')

const audit = buildOtpStructuredTermsAudit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_STRUCTURED_TERMS_VERSION)
assert.equal(audit.recordContract, OTP_STRUCTURED_TERMS_RECORD_CONTRACT)
assert.equal(audit.status, 'OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.groupCount, 13)
assert.equal(audit.summary.resaleGroupCount, 10)
assert.equal(audit.summary.developmentGroupCount, 10)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.deepEqual(audit.fieldRegistryGaps, [])
assert.deepEqual(audit.routeFieldGaps, [])
assert.deepEqual(audit.sourcePathGaps, [])
assert.deepEqual(audit.legalSectionGaps, [])
assert.deepEqual(audit.freeTextFallbackRisks, [])
assert.deepEqual(audit.buyerOwnedTermRisks, [])

for (const check of [
  'PHASE7_STRUCTURED_TERMS_BOTH_ROUTES_PRESENT',
  'PHASE7_RESALE_TERMS_STAY_RESALE_ONLY',
  'PHASE7_DEVELOPMENT_TERMS_STAY_DEVELOPMENT_ONLY',
  'PHASE7_STRUCTURED_TERMS_IN_FIELD_REGISTRY',
  'PHASE7_STRUCTURED_TERMS_ROUTE_ELIGIBLE',
  'PHASE7_STRUCTURED_TERMS_HAVE_SOURCE_PATHS',
  'PHASE7_STRUCTURED_TERMS_BOUND_TO_LEGAL_SECTIONS',
  'PHASE7_NO_FREE_TEXT_TERM_FALLBACKS',
  'PHASE7_BUYER_ONBOARDING_NOT_TERMS_SOURCE',
  'PHASE7_SUSPENSIVE_CONDITIONS_ARE_REPEATABLE_RECORDS',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpStructuredTermsAuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 7 Structured Terms',
  'OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING',
  'purchase_economics',
  'development_vat_pricing',
  'resale_occupation_rent',
  'structured_terms_only_no_free_text_fallback',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpStructuredTerms.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_STRUCTURED_TERMS_VERSION',
  'OTP_STRUCTURED_TERM_GROUPS',
  'normalizeOtpStructuredTerms',
  'buildOtpStructuredTermsAudit',
  'repeatable_condition_records',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP structured terms Phase 7 contract passed.')
