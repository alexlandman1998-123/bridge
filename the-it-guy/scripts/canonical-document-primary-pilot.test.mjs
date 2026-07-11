import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { loadCanonicalVerificationSnapshot } from './canonical-document-verification-snapshot.mjs'

const TRANSACTION_ID = '5db513ad-5736-46fe-bd8f-6b298d1d791d'
const REFERENCE = 'CANONICAL-DOC-TEST-001'

const expectedPacketMappings = [
  ['generated_mandate', 'generated_mandate'],
  ['signed_mandate', 'mandate_signature'],
  ['generated_otp', 'generated_otp'],
  ['signed_otp', 'otp'],
  ['transfer_documents', 'transfer_documents'],
  ['signed_transfer_documents', 'signed_transfer_pack'],
  ['signed_packet_version', 'final_signed_packet'],
  ['signed_addendum', 'signed_addendum'],
]

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const consolidation = await server.ssrLoadModule('/src/services/documents/canonicalDocumentConsolidationService.js')
  const gates = await server.ssrLoadModule('/src/services/documents/canonicalWorkflowGateService.js')
  const reminders = await server.ssrLoadModule('/src/services/documents/canonicalDocumentReminderService.js')
  const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')

  assert.ok(isSupabaseConfigured && supabase, 'Supabase must be configured for scoped canonical_primary pilot verification')

  const pilotOptions = {
    transactionId: TRANSACTION_ID,
    canonicalPrimaryTransactionAllowlist: [TRANSACTION_ID],
  }
  const globalPilotOptions = {
    sourceOfTruth: true,
    transactionId: TRANSACTION_ID,
  }
  const nonPilotOptions = {
    transactionId: '00000000-0000-4000-8000-000000000000',
    canonicalPrimaryTransactionAllowlist: [TRANSACTION_ID],
  }
  const rollbackOptions = {
    sourceOfTruth: false,
    transactionId: TRANSACTION_ID,
    canonicalPrimaryTransactionAllowlist: [],
  }

  const defaultMode = consolidation.getCanonicalDocumentRolloutMode()
  assert.notEqual(consolidation.getCanonicalDocumentRolloutMode(), consolidation.DOCUMENT_ROLLOUT_MODES.canonicalOnly)
  assert.equal(consolidation.getCanonicalDocumentRolloutMode(globalPilotOptions), consolidation.DOCUMENT_ROLLOUT_MODES.canonicalPrimary)
  assert.equal(consolidation.shouldUseCanonicalReads(globalPilotOptions), true)
  assert.equal(consolidation.shouldUseCanonicalWrites(globalPilotOptions), true)
  assert.equal(consolidation.shouldUseLegacyReadFallback(globalPilotOptions), true)
  assert.equal(consolidation.getCanonicalDocumentRolloutMode(pilotOptions), consolidation.DOCUMENT_ROLLOUT_MODES.canonicalPrimary)
  assert.equal(consolidation.shouldUseCanonicalReads(pilotOptions), true)
  assert.equal(consolidation.shouldUseCanonicalWrites(pilotOptions), true)
  assert.equal(consolidation.shouldUseLegacyReadFallback(pilotOptions), true)
  assert.ok(
    [
      consolidation.DOCUMENT_ROLLOUT_MODES.legacyPrimary,
      consolidation.DOCUMENT_ROLLOUT_MODES.canonicalPrimary,
    ].includes(consolidation.getCanonicalDocumentRolloutMode(nonPilotOptions)),
    'non-pilot transaction may remain legacy in scoped mode or become canonical_primary when global source-of-truth is enabled',
  )
  assert.equal(consolidation.getCanonicalDocumentRolloutMode(rollbackOptions), consolidation.DOCUMENT_ROLLOUT_MODES.legacyPrimary)
  assert.equal(consolidation.isLegacyDocumentGenerationDisabled(), false)
  assert.equal(consolidation.areLegacyDocumentReadsDisabled(), false)
  assert.equal(gates.areCanonicalWorkflowGateHardBlocksEnabled(), false)
  assert.equal(reminders.areCanonicalEmailRemindersEnabled(), false)
  assert.equal(reminders.areCanonicalWhatsappRemindersEnabled(), false)

  const data = await loadCanonicalVerificationSnapshot(supabase)

  const transactions = data.transactions || []
  const definitions = data.document_definitions || []
  const requirements = data.document_requirement_instances || []
  const legacyRequirements = data.transaction_required_documents || []
  const documents = data.documents || []
  const packets = data.document_packets || []
  const versions = data.document_packet_versions || []

  const fixtureTransaction = transactions.find((row) => row.id === TRANSACTION_ID)
  if (transactions.length) {
    assert.equal(fixtureTransaction?.reference, REFERENCE, 'pilot fixture transaction reference should match')
  }

  const definitionKeys = new Set(definitions.map((row) => row.key))
  const fixtureRequirements = requirements.filter((row) =>
    row.transaction_id === TRANSACTION_ID ||
    (row.context_type === 'transaction' && row.context_id === TRANSACTION_ID)
  )
  assert.ok(fixtureRequirements.length > 0, 'pilot fixture should have canonical requirements')
  assert.deepEqual(
    fixtureRequirements.filter((row) => !definitionKeys.has(row.document_definition_key)).map((row) => row.id),
    [],
    'pilot fixture canonical requirements should all have definitions',
  )

  const duplicateReport = consolidation.buildCanonicalDataIntegrityReport({
    canonicalDefinitions: definitions,
    canonicalInstances: fixtureRequirements,
    legacyRequirements: legacyRequirements.filter((row) => row.transaction_id === TRANSACTION_ID),
    uploadedDocuments: documents.filter((row) => row.transaction_id === TRANSACTION_ID),
    packetVersions: versions.filter((row) => packets.some((packet) => packet.id === row.packet_id && packet.transaction_id === TRANSACTION_ID)),
    documentRequests: [],
    reminders: [],
  })
  assert.deepEqual(duplicateReport.duplicateActiveRequirementInstances, [], 'pilot fixture should not have duplicate active canonical instances')
  assert.deepEqual(duplicateReport.approvedRequirementsWithoutSatisfier, [], 'pilot fixture should not have approved/completed requirements without satisfiers')

  const fixtureDocuments = documents.filter((row) => row.transaction_id === TRANSACTION_ID)
  assert.deepEqual(
    fixtureDocuments.filter((row) => !row.canonical_requirement_instance_id).map((row) => row.id),
    [],
    'pilot fixture uploaded documents should be canonical-linked',
  )

  const fixturePackets = packets.filter((packet) =>
    packet.transaction_id === TRANSACTION_ID &&
    packet.source_context_json?.fixture === 'canonical_packet_fixture_v1'
  )
  const fixtureVersions = versions.filter((version) =>
    fixturePackets.some((packet) => packet.id === version.packet_id)
  )
  assert.equal(fixturePackets.length, expectedPacketMappings.length, 'pilot fixture should include all generated/signed packet rows')
  assert.equal(fixtureVersions.length, expectedPacketMappings.length, 'pilot fixture should include all generated/signed packet versions')

  for (const [canonicalKey, legacyKey] of expectedPacketMappings) {
    const requirement = fixtureRequirements.find((row) => row.document_definition_key === canonicalKey)
    assert.ok(requirement, `${canonicalKey} requirement should exist for scoped pilot`)
    assert.equal(requirement.status, 'completed', `${canonicalKey} should be completed for scoped pilot`)
    assert.ok(requirement.satisfied_by_packet_id, `${canonicalKey} should have a packet satisfier`)
    assert.ok(requirement.satisfied_by_packet_version_id, `${canonicalKey} should have a packet version satisfier`)

    const packet = fixturePackets.find((row) => row.id === requirement.satisfied_by_packet_id)
    const version = fixtureVersions.find((row) => row.id === requirement.satisfied_by_packet_version_id)
    assert.ok(packet, `${canonicalKey} packet should be scoped to disposable fixture`)
    assert.ok(version, `${canonicalKey} packet version should be scoped to disposable fixture`)
    assert.equal(packet.canonical_requirement_instance_id, requirement.id, `${canonicalKey} packet should link back to requirement`)
    assert.equal(version.canonical_requirement_instance_id, requirement.id, `${canonicalKey} packet version should link back to requirement`)

    const projection = legacyRequirements.find((row) =>
      row.transaction_id === TRANSACTION_ID &&
      row.document_key === legacyKey
    )
    assert.ok(projection, `${canonicalKey} should have legacy projection ${legacyKey}`)
    assert.equal(projection.canonical_requirement_instance_id, requirement.id, `${canonicalKey} projection should link to canonical requirement`)
    assert.equal(projection.status, 'accepted', `${canonicalKey} projection should be accepted`)
    assert.equal(projection.is_uploaded, true, `${canonicalKey} projection should be marked uploaded`)
  }

  assert.deepEqual(
    fixturePackets.filter((packet) => !packet.canonical_requirement_instance_id).map((packet) => packet.id),
    [],
    'pilot fixture should not have loose packet artifacts',
  )

  const gateSummary = gates.getGateStatusSummaryFromRequirements(fixtureRequirements)
  assert.equal(gateSummary.gates.length > 0, true)
  assert.equal(gateSummary.gates.every((gate) => gate.canAdvance), true, 'hard-block-disabled pilot gates should remain non-blocking')

  const report = {
    pilotScope: {
      transactionId: TRANSACTION_ID,
      reference: REFERENCE,
    },
    rollout: {
      defaultMode,
      globalPilotMode: consolidation.getCanonicalDocumentRolloutMode(globalPilotOptions),
      scopedMode: consolidation.getCanonicalDocumentRolloutMode(pilotOptions),
      nonPilotMode: consolidation.getCanonicalDocumentRolloutMode(nonPilotOptions),
      rollbackMode: consolidation.getCanonicalDocumentRolloutMode(rollbackOptions),
      legacyFallbackAvailable: consolidation.shouldUseLegacyReadFallback(globalPilotOptions),
      legacyGenerationDisabled: consolidation.isLegacyDocumentGenerationDisabled(),
      legacyReadsDisabled: consolidation.areLegacyDocumentReadsDisabled(),
      canonicalOnlyDisabledForOperationalPilot: defaultMode !== consolidation.DOCUMENT_ROLLOUT_MODES.canonicalOnly,
    },
    safety: {
      hardBlocksEnabled: gates.areCanonicalWorkflowGateHardBlocksEnabled(),
      emailRemindersEnabled: reminders.areCanonicalEmailRemindersEnabled(),
      whatsappRemindersEnabled: reminders.areCanonicalWhatsappRemindersEnabled(),
    },
    fixture: {
      canonicalRequirementCount: fixtureRequirements.length,
      uploadedDocumentCount: fixtureDocuments.length,
      packetCount: fixturePackets.length,
      packetVersionCount: fixtureVersions.length,
      duplicateActiveRequirementCount: duplicateReport.duplicateActiveRequirementInstances.length,
      approvedCompletedWithoutSatisfierCount: duplicateReport.approvedRequirementsWithoutSatisfier.length,
      gateSummary: {
        ready: gateSummary.ready.length,
        warnings: gateSummary.warnings.length,
        blocked: gateSummary.blocked.length,
        notApplicable: gateSummary.notApplicable.length,
      },
    },
  }

  console.log(JSON.stringify(report, null, 2))
  console.log('canonical-document-primary-pilot tests passed')
} finally {
  await server.close()
}
