import { createServer } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV_FILES = ['.env.staging.local', '.env.production.local', '.env']

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

function normalizeText(value) {
  return String(value || '').trim()
}

function parseEnvLine(line = '') {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (!match) return null

  let value = match[2].trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return [match[1], value.replace(/\\n/g, '\n')]
}

function loadRuntimeEnv() {
  const fileEnv = {}
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line)
      if (parsed) fileEnv[parsed[0]] = parsed[1]
    }
  }
  return { ...fileEnv, ...process.env }
}

function decodeJwtPayload(token = '') {
  try {
    const [, payload = ''] = String(token).split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function createServiceRoleClient() {
  const env = loadRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const role = normalizeText(decodeJwtPayload(serviceRoleKey)?.role).toLowerCase()

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for staging cleanup.')
  }
  if (role !== 'service_role') {
    throw new Error('CANONICAL staging cleanup requires a Supabase service_role key, not an anon/frontend key.')
  }

  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    supabaseUrl,
  }
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
    const {
      STAGING_LINK_CLEANUP_SOURCE,
      STAGING_LINK_CLEANUP_VERSION,
      buildStagingLinkProjectionCleanupPlan,
      writeStagingLinkProjectionCleanupPlan,
    } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentStagingLinkCleanupService.js')
    const { client: supabase, supabaseUrl } = createServiceRoleClient()

    const [
      canonicalInstances,
      transactions,
      transactionRequiredDocuments,
      documents,
      documentRequests,
      reminders,
      documentPackets,
      packetVersions,
    ] = await Promise.all([
      fetchAll(supabase, 'document_requirement_instances'),
      fetchAll(supabase, 'transactions'),
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
      transactions,
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
      accessMode: 'service_role_admin',
      sourceSystem: STAGING_LINK_CLEANUP_SOURCE,
      cleanupVersion: STAGING_LINK_CLEANUP_VERSION,
      supabaseProjectRefHint: String(supabaseUrl || '').match(/https:\/\/([^.]+)/)?.[1] || null,
      sourceRowCounts: {
        canonicalInstances: canonicalInstances.length,
        transactions: transactions.length,
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
