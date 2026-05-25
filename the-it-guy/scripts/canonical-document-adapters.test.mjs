import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    ADAPTER_EVENT_TYPES,
    areCanonicalDocumentAdaptersEnabled,
    buildAdapterAuditReport,
    buildCanonicalUploadPatch,
    canonicalDefinitionKeyToLegacyKey,
    canonicalInstanceToDocumentRequest,
    canonicalInstanceToPrivateListingRequirement,
    canonicalInstanceToTransactionRequiredDocument,
    canonicalLevelToLegacyRequired,
    canonicalStatusToDocumentRequestStatus,
    canonicalStatusToPrivateListingStatus,
    canonicalStatusToTransactionRequiredStatus,
    detectStatusConflict,
    findMatchingCanonicalInstance,
    getUnmappedLegacyRequirementKeys,
    legacyRequirementGroupToPackKey,
    legacyRequirementKeyToCanonicalKey,
    packKeyToLegacyRequirementGroup,
    pickStrongerCanonicalStatus,
    privateListingStatusToCanonicalStatus,
    transactionRequiredStatusToCanonicalStatus,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')
  const {
    REQUIREMENT_LEVELS,
    REQUIREMENT_STATUSES,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')

  assert.equal(areCanonicalDocumentAdaptersEnabled(), false)
  assert.equal(areCanonicalDocumentAdaptersEnabled({ force: true }), true)

  assert.equal(canonicalDefinitionKeyToLegacyKey('signed_mandate'), 'mandate_signature')
  assert.equal(canonicalDefinitionKeyToLegacyKey('signed_otp'), 'otp')
  assert.equal(canonicalDefinitionKeyToLegacyKey('grant_letter'), 'grant_signed')
  assert.equal(canonicalDefinitionKeyToLegacyKey('settlement_figure'), 'settlement_figures')
  assert.equal(canonicalDefinitionKeyToLegacyKey('signed_transfer_documents'), 'signed_transfer_pack')
  assert.equal(canonicalDefinitionKeyToLegacyKey('rates_account'), 'rates_account')
  assert.equal(legacyRequirementKeyToCanonicalKey('mandate_signature'), 'signed_mandate')
  assert.equal(legacyRequirementKeyToCanonicalKey('otp'), 'signed_otp')
  assert.equal(legacyRequirementKeyToCanonicalKey('proof_of_address'), 'seller_proof_of_address')
  assert.equal(legacyRequirementKeyToCanonicalKey('unknown_key'), 'unknown_key')

  const originalParityUnmappedKeys = [
    'bank_statements',
    'bond_application_form',
    'bond_approval',
    'bond_bank_details',
    'bond_cancellation_notice',
    'bond_preapproval',
    'buyer_id_document',
    'buyer_proof_of_address',
    'company_resolution_to_sell',
    'generated_mandate',
    'generated_otp',
    'guarantees',
    'information_sheet',
    'occupation_certificate',
    'payslips',
    'proof_of_funds',
    'proof_of_income',
    'property_condition_disclosure',
    'rental_schedule',
    'reservation_deposit_proof',
    'seller_company_registration',
    'seller_executor_authority',
    'seller_letters_of_authority',
    'seller_trust_deed',
    'trust_resolution_to_sell',
    'transfer_documents',
    'zoning_certificate',
  ]
  for (const key of originalParityUnmappedKeys) {
    assert.equal(canonicalDefinitionKeyToLegacyKey(key), key)
    assert.equal(legacyRequirementKeyToCanonicalKey(key), key)
  }
  const realStagingUnmappedKeys = [
    'bank_statements',
    'grant_signed',
    'guarantees',
    'information_sheet',
    'otp',
    'payslips',
    'proof_of_income',
    'reservation_deposit_proof',
    'settlement_figures',
    'signed_transfer_pack',
    'transfer_documents',
  ]
  assert.deepEqual(
    getUnmappedLegacyRequirementKeys(realStagingUnmappedKeys.map((document_key) => ({ document_key }))),
    [],
  )
  assert.equal(legacyRequirementKeyToCanonicalKey('grant_signed'), 'grant_letter')
  assert.equal(legacyRequirementKeyToCanonicalKey('settlement_figures'), 'settlement_figure')
  assert.equal(legacyRequirementKeyToCanonicalKey('signed_transfer_pack'), 'signed_transfer_documents')
  assert.equal(legacyRequirementKeyToCanonicalKey('reservation_deposit_pop'), 'reservation_deposit_proof')
  assert.equal(legacyRequirementKeyToCanonicalKey('buyer_fica'), 'buyer_id_document')
  assert.equal(legacyRequirementKeyToCanonicalKey('seller_fica'), 'seller_id_document')
  assert.equal(legacyRequirementKeyToCanonicalKey('transfer_document_pack'), 'signed_transfer_documents')
  assert.equal(legacyRequirementKeyToCanonicalKey('final_signed_packet'), 'signed_packet_version')
  assert.equal(legacyRequirementKeyToCanonicalKey('bond_instruction'), 'bond_instruction_to_attorneys')
  assert.equal(legacyRequirementKeyToCanonicalKey('cancellation_instruction'), 'bond_cancellation_notice')
  assert.equal(legacyRequirementKeyToCanonicalKey('buyer_id'), 'buyer_id_document')
  assert.equal(legacyRequirementKeyToCanonicalKey('otp_signed'), 'signed_otp')
  assert.equal(legacyRequirementKeyToCanonicalKey('generated_offer_to_purchase'), 'generated_otp')
  assert.equal(legacyRequirementKeyToCanonicalKey('company_registration'), 'seller_company_registration')
  assert.equal(legacyRequirementKeyToCanonicalKey('executor_authority'), 'seller_executor_authority')
  assert.deepEqual(
    getUnmappedLegacyRequirementKeys(originalParityUnmappedKeys.map((requirement_key) => ({ requirement_key }))),
    [],
  )

  assert.equal(packKeyToLegacyRequirementGroup('seller_identity_fica'), 'fica')
  assert.equal(packKeyToLegacyRequirementGroup('tenant_occupancy'), 'property')
  assert.equal(legacyRequirementGroupToPackKey('financial'), 'property_finance_existing_bond')
  assert.equal(legacyRequirementGroupToPackKey('finance'), 'buyer_finance')
  assert.equal(legacyRequirementGroupToPackKey('sale'), 'attorney_transfer_readiness')
  assert.equal(legacyRequirementGroupToPackKey('buyer_fica'), 'buyer_identity_fica')
  assert.equal(legacyRequirementGroupToPackKey('buyer_finance'), 'buyer_finance')
  assert.equal(legacyRequirementGroupToPackKey('bond_originator'), 'bond_originator')
  assert.equal(legacyRequirementGroupToPackKey('body_corporate'), 'sectional_title_body_corporate')
  assert.equal(legacyRequirementGroupToPackKey('hoa'), 'estate_hoa')
  assert.equal(legacyRequirementGroupToPackKey('tenant'), 'tenant_occupancy')

  assert.equal(canonicalLevelToLegacyRequired(REQUIREMENT_LEVELS.blocker), true)
  assert.equal(canonicalLevelToLegacyRequired(REQUIREMENT_LEVELS.required), true)
  assert.equal(canonicalLevelToLegacyRequired(REQUIREMENT_LEVELS.recommended), false)
  assert.equal(canonicalLevelToLegacyRequired(REQUIREMENT_LEVELS.optional), false)

  assert.equal(canonicalStatusToPrivateListingStatus(REQUIREMENT_STATUSES.pending), 'required')
  assert.equal(canonicalStatusToPrivateListingStatus(REQUIREMENT_STATUSES.expired), 'requested')
  assert.equal(canonicalStatusToPrivateListingStatus(REQUIREMENT_STATUSES.waived), 'not_applicable')
  assert.equal(privateListingStatusToCanonicalStatus('approved'), REQUIREMENT_STATUSES.approved)

  assert.equal(canonicalStatusToTransactionRequiredStatus(REQUIREMENT_STATUSES.pending), 'missing')
  assert.equal(canonicalStatusToTransactionRequiredStatus(REQUIREMENT_STATUSES.rejected), 'reupload_required')
  assert.equal(canonicalStatusToTransactionRequiredStatus(REQUIREMENT_STATUSES.completed), 'accepted')
  assert.equal(transactionRequiredStatusToCanonicalStatus('accepted'), REQUIREMENT_STATUSES.approved)

  assert.equal(canonicalStatusToDocumentRequestStatus(REQUIREMENT_STATUSES.pending), 'requested')
  assert.equal(canonicalStatusToDocumentRequestStatus(REQUIREMENT_STATUSES.uploaded), 'uploaded')
  assert.equal(canonicalStatusToDocumentRequestStatus(REQUIREMENT_STATUSES.approved), 'reviewed')

  const canonicalInstance = {
    id: 'canonical-1',
    document_definition_key: 'signed_mandate',
    context_type: 'private_listing',
    context_id: 'listing-1',
    listing_id: 'listing-1',
    transaction_id: 'transaction-1',
    pack_key: 'seller_authority',
    requirement_level: REQUIREMENT_LEVELS.blocker,
    status: REQUIREMENT_STATUSES.pending,
    stage_gates: ['mandate_ready'],
    requested_from_role: 'seller',
    visible_to_roles: ['seller', 'agent'],
    uploadable_by_roles: ['seller'],
    reviewer_role: 'agent',
    source_system: 'test',
    resolver_version: 'test_v1',
    document_definitions: {
      key: 'signed_mandate',
      display_label: 'Signed Mandate',
      description: 'Signed seller mandate.',
      review_required: true,
    },
  }

  const privateProjection = canonicalInstanceToPrivateListingRequirement(canonicalInstance)
  assert.equal(privateProjection.private_listing_id, 'listing-1')
  assert.equal(privateProjection.requirement_key, 'mandate_signature')
  assert.equal(privateProjection.requirement_group, 'mandate')
  assert.equal(privateProjection.document_visibility, 'seller_visible')
  assert.equal(privateProjection.status, 'required')
  assert.equal(privateProjection.is_required, true)
  assert.equal(privateProjection.canonical_requirement_instance_id, 'canonical-1')

  const approvedLegacy = canonicalInstanceToPrivateListingRequirement(canonicalInstance, {
    id: 'legacy-1',
    status: 'approved',
    generated_from: { previous: true },
  })
  assert.equal(approvedLegacy.status, 'approved')
  assert.equal(approvedLegacy.generated_from.previous, true)

  const transactionProjection = canonicalInstanceToTransactionRequiredDocument({
    ...canonicalInstance,
    status: REQUIREMENT_STATUSES.completed,
  })
  assert.equal(transactionProjection.transaction_id, 'transaction-1')
  assert.equal(transactionProjection.document_key, 'mandate_signature')
  assert.equal(transactionProjection.status, 'accepted')
  assert.equal(transactionProjection.is_uploaded, true)
  assert.equal(transactionProjection.group_key, 'seller_authority')
  assert.equal(transactionProjection.visibility_scope, 'client')
  assert.equal(transactionProjection.required_from_role, 'client')

  const requestProjection = canonicalInstanceToDocumentRequest(canonicalInstance)
  assert.equal(requestProjection.document_type, 'mandate_signature')
  assert.equal(requestProjection.priority, 'required')
  assert.equal(requestProjection.status, 'requested')
  assert.equal(requestProjection.canonical_requirement_instance_id, 'canonical-1')

  const matchedByLink = findMatchingCanonicalInstance(
    { canonical_requirement_instance_id: 'canonical-1', requirement_key: 'wrong' },
    [canonicalInstance],
  )
  assert.equal(matchedByLink.instance.id, 'canonical-1')
  assert.equal(matchedByLink.strategy, 'canonical_requirement_instance_id')

  const matchedByKey = findMatchingCanonicalInstance(
    { requirement_key: 'mandate_signature' },
    [canonicalInstance],
  )
  assert.equal(matchedByKey.instance.id, 'canonical-1')
  assert.equal(matchedByKey.strategy, 'explicit_key_mapping')

  const unmapped = getUnmappedLegacyRequirementKeys([
    { requirement_key: 'mandate_signature' },
    { requirement_key: 'mystery_document' },
    { requirement_key: 'mystery_document' },
  ])
  assert.deepEqual(unmapped, ['mystery_document'])

  assert.equal(pickStrongerCanonicalStatus(REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.pending), REQUIREMENT_STATUSES.approved)
  assert.equal(pickStrongerCanonicalStatus(REQUIREMENT_STATUSES.pending, REQUIREMENT_STATUSES.uploaded), REQUIREMENT_STATUSES.uploaded)
  assert.deepEqual(
    detectStatusConflict(REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.pending),
    { existingStatus: 'approved', incomingStatus: 'pending', reason: 'would_downgrade_completed_state' },
  )

  const uploadPatch = buildCanonicalUploadPatch(
    { ...canonicalInstance, status: REQUIREMENT_STATUSES.pending },
    { id: 'private-doc-1', status: 'uploaded' },
    { status: 'uploaded' },
    { review_required: true },
  )
  assert.equal(uploadPatch.patch.status, REQUIREMENT_STATUSES.underReview)
  assert.equal(uploadPatch.patch.satisfied_by_document_id, 'private-doc-1')

  const completedUploadPatch = buildCanonicalUploadPatch(
    { ...canonicalInstance, status: REQUIREMENT_STATUSES.completed, satisfied_by_document_id: 'document-old' },
    { id: 'private-doc-2', status: 'uploaded' },
    { status: 'uploaded' },
    { review_required: false },
  )
  assert.equal(completedUploadPatch.patch.status, REQUIREMENT_STATUSES.completed)

  const audit = buildAdapterAuditReport({
    canonicalInstances: [canonicalInstance],
    legacyRequirements: [
      { id: 'legacy-1', requirement_key: 'mandate_signature', status: 'approved' },
      { id: 'legacy-2', requirement_key: 'mandate_signature', status: 'approved' },
      { id: 'legacy-3', requirement_key: 'legacy_only', status: 'required' },
    ],
    legacyDocuments: [
      { id: 'doc-orphan' },
      { id: 'doc-linked', canonical_requirement_instance_id: 'canonical-1' },
    ],
    packetVersions: [
      { id: 'packet-unlinked' },
      { id: 'packet-linked', canonical_requirement_instance_id: 'canonical-1' },
    ],
  })
  assert.deepEqual(audit.unmappedLegacyRequirementKeys, ['legacy_only'])
  assert.deepEqual(audit.duplicateLegacyRequirements, ['mandate_signature'])
  assert.deepEqual(audit.documentsNotLinkedToAnyRequirement, ['doc-orphan'])
  assert.deepEqual(audit.packetVersionsNotLinkedToMatchingRequirement, ['packet-unlinked'])

  assert.equal(ADAPTER_EVENT_TYPES.legacySynced, 'legacy_synced')
  assert.equal(ADAPTER_EVENT_TYPES.packetLinked, 'packet_linked')

  const parityKeys = [
    ...originalParityUnmappedKeys,
    'signed_otp',
    'grant_letter',
    'settlement_figure',
    'signed_transfer_documents',
  ]
  const parityInstances = parityKeys.map((key, index) => ({
    ...canonicalInstance,
    id: `parity-${index}`,
    document_definition_key: key,
    pack_key: key.startsWith('buyer_') || ['bank_statements', 'payslips', 'proof_of_funds', 'proof_of_income', 'reservation_deposit_proof', 'bond_preapproval', 'bond_approval', 'grant_letter'].includes(key)
      ? 'buyer_finance'
      : key.includes('bond_') || key === 'settlement_figure'
        ? 'property_finance_existing_bond'
        : ['guarantees', 'information_sheet', 'signed_otp', 'signed_transfer_documents', 'transfer_documents'].includes(key)
          ? 'attorney_transfer_readiness'
          : 'property_ownership',
    status: REQUIREMENT_STATUSES.pending,
  }))
  const parityRows = parityInstances.map((instance) => canonicalInstanceToPrivateListingRequirement(instance))
  assert.deepEqual(getUnmappedLegacyRequirementKeys(parityRows), [])
  assert.equal(new Set(parityRows.map((row) => row.requirement_key)).size, parityRows.length)
  for (const row of parityRows) {
    const match = findMatchingCanonicalInstance(row, parityInstances)
    assert.equal(match.strategy, 'canonical_requirement_instance_id')
    assert.equal(Boolean(match.instance), true)
  }

  console.log('canonical-document-adapters tests passed')
} finally {
  await server.close()
}
