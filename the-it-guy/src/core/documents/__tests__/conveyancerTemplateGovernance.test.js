import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
} from '../../transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_TEMPLATE_CAPABILITIES,
  CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION,
  buildConveyancerTemplateGovernanceFingerprint,
  canConveyancerTemplateActor,
  evaluateConveyancerTemplateApplicability,
  evaluateConveyancerTemplateLifecycleTransition,
  evaluateConveyancerTemplatePublicationReadiness,
  evaluateConveyancerTemplateVersionMutation,
  isConveyancerTemplateVersionImmutable,
  normalizeConveyancerTemplateVersion,
  selectConveyancerTemplateVersion,
  validateConveyancerTemplateVersion,
  validateConveyancerTemplateVersionLineage,
} from '../legalTemplateGovernance.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const HASH_1 = '1'.repeat(64)
const HASH_2 = '2'.repeat(64)
const CLAUSE_HASH = 'a'.repeat(64)
const author = { role: MATTER_PLAN_OWNER_ROLES.secretary, userId: 'author-1' }
const attorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' }
const secondAttorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-2' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }

function template(overrides = {}) {
  return {
    contractVersion: CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION,
    governanceVersion: 1,
    templateId: 'template-transfer-instruction',
    templateVersionId: 'template-transfer-instruction-v1',
    organisationId: 'org-1',
    moduleType: 'attorney',
    packetType: 'otp',
    templateKey: 'transfer_instruction',
    templateLabel: 'Transfer instruction',
    documentKind: 'agreement',
    documentModel: 'single_master_document',
    templateFormat: 'docx',
    lane: 'transfer',
    status: 'draft',
    versionNumber: 1,
    versionTag: 'v1',
    jurisdictionCode: 'ZA',
    languageCode: 'en-ZA',
    instrumentFamily: 'residential_resale',
    applicability: {
      transactionTypes: ['private_sale'],
      financeTypes: [],
      buyerEntityTypes: [],
      sellerEntityTypes: [],
      propertyTenures: ['freehold'],
      sellerHasExistingBond: null,
    },
    content: {
      contentHash: HASH_1,
      storageBucket: 'legal-templates',
      storagePath: 'org-1/transfer-instruction-v1.docx',
      fileName: 'transfer-instruction-v1.docx',
      sectionCount: 0,
      placeholderKeys: ['buyer_full_name'],
    },
    variables: [{
      key: 'buyer_full_name',
      label: 'Buyer full name',
      type: 'text',
      coverage: 'mapped',
      sourcePaths: ['transaction.buyer.full_name'],
      required: true,
    }],
    clauses: [{
      key: 'standard_transfer_terms',
      version: 1,
      required: true,
      contentHash: CLAUSE_HASH,
      approvedAt: '2026-07-01T08:00:00.000Z',
      approvedBy: attorney,
    }],
    change: { type: 'initial', summary: 'Initial governed template.' },
    authoredBy: author,
    createdAt: '2026-07-01T07:00:00.000Z',
    ...overrides,
  }
}

function published(overrides = {}) {
  const suppliedApproval = overrides.approval || {}
  const governed = template({
    status: 'published',
    publication: {
      publishedAt: '2026-07-03T08:00:00.000Z',
      publishedBy: manager,
      effectiveFrom: '2026-07-04T00:00:00.000Z',
      effectiveUntil: null,
    },
    ...overrides,
  })
  return {
    ...governed,
    approval: {
      approvedAt: '2026-07-02T08:00:00.000Z',
      approvedBy: attorney,
      notes: 'Legal wording reviewed.',
      ...suppliedApproval,
      templateFingerprint: suppliedApproval.templateFingerprint || buildConveyancerTemplateGovernanceFingerprint(governed),
    },
  }
}

function matterFacts(overrides = {}) {
  return {
    transaction_type: 'private_sale',
    finance_type: 'cash',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    property_tenure: 'freehold',
    seller_has_existing_bond: false,
    legal_lane: 'transfer',
    jurisdiction_code: 'ZA',
    language_code: 'en-ZA',
    ...overrides,
  }
}

test('validates a published, versioned and independently approved template', () => {
  const result = validateConveyancerTemplateVersion(published())
  assert.equal(result.valid, true, result.errors.join(', '))
  assert.equal(result.template.contractVersion, CONVEYANCER_TEMPLATE_GOVERNANCE_VERSION)
  assert.equal(result.template.status, 'published')
  assert.equal(result.template.variables[0].sourcePaths[0], 'transaction.buyer.full_name')
})

test('normalises existing registry fields without creating another record model', () => {
  const normalized = normalizeConveyancerTemplateVersion({
    ...template(),
    templateId: undefined,
    templateVersionId: undefined,
    id: 'version-row-1',
    template_id: 'registry-row-1',
    version_number: 1,
    version_tag: 'v1',
    status: 'awaiting_approval',
  })
  assert.equal(normalized.templateId, 'registry-row-1')
  assert.equal(normalized.templateVersionId, 'version-row-1')
  assert.equal(normalized.status, 'attorney_review')
})

test('rejects invalid governance enums, hashes and legal identity', () => {
  const result = validateConveyancerTemplateVersion(template({
    documentKind: 'invented',
    lane: 'invented',
    instrumentFamily: 'invented',
    content: { ...template().content, contentHash: 'not-a-hash' },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('invalid_document_kind'))
  assert.ok(result.errors.includes('invalid_legal_lane'))
  assert.ok(result.errors.includes('invalid_instrument_family'))
  assert.ok(result.errors.includes('valid_content_hash_required'))
})

test('enforces template role boundaries', () => {
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.secretary, CONVEYANCER_TEMPLATE_CAPABILITIES.edit), true)
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.secretary, CONVEYANCER_TEMPLATE_CAPABILITIES.approve), false)
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.transferAttorney, CONVEYANCER_TEMPLATE_CAPABILITIES.approve), true)
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.transferAttorney, CONVEYANCER_TEMPLATE_CAPABILITIES.publish), false)
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.firmManager, CONVEYANCER_TEMPLATE_CAPABILITIES.publish), true)
  assert.equal(canConveyancerTemplateActor(MATTER_PLAN_OWNER_ROLES.client, CONVEYANCER_TEMPLATE_CAPABILITIES.view), false)
})

test('requires independent legal approval and manager publication', () => {
  const review = template({ status: 'attorney_review' })
  const selfApproval = evaluateConveyancerTemplateLifecycleTransition({
    template: { ...review, authoredBy: attorney },
    toStatus: 'approved',
    actor: attorney,
    occurredAt: '2026-07-02T08:00:00.000Z',
  })
  assert.equal(selfApproval.allowed, false)
  assert.equal(selfApproval.reason, 'independent_template_approval_required')

  const independent = evaluateConveyancerTemplateLifecycleTransition({
    template: { ...review, authoredBy: attorney },
    toStatus: 'approved',
    actor: secondAttorney,
    occurredAt: '2026-07-02T08:00:00.000Z',
  })
  assert.equal(independent.allowed, true)
  assert.equal(independent.requiredCapability, CONVEYANCER_TEMPLATE_CAPABILITIES.approve)

  const approved = published({ status: 'approved' })
  const attorneyPublish = evaluateConveyancerTemplateLifecycleTransition({ template: approved, toStatus: 'published', actor: attorney, occurredAt: '2026-07-03T08:00:00.000Z' })
  assert.equal(attorneyPublish.reason, 'template_transition_not_authorised')
  const managerPublish = evaluateConveyancerTemplateLifecycleTransition({ template: approved, toStatus: 'published', actor: manager, occurredAt: '2026-07-03T08:00:00.000Z' })
  assert.equal(managerPublish.allowed, true)
})

test('keeps released and withdrawn versions immutable', () => {
  assert.equal(isConveyancerTemplateVersionImmutable(published()), true)
  assert.equal(isConveyancerTemplateVersionImmutable(template()), false)
  assert.equal(isConveyancerTemplateVersionImmutable(template({ status: 'withdrawn' })), true)

  const releasedEdit = evaluateConveyancerTemplateVersionMutation({
    currentVersion: published(),
    proposedVersion: published({ templateLabel: 'Altered after publication' }),
    actor: manager,
  })
  assert.equal(releasedEdit.allowed, false)
  assert.equal(releasedEdit.reason, 'released_template_version_immutable')
})

test('allows controlled draft edits without permitting identity mutation', () => {
  const current = template({ authoredBy: attorney })
  const edited = template({
    authoredBy: attorney,
    templateLabel: 'Updated transfer instruction',
    content: { ...template().content, contentHash: HASH_2, storagePath: 'org-1/transfer-instruction-v1-revised.docx' },
  })
  const allowed = evaluateConveyancerTemplateVersionMutation({ currentVersion: current, proposedVersion: edited, actor: attorney })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.reason, 'draft_template_mutation_authorised')

  const otherAuthor = evaluateConveyancerTemplateVersionMutation({ currentVersion: current, proposedVersion: edited, actor: secondAttorney })
  assert.equal(otherAuthor.reason, 'template_owned_by_another_author')
  const identity = evaluateConveyancerTemplateVersionMutation({ currentVersion: current, proposedVersion: { ...edited, templateVersionId: 'different-version' }, actor: attorney })
  assert.equal(identity.reason, 'template_version_identity_immutable')
})

test('rejects unmapped placeholders and incomplete required variables', () => {
  const unmapped = validateConveyancerTemplateVersion(template({
    content: { ...template().content, placeholderKeys: ['buyer_full_name', 'unknown_field'] },
  }))
  assert.ok(unmapped.errors.includes('unmapped_placeholder:unknown_field'))

  const missing = validateConveyancerTemplateVersion(template({
    content: { ...template().content, placeholderKeys: [] },
  }))
  assert.ok(missing.errors.includes('required_variable_not_in_template:buyer_full_name'))
})

test('blocks publication when mappings or required clauses are not governed', () => {
  const gap = published({
    variables: [{ ...template().variables[0], coverage: 'gap', sourcePaths: [] }],
  })
  const gapResult = evaluateConveyancerTemplatePublicationReadiness(gap)
  assert.equal(gapResult.ready, false)
  assert.ok(gapResult.blockers.includes('template_variable_gap'))

  const clause = published({
    clauses: [{ ...template().clauses[0], approvedAt: null, approvedBy: {} }],
  })
  const clauseResult = evaluateConveyancerTemplatePublicationReadiness(clause)
  assert.equal(clauseResult.ready, false)
  assert.ok(clauseResult.blockers.includes('required_clause_not_approved'))
})

test('invalidates legal approval when governed routing or mappings change', () => {
  const approved = published()
  const changed = {
    ...approved,
    applicability: { ...approved.applicability, financeTypes: ['bond'] },
  }
  const result = validateConveyancerTemplateVersion(changed)
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('approved_fingerprint_mismatch'))
})

test('validates sequential immutable version lineage', () => {
  const previous = published()
  const current = template({
    templateVersionId: 'template-transfer-instruction-v2',
    status: 'draft',
    versionNumber: 2,
    versionTag: 'v2',
    previousVersionId: previous.templateVersionId,
    content: { ...template().content, contentHash: HASH_2, storagePath: 'org-1/transfer-instruction-v2.docx' },
    change: { type: 'minor', summary: 'Clarified the signature instructions.' },
  })
  assert.equal(validateConveyancerTemplateVersionLineage({ currentVersion: current, previousVersion: previous }).valid, true)

  const skipped = validateConveyancerTemplateVersionLineage({ currentVersion: { ...current, versionNumber: 3 }, previousVersion: previous })
  assert.ok(skipped.errors.includes('lineage_version_must_be_sequential'))
  const unchanged = validateConveyancerTemplateVersionLineage({ currentVersion: { ...current, content: previous.content }, previousVersion: previous })
  assert.ok(unchanged.errors.includes('lineage_content_hash_unchanged'))
})

test('fails applicability closed when routing facts are absent or mismatched', () => {
  const missing = evaluateConveyancerTemplateApplicability({ template: published(), matterFacts: { legal_lane: 'transfer' } })
  assert.equal(missing.applicable, false)
  assert.ok(missing.missingFacts.includes('transaction_type'))
  assert.ok(missing.missingFacts.includes('property_tenure'))

  const mismatch = evaluateConveyancerTemplateApplicability({ template: published(), matterFacts: matterFacts({ property_tenure: 'sectional_title' }) })
  assert.equal(mismatch.applicable, false)
  assert.ok(mismatch.mismatches.includes('property_tenure'))
})

test('selects the most specific organisation template without crossing tenants', () => {
  const global = published({ templateVersionId: 'global-v1', organisationId: null, isDefault: true })
  const organisation = published({
    templateVersionId: 'org-v2',
    versionNumber: 2,
    versionTag: 'v2',
    previousVersionId: 'org-v1',
    content: { ...template().content, contentHash: HASH_2 },
    change: { type: 'minor', summary: 'Organisation-specific wording.' },
  })
  const otherTenant = published({
    templateVersionId: 'other-v3',
    organisationId: 'org-2',
    versionNumber: 3,
    versionTag: 'v3',
    previousVersionId: 'other-v2',
    change: { type: 'minor', summary: 'Other tenant wording.' },
  })
  const result = selectConveyancerTemplateVersion({
    templates: [global, otherTenant, organisation],
    matterFacts: matterFacts(),
    organisationId: 'org-1',
    asOf: '2026-07-15T09:00:00.000Z',
  })
  assert.equal(result.selected.templateVersionId, 'org-v2')
  assert.equal(result.selectionReason, 'organisation_template_selected')
  assert.ok(result.evaluations.find((item) => item.template.templateVersionId === 'other-v3').reasons.includes('template_organisation_mismatch'))
})

test('does not select future, expired or draft versions', () => {
  const future = published({ templateVersionId: 'future-v1', publication: { ...published().publication, effectiveFrom: '2027-01-01T00:00:00.000Z' } })
  const expired = published({ templateVersionId: 'expired-v1', publication: { ...published().publication, effectiveUntil: '2026-07-10T00:00:00.000Z' } })
  const draft = template({ templateVersionId: 'draft-v1' })
  const result = selectConveyancerTemplateVersion({
    templates: [future, expired, draft],
    matterFacts: matterFacts(),
    organisationId: 'org-1',
    asOf: '2026-07-15T09:00:00.000Z',
  })
  assert.equal(result.selected, null)
  assert.equal(result.selectionReason, 'no_selectable_template')
})

test('reports an equal-priority routing conflict deterministically', () => {
  const first = published({ templateVersionId: 'a-version' })
  const second = published({ templateVersionId: 'b-version' })
  const result = selectConveyancerTemplateVersion({
    templates: [second, first],
    matterFacts: matterFacts(),
    organisationId: 'org-1',
    asOf: '2026-07-15T09:00:00.000Z',
  })
  assert.equal(result.conflict, true)
  assert.equal(result.selected.templateVersionId, 'a-version')
})

console.log('conveyancer document template C1 governance tests passed')
