import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerTemplateGovernanceFingerprint } from '../../../core/documents/legalTemplateGovernance.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION,
  buildConveyancerCorrespondenceAssetContentHash,
  buildConveyancerCorrespondenceClauseContentHash,
  generateConveyancerCorrespondence,
} from '../conveyancerCorrespondenceGenerator.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const SUBJECT_TEMPLATE = 'Documents required · {{matter_reference}} · {{recipient_reference}}'
const BODY_TEMPLATE = [
  'Dear {{recipient_name}},',
  '',
  '{{approved_terms}}',
  '',
  '{{request_note}}',
  'Amount due: {{amount_due}}',
  'Date: {{generated_date}}',
  '',
  'Regards,',
  '{{organisation_name}}',
].join('\n')
const CLAUSE_TEXT = 'Please provide the outstanding documents for matter {{matter_reference}}.'
const CONTENT_HASH = buildConveyancerCorrespondenceAssetContentHash({ channel: 'email', format: 'plain_text', subjectTemplate: SUBJECT_TEMPLATE, bodyTemplate: BODY_TEMPLATE })
const CLAUSE_HASH = buildConveyancerCorrespondenceClauseContentHash(CLAUSE_TEXT)
const author = { role: MATTER_PLAN_OWNER_ROLES.secretary, userId: 'author-1' }
const attorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }
let commandSequence = 0

function transaction(overrides = {}) {
  return {
    id: 'tx-c2-1',
    organisation_id: 'org-c2-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan(source = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: source, generatedAt: '2026-07-15T08:00:00.000Z' })
  assert.equal(generated.valid, true)
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-15T08:05:00.000Z' }
}

function governedTemplate(overrides = {}) {
  const variables = [
    { key: 'recipient_name', label: 'Recipient name', type: 'text', coverage: 'mapped', sourcePaths: ['parties.recipient.name'], required: true },
    { key: 'matter_reference', label: 'Matter reference', type: 'text', coverage: 'calculated', sourcePaths: ['plan.planId'], required: true },
    { key: 'organisation_name', label: 'Organisation name', type: 'text', coverage: 'agency_setting', sourcePaths: ['organisation.legalName'], required: true },
    { key: 'request_note', label: 'Request note', type: 'text', coverage: 'manual', sourcePaths: [], manualEntryAllowed: true, required: true },
    { key: 'approved_terms', label: 'Approved terms', type: 'text', coverage: 'approved_clause', sourcePaths: [], clauseKey: 'document_request_terms', required: true },
    { key: 'recipient_reference', label: 'Recipient reference', type: 'text', coverage: 'mapped', sourcePaths: ['parties.recipient.reference'], required: true, sensitive: true },
    { key: 'amount_due', label: 'Amount due', type: 'money', coverage: 'mapped', sourcePaths: ['financial.amountDue'], required: true },
    { key: 'generated_date', label: 'Generated date', type: 'date', coverage: 'calculated', sourcePaths: ['generated.date'], required: true },
  ]
  const placeholderKeys = variables.map((item) => item.key)
  const base = {
    contractVersion: 'conveyancer_template_governance_v1',
    governanceVersion: 1,
    templateId: 'template-document-request',
    templateVersionId: 'template-document-request-v1',
    organisationId: 'org-c2-1',
    moduleType: 'attorney',
    packetType: 'correspondence',
    templateKey: 'outstanding_document_request',
    templateLabel: 'Outstanding document request',
    documentKind: 'correspondence',
    documentModel: 'single_master_document',
    templateFormat: 'json',
    lane: 'transfer',
    status: 'published',
    versionNumber: 1,
    versionTag: 'v1',
    jurisdictionCode: 'ZA',
    languageCode: 'en-ZA',
    applicability: { transactionTypes: ['private_sale'], propertyTenures: ['freehold'] },
    content: {
      contentHash: CONTENT_HASH,
      storageBucket: 'legal-templates',
      storagePath: 'org-c2-1/outstanding-document-request-v1.json',
      fileName: 'outstanding-document-request-v1.json',
      sectionCount: 0,
      placeholderKeys,
    },
    variables,
    clauses: [{
      key: 'document_request_terms',
      version: 1,
      required: true,
      contentHash: CLAUSE_HASH,
      approvedAt: '2026-07-01T08:00:00.000Z',
      approvedBy: attorney,
    }],
    change: { type: 'initial', summary: 'Initial correspondence template.' },
    authoredBy: author,
    createdAt: '2026-07-01T07:00:00.000Z',
    publication: {
      publishedAt: '2026-07-03T08:00:00.000Z',
      publishedBy: manager,
      effectiveFrom: '2026-07-04T00:00:00.000Z',
      effectiveUntil: null,
    },
    ...overrides,
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

function asset(overrides = {}) {
  const base = {
    templateVersionId: 'template-document-request-v1',
    channel: 'email',
    format: 'plain_text',
    subjectTemplate: SUBJECT_TEMPLATE,
    bodyTemplate: BODY_TEMPLATE,
    ...overrides,
  }
  return { ...base, contentHash: overrides.contentHash || buildConveyancerCorrespondenceAssetContentHash(base) }
}

function approvedClause(overrides = {}) {
  const legalText = overrides.legalText || CLAUSE_TEXT
  return {
    key: 'document_request_terms',
    version: 1,
    contentHash: overrides.contentHash || buildConveyancerCorrespondenceClauseContentHash(legalText),
    legalText,
    approvedAt: '2026-07-01T08:00:00.000Z',
    approvedBy: attorney,
    ...overrides,
  }
}

function generationInput(overrides = {}) {
  commandSequence += 1
  const plan = overrides.plan || activePlan()
  return {
    plan,
    templates: [governedTemplate()],
    assets: [asset()],
    correspondenceKey: 'outstanding_document_request',
    lane: 'transfer',
    actor: attorney,
    recipients: [{ role: 'seller', name: 'Sam Seller', email: 'seller@example.com', delivery: 'to' }],
    data: {
      parties: { recipient: { name: 'Sam Seller', reference: '7801015009088' } },
      financial: { amountDue: 12500.5 },
    },
    organisationSettings: { legalName: 'Example Attorneys Inc.' },
    manualValues: { request_note: 'Please send the certified copies by Friday.' },
    clauses: [approvedClause()],
    generatedAt: '2026-07-15T09:00:00.000Z',
    commandId: `cmd-c2-${commandSequence}`,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
    ...overrides,
  }
}

test('generates a governed correspondence draft with complete provenance', () => {
  const result = generateConveyancerCorrespondence(generationInput())
  assert.equal(result.ok, true, result.code)
  assert.equal(result.duplicate, false)
  assert.equal(result.correspondence.version, CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION)
  assert.equal(result.correspondence.status, 'draft')
  assert.equal(result.correspondence.dispatchAllowed, false)
  assert.match(result.correspondence.subject, /matter_plan_tx_c2_1/)
  assert.match(result.correspondence.body, /Please provide the outstanding documents/)
  assert.match(result.correspondence.body, /R 12 500\.50/)
  assert.equal(result.correspondence.template.templateVersionId, 'template-document-request-v1')
  assert.equal(result.correspondence.clauseManifest[0].key, 'document_request_terms')
  assert.equal(result.event.dispatchPerformed, false)
  assert.deepEqual(result.event.sensitiveVariableKeys, ['recipient_reference'])
  assert.equal(Object.isFrozen(result.correspondence), true)
  assert.equal(Object.isFrozen(result.event), true)
})

test('uses the standard SHA-256 digest for governed content', () => {
  assert.equal(
    buildConveyancerCorrespondenceClauseContentHash('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

test('fails closed when a required mapped or manual value is missing', () => {
  const input = generationInput({ manualValues: {} })
  delete input.data.parties.recipient.name
  const result = generateConveyancerCorrespondence(input)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'correspondence_values_incomplete')
  assert.ok(result.errors.includes('required_correspondence_value_missing:recipient_name'))
  assert.ok(result.errors.includes('required_correspondence_value_missing:request_note'))
  assert.equal(result.correspondence, null)
})

test('verifies the artifact hash and exact governed placeholder set', () => {
  const stale = generateConveyancerCorrespondence(generationInput({ assets: [asset({ contentHash: 'e'.repeat(64) })] }))
  assert.equal(stale.code, 'correspondence_template_asset_invalid')
  assert.ok(stale.errors.includes('correspondence_asset_hash_mismatch'))

  const undeclared = generateConveyancerCorrespondence(generationInput({
    assets: [asset({ bodyTemplate: `${asset().bodyTemplate}\n{{rogue_field}}` })],
  }))
  assert.ok(undeclared.errors.includes('undeclared_correspondence_placeholder:rogue_field'))
})

test('accepts only the exact approved clause version and hash', () => {
  const missing = generateConveyancerCorrespondence(generationInput({ clauses: [] }))
  assert.ok(missing.errors.includes('approved_clause_missing:document_request_terms:v1'))

  const stale = generateConveyancerCorrespondence(generationInput({ clauses: [approvedClause({ contentHash: 'f'.repeat(64) })] }))
  assert.ok(stale.errors.includes('approved_clause_hash_mismatch:document_request_terms:v1'))

  const unapproved = generateConveyancerCorrespondence(generationInput({ clauses: [approvedClause({ approvedAt: null })] }))
  assert.ok(unapproved.errors.includes('approved_clause_authority_invalid:document_request_terms:v1'))
})

test('rejects unknown placeholders inside approved clause wording', () => {
  const legalText = 'Supply {{unmapped_legal_value}}.'
  const contentHash = buildConveyancerCorrespondenceClauseContentHash(legalText)
  const result = generateConveyancerCorrespondence(generationInput({
    templates: [governedTemplate({ clauses: [{ ...governedTemplate().clauses[0], contentHash }] })],
    clauses: [approvedClause({ legalText, contentHash })],
  }))
  assert.equal(result.code, 'correspondence_values_incomplete')
  assert.ok(result.errors.includes('unmapped_clause_placeholder:document_request_terms:unmapped_legal_value'))
})

test('enforces legal-lane generation authority', () => {
  const bondAttorney = { role: MATTER_PLAN_OWNER_ROLES.bondAttorney, userId: 'bond-1' }
  const denied = generateConveyancerCorrespondence(generationInput({ actor: bondAttorney }))
  assert.equal(denied.code, 'correspondence_lane_not_authorised')

  const secretary = { role: MATTER_PLAN_OWNER_ROLES.secretary, userId: 'secretary-1' }
  const allowed = generateConveyancerCorrespondence(generationInput({ actor: secretary }))
  assert.equal(allowed.ok, true, allowed.code)
})

test('selects an organisation template ahead of a global fallback', () => {
  const global = governedTemplate({ templateVersionId: 'global-correspondence-v1', organisationId: null, isDefault: true })
  const input = generationInput({
    templates: [global, governedTemplate()],
    assets: [asset({ templateVersionId: 'global-correspondence-v1' }), asset()],
  })
  const result = generateConveyancerCorrespondence(input)
  assert.equal(result.ok, true, result.code)
  assert.equal(result.correspondence.template.templateVersionId, 'template-document-request-v1')
  assert.equal(result.correspondence.template.selectionReason, 'organisation_template_selected')
})

test('stops generation when equally governed templates conflict', () => {
  const duplicate = governedTemplate({ templateVersionId: 'template-document-request-v1-copy' })
  const result = generateConveyancerCorrespondence(generationInput({
    templates: [governedTemplate(), duplicate],
    assets: [asset(), asset({ templateVersionId: 'template-document-request-v1-copy' })],
  }))
  assert.equal(result.code, 'correspondence_template_selection_conflict')
})

test('does not select draft, future, expired or cross-tenant templates', () => {
  const draft = governedTemplate({ status: 'draft', approval: {}, publication: {} })
  const future = governedTemplate({ publication: { ...governedTemplate().publication, effectiveFrom: '2027-01-01T00:00:00.000Z' } })
  const otherTenant = governedTemplate({ organisationId: 'org-other' })
  for (const candidate of [draft, future, otherTenant]) {
    const result = generateConveyancerCorrespondence(generationInput({ templates: [candidate] }))
    assert.equal(result.code, 'no_selectable_correspondence_template')
  }
})

test('validates email recipients and rejects duplicate delivery', () => {
  const invalid = generateConveyancerCorrespondence(generationInput({ recipients: [{ role: 'seller', email: 'invalid' }] }))
  assert.equal(invalid.code, 'correspondence_recipients_invalid')
  assert.ok(invalid.errors.includes('valid_recipient_email_required'))

  const duplicate = generateConveyancerCorrespondence(generationInput({
    recipients: [
      { role: 'seller', email: 'seller@example.com', delivery: 'to' },
      { role: 'seller', email: 'seller@example.com', delivery: 'cc' },
    ],
  }))
  assert.ok(duplicate.errors.includes('duplicate_correspondence_recipient'))
})

test('supports governed letter output without treating it as sent', () => {
  const result = generateConveyancerCorrespondence(generationInput({
    templates: [governedTemplate({ content: { ...governedTemplate().content, contentHash: buildConveyancerCorrespondenceAssetContentHash({ channel: 'letter', format: 'plain_text', subjectTemplate: SUBJECT_TEMPLATE, bodyTemplate: BODY_TEMPLATE }) } })],
    assets: [asset({ channel: 'letter' })],
    recipients: [{ role: 'seller', name: 'Sam Seller', address: '1 Main Road, Cape Town' }],
  }))
  assert.equal(result.ok, true, result.code)
  assert.equal(result.correspondence.channel, 'letter')
  assert.equal(result.correspondence.dispatchAllowed, false)
})

test('enforces plan identity, active state and secure idempotency', () => {
  const stale = generateConveyancerCorrespondence(generationInput({ expectedPlanVersion: 99 }))
  assert.equal(stale.code, 'stale_plan_version')

  const draftPlan = activePlan()
  draftPlan.status = MATTER_PLAN_STATUSES.draft
  draftPlan.activatedAt = null
  const inactive = generateConveyancerCorrespondence(generationInput({ plan: draftPlan, expectedPlanId: draftPlan.planId, expectedPlanVersion: draftPlan.version }))
  assert.equal(inactive.code, 'active_matter_plan_required')

  const input = generationInput()
  const first = generateConveyancerCorrespondence(input)
  assert.equal(first.ok, true)
  const replay = generateConveyancerCorrespondence({
    ...input,
    generatedAt: 'not-a-date',
    existingGenerations: [{ ...first.correspondence, correspondence: first.correspondence, event: first.event }],
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.code, 'idempotent_replay')
})

test('never mutates generation inputs', () => {
  const input = generationInput()
  const before = structuredClone(input)
  const result = generateConveyancerCorrespondence(input)
  assert.equal(result.ok, true, result.code)
  assert.deepEqual(input, before)
})

console.log('conveyancer correspondence C2 generator tests passed')
