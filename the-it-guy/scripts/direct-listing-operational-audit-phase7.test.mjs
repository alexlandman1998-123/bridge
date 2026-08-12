import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { buildDirectListingOperationalSummary } from '../src/lib/directListingOperationalSummary.js'

const agentListingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function buildListing(payload, extra = {}) {
  return {
    id: 'listing_phase7',
    seller: {
      name: payload.sellerCanonicalFacts?.sellerName,
      email: payload.sellerPortalInvite?.destinationEmail,
      phone: payload.sellerPortalInvite?.destinationPhone,
    },
    sellerOnboarding: {
      status: 'sent',
      token: 'seller-phase7-token',
      formData: payload.sellerOnboardingFormData,
      sellerPortalInvite: {
        requested: true,
        status: 'prepared_local',
        link: 'https://app.example.test/seller/onboarding/seller-phase7-token',
      },
    },
    sellerCanonicalFacts: payload.sellerCanonicalFacts,
    sellerCanonicalFactReadiness: {
      sellerName: true,
      sellerEmail: true,
      sellerPhone: true,
      sellerLegalType: true,
      companyDirectors: true,
      propertyAddress: true,
      propertyStructureType: true,
      propertyUnitNumber: true,
      propertyComplexName: true,
      complianceDeclarations: true,
    },
    complianceDeclarations: payload.complianceDeclarations,
    ...extra,
  }
}

test('direct listing operational summary stays declaration-only and upload-free', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'company',
    sellerName: 'Casey',
    sellerSurname: 'Contact',
    sellerEmail: 'casey@example.com',
    sellerPhone: '+27 82 111 2222',
    companyName: 'Phase Seven Holdings',
    companyDirectors: [{ fullName: 'Dana Director', email: 'dana@example.com' }],
    propertyStructureType: 'sectional_title',
    unitNumber: '12',
    complexName: 'Audit Scheme',
    hasSignedMandate: true,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: true,
    sellerPortalInviteRequested: true,
  })
  const summary = buildDirectListingOperationalSummary(buildListing(payload))

  assert.equal(summary.hasIntake, true)
  assert.equal(summary.declarationOnly, true)
  assert.equal(summary.uploadsRequired, false)
  assert.equal(summary.sellerTypeLabel, 'Company')
  assert.equal(summary.propertyStructureLabel, 'Sectional Title')
  assert.equal(summary.readiness.percent, 100)
  assert.equal(summary.portalInvite.label, 'Prepared')
  assert.ok(summary.declarations.some((row) => row.key === 'property_condition_disclosure' && row.held === false))
  assert.ok(summary.attentionItems.some((item) => item.includes('Property Condition Disclosure')))
})

test('direct listing operational summary exposes readiness and invite retry flags', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'trust',
    sellerName: 'Tessa',
    sellerSurname: 'Trustee',
    sellerEmail: 'trust@example.com',
    trustName: 'Phase Seven Trust',
    trustees: [{ fullName: 'Tina Trustee' }],
    sellerPortalInviteRequested: true,
  })
  const summary = buildDirectListingOperationalSummary(buildListing(payload, {
    sellerCanonicalFactReadiness: {
      sellerName: true,
      sellerEmail: true,
      sellerPhone: false,
      sellerLegalType: true,
      trustTrustees: true,
      propertyAddress: false,
    },
    sellerOnboarding: {
      status: 'not_started',
      formData: payload.sellerOnboardingFormData,
      sellerPortalInvite: {
        requested: true,
        status: 'failed',
        error: 'send-email unavailable',
      },
    },
  }))

  assert.equal(summary.readiness.missing, 2)
  assert.equal(summary.portalInvite.label, 'Requested')
  assert.ok(summary.attentionItems.some((item) => item.includes('2 intake facts missing')))
  assert.ok(summary.attentionItems.some((item) => item.includes('send-email unavailable')))
})

test('AgentListingDetail renders the Phase 7 operational audit panel', () => {
  assert.match(agentListingDetailSource, /buildDirectListingOperationalSummary/)
  assert.match(agentListingDetailSource, /directListingOperationalSummary/)
  assert.match(agentListingDetailSource, /data-testid="direct-listing-operational-audit"/)
  assert.match(agentListingDetailSource, /Declarations are audit flags only and do not require uploads/)
  assert.match(agentListingDetailSource, /Upload[s]? not required/)
})
