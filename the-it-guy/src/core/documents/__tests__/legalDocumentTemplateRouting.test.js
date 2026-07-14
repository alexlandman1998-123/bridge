import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentTemplateCoverageAudit,
  buildLegalDocumentTemplateRouteSignature,
  buildLegalDocumentTemplateRoutingAudit,
  resolveLegalDocumentTemplateRoutingMetadata,
  scoreLegalDocumentTemplateCandidate,
  selectLegalDocumentTemplateCandidate,
} from '../legalDocumentTemplateRouting.js'
import { resolveLegalDocumentScenarioProfile } from '../legalDocumentScenarioProfile.js'

const otpProfile = resolveLegalDocumentScenarioProfile({
  packetType: 'otp',
  seller: { entityType: 'trust' },
  buyer: { entityType: 'individual', maritalStatus: 'in community of property' },
  property: { propertyType: 'sectional title' },
  transaction: { financeType: 'bond' },
})

test('selects the exact OTP legal scenario ahead of the generic template', () => {
  const selection = selectLegalDocumentTemplateCandidate([
    { id: 'default', is_default: true, metadata_json: {} },
    {
      id: 'exact',
      metadata_json: { legal_document_scenario: otpProfile.scenarioKey },
    },
  ], { scenarioProfile: otpProfile })

  assert.equal(selection.template.id, 'exact')
  assert.deepEqual(selection.reasons, ['exact_scenario_metadata'])
})

test('supports simple dimension metadata without enumerating every OTP combination', () => {
  const selection = selectLegalDocumentTemplateCandidate([
    { id: 'default', is_default: true, metadata_json: {} },
    {
      id: 'sectional-trust',
      metadata_json: {
        seller_clause_profile: 'trust',
        property_clause_profile: 'sectional_title',
      },
    },
  ], { scenarioProfile: otpProfile })

  assert.equal(selection.template.id, 'sectional-trust')
  assert.deepEqual(selection.reasons, ['seller_profile_metadata', 'property_profile_metadata'])
})

test('rejects a template when any configured legal dimension conflicts', () => {
  const candidate = scoreLegalDocumentTemplateCandidate({
    id: 'cash-only',
    metadata_json: {
      seller_clause_profile: 'trust',
      finance_clause_profile: 'cash',
    },
  }, { scenarioProfile: otpProfile })

  assert.equal(candidate.compatible, false)
  assert.deepEqual(candidate.reasons, ['finance_mismatch'])
})

test('reads existing mandate route metadata through the shared router', () => {
  const metadata = resolveLegalDocumentTemplateRoutingMetadata({
    packet_type: 'mandate',
    metadata_json: { mandate_template_variant: 'company_sectional_title' },
  })

  assert.deepEqual(metadata.scenarios, ['company_sectional_title'])
  assert.equal(metadata.hasRoutingMetadata, true)
})

test('returns an explainable routing audit for generation history', () => {
  const selection = selectLegalDocumentTemplateCandidate([
    {
      id: 'exact',
      template_key: 'otp_trust_icop_sectional_bond',
      template_label: 'Trust seller sectional bond OTP',
      metadata_json: { legal_document_scenario: otpProfile.scenarioKey },
    },
  ], { scenarioProfile: otpProfile })
  const audit = buildLegalDocumentTemplateRoutingAudit(selection)

  assert.equal(audit.legalDocumentScenarioKey, otpProfile.scenarioKey)
  assert.equal(audit.selectedTemplateId, 'exact')
  assert.equal(audit.matchedSpecificScenario, true)
})

test('summarises broad fallback and specialised OTP coverage without a combination matrix', () => {
  const audit = buildLegalDocumentTemplateCoverageAudit([
    { id: 'fallback', packet_type: 'otp', template_label: 'General OTP', metadata_json: {} },
    {
      id: 'sectional',
      packet_type: 'otp',
      template_label: 'Sectional OTP',
      metadata_json: { property_clause_profile: 'sectional_title' },
    },
    {
      id: 'trust',
      packet_type: 'otp',
      template_label: 'Trust seller OTP',
      metadata_json: { seller_clause_profile: 'trust' },
    },
  ], { packetType: 'otp' })

  assert.equal(audit.hasGenericFallback, true)
  assert.equal(audit.genericCount, 1)
  assert.equal(audit.targetedCount, 2)
  assert.equal(audit.conflictCount, 0)
})

test('flags duplicate routing rules regardless of metadata key order', () => {
  const first = {
    id: 'first',
    packet_type: 'otp',
    metadata_json: {
      seller_clause_profiles: ['trust', 'company'],
      property_clause_profile: 'sectional_title',
    },
  }
  const second = {
    id: 'second',
    packet_type: 'otp',
    metadata_json: {
      propertyClauseProfile: 'sectional_title',
      sellerClauseProfiles: ['company', 'trust'],
    },
  }
  const audit = buildLegalDocumentTemplateCoverageAudit([first, second], { packetType: 'otp' })

  assert.equal(buildLegalDocumentTemplateRouteSignature(first), buildLegalDocumentTemplateRouteSignature(second))
  assert.equal(audit.conflictCount, 1)
  assert.deepEqual(audit.conflicts[0].templates.map((template) => template.id), ['first', 'second'])
})
