import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  buildConveyancerTemplateGovernanceFingerprint,
  validateConveyancerTemplateVersion,
} from '../../../core/documents/legalTemplateGovernance.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  buildConveyancerCorrespondenceAssetContentHash,
  buildConveyancerCorrespondenceClauseContentHash,
  generateConveyancerCorrespondence,
} from '../conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION,
  validateConveyancerCorrespondenceData,
} from '../conveyancerCorrespondenceDataValidation.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const SUBJECT = 'Documents required · {{matter_reference}} · {{recipient_reference}}'
const BODY = [
  'Dear {{recipient_name}},',
  '{{approved_terms}}',
  '{{request_note}}',
  'Amount due: {{amount_due}}',
  'Date: {{generated_date}}',
  'Regards, {{organisation_name}}',
].join('\n')
const CLAUSE_TEXT = 'Please provide the outstanding documents for matter {{matter_reference}}.'
const CONTENT_HASH = buildConveyancerCorrespondenceAssetContentHash({ channel: 'email', format: 'plain_text', subjectTemplate: SUBJECT, bodyTemplate: BODY })
const CLAUSE_HASH = buildConveyancerCorrespondenceClauseContentHash(CLAUSE_TEXT)
const author = { role: MATTER_PLAN_OWNER_ROLES.secretary, userId: 'author-c3' }
const attorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-c3' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-c3' }
let sequence = 0

function activePlan() {
  const generated = generateConveyancerMatterPlan({
    transaction: {
      id: 'tx-c3-1',
      organisation_id: 'org-c3-1',
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

function governedTemplate(overrides = {}) {
  const variables = overrides.variables || [
    { key: 'recipient_name', label: 'Recipient name', type: 'text', coverage: 'mapped', sourcePaths: ['parties.recipient.name'], required: true, validationRules: [{ type: 'min_length', value: 2 }] },
    { key: 'matter_reference', label: 'Matter reference', type: 'text', coverage: 'calculated', sourcePaths: ['plan.planId'], required: true },
    { key: 'organisation_name', label: 'Organisation name', type: 'text', coverage: 'agency_setting', sourcePaths: ['organisation.legalName'], required: true },
    { key: 'request_note', label: 'Request note', type: 'text', coverage: 'manual', sourcePaths: [], manualEntryAllowed: true, required: true, validationRules: [{ type: 'max_length', value: 100, severity: 'warning' }] },
    { key: 'approved_terms', label: 'Approved terms', type: 'text', coverage: 'approved_clause', sourcePaths: [], clauseKey: 'document_request_terms', required: true },
    {
      key: 'recipient_reference',
      label: 'Recipient reference',
      type: 'text',
      coverage: 'mapped',
      sourcePaths: ['parties.recipient.reference'],
      required: true,
      sensitive: true,
      validationRules: [
        { type: 'south_african_id' },
        { type: 'source_verification_required' },
        { type: 'source_max_age_days', value: 30 },
      ],
    },
    { key: 'amount_due', label: 'Amount due', type: 'money', coverage: 'mapped', sourcePaths: ['financial.amountDue'], required: true, validationRules: [{ type: 'number_min', value: 0 }] },
    { key: 'generated_date', label: 'Generated date', type: 'date', coverage: 'calculated', sourcePaths: ['generated.date'], required: true, validationRules: [{ type: 'date_not_future' }] },
  ]
  const base = {
    contractVersion: 'conveyancer_template_governance_v1',
    governanceVersion: 1,
    templateId: 'template-c3-request',
    templateVersionId: 'template-c3-request-v1',
    organisationId: 'org-c3-1',
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
      storagePath: 'org-c3-1/request-v1.json',
      fileName: 'request-v1.json',
      sectionCount: 0,
      placeholderKeys: variables.map((item) => item.key),
    },
    clauses: [{ key: 'document_request_terms', version: 1, required: true, contentHash: CLAUSE_HASH, approvedAt: '2026-07-01T08:00:00.000Z', approvedBy: attorney }],
    change: { type: 'initial', summary: 'Initial data-validated correspondence.' },
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

function asset() {
  return { templateVersionId: 'template-c3-request-v1', channel: 'email', format: 'plain_text', subjectTemplate: SUBJECT, bodyTemplate: BODY, contentHash: CONTENT_HASH }
}

function clause() {
  return { key: 'document_request_terms', version: 1, contentHash: CLAUSE_HASH, legalText: CLAUSE_TEXT, approvedAt: '2026-07-01T08:00:00.000Z', approvedBy: attorney }
}

function sourceData(overrides = {}) {
  return {
    parties: { recipient: { name: 'Sam Seller', reference: '8001015009087' } },
    financial: { amountDue: 12500.5 },
    ...overrides,
  }
}

function evidence(overrides = {}) {
  return {
    recipient_reference: {
      sourceId: 'fica-record-1',
      capturedAt: '2026-07-10T09:00:00.000Z',
      verifiedAt: '2026-07-10T10:00:00.000Z',
      verifiedBy: attorney,
      expiresAt: '2026-08-10T10:00:00.000Z',
      ...overrides,
    },
  }
}

function scenario(overrides = {}) {
  sequence += 1
  const plan = overrides.plan || activePlan()
  const template = overrides.template || governedTemplate()
  const data = overrides.data || sourceData()
  const manualValues = overrides.manualValues || { request_note: 'Please send the certified copies by Friday.' }
  const clauses = overrides.clauses || [clause()]
  const generated = generateConveyancerCorrespondence({
    plan,
    templates: [template],
    assets: [asset()],
    correspondenceKey: 'outstanding_document_request',
    lane: 'transfer',
    actor: attorney,
    recipients: [{ role: 'seller', name: 'Sam Seller', email: 'seller@example.com', delivery: 'to' }],
    data,
    organisationSettings: { legalName: 'Example Attorneys Inc.' },
    manualValues,
    clauses,
    generatedAt: '2026-07-15T09:00:00.000Z',
    commandId: `cmd-c2-for-c3-${sequence}`,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
  })
  assert.equal(generated.ok, true, generated.code)
  return {
    plan,
    correspondence: generated.correspondence,
    template,
    actor: attorney,
    data,
    organisationSettings: { legalName: 'Example Attorneys Inc.' },
    manualValues,
    clauses,
    sourceEvidence: evidence(),
    validatedAt: '2026-07-15T10:00:00.000Z',
    commandId: `cmd-c3-${sequence}`,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
    ...overrides,
  }
}

test('produces a passed immutable validation report without allowing dispatch', () => {
  const result = validateConveyancerCorrespondenceData(scenario())
  assert.equal(result.ok, true, result.code)
  assert.equal(result.validation.version, CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION)
  assert.equal(result.validation.outcome, 'passed', JSON.stringify(result.validation.failedCodes))
  assert.equal(result.validation.readyForReview, true)
  assert.equal(result.validation.dispatchAllowed, false)
  assert.equal(result.event.dispatchPerformed, false)
  assert.equal(Object.isFrozen(result.validation), true)
  assert.equal(Object.isFrozen(result.event), true)
})

test('blocks invalid governed semantic data', () => {
  const input = scenario()
  input.data = sourceData({ parties: { recipient: { name: 'S', reference: '123' } } })
  const result = validateConveyancerCorrespondenceData(input)
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.validation.failedCodes.includes('invalid_south_african_id'))
  assert.ok(result.validation.failedCodes.includes('below_minimum_length'))
  assert.ok(result.validation.failedCodes.includes('generated_field_matches_current_source'))
})

test('keeps warnings visible without blocking review', () => {
  const input = scenario({ manualValues: { request_note: 'A'.repeat(101) } })
  const result = validateConveyancerCorrespondenceData(input)
  assert.equal(result.validation.outcome, 'warning')
  assert.equal(result.validation.readyForReview, true)
  assert.equal(result.validation.warningCount, 1)
  assert.ok(result.validation.failedCodes.includes('above_maximum_length'))
})

test('enforces governed cross-field rules', () => {
  const variables = structuredClone(governedTemplate().variables)
  variables.find((item) => item.key === 'request_note').validationRules.push({ type: 'matches_variable', otherKey: 'recipient_name' })
  const template = governedTemplate({ variables })
  const result = validateConveyancerCorrespondenceData(scenario({ template, manualValues: { request_note: 'Different value' } }))
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.validation.failedCodes.includes('variable_value_mismatch'))
})

test('enforces source verification and freshness rules', () => {
  const missing = validateConveyancerCorrespondenceData(scenario({ sourceEvidence: {} }))
  assert.equal(missing.validation.outcome, 'blocked')
  assert.ok(missing.validation.failedCodes.includes('source_verification_required'))
  assert.ok(missing.validation.failedCodes.includes('source_data_stale'))

  const stale = validateConveyancerCorrespondenceData(scenario({ sourceEvidence: evidence({ verifiedAt: '2026-05-01T10:00:00.000Z', expiresAt: null }) }))
  assert.ok(stale.validation.failedCodes.includes('source_data_stale'))
})

test('blocks unresolved source conflicts without exposing competing values', () => {
  const result = validateConveyancerCorrespondenceData(scenario({
    sourceConflicts: [{ variableKey: 'recipient_reference', values: ['8001015009087', 'other'], sources: ['fica', 'onboarding'], resolved: false }],
  }))
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.validation.failedCodes.includes('source_conflict_unresolved'))
  assert.equal(JSON.stringify(result.validation).includes('other'), false)
})

test('detects content and recipient tampering after C2 generation', () => {
  const input = scenario()
  input.correspondence = structuredClone(input.correspondence)
  input.correspondence.body = `${input.correspondence.body}\nPay a different account.`
  input.correspondence.recipients[0].email = 'attacker@example.com'
  const result = validateConveyancerCorrespondenceData(input)
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.validation.failedCodes.includes('generated_content_unchanged'))
})

test('detects source drift through per-field hashes', () => {
  const input = scenario()
  input.data = sourceData({ parties: { recipient: { name: 'Samuel Seller', reference: '8001015009087' } } })
  const result = validateConveyancerCorrespondenceData(input)
  assert.equal(result.validation.outcome, 'blocked')
  assert.ok(result.validation.checks.some((item) => item.fieldKey === 'recipient_name' && item.code === 'generated_field_matches_current_source' && item.status === 'failed'))
})

test('blocks stale or altered template provenance', () => {
  const staleInput = scenario()
  staleInput.template = governedTemplate({ status: 'superseded' })
  const stale = validateConveyancerCorrespondenceData(staleInput)
  assert.equal(stale.validation.outcome, 'blocked')
  assert.ok(stale.validation.failedCodes.includes('template_still_selectable'))

  const changed = scenario()
  changed.correspondence = structuredClone(changed.correspondence)
  changed.correspondence.template.governanceFingerprint = 'fnv1a_deadbeef'
  const altered = validateConveyancerCorrespondenceData(changed)
  assert.ok(altered.validation.failedCodes.includes('template_governance_fingerprint_exact'))
})

test('enforces active plan concurrency and legal-lane authority', () => {
  const input = scenario({ expectedPlanVersion: 99 })
  const stale = validateConveyancerCorrespondenceData(input)
  assert.equal(stale.code, 'stale_plan_version')

  const denied = validateConveyancerCorrespondenceData(scenario({ actor: { role: MATTER_PLAN_OWNER_ROLES.bondAttorney, userId: 'bond-c3' } }))
  assert.equal(denied.code, 'correspondence_validation_lane_not_authorised')
})

test('supports secure idempotent replay', () => {
  const input = scenario()
  const first = validateConveyancerCorrespondenceData(input)
  const replay = validateConveyancerCorrespondenceData({
    ...input,
    validatedAt: 'invalid',
    existingValidations: [{ ...first.validation, validation: first.validation, event: first.event }],
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.code, 'idempotent_replay')

  const conflicting = structuredClone(input)
  conflicting.correspondence.correspondenceId = 'correspondence:different'
  conflicting.existingValidations = [{ ...first.validation, validation: first.validation, event: first.event }]
  assert.equal(validateConveyancerCorrespondenceData(conflicting).code, 'command_id_correspondence_conflict')
})

test('keeps sensitive values out of validation and audit output', () => {
  const result = validateConveyancerCorrespondenceData(scenario())
  const serialized = JSON.stringify({ validation: result.validation, event: result.event })
  assert.equal(serialized.includes('8001015009087'), false)
  assert.deepEqual(result.event.sensitiveVariableKeys, ['recipient_reference'])
})

test('rejects invalid or unsafe governed validation-rule contracts', () => {
  const variables = structuredClone(governedTemplate().variables)
  variables[0].validationRules = [{ type: 'regular_expression', value: 10 }]
  const invalid = validateConveyancerTemplateVersion(governedTemplate({ variables }))
  assert.ok(invalid.errors.includes('variable_0:validation_rule_0:invalid_type'))

  variables[0].validationRules = [{ type: 'matches_variable', otherKey: 'unknown_field' }]
  const unknown = validateConveyancerTemplateVersion(governedTemplate({ variables }))
  assert.ok(unknown.errors.includes('variable_0:validation_rule_0:other_variable_unknown'))

  variables[0].validationRules = [{ type: 'min_length', value: 2, severity: 'optional' }]
  const invalidSeverity = validateConveyancerTemplateVersion(governedTemplate({ variables }))
  assert.ok(invalidSeverity.errors.includes('variable_0:validation_rule_0:invalid_severity'))
})

test('never mutates validation inputs', () => {
  const input = scenario()
  const before = structuredClone(input)
  const result = validateConveyancerCorrespondenceData(input)
  assert.equal(result.ok, true)
  assert.deepEqual(input, before)
})

console.log('conveyancer correspondence C3 data validation tests passed')
