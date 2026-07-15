import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOtpRuntimeAssembly } from '../otpRuntimeAssembly.js'

const approved = {
  governance: {
    approval_status: 'approved',
    approved_at: '2026-07-15T00:00:00.000Z',
    approved_by: 'attorney-1',
    approved_by_role: 'attorney',
    locked: true,
  },
}

function packSection(key, condition = null) {
  return {
    sectionKey: key,
    sectionLabel: key,
    legalText: `${key} wording`,
    conditionJson: condition || { rule: { field: 'legal_active_clause_packs', operator: 'contains', value: key } },
    metadataJson: { clause_pack_keys: [key], ...approved },
  }
}

const baseSections = [
  { sectionKey: 'definitions', sectionLabel: 'Definitions', legalText: 'Core wording', metadataJson: approved },
  packSection('cash_sale_pack'),
  packSection('bond_finance_pack'),
  { sectionKey: 'signature_pages', sectionLabel: 'Signatures', sectionType: 'signature_zone' },
]

const resolution = {
  selectionKey: 'cash-route',
  activePackKeys: ['residential_resale_core_pack', 'cash_sale_pack'],
  draftAssemblyAllowed: true,
  signingReady: true,
  conflicts: [],
  decisions: [
    { key: 'cash_sale_pack', label: 'Cash sale', reason: 'The sale is cash.' },
    { key: 'bond_finance_pack', label: 'Bond finance', reason: 'No bond is used.' },
  ],
}

const coverage = {
  items: [{ key: 'cash_sale_pack', covered: true }],
}

test('renders exactly the approved packs selected by the onboarding facts', () => {
  const assembly = buildOtpRuntimeAssembly({
    template: { id: 'otp-1', metadataJson: { otp_runtime_assembly_version: 'otp_runtime_assembly_v1' } },
    sections: baseSections,
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage,
  })
  assert.equal(assembly.runtimeEnforced, true)
  assert.equal(assembly.canAssemble, true)
  assert.equal(assembly.canReleaseForSigning, true)
  assert.deepEqual(assembly.selectedPackKeys, ['cash_sale_pack'])
  assert.equal(assembly.decisions.find((item) => item.key === 'bond_finance_pack').status, 'excluded')
})

test('blocks a required pack that is not rendered', () => {
  const assembly = buildOtpRuntimeAssembly({
    template: { metadataJson: { otp_runtime_assembly_version: 'otp_runtime_assembly_v1' } },
    sections: baseSections.filter((section) => section.sectionKey !== 'cash_sale_pack'),
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage,
  })
  assert.equal(assembly.canAssemble, false)
  assert.deepEqual(assembly.missingPackKeys, ['cash_sale_pack'])
})

test('blocks inactive or duplicate clause wording from leaking into the document', () => {
  const sections = [
    ...baseSections,
    packSection('cash_sale_pack'),
    packSection('bond_finance_pack', {}),
  ]
  const assembly = buildOtpRuntimeAssembly({
    template: { metadataJson: { otp_runtime_assembly_version: 'otp_runtime_assembly_v1' } },
    sections,
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage,
  })
  assert.deepEqual(assembly.duplicatePackKeys, ['cash_sale_pack'])
  assert.deepEqual(assembly.unexpectedPackKeys, ['bond_finance_pack'])
  assert.equal(assembly.canAssemble, false)
})

test('blocks selected wording that is not attorney-approved and locked', () => {
  const assembly = buildOtpRuntimeAssembly({
    template: { metadataJson: { otp_runtime_assembly_version: 'otp_runtime_assembly_v1' } },
    sections: baseSections,
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage: { items: [{ key: 'cash_sale_pack', covered: false }] },
  })
  assert.deepEqual(assembly.unapprovedPackKeys, ['cash_sale_pack'])
  assert.equal(assembly.canAssemble, false)
})

test('keeps pre-Phase 4 templates observable without silently adopting enforcement', () => {
  const assembly = buildOtpRuntimeAssembly({
    template: {},
    sections: baseSections.filter((section) => section.sectionKey !== 'cash_sale_pack'),
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage,
  })
  assert.equal(assembly.runtimeEnforced, false)
  assert.equal(assembly.rolloutCompatible, true)
  assert.equal(assembly.canAssemble, false)
})

test('fails closed for an unknown runtime contract version', () => {
  const assembly = buildOtpRuntimeAssembly({
    template: { metadataJson: { otp_runtime_assembly_version: 'otp_runtime_assembly_v999' } },
    sections: baseSections,
    placeholders: { legal_active_clause_packs: 'cash_sale_pack' },
    resolution,
    coverage,
  })
  assert.equal(assembly.runtimeEnforced, true)
  assert.equal(assembly.canAssemble, false)
  assert.ok(assembly.blockers.some((item) => item.code === 'unsupported_runtime_contract'))
})
