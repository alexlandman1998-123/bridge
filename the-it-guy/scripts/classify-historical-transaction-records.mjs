#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  HISTORICAL_TRANSACTION_CLASSIFIER_VERSION,
  classifyHistoricalTransaction,
  findHistoricalHandoverIssues,
  summarizeHistoricalClassifications,
} from './lib/historicalTransactionClassifier.mjs'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PAGE_SIZE = 500
const scriptPath = fileURLToPath(import.meta.url)

function readEnv(fileName) {
  const target = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(target)) return {}
  return Object.fromEntries(
    fs.readFileSync(target, 'utf8').split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { confirmProductionReadOnly: false, includeInactive: false, output: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--confirm-production-read-only') args.confirmProductionReadOnly = true
    else if (token === '--include-inactive') args.includeInactive = true
    else if (token === '--output') args.output = argv[++index] || ''
    else if (['--apply', '--commit', '--write'].includes(token)) {
      throw new Error(`${token} is not supported. This classifier is permanently read-only.`)
    } else throw new Error(`Unknown argument: ${token}`)
  }
  return args
}

async function fetchAll(client, table, select, configure = (query) => query) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = configure(client.from(table).select(select).range(from, from + PAGE_SIZE - 1))
    const result = await query
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if ((result.data || []).length < PAGE_SIZE) return rows
  }
}

function mapById(rows = []) {
  return new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]))
}

function groupByTransaction(rows = []) {
  const grouped = new Map()
  for (const row of rows) {
    if (!row?.transaction_id) continue
    if (!grouped.has(row.transaction_id)) grouped.set(row.transaction_id, [])
    grouped.get(row.transaction_id).push(row)
  }
  return grouped
}

function uniqueIds(rows, key) {
  return [...new Set(rows.map((row) => row?.[key]).filter(Boolean))]
}

async function fetchByIds(client, table, select, ids) {
  if (!ids.length) return []
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const result = await client.from(table).select(select).in('id', ids.slice(offset, offset + 200))
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    rows.push(...(result.data || []))
  }
  return rows
}

function guardProductionReadOnly(env, args) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!args.confirmProductionReadOnly) {
    throw new Error('Pass --confirm-production-read-only to run the guarded production audit.')
  }
  if (!url || new URL(url).hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error('Refusing to run outside the canonical production Supabase project.')
  }
  if (!serviceKey) throw new Error('A production service-role key is required for the read-only audit.')
  return { url, serviceKey }
}

export async function runHistoricalTransactionClassification({ client, includeInactive = false, generatedAt = new Date().toISOString() } = {}) {
  const transactions = await fetchAll(
    client,
    'transactions',
    'id, is_active, is_demo_data, demo_metadata, transaction_type, finance_type, creation_status, organisation_id, development_id, unit_id, buyer_id, listing_id, transaction_reference, platform_reference, matter_number, next_action, comment, notes, client_name, buyer_name, purchaser_name, assigned_agent_email, assigned_attorney_email, assigned_bond_originator_email, seller_email, development_name, unit_number, listing_title, property_title, transaction_origin_source, transaction_origin_role, created_by, created_at',
    (query) => query.order('created_at', { ascending: true }),
  )
  const transactionIds = transactions.map((row) => row.id)
  const transactionIdSet = new Set(transactionIds)
  const [rolePlayers, attorneyAssignments, bondApplications] = await Promise.all([
    fetchAll(client, 'transaction_role_players', 'transaction_id, role_type, status, assignment_status, removed_at, is_demo_data, selection_source, email_address, snapshot_json'),
    fetchAll(client, 'transaction_attorney_assignments', 'transaction_id, status, assignment_status'),
    fetchAll(client, 'transaction_bond_applications', 'transaction_id, status, assignment_status'),
  ])
  const rolePlayersByTransaction = groupByTransaction(rolePlayers.filter((row) => transactionIdSet.has(row.transaction_id)))
  const attorneyAssignmentsByTransaction = groupByTransaction(attorneyAssignments)
  const bondApplicationsByTransaction = groupByTransaction(bondApplications)

  const candidateTransactions = transactions.filter((transaction) => {
    if (!includeInactive && transaction.is_active === false) return false
    return findHistoricalHandoverIssues({
      transaction,
      rolePlayers: rolePlayersByTransaction.get(transaction.id) || [],
      attorneyAssignments: attorneyAssignmentsByTransaction.get(transaction.id) || [],
      bondApplications: bondApplicationsByTransaction.get(transaction.id) || [],
    }).length > 0
  })

  const [buyers, organisations, listings, developments, units] = await Promise.all([
    fetchByIds(client, 'buyers', 'id, is_demo_data, demo_metadata, email, name', uniqueIds(candidateTransactions, 'buyer_id')),
    fetchByIds(client, 'organisations', 'id, is_demo_data, name, display_name, company_email, email, status, type, workspace_kind', uniqueIds(candidateTransactions, 'organisation_id')),
    fetchByIds(client, 'private_listings', 'id, is_demo_data, demo_metadata, listing_reference, listing_source, title', uniqueIds(candidateTransactions, 'listing_id')),
    fetchByIds(client, 'developments', 'id, name, code, organisation_id', uniqueIds(candidateTransactions, 'development_id')),
    fetchByIds(client, 'units', 'id, unit_number, unit_label, notes, development_id', uniqueIds(candidateTransactions, 'unit_id')),
  ])
  const buyerById = mapById(buyers)
  const organisationById = mapById(organisations)
  const listingById = mapById(listings)
  const developmentById = mapById(developments)
  const unitById = mapById(units)

  const rows = candidateTransactions.map((transaction) => classifyHistoricalTransaction({
    transaction,
    buyer: buyerById.get(transaction.buyer_id) || null,
    organisation: organisationById.get(transaction.organisation_id) || null,
    listing: listingById.get(transaction.listing_id) || null,
    development: developmentById.get(transaction.development_id) || null,
    unit: unitById.get(transaction.unit_id) || null,
    rolePlayers: rolePlayersByTransaction.get(transaction.id) || [],
    attorneyAssignments: attorneyAssignmentsByTransaction.get(transaction.id) || [],
    bondApplications: bondApplicationsByTransaction.get(transaction.id) || [],
  }))

  return {
    classifierVersion: HISTORICAL_TRANSACTION_CLASSIFIER_VERSION,
    generatedAt,
    environment: 'production',
    mode: 'read_only',
    mutatedData: false,
    scope: {
      includeInactive,
      scannedTransactions: transactions.length,
      candidateTransactions: candidateTransactions.length,
    },
    summary: summarizeHistoricalClassifications(rows),
    rows,
  }
}

async function main() {
  const args = parseArgs()
  const env = {
    ...readEnv('.env'),
    ...readEnv('.env.production.local'),
    ...readEnv('.env.local'),
    ...process.env,
  }
  const credentials = guardProductionReadOnly(env, args)
  const client = createClient(credentials.url, credentials.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const report = await runHistoricalTransactionClassification({ client, includeInactive: args.includeInactive })
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, serialized, 'utf8')
    process.stdout.write(`${JSON.stringify({
      classifierVersion: report.classifierVersion,
      generatedAt: report.generatedAt,
      mode: report.mode,
      mutatedData: report.mutatedData,
      scope: report.scope,
      summary: report.summary,
      outputPath,
    }, null, 2)}\n`)
    return
  }
  process.stdout.write(serialized)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === scriptPath) {
  await main()
}

export const __historicalTransactionClassificationRunnerTestUtils = Object.freeze({
  guardProductionReadOnly,
  parseArgs,
})
