import { createServer } from 'vite'

function hasArg(name) {
  return process.argv.includes(name)
}

function summarizeRows(rows = [], mapper = (row) => row, limit = 50) {
  return rows.slice(0, limit).map(mapper)
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

async function fetchAll(client, table) {
  const result = await client.from(table).select('*')
  if (result.error) throw result.error
  return result.data || []
}

function cleanPlanItem(item = {}) {
  const { instance, ...rest } = item
  return rest
}

function summarizePlan(plan = {}) {
  return {
    summary: plan.summary,
    safeAutoLinks: {
      count: plan.safeAutoLinks.length,
      byOperation: groupCounts(plan.safeAutoLinks, (row) => row.operation),
      byDocumentKey: groupCounts(plan.safeAutoLinks, (row) => row.documentKey),
      preview: summarizeRows(plan.safeAutoLinks, cleanPlanItem),
    },
    documentLinks: {
      count: plan.documentLinks.length,
      byDocumentKey: groupCounts(plan.documentLinks, (row) => row.documentKey),
      preview: summarizeRows(plan.documentLinks, cleanPlanItem),
    },
    generatedArtifactLinks: {
      count: plan.generatedArtifactLinks.length,
      byDocumentKey: groupCounts(plan.generatedArtifactLinks, (row) => row.documentKey),
      preview: summarizeRows(plan.generatedArtifactLinks, cleanPlanItem),
    },
    documentRequestLinks: {
      count: plan.documentRequestLinks.length,
      byDocumentKey: groupCounts(plan.documentRequestLinks, (row) => row.documentKey),
      preview: summarizeRows(plan.documentRequestLinks, cleanPlanItem),
    },
    legacyProjectionCreates: {
      count: plan.legacyProjectionCreates.length,
      byDocumentKey: groupCounts(plan.legacyProjectionCreates, (row) => row.documentKey),
      preview: summarizeRows(plan.legacyProjectionCreates, cleanPlanItem),
    },
    manualReview: {
      count: plan.manualReview.length,
      byReason: groupCounts(plan.manualReview, (row) => row.reason),
      byLegacyKey: groupCounts(plan.manualReview, (row) => row.legacyKey),
      preview: summarizeRows(plan.manualReview, cleanPlanItem),
    },
  }
}

async function main() {
  const write = hasArg('--write')
  const createReminders = hasArg('--create-reminders') && process.env.CANONICAL_STAGING_LINK_CLEANUP_CREATE_REMINDERS === 'true'
  const confirmed = hasArg('--confirm-staging') && process.env.CANONICAL_STAGING_LINK_CLEANUP_WRITE === 'true'
  if (write && !confirmed) {
    throw new Error('Write mode requires --confirm-staging and CANONICAL_STAGING_LINK_CLEANUP_WRITE=true.')
  }

  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { supabase, isSupabaseConfigured, supabaseUrl } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    const {
      STAGING_LINK_CLEANUP_SOURCE,
      STAGING_LINK_CLEANUP_VERSION,
      buildStagingLinkProjectionCleanupPlan,
      writeStagingLinkProjectionCleanupPlan,
    } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentStagingLinkCleanupService.js')

    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Cannot run staging link/projection cleanup.')
    }

    const [
      canonicalInstances,
      transactionRequiredDocuments,
      documents,
      documentRequests,
      reminders,
      documentPackets,
      packetVersions,
    ] = await Promise.all([
      fetchAll(supabase, 'document_requirement_instances'),
      fetchAll(supabase, 'transaction_required_documents'),
      fetchAll(supabase, 'documents'),
      fetchAll(supabase, 'document_requests'),
      fetchAll(supabase, 'document_requirement_reminders'),
      fetchAll(supabase, 'document_packets'),
      fetchAll(supabase, 'document_packet_versions'),
    ])

    const packetsById = new Map(documentPackets.map((packet) => [packet.id, packet]))
    const mergedPacketVersions = packetVersions.map((version) => ({
      ...version,
      ...(packetsById.get(version.packet_id) || {}),
      id: version.id,
      packet_id: version.packet_id,
    }))

    const plan = buildStagingLinkProjectionCleanupPlan({
      canonicalInstances,
      transactionRequiredDocuments,
      documents,
      documentRequests,
      reminders,
      packetVersions: mergedPacketVersions,
    })
    plan.instancesById = new Map(canonicalInstances.map((instance) => [instance.id, instance]))

    const writeResult = await writeStagingLinkProjectionCleanupPlan({
      client: supabase,
      plan,
      write,
      createReminders,
    })

    const report = {
      mode: write ? 'write' : 'dry_run',
      mutatedData: Boolean(write),
      rolloutModeChanged: false,
      canonicalPrimaryEnabled: false,
      canonicalOnlyEnabled: false,
      externalRemindersEnabled: false,
      hardWorkflowBlocksEnabled: false,
      reminderCreationRequested: Boolean(createReminders),
      sourceSystem: STAGING_LINK_CLEANUP_SOURCE,
      cleanupVersion: STAGING_LINK_CLEANUP_VERSION,
      supabaseProjectRefHint: String(supabaseUrl || '').match(/https:\/\/([^.]+)/)?.[1] || null,
      sourceRowCounts: {
        canonicalInstances: canonicalInstances.length,
        transactionRequiredDocuments: transactionRequiredDocuments.length,
        documents: documents.length,
        documentRequests: documentRequests.length,
        reminders: reminders.length,
        documentPackets: documentPackets.length,
        packetVersions: packetVersions.length,
      },
      dryRunPlan: summarizePlan(plan),
      writeResult,
      controlledWriteCommand: 'CANONICAL_STAGING_LINK_CLEANUP_WRITE=true npm run cleanup:canonical-documents:staging-links -- --write --confirm-staging',
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
