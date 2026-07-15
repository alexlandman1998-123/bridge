import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerTemplateGovernanceFingerprint } from '../../../core/documents/legalTemplateGovernance.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import { buildConveyancerCorrespondenceClauseContentHash } from '../conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION,
  CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION,
  buildConveyancerOperationalDocumentAssetContentHash,
  generateConveyancerOperationalDocument,
} from '../conveyancerOperationalDocumentGenerator.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const attorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-c4' }
const author = { role: MATTER_PLAN_OWNER_ROLES.secretary, userId: 'author-c4' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-c4' }
const CLAUSE_TEXT = 'We are instructed to proceed with transfer of {{property_description}}.'
const CLAUSE_HASH = buildConveyancerCorrespondenceClauseContentHash(CLAUSE_TEXT)
let sequence = 0

function activePlan() {
  const generated = generateConveyancerMatterPlan({
    transaction: {
      id: 'tx-c4-1',
      organisation_id: 'org-c4-1',
      finance_type: 'cash',
      transaction_type: 'private_sale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      seller_has_existing_bond: false,
      property_tenure: 'freehold',
    },
    generatedAt: '2026-07-15T08:00:00.000Z',
  })
  assert.equal(generated.valid, true)
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-15T08:05:00.000Z' }
}

function baseAsset(overrides = {}) {
  const base = {
    assetVersion: CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION,
    templateVersionId: 'template-transfer-instruction-v1',
    outputFormat: 'pdf',
    titleTemplate: 'Transfer instruction · {{matter_reference}}',
    fileNameTemplate: 'Transfer instruction - {{seller_name}}',
    sections: [
      {
        sectionKey: 'matter_details',
        titleTemplate: 'Matter details',
        bodyTemplate: 'Seller: {{seller_name}}\nIdentity: {{seller_id}}\nProperty: {{property_description}}\nDate: {{instruction_date}}',
        required: true,
      },
      {
        sectionKey: 'instruction',
        titleTemplate: 'Instruction',
        bodyTemplate: '{{instruction_terms}}\n{{instruction_note}}\nPrepared by {{organisation_name}}.',
        required: true,
        pageBreakBefore: true,
        keepTogether: true,
      },
      {
        sectionKey: 'execution',
        titleTemplate: 'Execution',
        bodyTemplate: 'Authorised signatory: {{signatory_name}}',
        required: true,
      },
    ],
    signingFields: [
      { fieldKey: 'conveyancer_signature', fieldType: 'signature', signerRole: 'transfer_attorney', sectionKey: 'execution', variableKey: 'signatory_name', required: true, order: 1 },
      { fieldKey: 'signature_date', fieldType: 'signed_date', signerRole: 'transfer_attorney', sectionKey: 'execution', required: true, order: 2 },
    ],
    ...overrides,
  }
  return { ...base, contentHash: overrides.contentHash || buildConveyancerOperationalDocumentAssetContentHash(base) }
}

function governedTemplate(overrides = {}) {
  const variables = overrides.variables || [
    { key: 'seller_name', label: 'Seller name', type: 'text', coverage: 'mapped', sourcePaths: ['parties.seller.name'], required: true, validationRules: [{ type: 'min_length', value: 2 }] },
    { key: 'seller_id', label: 'Seller identity number', type: 'text', coverage: 'mapped', sourcePaths: ['parties.seller.idNumber'], required: true, sensitive: true, validationRules: [{ type: 'south_african_id' }, { type: 'source_verification_required' }] },
    { key: 'property_description', label: 'Property description', type: 'text', coverage: 'mapped', sourcePaths: ['property.legalDescription'], required: true },
    { key: 'matter_reference', label: 'Matter reference', type: 'text', coverage: 'calculated', sourcePaths: ['plan.planId'], required: true },
    { key: 'instruction_date', label: 'Instruction date', type: 'date', coverage: 'calculated', sourcePaths: ['generated.date'], required: true, validationRules: [{ type: 'date_not_future' }] },
    { key: 'instruction_note', label: 'Instruction note', type: 'text', coverage: 'manual', sourcePaths: [], manualEntryAllowed: true, required: true, validationRules: [{ type: 'max_length', value: 80, severity: 'warning' }] },
    { key: 'instruction_terms', label: 'Approved instruction terms', type: 'text', coverage: 'approved_clause', sourcePaths: [], clauseKey: 'transfer_instruction_terms', required: true },
    { key: 'organisation_name', label: 'Firm name', type: 'text', coverage: 'agency_setting', sourcePaths: ['organisation.legalName'], required: true },
    { key: 'signatory_name', label: 'Signatory name', type: 'text', coverage: 'signing_preset', sourcePaths: ['signing.signatoryName'], required: true },
  ]
  const asset = baseAsset()
  const base = {
    contractVersion: 'conveyancer_template_governance_v1',
    governanceVersion: 1,
    templateId: 'template-transfer-instruction',
    templateVersionId: 'template-transfer-instruction-v1',
    organisationId: 'org-c4-1',
    moduleType: 'attorney',
    packetType: 'operational_documents',
    templateKey: 'transfer_instruction',
    templateLabel: 'Transfer instruction',
    documentKind: 'instruction',
    documentModel: 'single_master_document',
    templateFormat: 'structured',
    lane: 'transfer',
    status: 'published',
    versionNumber: 1,
    versionTag: 'v1',
    jurisdictionCode: 'ZA',
    languageCode: 'en-ZA',
    applicability: { transactionTypes: ['private_sale'], propertyTenures: ['freehold'] },
    content: {
      contentHash: asset.contentHash,
      storageBucket: 'legal-templates',
      storagePath: 'org-c4-1/transfer-instruction-v1.json',
      fileName: 'transfer-instruction-v1.json',
      sectionCount: asset.sections.length,
      placeholderKeys: variables.map((item) => item.key),
    },
    clauses: [{ key: 'transfer_instruction_terms', version: 1, required: true, contentHash: CLAUSE_HASH, approvedAt: '2026-07-01T08:00:00.000Z', approvedBy: attorney }],
    change: { type: 'initial', summary: 'Initial governed transfer instruction.' },
    authoredBy: author,
    createdAt: '2026-07-01T07:00:00.000Z',
    publication: { publishedAt: '2026-07-03T08:00:00.000Z', publishedBy: manager, effectiveFrom: '2026-07-04T00:00:00.000Z', effectiveUntil: null },
    ...overrides,
    variables,
  }
  const suppliedApproval = overrides.approval || {}
  return {
    ...base,
    approval: {
      approvedAt: '2026-07-02T08:00:00.000Z',
      approvedBy: attorney,
      ...suppliedApproval,
      templateFingerprint: suppliedApproval.templateFingerprint || buildConveyancerTemplateGovernanceFingerprint(base),
    },
  }
}

function clause(overrides = {}) {
  return {
    key: 'transfer_instruction_terms',
    version: 1,
    contentHash: CLAUSE_HASH,
    legalText: CLAUSE_TEXT,
    approvedAt: '2026-07-01T08:00:00.000Z',
    approvedBy: attorney,
    ...overrides,
  }
}

function sourceData(overrides = {}) {
  return {
    parties: { seller: { name: 'Sam Seller', idNumber: '8001015009087' } },
    property: { legalDescription: 'Erf 123 Cape Town' },
    ...overrides,
  }
}

function generationInput(overrides = {}) {
  sequence += 1
  const plan = overrides.plan || activePlan()
  return {
    plan,
    templates: [governedTemplate()],
    assets: [baseAsset()],
    documentKey: 'transfer_instruction',
    documentKind: 'instruction',
    actionKey: 'draft_transfer_documents',
    lane: 'transfer',
    actor: attorney,
    data: sourceData(),
    organisationSettings: { legalName: 'Example Attorneys Inc.' },
    signingPreset: { signatoryName: 'Alex Attorney' },
    manualValues: { instruction_note: 'Please open the matter and complete the initial checks.' },
    clauses: [clause()],
    sourceEvidence: { seller_id: { verifiedAt: '2026-07-10T10:00:00.000Z', verifiedBy: attorney, expiresAt: '2026-08-10T10:00:00.000Z' } },
    generatedAt: '2026-07-15T10:00:00.000Z',
    commandId: `cmd-c4-${sequence}`,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
    ...overrides,
  }
}

test('assembles a governed renderer-ready operational document', () => {
  const result = generateConveyancerOperationalDocument(generationInput())
  assert.equal(result.ok, true, result.code)
  assert.equal(result.document.version, CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION)
  assert.equal(result.document.status, 'draft')
  assert.equal(result.document.renderReady, true)
  assert.equal(result.document.persistAllowed, false)
  assert.equal(result.document.signingAllowed, false)
  assert.equal(result.document.dispatchAllowed, false)
  assert.equal(result.document.renderModel.sections.length, 3)
  assert.equal(result.document.renderModel.signingFields.length, 2)
  assert.match(result.document.renderModel.sections[1].body, /Erf 123 Cape Town/)
  assert.equal(result.document.dataValidation.outcome, 'passed')
  assert.equal(result.event.renderingPerformed, false)
  assert.equal(Object.isFrozen(result.document), true)
})

test('supports every governed operational document kind and rejects non-operational kinds', () => {
  for (const documentKind of ['instruction', 'application', 'declaration', 'consent', 'resolution', 'certificate', 'checklist', 'annexure']) {
    const template = governedTemplate({ documentKind })
    const result = generateConveyancerOperationalDocument(generationInput({ documentKind, templates: [template] }))
    assert.equal(result.ok, true, `${documentKind}:${result.code}`)
  }
  assert.equal(generateConveyancerOperationalDocument(generationInput({ documentKind: 'agreement' })).code, 'unsupported_operational_document_kind')
  assert.equal(generateConveyancerOperationalDocument(generationInput({ documentKind: 'correspondence' })).code, 'unsupported_operational_document_kind')
})

test('blocks generation when governed data rules fail', () => {
  const result = generateConveyancerOperationalDocument(generationInput({
    data: sourceData({ parties: { seller: { name: 'S', idNumber: '123' } } }),
  }))
  assert.equal(result.code, 'operational_document_data_blocked')
  assert.equal(result.document, null)
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.errors.includes('invalid_south_african_id'))
})

test('allows warning-only data through while retaining mandatory review', () => {
  const result = generateConveyancerOperationalDocument(generationInput({ manualValues: { instruction_note: 'A'.repeat(81) } }))
  assert.equal(result.ok, true, result.code)
  assert.equal(result.document.dataValidation.outcome, 'warning')
  assert.equal(result.document.reviewRequired, true)
  assert.equal(result.document.dataValidation.warningCount, 1)
})

test('verifies the exact governed structured asset and placeholder registry', () => {
  const stale = generateConveyancerOperationalDocument(generationInput({ assets: [baseAsset({ contentHash: 'e'.repeat(64) })] }))
  assert.equal(stale.code, 'operational_document_asset_invalid')
  assert.ok(stale.errors.includes('operational_asset_content_hash_invalid'))

  const rogue = baseAsset({ sections: [...baseAsset().sections, { sectionKey: 'rogue', bodyTemplate: '{{unknown_value}}' }] })
  const unknown = generateConveyancerOperationalDocument(generationInput({ assets: [rogue] }))
  assert.ok(unknown.errors.includes('undeclared_operational_placeholder:unknown_value'))
})

test('rejects unsafe signing-field definitions', () => {
  const invalidType = baseAsset({ signingFields: [{ fieldKey: 'execute', fieldType: 'script', signerRole: 'transfer_attorney', sectionKey: 'execution' }] })
  assert.ok(generateConveyancerOperationalDocument(generationInput({ assets: [invalidType] })).errors.includes('invalid_operational_signing_field_type:execute'))

  const unknownSection = baseAsset({ signingFields: [{ fieldKey: 'execute', fieldType: 'signature', signerRole: 'transfer_attorney', sectionKey: 'missing' }] })
  assert.ok(generateConveyancerOperationalDocument(generationInput({ assets: [unknownSection] })).errors.includes('operational_signing_field_section_unknown:execute'))
})

test('accepts only the exact approved operational clause', () => {
  const missing = generateConveyancerOperationalDocument(generationInput({ clauses: [] }))
  assert.ok(missing.errors.includes('approved_clause_missing:transfer_instruction_terms:v1'))
  const changed = generateConveyancerOperationalDocument(generationInput({ clauses: [clause({ contentHash: 'f'.repeat(64) })] }))
  assert.ok(changed.errors.includes('approved_clause_hash_mismatch:transfer_instruction_terms:v1'))
})

test('enforces template selection, tenant scope and equal-priority conflicts', () => {
  const global = governedTemplate({ templateVersionId: 'global-transfer-instruction-v1', organisationId: null, isDefault: true })
  const selected = generateConveyancerOperationalDocument(generationInput({
    templates: [global, governedTemplate()],
    assets: [baseAsset({ templateVersionId: 'global-transfer-instruction-v1' }), baseAsset()],
  }))
  assert.equal(selected.document.template.templateVersionId, 'template-transfer-instruction-v1')
  const conflict = governedTemplate({ templateVersionId: 'template-transfer-instruction-v1-copy' })
  const blocked = generateConveyancerOperationalDocument(generationInput({
    templates: [governedTemplate(), conflict],
    assets: [baseAsset(), baseAsset({ templateVersionId: 'template-transfer-instruction-v1-copy' })],
  }))
  assert.equal(blocked.code, 'operational_document_template_selection_conflict')
})

test('enforces legal-lane authority and active-plan concurrency', () => {
  const denied = generateConveyancerOperationalDocument(generationInput({ actor: { role: MATTER_PLAN_OWNER_ROLES.bondAttorney, userId: 'bond-c4' } }))
  assert.equal(denied.code, 'operational_document_lane_not_authorised')
  assert.equal(generateConveyancerOperationalDocument(generationInput({ expectedPlanVersion: 99 })).code, 'stale_plan_version')
})

test('binds every operational draft to an existing non-terminal matter action', () => {
  assert.equal(generateConveyancerOperationalDocument(generationInput({ actionKey: '' })).code, 'operational_document_action_key_required')
  assert.equal(generateConveyancerOperationalDocument(generationInput({ actionKey: 'missing_action' })).code, 'operational_document_action_unknown')
  const plan = activePlan()
  const action = plan.actions.find((item) => item.key === 'draft_transfer_documents')
  action.state = 'cancelled'
  action.stateReason = 'No longer required.'
  const terminal = generateConveyancerOperationalDocument(generationInput({ plan, expectedPlanId: plan.planId, expectedPlanVersion: plan.version }))
  assert.equal(terminal.code, 'operational_document_action_terminal')
})

test('supports secure idempotent replay and rejects command reuse', () => {
  const input = generationInput()
  const first = generateConveyancerOperationalDocument(input)
  const replay = generateConveyancerOperationalDocument({ ...input, generatedAt: 'invalid', existingDocuments: [{ ...first.document, document: first.document, validation: first.validation, event: first.event }] })
  assert.equal(replay.duplicate, true)
  assert.equal(replay.code, 'idempotent_replay')
  const conflict = generateConveyancerOperationalDocument({ ...input, documentKind: 'application', existingDocuments: [{ ...first.document, document: first.document }] })
  assert.equal(conflict.code, 'command_id_operational_document_conflict')
})

test('sanitises output names and produces no rendered or persisted artifact', () => {
  const unsafe = baseAsset({ fileNameTemplate: '../Transfer: {{seller_name}}' })
  const template = governedTemplate({ content: { ...governedTemplate().content, contentHash: unsafe.contentHash } })
  const result = generateConveyancerOperationalDocument(generationInput({ templates: [template], assets: [unsafe] }))
  assert.equal(result.ok, true, result.code)
  assert.equal(result.document.renderModel.fileName.includes('/'), false)
  assert.equal('fileUrl' in result.document, false)
  assert.equal(result.event.persistencePerformed, false)
  assert.equal(result.event.renderingPerformed, false)
})

test('keeps sensitive values out of audit metadata', () => {
  const result = generateConveyancerOperationalDocument(generationInput())
  assert.equal(JSON.stringify(result.event).includes('8001015009087'), false)
  assert.deepEqual(result.event.sensitiveVariableKeys, ['seller_id'])
})

test('never mutates operational-document inputs', () => {
  const input = generationInput()
  const before = structuredClone(input)
  const result = generateConveyancerOperationalDocument(input)
  assert.equal(result.ok, true, result.code)
  assert.deepEqual(input, before)
})

console.log('conveyancer operational documents C4 tests passed')
