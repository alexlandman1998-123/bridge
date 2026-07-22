import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { evaluateConditionalMasterSections } from '../src/core/documents/conditionalMasterEngine.js'
import { buildConditionalMasterTemplateSections } from '../src/core/documents/conditionalMasterTemplateDefinitions.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveCanonicalLegalDocumentScenario,
} from '../src/core/documents/legalDocumentScenarioProfile.js'
import { evaluateVisibilityRulesDetailed } from '../src/core/documents/sectionVisibilityRules.js'

const visibilitySource = await readFile(new URL('../src/core/documents/sectionVisibilityRules.js', import.meta.url), 'utf8')
const engineSource = await readFile(new URL('../src/core/documents/conditionalMasterEngine.js', import.meta.url), 'utf8')
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

const profile = resolveCanonicalLegalDocumentScenario({
  packetType: 'otp',
  seller: { entityType: 'company' },
  buyer: { entityType: 'trust' },
  property: { titleType: 'sectional title' },
  transaction: { financeType: 'combination' },
})
const sections = buildConditionalMasterTemplateSections('otp', [
  { sectionKey: 'cover_page', sectionLabel: 'Cover', legalText: 'Cover' },
  { sectionKey: 'signature_pages', sectionLabel: 'Signatures', legalText: 'Signatures' },
])
const audit = evaluateConditionalMasterSections({
  packetType: 'otp',
  sections,
  placeholders: buildLegalDocumentScenarioPlaceholders(profile),
  scenarioProfile: profile,
})

assert.equal(audit.canProceed, true)
assert.deepEqual(new Set(audit.includedPackKeys), new Set(profile.activeClausePacks))
assert.ok(audit.excludedPackKeys.includes('cash_sale_pack'))
assert.ok(audit.sections.every((section) => section.condition?.engineVersion === 'conditional-visibility-v2'))

const rejected = evaluateVisibilityRulesDetailed(
  { field: 'finance_type', operator: 'not_in', value: ['cash'] },
  {},
  { strict: true },
)
assert.equal(rejected.visible, false)

for (const token of [
  "VISIBILITY_ENGINE_VERSION = 'conditional-visibility-v2'",
  'VISIBILITY_OPERATOR_UNSUPPORTED',
  'VISIBILITY_FIELD_CONFLICT',
  'VISIBILITY_RULE_EMPTY',
]) {
  assert.ok(visibilitySource.includes(token), `Phase 6 visibility engine should include ${token}.`)
}

for (const token of [
  "CONDITIONAL_MASTER_ENGINE_VERSION = 'conditional-master-engine-v1'",
  'CONDITIONAL_RULE_DRIFT',
  'CONDITIONAL_DECISION_MISMATCH',
  'CONDITIONAL_PACK_MISSING',
  'CONDITIONAL_PACK_METADATA_INVALID',
  'CONDITIONAL_MASTER_VERSION_MISMATCH',
  'CONDITIONAL_SCENARIO_INCOMPLETE',
]) {
  assert.ok(engineSource.includes(token), `Phase 6 master engine should include ${token}.`)
}

for (const token of [
  'evaluateConditionalMasterSections({',
  'conditionalEngineAudit',
  'CONDITIONAL_EDITABLE_MANIFEST_MISMATCH',
  'conditionalIncludedPackKeys',
  'conditionalExcludedPackKeys',
  'conditionalDecisionHash',
  'const allowGenerationBypass = !hasConditionalEngineBlockingIssues && !hasConditionalSigningBlockingIssues && !hasConditionalMasterCoverageBlockingIssues && (',
]) {
  assert.ok(packetService.includes(token), `Packet generation should include ${token}.`)
}

assert.match(adr, /The engine does not silently fall back from a rejected core pack to unconditional wording\./)

console.log('Hardened conditional legal document engine Phase 6 contract passed.')
