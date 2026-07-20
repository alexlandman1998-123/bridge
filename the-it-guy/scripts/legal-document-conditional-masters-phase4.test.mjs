import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assessConditionalMasterTemplate,
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../src/core/documents/conditionalMasterTemplateDefinitions.js'

const migration = await readFile(new URL('../../supabase/migrations/202607200004_conditional_legal_masters_phase4.sql', import.meta.url), 'utf8')
const settingsEditor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const resolver = await readFile(new URL('../src/core/documents/legalDocumentScenarioProfile.js', import.meta.url), 'utf8')
const dataRules = await readFile(new URL('../src/core/documents/conditionalPackDataRules.js', import.meta.url), 'utf8')

const definitions = ['mandate', 'otp'].map((packetType) => getConditionalMasterTemplateDefinition(packetType))
assert.deepEqual(definitions.map((definition) => definition.templateKey), ['mandate_default_v1', 'otp_default_v1'])
assert.deepEqual(definitions.map((definition) => definition.packKeys.length), [6, 13])

for (const definition of definitions) {
  const sections = buildConditionalMasterTemplateSections(definition.packetType, [
    { sectionKey: definition.packetType === 'mandate' ? 'introduction_purpose' : 'cover_page', legalText: 'Approved standard wording', isRequired: true },
    { sectionKey: 'signature_pages', legalText: 'Signature wording', isRequired: true },
  ])
  assert.equal(assessConditionalMasterTemplate(definition.packetType, sections).valid, true)
  assert.equal(sections.filter((section) => section.sectionKey === 'signature_pages').length, 1)
}

for (const token of [
  "'conditional_master', true",
  "'conditional_master_version', 'conditional-master-v1'",
  "'scenario_resolver_version', 'canonical_legal_document_scenario_v1'",
  "'core_condition_rules_locked', true",
  "'condition_rule_locked', true",
  "'mandate_default_v1'",
  "'otp_default_v1'",
  "'property_full_title_pack'",
  "'property_sectional_title_pack'",
  "'cash_contribution_pack'",
  'v_master_count <> 2',
  "case template.packet_type when 'mandate' then 6 else 13 end",
]) {
  assert.ok(migration.includes(token), `Phase 4 migration should include ${token}.`)
}

assert.match(settingsEditor, /buildConditionalMasterTemplateSections\(packetType, baseSections\)/)
assert.match(settingsEditor, /conditional_master_version: conditionalMasterDefinition\.masterVersion/)
assert.match(settingsEditor, /function isCoreConditionRuleLocked\(section = \{\}\)/)
assert.match(settingsEditor, /You can still edit the clause wording\./)
assert.match(resolver, /financeClauseProfile === 'combination' \? 'cash_contribution_pack'/)
assert.match(dataRules, /key: 'cash_contribution_pack'/)
assert.match(dataRules, /case 'combination_finance'/)
assert.match(migration, /legal_text = coalesce\(nullif\(btrim\(public\.document_template_sections\.legal_text\), ''\), excluded\.legal_text\)/)
assert.doesNotMatch(migration, /delete\s+from\s+public\.document_packet_templates/i)

console.log('Conditional legal document masters Phase 4 contract passed.')
