import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  listLegalDocumentEditorSituationGroups,
  listLegalDocumentEditorSituations,
} from '../src/core/documents/legalDocumentEditorSituations.js'

const contextPanel = await readFile(new URL('../src/components/legal-documents/LegalDocumentEditorContextPanel.jsx', import.meta.url), 'utf8')
const scopeNav = await readFile(new URL('../src/components/legal-documents/LegalDocumentEditorScopeNav.jsx', import.meta.url), 'utf8')
const editorRoute = await readFile(new URL('../src/pages/settings/LegalDocumentEditorRoute.jsx', import.meta.url), 'utf8')
const editor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const overview = await readFile(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')

assert.equal(listLegalDocumentEditorSituations({ packetType: 'mandate' }).length, 6)
assert.equal(listLegalDocumentEditorSituations({ packetType: 'otp' }).length, 13)
assert.deepEqual(
  listLegalDocumentEditorSituationGroups({ packetType: 'otp' }).find((group) => group.key === 'finance').items.map((item) => item.key),
  ['bond_finance_pack', 'cash_sale_pack', 'cash_contribution_pack'],
)

assert.match(scopeNav, /label: 'Conditional sections'/)
assert.match(contextPanel, /Choose the conditional section to edit/)
assert.match(contextPanel, /Included when \{situation\.activationLabel\}/)
assert.match(editorRoute, /\{ packetType: definition\.packetType \}/)
assert.match(editorRoute, /'Conditional sections'/)
assert.match(overview, /title="Conditional sections"/)

for (const token of [
  'CONDITIONAL_PACK_PROTECTED_SECTION_FIELDS',
  'isConditionalMasterPackSection(section)',
  'Edit the legal wording, not the inclusion logic',
  'Included automatically',
  'assessConditionalMasterTemplate(packetType, form.sections || [])',
  'The conditional master must contain exactly one signature section.',
]) {
  assert.ok(editor.includes(token), `Phase 5 editor should include ${token}.`)
}

assert.doesNotMatch(contextPanel, /Which situation do you want to edit\?/)
assert.doesNotMatch(scopeNav, /label: 'Situation wording'/)

console.log('Conditional-section legal document editor Phase 5 contract passed.')
