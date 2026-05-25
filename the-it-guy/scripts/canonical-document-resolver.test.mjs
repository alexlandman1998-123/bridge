import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    REQUIREMENT_LEVELS,
    REQUIREMENT_STATUSES,
    buildInstanceSignature,
    calculateGateReadiness,
    calculatePackCompletion,
    evaluateConditions,
    explainGateFailure,
    getFactValue,
    getRequirementReadiness,
    isRequirementProvisionallySatisfied,
    isRequirementSatisfied,
    reconcileRequirementInstances,
    requirementBlocksWorkflow,
    resolveRequirements,
    resolveRequirementCandidates,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')

  const facts = {
    seller: { legal_type: 'individual', existing_bond: true },
    property: { sectional_title: true, value: 2500000 },
    occupancy: { status: 'tenant_occupied' },
    purchase: { finance_type: 'hybrid' },
    context: { type: 'private_listing' },
  }

  assert.equal(getFactValue(facts, 'seller.legal_type'), 'individual')
  assert.equal(getFactValue(facts, 'property.sectional_title'), true)
  assert.equal(getFactValue(facts, 'missing.path'), undefined)
  assert.equal(getFactValue(null, 'seller.legal_type'), undefined)

  assert.equal(evaluateConditions({ fact: 'seller.legal_type', operator: 'eq', value: 'individual' }, facts), true)
  assert.equal(evaluateConditions({ fact: 'seller.legal_type', operator: 'neq', value: 'company' }, facts), true)
  assert.equal(evaluateConditions({ fact: 'purchase.finance_type', operator: 'in', value: ['cash', 'hybrid'] }, facts), true)
  assert.equal(evaluateConditions({ fact: 'purchase.finance_type', operator: 'not_in', value: ['bond'] }, facts), true)
  assert.equal(evaluateConditions({ fact: 'property.value', operator: 'gt', value: 1000000 }, facts), true)
  assert.equal(evaluateConditions({ fact: 'property.value', operator: 'lte', value: 2500000 }, facts), true)
  assert.equal(evaluateConditions({ fact: 'property.erf', operator: 'not_exists' }, facts), true)
  assert.equal(evaluateConditions({
    all: [
      { fact: 'property.sectional_title', operator: 'eq', value: true },
      {
        any: [
          { fact: 'occupancy.status', operator: 'eq', value: 'vacant' },
          { fact: 'occupancy.status', operator: 'eq', value: 'tenant_occupied' },
        ],
      },
    ],
  }, facts), true)

  const definitions = [
    {
      key: 'seller_id_document',
      pack_key: 'seller_identity_fica',
      default_requirement_level: 'required',
      default_visibility: ['seller', 'agent'],
      default_upload_roles: ['seller'],
    },
    {
      key: 'bond_statement',
      pack_key: 'property_finance_existing_bond',
      default_requirement_level: 'required',
      default_visibility: ['seller', 'agent'],
      default_upload_roles: ['seller'],
    },
    {
      key: 'proof_of_funds',
      pack_key: 'buyer_finance',
      default_requirement_level: 'blocker',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
  ]

  const rules = [
    {
      id: 'rule-seller-id',
      document_definition_key: 'seller_id_document',
      pack_key: 'seller_identity_fica',
      context_type: 'private_listing',
      condition_json: { fact: 'seller.legal_type', operator: 'exists' },
      requirement_level: null,
      stage_gates: ['mandate_ready', 'listing_ready'],
      requested_from_role: 'seller',
      reviewer_role: 'agent',
      priority: 1,
    },
    {
      id: 'rule-seller-id-duplicate',
      document_definition_key: 'seller_id_document',
      pack_key: 'seller_identity_fica',
      context_type: 'private_listing',
      condition_json: { fact: 'seller.legal_type', operator: 'exists' },
      requirement_level: null,
      stage_gates: ['mandate_ready'],
      requested_from_role: 'seller',
      reviewer_role: 'agent',
      priority: 2,
    },
    {
      id: 'rule-bond',
      document_definition_key: 'bond_statement',
      pack_key: 'property_finance_existing_bond',
      context_type: 'private_listing',
      condition_json: { fact: 'seller.existing_bond', operator: 'eq', value: true },
      requirement_level: 'required',
      stage_gates: ['attorney_instruction_ready'],
      requested_from_role: 'seller',
      reviewer_role: 'agent',
      priority: 3,
    },
    {
      id: 'rule-proof-of-funds',
      document_definition_key: 'proof_of_funds',
      pack_key: 'buyer_finance',
      context_type: 'transaction',
      condition_json: { fact: 'purchase.finance_type', operator: 'in', value: ['cash', 'hybrid'] },
      requirement_level: 'blocker',
      stage_gates: ['finance_ready'],
      requested_from_role: 'buyer',
      reviewer_role: 'agent',
      priority: 4,
    },
  ]

  const input = {
    contextType: 'private_listing',
    contextId: '11111111-1111-4111-8111-111111111111',
    listingId: '22222222-2222-4222-8222-222222222222',
    facts,
    options: {
      dryRun: true,
      existingInstances: [],
      sourceSystem: 'test_resolver',
      resolverVersion: 'test_v1',
    },
  }

  const candidates = resolveRequirementCandidates({ input, rules, definitions })
  assert.equal(candidates.generatedInstances.length, 2)
  assert.equal(candidates.matchedRules.length, 2)
  assert.equal(candidates.unmatchedRules.some((item) => item.reason === 'duplicate_requirement_signature_suppressed'), true)
  assert.equal(candidates.generatedInstances[0].document_definition_key, 'seller_id_document')
  assert.deepEqual(candidates.generatedInstances[0].visible_to_roles, ['agent', 'seller'])
  assert.equal(candidates.generatedInstances[0].source_system, 'test_resolver')
  assert.equal(candidates.generatedInstances[0].resolver_version, 'test_v1')

  const dryRunResolution = await resolveRequirements(input, { client: null, rules, definitions })
  assert.equal(dryRunResolution.dryRun, true)
  assert.equal(dryRunResolution.generatedInstances.length, 2)
  assert.equal(dryRunResolution.reconciliation.toCreate.length, 2)
  assert.equal(dryRunResolution.readiness.overall.total, 2)

  const existingSellerId = {
    id: 'existing-seller-id',
    ...candidates.generatedInstances[0],
    status: REQUIREMENT_STATUSES.uploaded,
    visible_to_roles: ['seller'],
    satisfied_by_document_id: 'document-1',
  }
  const obsolete = {
    id: 'obsolete-req',
    document_definition_key: 'old_document',
    context_type: input.contextType,
    context_id: input.contextId,
    pack_key: 'seller_identity_fica',
    requirement_level: REQUIREMENT_LEVELS.required,
    status: REQUIREMENT_STATUSES.pending,
    requested_from_role: 'seller',
    requested_from_contact_id: null,
    source_system: 'test_resolver',
    resolver_version: 'test_v1',
    rule_id: 'old-rule',
  }
  const inactiveBond = {
    id: 'inactive-bond',
    ...candidates.generatedInstances[1],
    status: REQUIREMENT_STATUSES.notApplicable,
  }

  const reconciliation = reconcileRequirementInstances(
    [existingSellerId, obsolete, inactiveBond],
    candidates.generatedInstances,
    { regenerate: true, sourceSystem: 'test_resolver', resolverVersion: 'test_v2' },
  )

  assert.equal(reconciliation.toCreate.length, 0)
  assert.equal(reconciliation.toUpdate.length, 2)
  assert.equal(reconciliation.reactivated.length, 1)
  assert.equal(reconciliation.toMarkNotApplicable.length, 1)
  assert.equal(reconciliation.toUpdate.find((item) => item.id === 'existing-seller-id').status, REQUIREMENT_STATUSES.uploaded)
  assert.equal(reconciliation.toUpdate.find((item) => item.id === 'inactive-bond').status, REQUIREMENT_STATUSES.pending)
  assert.equal(reconciliation.toMarkNotApplicable[0].id, 'obsolete-req')

  const sellerSignature = buildInstanceSignature(candidates.generatedInstances[0])
  assert.equal(sellerSignature, `${input.contextType}::${input.contextId}::seller_id_document::seller::`)

  const readinessRequirements = [
    {
      id: 'blocker-pending',
      document_definition_key: 'proof_of_funds',
      pack_key: 'buyer_finance',
      requirement_level: REQUIREMENT_LEVELS.blocker,
      status: REQUIREMENT_STATUSES.pending,
      stage_gates: ['finance_ready'],
    },
    {
      id: 'uploaded-required',
      document_definition_key: 'bond_statement',
      pack_key: 'property_finance_existing_bond',
      requirement_level: REQUIREMENT_LEVELS.required,
      status: REQUIREMENT_STATUSES.uploaded,
      stage_gates: ['finance_ready'],
    },
    {
      id: 'approved-required',
      document_definition_key: 'seller_id_document',
      pack_key: 'seller_identity_fica',
      requirement_level: REQUIREMENT_LEVELS.required,
      status: REQUIREMENT_STATUSES.approved,
      stage_gates: ['mandate_ready'],
    },
    {
      id: 'optional-pending',
      document_definition_key: 'video_walkthrough',
      pack_key: 'marketing_assets',
      requirement_level: REQUIREMENT_LEVELS.optional,
      status: REQUIREMENT_STATUSES.pending,
      stage_gates: ['listing_ready'],
    },
  ]

  assert.equal(isRequirementSatisfied(readinessRequirements[2]), true)
  assert.equal(isRequirementProvisionallySatisfied(readinessRequirements[1]), true)
  assert.equal(requirementBlocksWorkflow(readinessRequirements[0], 'finance_ready'), true)
  assert.equal(requirementBlocksWorkflow(readinessRequirements[1], 'finance_ready'), false)

  const financeReadiness = calculateGateReadiness(readinessRequirements, 'finance_ready')
  assert.equal(financeReadiness.ready, false)
  assert.equal(financeReadiness.blockingCount, 1)
  assert.equal(financeReadiness.percentReady, 50)

  const buyerFinancePack = calculatePackCompletion(readinessRequirements, 'buyer_finance')
  assert.equal(buyerFinancePack.total, 1)
  assert.equal(buyerFinancePack.percentComplete, 0)

  const globalReadiness = getRequirementReadiness(readinessRequirements)
  assert.equal(globalReadiness.missingBlockers.length, 1)
  assert.equal(globalReadiness.packs.some((pack) => pack.packKey === 'buyer_finance'), true)

  const explanation = explainGateFailure(readinessRequirements, 'finance_ready')
  assert.equal(explanation.ready, false)
  assert.equal(explanation.reasons[0].documentDefinitionKey, 'proof_of_funds')

  console.log('canonical-document-resolver tests passed')
} finally {
  await server.close()
}
