import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    DOCUMENT_ROLLOUT_MODES,
    LEGACY_GENERATION_PATHS,
    buildBackfillPlan,
    buildCanonicalDataIntegrityReport,
    buildLegacyGenerationDeprecationReport,
    buildLegacyParityAudit,
    buildProductionReadinessChecklist,
    buildRollbackPlan,
    getCanonicalDocumentRolloutMode,
    shouldRunLegacyGeneration,
    shouldUseCanonicalReads,
    shouldUseCanonicalWrites,
    shouldUseLegacyReadFallback,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentConsolidationService.js')
  const {
    REQUIREMENT_LEVELS,
    REQUIREMENT_STATUSES,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')

  assert.equal(getCanonicalDocumentRolloutMode(), DOCUMENT_ROLLOUT_MODES.legacyPrimary)
  assert.equal(getCanonicalDocumentRolloutMode({ parityMode: true }), DOCUMENT_ROLLOUT_MODES.parity)
  assert.equal(getCanonicalDocumentRolloutMode({ sourceOfTruth: true }), DOCUMENT_ROLLOUT_MODES.canonicalPrimary)
  assert.equal(
    getCanonicalDocumentRolloutMode({
      sourceOfTruth: true,
      legacyGenerationDisabled: true,
      legacyReadsDisabled: true,
    }),
    DOCUMENT_ROLLOUT_MODES.canonicalOnly,
  )

  assert.equal(shouldUseCanonicalReads({ parityMode: true }), true)
  assert.equal(shouldUseCanonicalWrites({ parityMode: true }), false)
  assert.equal(shouldUseCanonicalWrites({ sourceOfTruth: true }), true)
  assert.equal(shouldUseLegacyReadFallback({ sourceOfTruth: true }), true)
  assert.equal(shouldUseLegacyReadFallback({ sourceOfTruth: true, legacyReadsDisabled: true }), false)
  assert.equal(shouldRunLegacyGeneration('seller_document_requirement_engine', { parityMode: true }), true)
  assert.equal(shouldRunLegacyGeneration('seller_document_requirement_engine', { legacyGenerationDisabled: true }), false)
  assert.equal(LEGACY_GENERATION_PATHS.length >= 4, true)

  const canonicalDefinitions = [
    { key: 'signed_mandate' },
    { key: 'seller_id_document' },
    { key: 'bond_statement' },
  ]
  const canonicalInstances = [
    {
      id: 'req-1',
      document_definition_key: 'signed_mandate',
      context_type: 'private_listing',
      context_id: 'listing-1',
      listing_id: 'listing-1',
      pack_key: 'seller_authority',
      requirement_level: REQUIREMENT_LEVELS.blocker,
      status: REQUIREMENT_STATUSES.pending,
      stage_gates: ['mandate_ready'],
      requested_from_role: 'seller',
      requested_from_contact_id: null,
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
    },
    {
      id: 'req-2',
      document_definition_key: 'seller_id_document',
      context_type: 'private_listing',
      context_id: 'listing-1',
      listing_id: 'listing-1',
      pack_key: 'seller_identity_fica',
      requirement_level: REQUIREMENT_LEVELS.required,
      status: REQUIREMENT_STATUSES.approved,
      satisfied_by_document_id: null,
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
    },
    {
      id: 'req-duplicate-a',
      document_definition_key: 'bond_statement',
      context_type: 'private_listing',
      context_id: 'listing-1',
      listing_id: 'listing-1',
      pack_key: 'property_finance_existing_bond',
      requirement_level: REQUIREMENT_LEVELS.required,
      status: REQUIREMENT_STATUSES.requested,
      requested_from_role: 'seller',
      requested_from_contact_id: null,
      visible_to_roles: ['seller'],
      uploadable_by_roles: [],
    },
    {
      id: 'req-duplicate-b',
      document_definition_key: 'bond_statement',
      context_type: 'private_listing',
      context_id: 'listing-1',
      listing_id: 'listing-1',
      pack_key: 'property_finance_existing_bond',
      requirement_level: REQUIREMENT_LEVELS.required,
      status: REQUIREMENT_STATUSES.requested,
      requested_from_role: 'seller',
      requested_from_contact_id: null,
      visible_to_roles: ['seller', 'alien_role'],
      uploadable_by_roles: ['seller'],
    },
    {
      id: 'req-missing-definition',
      document_definition_key: 'missing_definition',
      context_type: 'transaction',
      context_id: 'transaction-1',
      transaction_id: 'transaction-1',
      pack_key: 'attorney_transfer_readiness',
      requirement_level: REQUIREMENT_LEVELS.blocker,
      status: REQUIREMENT_STATUSES.pending,
      stage_gates: ['attorney_instruction_ready'],
      requested_from_role: '',
      visible_to_roles: ['agent'],
      uploadable_by_roles: [],
    },
  ]

  const legacyRequirements = [
    {
      id: 'legacy-1',
      private_listing_id: 'listing-1',
      requirement_key: 'mandate_signature',
      status: 'required',
    },
    {
      id: 'legacy-2',
      private_listing_id: 'listing-1',
      requirement_key: 'id_document',
      status: 'approved',
      canonical_requirement_instance_id: 'req-2',
    },
    {
      id: 'legacy-mystery',
      private_listing_id: 'listing-1',
      requirement_key: 'mystery_legacy_doc',
      status: 'required',
    },
  ]

  const integrity = buildCanonicalDataIntegrityReport({
    canonicalDefinitions,
    canonicalInstances,
    legacyRequirements,
    uploadedDocuments: [
      { id: 'doc-orphan', document_type: 'id_document', private_listing_id: 'listing-1' },
      { id: 'doc-linked', canonical_requirement_instance_id: 'req-2' },
    ],
    packetVersions: [
      { id: 'packet-orphan', packet_type: 'signed_mandate' },
      { id: 'packet-linked', canonical_requirement_instance_id: 'req-1' },
    ],
    documentRequests: [
      { id: 'request-orphan', document_type: 'mandate_signature', status: 'requested' },
      { id: 'request-linked', canonical_requirement_instance_id: 'req-1' },
    ],
    reminders: [
      { id: 'reminder-stale', requirement_instance_id: 'req-2', status: 'scheduled' },
    ],
  })

  assert.deepEqual(
    integrity.canonicalRequirementsWithoutDefinitions.map((item) => item.requirementInstanceId),
    ['req-missing-definition'],
  )
  assert.equal(integrity.duplicateActiveRequirementInstances.length, 1)
  assert.equal(integrity.requirementsWithNoResponsibleUploader.length >= 2, true)
  assert.deepEqual(integrity.approvedRequirementsWithoutSatisfier.map((item) => item.requirementInstanceId), ['req-2'])
  assert.deepEqual(integrity.uploadedDocumentsNotLinkedToRequirements.map((item) => item.documentId), ['doc-orphan'])
  assert.deepEqual(integrity.generatedPacketsNotLinkedToRequirements.map((item) => item.packetVersionId), ['packet-orphan'])
  assert.deepEqual(integrity.documentRequestsNotLinkedToCanonicalReminders.map((item) => item.requestId), ['request-orphan'])
  assert.deepEqual(integrity.staleRemindersForSatisfiedRequirements.map((item) => item.reminderId), ['reminder-stale'])
  assert.deepEqual(integrity.requirementsWithInvalidVisibilityRoles[0].invalidRoles, ['alien_role'])

  const audit = buildLegacyParityAudit({
    canonicalDefinitions,
    canonicalInstances,
    legacyRequirements,
    documentRequests: [{ id: 'request-1', document_type: 'mandate_signature', status: 'requested' }],
    legacyEngineOutputs: {
      sellerDocumentRequirementEngine: [
        { key: 'mandate_signature' },
        { key: 'unknown_legacy_engine_key' },
      ],
    },
  })

  assert.equal(audit.summary.canonicalDefinitionCount, 3)
  assert.equal(audit.summary.unmappedLegacyKeyCount, 1)
  assert.equal(audit.summary.statusConflictCount, 0)
  assert.deepEqual(audit.missingCanonicalMappings, ['mystery_legacy_doc'])
  assert.equal(audit.engineSummaries[0].unmappedKeys.includes('unknown_legacy_engine_key'), true)

  const backfillPlan = buildBackfillPlan({
    canonicalInstances,
    legacyRequirements,
    legacyDocuments: [
      { id: 'doc-mandate', private_listing_id: 'listing-1', requirement_key: 'mandate_signature' },
      { id: 'doc-mystery', private_listing_id: 'listing-1', requirement_key: 'mystery_legacy_doc' },
    ],
    documentRequests: [
      { id: 'request-mandate', private_listing_id: 'listing-1', document_type: 'mandate_signature' },
    ],
    packetVersions: [
      { id: 'packet-mandate', packet_type: 'signed_mandate', private_listing_id: 'listing-1' },
    ],
    dryRun: true,
    minimumConfidence: 80,
  })

  assert.equal(backfillPlan.dryRun, true)
  assert.equal(backfillPlan.summary.destructiveOperations, 0)
  assert.equal(backfillPlan.legacyRequirementLinks.some((item) => item.legacyId === 'legacy-1'), true)
  assert.equal(backfillPlan.documentLinks.some((item) => item.documentId === 'doc-mandate'), true)
  assert.equal(backfillPlan.requestLinks.some((item) => item.documentRequestId === 'request-mandate'), true)
  assert.equal(backfillPlan.manualReview.some((item) => item.documentId === 'doc-mystery'), true)

  const deprecation = buildLegacyGenerationDeprecationReport({
    sourceOfTruth: true,
    legacyGenerationDisabled: true,
  })
  assert.equal(deprecation.every((item) => item.status === 'deprecated_disabled_by_flag'), true)

  const rollback = buildRollbackPlan()
  assert.equal(rollback.steps.some((step) => step.includes('CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH=false')), true)
  assert.equal(rollback.dataSafety.some((step) => step.includes('Legacy tables are not deleted')), true)

  const checklist = buildProductionReadinessChecklist(audit)
  assert.equal(checklist.some((item) => item.key === 'external_reminders_disabled_by_default' && item.passed), true)
  assert.equal(checklist.some((item) => item.key === 'seller_portal_verified' && !item.passed), true)

  console.log('canonical-document-consolidation tests passed')
} finally {
  await server.close()
}
