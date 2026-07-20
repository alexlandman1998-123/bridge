import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../conditionalMasterTemplateDefinitions.js'
import {
  evaluateConditionalMasterCoverage,
  listConditionalMasterCoverageCases,
} from '../conditionalMasterCoverageReadiness.js'

function coveredTemplate(packetType) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  return {
    packet_type: packetType,
    metadata_json: { default_signer_roles: definition.defaultSignerRoles },
    sections: buildConditionalMasterTemplateSections(packetType, [
      { sectionKey: 'parties', sectionLabel: 'Parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', sectionLabel: 'Signatures', legalText: 'Signatures' },
    ]),
  }
}

test('enumerates the complete supported fact matrix', () => {
  assert.equal(listConditionalMasterCoverageCases('mandate').length, 12)
  assert.equal(listConditionalMasterCoverageCases('otp').length, 216)
})

test('certifies one Mandate master across every supported seller and property case', () => {
  const readiness = evaluateConditionalMasterCoverage({
    packetType: 'mandate',
    template: coveredTemplate('mandate'),
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.coveredCaseCount, 12)
  assert.equal(readiness.blockedCaseCount, 0)
  assert.deepEqual(readiness.coveredPackKeys, readiness.expectedPackKeys)
})

test('certifies one OTP master across every party, property and finance case', () => {
  const readiness = evaluateConditionalMasterCoverage({
    packetType: 'otp',
    template: coveredTemplate('otp'),
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.coveredCaseCount, 216)
  assert.equal(readiness.scenarioCount, 96)
  assert.deepEqual(readiness.coveredPackKeys, readiness.expectedPackKeys)
})

test('fails coverage when an excluded branch is broken even if another scenario would render', () => {
  const template = coveredTemplate('otp')
  template.sections = template.sections.map((section) => (
    section.sectionKey === 'buyer_trust_authority_pack'
      ? { ...section, conditionJson: { enabled: true, rule: { field: 'buyer_entity_type', operator: 'equals', value: 'company' } } }
      : section
  ))
  const readiness = evaluateConditionalMasterCoverage({ packetType: 'otp', template })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockedCaseCount > 0)
  assert.ok(readiness.issues.some((item) => item.code === 'COVERAGE_CONDITIONAL_RULE_DRIFT'))
})

test('fails coverage when protected signer conditions are missing or changed', () => {
  const template = coveredTemplate('mandate')
  template.metadata_json.default_signer_roles = template.metadata_json.default_signer_roles.map((role) => (
    role.role === 'seller_spouse' ? { ...role, conditionJson: null } : role
  ))
  const readiness = evaluateConditionalMasterCoverage({ packetType: 'mandate', template })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.issues.some((item) => item.code === 'COVERAGE_CONDITIONAL_SIGNER_ROLE_RULE_DRIFT'))
})
