import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../src/core/documents/conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterCoverage } from '../src/core/documents/conditionalMasterCoverageReadiness.js'

function template(packetType) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  return {
    packet_type: packetType,
    metadata_json: { default_signer_roles: definition.defaultSignerRoles },
    sections: buildConditionalMasterTemplateSections(packetType, [
      { sectionKey: 'parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', legalText: 'Signatures' },
    ]),
  }
}

const mandate = evaluateConditionalMasterCoverage({ packetType: 'mandate', template: template('mandate') })
const otp = evaluateConditionalMasterCoverage({ packetType: 'otp', template: template('otp') })
assert.equal(mandate.ready, true)
assert.equal(mandate.caseCount, 12)
assert.equal(otp.ready, true)
assert.equal(otp.caseCount, 216)
assert.equal(otp.scenarioCount, 96)

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const libraryModel = await readFile(new URL('../src/core/documents/legalDocumentLibraryModel.js', import.meta.url), 'utf8')
const settings = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

for (const token of [
  'evaluateConditionalMasterCoverage({',
  'conditionalMasterCoverageReadiness',
  'conditionalMasterCoverageDecisionHash',
  'hasConditionalMasterCoverageBlockingIssues',
  'CONDITIONAL_MASTER_COVERAGE_BLOCKED',
]) {
  assert.ok(packetService.includes(token), `Runtime coverage readiness should include ${token}.`)
}

assert.ok(libraryModel.includes('coverageReadiness?.ready'))
assert.ok(libraryModel.includes('legacyRoutingAudit'))
assert.ok(settings.includes('Coverage Readiness'))
assert.ok(settings.includes('supported legal cases covered'))
assert.ok(!packetService.includes("issue?.source === 'mandate_template_launch_readiness'"))
assert.match(adr, /A generic fallback or a collection of route-specific templates is not coverage evidence\./)

console.log('Conditional-master coverage readiness Phase 8 contract passed.')
