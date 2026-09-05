import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { evaluateDocumentTrustOperationalAssurance } from '../src/services/documentTrustOperationalAssuranceService.js'

const DEFAULT_OUTPUT = 'output/document-trust-phase6-operational-assurance.json'

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')]
    }))
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: '.env.staging.local',
    output: DEFAULT_OUTPUT,
    phase4Enabled: false,
    requirePhase4: false,
    failOnIssues: false,
    pilotId: '',
  }
  for (const arg of argv) {
    if (arg === '--phase4-enabled') options.phase4Enabled = true
    else if (arg === '--require-phase4') options.requirePhase4 = true
    else if (arg === '--fail-on-issues') options.failOnIssues = true
    else if (arg.startsWith('--env-file=')) options.envFile = arg.slice('--env-file='.length)
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--pilot-id=')) options.pilotId = arg.slice('--pilot-id='.length)
  }
  return options
}

function requireEnv(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('A Supabase URL and service-role key are required for this read-only assurance report.')
  return { url, key }
}

async function query(client, label, query, fallback = []) {
  const result = await query
  if (result.error) throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  return result.data ?? fallback
}

function chunks(items, size = 200) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

async function fetchReferencedCanonicalDocuments(client, requirements = []) {
  const requirementIds = [...new Set(requirements.map((row) => String(row?.id || '').trim()).filter(Boolean))]
  const satisfiedDocumentIds = [...new Set(requirements
    .map((row) => String(row?.satisfied_by_document_id || row?.satisfiedByDocumentId || '').trim())
    .filter(Boolean))]
  const rows = []
  for (const ids of chunks(requirementIds)) {
    rows.push(...await query(
      client,
      'documents by canonical requirement',
      client.from('documents').select('id, canonical_requirement_instance_id').in('canonical_requirement_instance_id', ids),
      [],
    ))
  }
  for (const ids of chunks(satisfiedDocumentIds)) {
    rows.push(...await query(
      client,
      'documents by satisfied document id',
      client.from('documents').select('id, canonical_requirement_instance_id').in('id', ids),
      [],
    ))
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}

async function fetchRows(client, table, select) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; from < 5000; from += pageSize) {
    const page = await query(
      client,
      table,
      client.from(table).select(select).range(from, from + pageSize - 1),
      [],
    )
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

async function fetchRowsForTransactions(client, table, select, transactionIds = []) {
  const rows = []
  for (const ids of chunks(transactionIds)) {
    rows.push(...await query(
      client,
      `${table} for active buyer portals`,
      client.from(table).select(select).in('transaction_id', ids),
      [],
    ))
  }
  return rows
}

async function main() {
  const options = parseArgs()
  if (options.requirePhase4 && !options.phase4Enabled) {
    throw new Error('--require-phase4 requires --phase4-enabled.')
  }
  const env = { ...parseEnv(options.envFile), ...process.env }
  const { url, key } = requireEnv(env)
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const portalLinks = await fetchRows(
    client,
    'client_portal_links',
    'transaction_id, is_active',
  )
  const activeBuyerPortalTransactionIds = [...new Set(portalLinks
    .filter((link) => link?.is_active !== false)
    .map((link) => String(link?.transaction_id || '').trim())
    .filter(Boolean))]
  const requirements = await fetchRowsForTransactions(
    client,
    'document_requirement_instances',
    'id, transaction_id, status, satisfied_by_document_id',
    activeBuyerPortalTransactionIds,
  )
  const legacyRequiredDocuments = await fetchRowsForTransactions(
    client,
    'transaction_required_documents',
    'id, transaction_id, enabled, canonical_requirement_instance_id',
    activeBuyerPortalTransactionIds,
  )
  const pilot = options.pilotId
    ? await query(
        client,
        'transaction_bond_originator_one_originator_pilots',
        client.from('transaction_bond_originator_one_originator_pilots').select('*').eq('id', options.pilotId).maybeSingle(),
        null,
      )
    : null
  const referencedDocuments = await fetchReferencedCanonicalDocuments(client, requirements)
  const report = evaluateDocumentTrustOperationalAssurance({
    canonicalRequirements: requirements,
    documents: referencedDocuments,
    legacyRequiredDocuments,
    phase4Enabled: options.phase4Enabled,
    phase5Pilot: pilot,
  })
  const output = {
    ...report,
    run: {
      readOnly: true,
      phase4EnabledAsserted: options.phase4Enabled,
      pilotId: options.pilotId || null,
      activeBuyerPortalTransactionCount: activeBuyerPortalTransactionIds.length,
      source: 'active client_portal_links + document_requirement_instances + documents + transaction_required_documents',
    },
  }
  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({ status: output.status, issueCount: output.summary.issueCount, output: options.output }))
  if (options.failOnIssues && output.status !== 'healthy') process.exitCode = 2
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
