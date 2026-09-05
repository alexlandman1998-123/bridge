import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildDocumentTrustPhase61ReviewQueue } from '../src/services/documentTrustPhase61RemediationService.js'

const DEFAULT_OUTPUT = 'output/document-trust-phase61-confirmed-remediation.json'

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    }))
}

function parsePair(value, flag) {
  const [left, right, ...extra] = String(value || '').split(':').map((item) => item.trim())
  if (!left || !right || extra.length) throw new Error(`${flag} must be <left-uuid>:<right-uuid>.`)
  return [left, right]
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { envFile: '.env.staging.local', output: DEFAULT_OUTPUT, apply: false, confirmed: false, actorReference: '', requirementDocuments: [], legacyRequirements: [] }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--confirm-phase61-remediation') options.confirmed = true
    else if (arg.startsWith('--env-file=')) options.envFile = arg.slice('--env-file='.length)
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--actor-reference=')) options.actorReference = arg.slice('--actor-reference='.length).trim()
    else if (arg.startsWith('--requirement-document=')) options.requirementDocuments.push(parsePair(arg.slice('--requirement-document='.length), '--requirement-document'))
    else if (arg.startsWith('--legacy-requirement=')) options.legacyRequirements.push(parsePair(arg.slice('--legacy-requirement='.length), '--legacy-requirement'))
  }
  return options
}

function assertOptions(options) {
  const mutationCount = options.requirementDocuments.length + options.legacyRequirements.length
  if (options.apply && !options.confirmed) throw new Error('--apply requires --confirm-phase61-remediation.')
  if (options.apply && !options.actorReference) throw new Error('--apply requires --actor-reference=<change-or-ticket-reference>.')
  if (options.apply && mutationCount === 0) throw new Error('--apply requires at least one explicit remediation pair.')
  if (!options.apply && mutationCount > 0) throw new Error('Explicit remediation pairs require --apply and --confirm-phase61-remediation.')
}

function requireEnv(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('A Supabase URL and service-role key are required for Phase 6.1.')
  return { url, key }
}

async function query(label, request, fallback = []) {
  const result = await request
  if (result.error) throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  return result.data ?? fallback
}

function chunks(items, size = 200) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

async function fetchActivePortalTransactionIds(client) {
  const links = await query('client_portal_links', client.from('client_portal_links').select('transaction_id, is_active'))
  return [...new Set(links.filter((link) => link.is_active !== false).map((link) => String(link.transaction_id || '').trim()).filter(Boolean))]
}

async function fetchByTransactions(client, table, select, transactionIds) {
  const rows = []
  for (const ids of chunks(transactionIds)) {
    rows.push(...await query(table, client.from(table).select(select).in('transaction_id', ids)))
  }
  return rows
}

async function fetchSatisfiedDocuments(client, requirements) {
  const ids = [...new Set(requirements.map((row) => String(row.satisfied_by_document_id || '').trim()).filter(Boolean))]
  const rows = []
  for (const batch of chunks(ids)) {
    rows.push(...await query('documents', client.from('documents').select('id, transaction_id, canonical_requirement_instance_id').in('id', batch)))
  }
  return rows
}

async function loadQueue(client) {
  const transactionIds = await fetchActivePortalTransactionIds(client)
  const [canonicalRequirements, legacyRequiredDocuments] = await Promise.all([
    fetchByTransactions(client, 'document_requirement_instances', 'id, transaction_id, status, satisfied_by_document_id', transactionIds),
    fetchByTransactions(client, 'transaction_required_documents', 'id, transaction_id, enabled, canonical_requirement_instance_id', transactionIds),
  ])
  const documents = await fetchSatisfiedDocuments(client, canonicalRequirements)
  return {
    transactionIds,
    canonicalRequirements,
    documents,
    legacyRequiredDocuments,
    queue: buildDocumentTrustPhase61ReviewQueue({ canonicalRequirements, documents, legacyRequiredDocuments }),
  }
}

function ensureSelectedItemsAreQueued(queue, options) {
  const requirementIds = new Set(queue.queue.filter((item) => item.type === 'requirement_document_link').map((item) => item.requirementInstanceId))
  const legacyIds = new Set(queue.queue.filter((item) => item.type === 'legacy_requirement_link').map((item) => item.legacyRequiredDocumentId))
  for (const [requirementId] of options.requirementDocuments) {
    if (!requirementIds.has(requirementId)) throw new Error(`Requirement ${requirementId} is not currently a Phase 6.1 review item.`)
  }
  for (const [legacyId] of options.legacyRequirements) {
    if (!legacyIds.has(legacyId)) throw new Error(`Legacy row ${legacyId} is not currently a Phase 6.1 review item.`)
  }
}

async function applyExplicitRemediations(client, options, queue) {
  ensureSelectedItemsAreQueued(queue, options)
  const results = []
  for (const [requirementInstanceId, documentId] of options.requirementDocuments) {
    const result = await query('confirmed requirement/document remediation', client.rpc(
      'bridge_document_trust_phase61_link_requirement_document',
      { p_requirement_instance_id: requirementInstanceId, p_document_id: documentId, p_actor_reference: options.actorReference },
    ), null)
    results.push({ type: 'requirement_document_link', requirementInstanceId, documentId, result })
  }
  for (const [legacyRequiredDocumentId, requirementInstanceId] of options.legacyRequirements) {
    const result = await query('confirmed legacy/requirement remediation', client.rpc(
      'bridge_document_trust_phase61_link_legacy_required_document',
      { p_legacy_required_document_id: legacyRequiredDocumentId, p_requirement_instance_id: requirementInstanceId, p_actor_reference: options.actorReference },
    ), null)
    results.push({ type: 'legacy_requirement_link', legacyRequiredDocumentId, requirementInstanceId, result })
  }
  return results
}

async function main() {
  const options = parseArgs()
  assertOptions(options)
  const { url, key } = requireEnv({ ...parseEnv(options.envFile), ...process.env })
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const before = await loadQueue(client)
  const applied = options.apply ? await applyExplicitRemediations(client, options, before) : []
  const after = options.apply ? await loadQueue(client) : before
  const receipt = {
    version: 'document-trust-phase61-confirmed-remediation-receipt-v1',
    generatedAt: new Date().toISOString(),
    dryRun: !options.apply,
    mutatedData: options.apply,
    scope: { activeBuyerPortalTransactionCount: before.transactionIds.length },
    safety: before.queue.safety,
    actorReference: options.apply ? options.actorReference : null,
    before: before.queue,
    applied,
    after: after.queue,
  }
  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(JSON.stringify({ dryRun: receipt.dryRun, applied: applied.length, remaining: after.queue.summary.total, output: options.output }))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
