import { createServer } from 'vite'
import { assertCanonicalVerificationDataSource } from './canonical-document-verification-data-guard.mjs'

const TABLES = Object.freeze([
  'document_definitions',
  'document_requirement_rules',
  'document_requirement_instances',
  'private_listing_document_requirements',
  'private_listing_documents',
  'transaction_required_documents',
  'document_requests',
  'documents',
  'document_packets',
  'document_packet_versions',
  'document_requirement_reminders',
])

const MAX_ROWS_PER_TABLE = Number(process.env.CANONICAL_DRY_RUN_MAX_ROWS || 5000)
const SNAPSHOT_RPC = 'canonical_document_verification_snapshot'
const SNAPSHOT_TRANSACTION_ID = normalizeText(process.env.CANONICAL_DRY_RUN_TRANSACTION_ID)
const SNAPSHOT_FIXTURE = normalizeText(process.env.CANONICAL_DRY_RUN_FIXTURE)

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function rowContextId(row = {}) {
  return normalizeText(row.context_id || row.private_listing_id || row.listing_id || row.transaction_id)
}

function rowDocumentKey(row = {}) {
  return normalizeKey(row.document_definition_key || row.requirement_key || row.document_key || row.document_type || row.packet_type || row.category)
}

function summariseRows(rows = [], mapper = (row) => row) {
  return rows.slice(0, 50).map(mapper)
}

function groupCounts(rows = [], keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

async function fetchVerificationSnapshot(client) {
  const params = {
    p_purpose: 'canonical_staging_verification',
    p_max_rows: MAX_ROWS_PER_TABLE,
  }
  if (SNAPSHOT_TRANSACTION_ID) params.p_transaction_id = SNAPSHOT_TRANSACTION_ID
  if (SNAPSHOT_FIXTURE) params.p_fixture = SNAPSHOT_FIXTURE

  const result = await client.rpc(SNAPSHOT_RPC, params)
  if (result.error) return { available: false, error: result.error.message, tables: null }

  const snapshot = result.data || {}
  const tables = {}
  for (const table of TABLES) {
    const rows = Array.isArray(snapshot[table]) ? snapshot[table] : []
    tables[table] = {
      table,
      available: true,
      totalRows: rows.length,
      fetchedRows: rows.length,
      rows,
      error: null,
      source: SNAPSHOT_RPC,
    }
  }
  return { available: true, error: null, tables }
}

async function fetchVerificationTables(client) {
  const snapshot = await fetchVerificationSnapshot(client)
  assertCanonicalVerificationDataSource({
    snapshotAvailable: snapshot.available,
    snapshotError: snapshot.error,
    tables: snapshot.tables,
    scoped: Boolean(SNAPSHOT_TRANSACTION_ID || SNAPSHOT_FIXTURE),
  })
  return snapshot.tables
}

function mergePacketVersionRows(packetVersions = [], packets = []) {
  const packetsById = new Map(packets.map((packet) => [packet.id, packet]))
  return packetVersions.map((version) => {
    const packet = packetsById.get(version.packet_id) || {}
    return {
      ...version,
      packet_type: version.packet_type || packet.packet_type,
      transaction_id: version.transaction_id || packet.transaction_id,
      listing_id: version.listing_id || packet.listing_id,
      context_id: version.context_id || packet.transaction_id || packet.lead_id || packet.deal_id,
      document_packets: packet,
    }
  })
}

function buildProjectionGapReport({ canonicalInstances = [], legacyRequirements = [], adapter }) {
  const activeInstances = canonicalInstances.filter((instance) => instance.status !== 'not_applicable')
  const legacyKeysByContext = new Set(legacyRequirements.map((row) => {
    const contextId = rowContextId(row)
    const key = rowDocumentKey(row)
    return `${contextId}::${key}`
  }))

  return activeInstances
    .map((instance) => {
      const contextIds = [
        instance.context_id,
        instance.listing_id,
        instance.transaction_id,
      ].map(normalizeText).filter(Boolean)
      const legacyKey = adapter.canonicalDefinitionKeyToLegacyKey(instance.document_definition_key)
      const projected = contextIds.some((contextId) => legacyKeysByContext.has(`${contextId}::${legacyKey}`))
      return projected ? null : {
        requirementInstanceId: instance.id,
        documentDefinitionKey: instance.document_definition_key,
        expectedLegacyKey: legacyKey,
        contextType: instance.context_type,
        contextId: instance.context_id,
        listingId: instance.listing_id,
        transactionId: instance.transaction_id,
        status: instance.status,
      }
    })
    .filter(Boolean)
}

function classifyBackfill(plan = {}) {
  const all = [
    ...plan.legacyRequirementLinks,
    ...plan.documentLinks,
    ...plan.requestLinks,
    ...plan.packetLinks,
  ]
  const safeAuto = all.filter((item) => item.confidence >= 90)
  const review = [...plan.manualReview, ...all.filter((item) => item.confidence < 90)]
  return {
    plannedLinks: all.length,
    safeAutoLinkCount: safeAuto.length,
    manualReviewCount: review.length,
    byOperation: groupCounts(all, (item) => item.operation),
    safeAutoLinkPreview: summariseRows(safeAuto, (item) => ({
      operation: item.operation,
      legacyId: item.legacyId || item.documentId || item.documentRequestId || item.packetVersionId || null,
      canonicalRequirementInstanceId: item.canonicalRequirementInstanceId,
      confidence: item.confidence,
      matchReason: item.strategy,
      safeToAutoLink: item.confidence >= 90,
      manualReviewNeeded: false,
    })),
    manualReviewPreview: summariseRows(review, (item) => ({
      operation: item.operation,
      legacyId: item.legacyId || item.documentId || item.documentRequestId || item.packetVersionId || null,
      canonicalRequirementInstanceId: item.canonicalRequirementInstanceId || null,
      confidence: item.confidence || 0,
      matchReason: item.strategy || item.reason || 'unmatched',
      safeToAutoLink: false,
      manualReviewNeeded: true,
      reason: item.reason || null,
    })),
  }
}

async function main() {
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    const consolidation = await server.ssrLoadModule('/src/services/documents/canonicalDocumentConsolidationService.js')
    const adapter = await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')

    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Cannot run real staging dry-run parity verification.')
    }

    const tables = await fetchVerificationTables(supabase)
    const rows = Object.fromEntries(Object.entries(tables).map(([table, result]) => [table, result.rows || []]))

    const canonicalDefinitions = rows.document_definitions
    const canonicalInstances = rows.document_requirement_instances
    const legacyPrivateRequirements = rows.private_listing_document_requirements.map((row) => ({ ...row, legacy_table: 'private_listing_document_requirements' }))
    const legacyTransactionRequirements = rows.transaction_required_documents.map((row) => ({ ...row, legacy_table: 'transaction_required_documents' }))
    const documentRequests = rows.document_requests
    const legacyRequirements = [
      ...legacyPrivateRequirements,
      ...legacyTransactionRequirements,
    ]
    const packetVersions = mergePacketVersionRows(rows.document_packet_versions, rows.document_packets)

    const parity = consolidation.buildLegacyParityAudit({
      canonicalDefinitions,
      canonicalInstances,
      legacyRequirements,
      legacyDocuments: rows.private_listing_documents,
      documentRequests,
      documents: rows.documents,
      packetVersions,
      reminders: rows.document_requirement_reminders,
    })

    const integrity = consolidation.buildCanonicalDataIntegrityReport({
      canonicalDefinitions,
      canonicalInstances,
      legacyRequirements: [...legacyRequirements, ...documentRequests],
      uploadedDocuments: [...rows.documents, ...rows.private_listing_documents],
      packetVersions,
      documentRequests,
      reminders: rows.document_requirement_reminders,
    })

    const backfillPlan = consolidation.buildBackfillPlan({
      canonicalInstances,
      legacyRequirements,
      legacyDocuments: [...rows.private_listing_documents, ...rows.documents],
      documentRequests,
      packetVersions,
      dryRun: true,
      minimumConfidence: 80,
    })
    const backfillSummary = classifyBackfill(backfillPlan)
    const projectionGaps = buildProjectionGapReport({
      canonicalInstances,
      legacyRequirements,
      adapter,
    })

    const tableSummary = Object.fromEntries(TABLES.map((table) => [table, {
      available: tables[table].available,
      totalRows: tables[table].totalRows,
      fetchedRows: tables[table].fetchedRows,
      truncated: Boolean(tables[table].truncated),
      error: tables[table].error || null,
    }]))

    const critical = {
      unmappedLegacyKeys: parity.missingCanonicalMappings || [],
      duplicateActiveCanonicalRequirements: integrity.duplicateActiveRequirementInstances || [],
      statusConflicts: parity.statusConflicts || [],
      orphanUploadedDocuments: integrity.uploadedDocumentsNotLinkedToRequirements || [],
      invalidRoleIssues: integrity.requirementsWithInvalidVisibilityRoles || [],
      impossibleWorkflowBlockers: integrity.workflowGatesBlockedByImpossibleRules || [],
    }

    const recommendation = (
      critical.unmappedLegacyKeys.length === 0 &&
      critical.duplicateActiveCanonicalRequirements.length === 0 &&
      critical.statusConflicts.length === 0 &&
      critical.invalidRoleIssues.length === 0 &&
      critical.impossibleWorkflowBlockers.length === 0
    )
      ? 'proceed_to_browser_level_staging_verification_after_manual_review_of_backfill_report'
      : 'fix_real_staging_parity_issues_before_browser_level_verification'

    const report = {
      verificationScope: 'real_staging_supabase_dry_run_report_only',
      mutatedData: false,
      rolloutModeChanged: false,
      externalRemindersEnabled: false,
      hardWorkflowBlocksEnabled: false,
      maxRowsPerTable: MAX_ROWS_PER_TABLE,
      dataSource: SNAPSHOT_RPC,
      snapshotRpcError: null,
      tablesInspected: TABLES,
      rowCounts: tableSummary,
      paritySummary: parity.summary,
      legacyRowsWithoutCanonicalMatch: {
        count: integrity.legacyRowsWithoutCanonicalInstance.length,
        byKey: groupCounts(integrity.legacyRowsWithoutCanonicalInstance, (row) => row.legacyKey),
        preview: summariseRows(integrity.legacyRowsWithoutCanonicalInstance),
      },
      canonicalInstancesWithoutLegacyProjection: {
        count: projectionGaps.length,
        byKey: groupCounts(projectionGaps, (row) => row.documentDefinitionKey),
        preview: summariseRows(projectionGaps),
      },
      duplicateActiveCanonicalRequirements: {
        count: integrity.duplicateActiveRequirementInstances.length,
        preview: summariseRows(integrity.duplicateActiveRequirementInstances),
      },
      orphanUploadedDocuments: {
        count: integrity.uploadedDocumentsNotLinkedToRequirements.length,
        byDocumentType: groupCounts(integrity.uploadedDocumentsNotLinkedToRequirements, (row) => row.documentType),
        preview: summariseRows(integrity.uploadedDocumentsNotLinkedToRequirements),
      },
      unlinkedGeneratedPackets: {
        count: integrity.generatedPacketsNotLinkedToRequirements.length,
        preview: summariseRows(integrity.generatedPacketsNotLinkedToRequirements),
      },
      documentRequestReminderMismatches: {
        count: integrity.documentRequestsNotLinkedToCanonicalReminders.length,
        byDocumentType: groupCounts(integrity.documentRequestsNotLinkedToCanonicalReminders, (row) => row.documentType),
        preview: summariseRows(integrity.documentRequestsNotLinkedToCanonicalReminders),
      },
      approvedCompletedRequirementsWithoutSatisfiers: {
        count: integrity.approvedRequirementsWithoutSatisfier.length,
        byKey: groupCounts(integrity.approvedRequirementsWithoutSatisfier, (row) => row.documentDefinitionKey),
        preview: summariseRows(integrity.approvedRequirementsWithoutSatisfier),
      },
      missingResponsibleUploaderIssues: {
        count: integrity.requirementsWithNoResponsibleUploader.length,
        byKey: groupCounts(integrity.requirementsWithNoResponsibleUploader, (row) => row.documentDefinitionKey),
        preview: summariseRows(integrity.requirementsWithNoResponsibleUploader),
      },
      invalidRolePermissionIssues: {
        count: integrity.requirementsWithInvalidVisibilityRoles.length,
        preview: summariseRows(integrity.requirementsWithInvalidVisibilityRoles),
      },
      staleRemindersForSatisfiedRequirements: {
        count: integrity.staleRemindersForSatisfiedRequirements.length,
        preview: summariseRows(integrity.staleRemindersForSatisfiedRequirements),
      },
      workflowGateIntegrityIssues: {
        count: integrity.workflowGatesBlockedByImpossibleRules.length,
        preview: summariseRows(integrity.workflowGatesBlockedByImpossibleRules),
      },
      backfillPlanSummary: backfillSummary,
      manualReviewList: backfillSummary.manualReviewPreview,
      criticalChecks: {
        unmappedLegacyKeyCount: critical.unmappedLegacyKeys.length,
        duplicateActiveCanonicalRequirementCount: critical.duplicateActiveCanonicalRequirements.length,
        statusConflictCount: critical.statusConflicts.length,
        orphanUploadedDocumentCount: critical.orphanUploadedDocuments.length,
        invalidRoleIssueCount: critical.invalidRoleIssues.length,
        impossibleWorkflowBlockerCount: critical.impossibleWorkflowBlockers.length,
      },
      recommendation,
    }

    console.log(safeJson(report))
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
