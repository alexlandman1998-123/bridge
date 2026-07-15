import assert from 'node:assert/strict'
import {
  BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
  BOND_OPERATIONAL_DOCUMENT_STATUS,
  buildApprovedBondOperationalTemplate,
  buildBondAttorneyPhase4BaselineReport,
  generateBondOperationalDocument,
  generateBondOperationalDocumentPack,
  listBondOperationalDocumentKeys,
  validateBondOperationalTemplate,
} from '../bondAttorneyModulePhase4.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-bank-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'bond_attorney', userId: 'bond-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const completeEvidence = {
  bank_name: verified('Nedbank'),
  bank_reference: verified('NB-2026-001'),
  approved_bond_amount: verified(1850000),
  mortgagor_identity_and_capacity: verified({ name: 'Alex Buyer', capacity: 'individual mortgagor' }),
  mortgagee_identity: verified({ name: 'Nedbank Limited', registrationNumber: '1951/000009/06' }),
  property_legal_description: verified('Erf 1234 Cape Town, City of Cape Town'),
  title_deed_or_deeds_office_reference: verified('T12345/2021'),
  buyer_marital_or_entity_authority: verified({ status: 'unmarried', authority: 'self' }),
  bank_conditions: verified([{ key: 'insurance', owner: 'buyer', status: 'satisfied' }]),
  guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-09-30' }]),
  signing_method_and_signed_pack_status: verified({ method: 'wet_ink', status: 'signed_originals_received' }),
  bank_submission_reference: verified('BANK-SUB-77'),
  approval_to_lodge_reference: verified('ATL-2026-22'),
  lodgement_reference: verified('LODGE-2026-101'),
  registration_date: verified('2026-08-02'),
}

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['renderModel', 'sections', 'body', 'facts', 'value'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

const operationalKeys = listBondOperationalDocumentKeys()
assert.deepEqual(operationalKeys, [
  'instruction_acknowledgement',
  'buyer_fica_request_pack',
  'bank_condition_schedule',
  'bond_signing_appointment_pack',
  'guarantee_request_cover',
  'lodgement_readiness_cover',
  'registration_notification',
  'bank_closeout_report',
])
assert.equal(BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed, false)
assert.equal(BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.signingAllowed, false)
assert.equal(BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.bankSubmissionAllowed, false)

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase4' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(workspace.canonicalData.readyForDrafting, true)

const approvedTemplate = buildApprovedBondOperationalTemplate('instruction_acknowledgement', {
  approvedBy: { role: 'firm_manager', userId: 'manager-1' },
})
const templateValidation = validateBondOperationalTemplate(approvedTemplate, 'instruction_acknowledgement')
assert.equal(templateValidation.valid, true, JSON.stringify(templateValidation.errors, null, 2))

const generated = generateBondOperationalDocument({
  workspace,
  documentKey: 'instruction_acknowledgement',
  template: approvedTemplate,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase4-command-1',
  generatedAt: '2026-07-15T09:00:00.000Z',
  firmBranding: { firmName: 'Pilot Bond Attorneys', email: 'bonds@example.test', phone: '+27110000000' },
})
assert.equal(generated.ok, true, JSON.stringify(generated.errors, null, 2))
assert.equal(generated.document.status, BOND_OPERATIONAL_DOCUMENT_STATUS.draftGenerated)
assert.equal(generated.document.reviewRequired, true)
assert.equal(generated.document.finalAllowed, false)
assert.equal(generated.document.signingAllowed, false)
assert.equal(generated.document.dispatchAllowed, false)
assert.equal(generated.document.bankSubmissionAllowed, false)
assert.equal(generated.document.watermark, 'DRAFT - ATTORNEY REVIEW REQUIRED')
assert.equal(generated.document.template.locked, true)
assert.equal(generated.document.dataFingerprint, workspace.dataFingerprint)
assert.equal(generated.document.version.dataFingerprint, workspace.dataFingerprint)
assert.equal(generated.document.artifactLink.workspaceId, workspace.workspaceId)
assert.equal(generated.document.artifactLink.documentKey, 'instruction_acknowledgement')
assert.equal(generated.document.renderModel.header.firmName, 'Pilot Bond Attorneys')
assert.match(generated.document.renderModel.sections[0].body, /Nedbank/)
assert.match(generated.document.renderModel.sections[0].body, /NB-2026-001/)
assert.equal(generated.auditEvent.eventType, 'bond_operational_document_generated')
assert.equal(containsForbiddenAuditPayload(generated.auditEvent), false)

const unapprovedTemplate = buildApprovedBondOperationalTemplate('instruction_acknowledgement', {
  status: 'draft',
  locked: false,
})
const blockedTemplate = generateBondOperationalDocument({
  workspace,
  documentKey: 'instruction_acknowledgement',
  template: unapprovedTemplate,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase4-command-2',
})
assert.equal(blockedTemplate.ok, false)
assert.equal(blockedTemplate.code, 'bond_operational_template_invalid')
assert.ok(blockedTemplate.errors.includes('template_not_approved'))
assert.ok(blockedTemplate.errors.includes('template_wording_not_locked'))

const missingWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase4' },
  evidence: { bank_name: verified('Nedbank') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const blockedMissingFacts = generateBondOperationalDocument({
  workspace: missingWorkspace,
  documentKey: 'instruction_acknowledgement',
  template: approvedTemplate,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase4-command-3',
})
assert.equal(blockedMissingFacts.ok, false)
assert.equal(blockedMissingFacts.code, 'canonical_bond_data_not_ready')

const blockedLegalInstrument = generateBondOperationalDocument({
  workspace,
  documentKey: 'mortgage_bond_draft',
  template: approvedTemplate,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase4-command-4',
})
assert.equal(blockedLegalInstrument.ok, false)
assert.equal(blockedLegalInstrument.code, 'unsupported_bond_operational_document')

const blockedIngestOnly = generateBondOperationalDocument({
  workspace,
  documentKey: 'bond_instruction',
  template: approvedTemplate,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase4-command-5',
})
assert.equal(blockedIngestOnly.ok, false)
assert.equal(blockedIngestOnly.code, 'unsupported_bond_operational_document')

const blockedActor = generateBondOperationalDocument({
  workspace,
  documentKey: 'instruction_acknowledgement',
  template: approvedTemplate,
  actor: { role: 'buyer', userId: 'buyer-1' },
  commandId: 'phase4-command-6',
})
assert.equal(blockedActor.ok, false)
assert.equal(blockedActor.code, 'bond_operational_actor_not_authorised')

const templates = operationalKeys.reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedBondOperationalTemplate(documentKey, {
    approvedBy: { role: 'firm_manager', userId: 'manager-1' },
  }),
}), {})
const pack = generateBondOperationalDocumentPack({
  workspace,
  templates,
  actor: { role: 'secretary', userId: 'secretary-1' },
  commandIdPrefix: 'phase4-pack',
  generatedAt: '2026-07-15T09:30:00.000Z',
  firmBranding: { firmName: 'Pilot Bond Attorneys' },
})
assert.equal(pack.documentCount, 8)
assert.equal(pack.generatedCount, 8)
assert.equal(pack.failedCount, 0)
assert.ok(pack.results.every((result) => result.ok && result.document.reviewRequired && !result.document.finalAllowed))

const report = buildBondAttorneyPhase4BaselineReport({
  transaction: { id: 'tx-bond-phase4' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  firmBranding: { firmName: 'Pilot Bond Attorneys' },
})
assert.equal(report.readyForPhase5, true, JSON.stringify(report, null, 2))
assert.equal(report.operationalDocumentCount, 8)
assert.equal(report.generatedCount, 8)
assert.equal(report.blockedNonOperational.length, 8)

console.log(`Bond attorney module Phase 4 operational generator passed (${report.generatedCount} draft documents).`)
