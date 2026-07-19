#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_ROOT = path.resolve('migration-evidence/2026-07-19-bridgenine-removal-phase3')
const BACKUP_DIR = path.join(OUTPUT_ROOT, 'backups')
const PLAN_PATH = path.resolve(process.env.PHASE3_PLAN_PATH || path.join(BACKUP_DIR, 'migration-plan.json'))
const SUMMARY_PATH = path.resolve(process.env.PHASE3_SUMMARY_PATH || path.join(OUTPUT_ROOT, 'migration-summary.json'))
const VERIFICATION_PATH = path.join(OUTPUT_ROOT, 'verification-summary.json')
const MODE = process.argv.includes('--verify')
  ? 'verify'
  : process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--rollback')
      ? 'rollback'
      : 'plan'
const SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')

const ACTIVE_RELATIONS = [
  'appointment_participants',
  'attorney_firms',
  'buyers',
  'contacts',
  'demo_seed_manifests',
  'document_packet_signers',
  'document_signing_fields',
  'lead_activities',
  'leads',
  'offers',
  'organisation_branches',
  'organisation_settings',
  'organisation_users',
  'organisations',
  'organization_branches',
  'partner_routing_rules',
  'private_listing_seller_onboarding',
  'private_listings',
  'profiles',
  'signup_intents',
  'transaction_participants',
  'transaction_role_players',
  'transactions',
]

const PRESERVED_HISTORY_RELATIONS = [
  'communication_deliveries',
  'documents',
  'document_packet_events',
  'document_packet_versions',
  'document_packets',
  'private_listing_activity',
  'security_audit_events',
  'telemetry_events',
  'transaction_events',
  'transaction_workflow_events',
]

const ARCH9_LOGIN_LOCAL_PARTS = new Set([
  'agent.demo',
  'attorney.demo',
  'principal.demo',
  'qa.attorney+canonical',
])

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  const body = await response.text()
  let data = null
  try {
    data = body ? JSON.parse(body) : null
  } catch {
    // Avoid including sensitive response bodies in errors.
  }
  if (!response.ok) {
    const message = data?.message || data?.error || data?.hint || `HTTP ${response.status}`
    throw new Error(`${response.status} ${response.statusText}: ${message}`)
  }
  return { data, headers: response.headers }
}

const writePrivateJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 })
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(filename, 0o600)
}

const writePublicJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 })
}

const replacementDomainForEmail = (localPart) =>
  ARCH9_LOGIN_LOCAL_PARTS.has(localPart.toLowerCase()) ? 'arch9.co.za' : 'example.test'

const migrateString = (value) => {
  let next = value
  next = next
    .replace(/https:\/\/app\.bridgenine\.co\.za/gi, 'https://app.arch9.co.za')
    .replace(/https:\/\/admin\.bridgenine\.co\.za/gi, 'https://admin.arch9.co.za')
    .replace(/https:\/\/www\.bridgenine\.co\.za/gi, 'https://www.arch9.co.za')
    .replace(/https:\/\/bridgenine\.co\.za/gi, 'https://arch9.co.za')
  next = next.replace(/([a-z0-9._%+-]+)@bridgenine\.co\.za/gi, (_, localPart) =>
    `${localPart.toLowerCase()}@${replacementDomainForEmail(localPart)}`,
  )
  return next.replace(/bridgenine\.co\.za/gi, 'arch9.co.za')
}

const migrateValue = (value) => {
  if (typeof value === 'string') return migrateString(value)
  if (Array.isArray(value)) return value.map(migrateValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateValue(item)]))
  }
  return value
}

const valuesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const fetchAllRows = async (relation) => {
  const rows = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: '*', limit: String(pageSize), offset: String(offset) })
    const { data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${relation}?${params}`)
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

const getAuthUsers = async () => {
  const users = []
  const errors = []
  const pageSize = 50
  const first = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=${pageSize}`)
  const total = Number(first.headers.get('x-total-count') || 0)
  const fullPages = Math.floor(total / pageSize)
  users.push(...(Array.isArray(first.data?.users) ? first.data.users : []))
  for (let page = 2; page <= fullPages; page += 1) {
    const { data } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`)
    users.push(...(Array.isArray(data?.users) ? data.users : []))
  }
  const firstRemainder = fullPages * pageSize + 1
  const remainder = Array.from({ length: total - fullPages * pageSize }, (_, index) => firstRemainder + index)
  const results = await Promise.all(remainder.map(async (page) => {
    try {
      const { data } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1`)
      return { page, users: Array.isArray(data?.users) ? data.users : [] }
    } catch (error) {
      return { page, users: [], error: error.message }
    }
  }))
  for (const result of results) {
    users.push(...result.users)
    if (result.error) errors.push({ page: result.page, error: result.error })
  }
  return { total, users, errors }
}

const getSchema = async () => (await fetchJson(`${SUPABASE_URL}/rest/v1/`)).data

const primaryKeyColumns = (schema, relation) => Object.entries(schema?.definitions?.[relation]?.properties || {})
  .filter(([, property]) => String(property?.description || '').includes('<pk/>'))
  .map(([column]) => column)

const buildPlan = async () => {
  const schema = await getSchema()
  const auth = await getAuthUsers()
  const authByEmail = new Map(auth.users.map((user) => [String(user.email || '').toLowerCase(), user.id]))
  const authOperations = []

  for (const user of auth.users) {
    const beforeEmail = String(user.email || '').toLowerCase()
    const afterEmail = migrateString(beforeEmail)
    const beforeUserMetadata = user.user_metadata || {}
    const afterUserMetadata = migrateValue(beforeUserMetadata)
    const emailChanged = beforeEmail !== afterEmail
    const metadataChanged = !valuesEqual(beforeUserMetadata, afterUserMetadata)
    if (!emailChanged && !metadataChanged) continue
    if (emailChanged) {
      const collision = authByEmail.get(afterEmail)
      if (collision && collision !== user.id) {
        throw new Error(`Auth email collision detected for target ${afterEmail}`)
      }
    }
    authOperations.push({ userId: user.id, beforeEmail, afterEmail, beforeUserMetadata, afterUserMetadata })
  }

  const databaseOperations = []
  for (const relation of ACTIVE_RELATIONS) {
    const keyColumns = primaryKeyColumns(schema, relation)
    if (keyColumns.length === 0) throw new Error(`No primary key metadata found for ${relation}`)
    const rows = await fetchAllRows(relation)
    for (const row of rows) {
      const beforePatch = {}
      const afterPatch = {}
      for (const [column, value] of Object.entries(row)) {
        if (keyColumns.includes(column)) continue
        const migrated = migrateValue(value)
        if (!valuesEqual(value, migrated)) {
          beforePatch[column] = value
          afterPatch[column] = migrated
        }
      }
      if (Object.keys(afterPatch).length === 0) continue
      databaseOperations.push({
        relation,
        primaryKey: Object.fromEntries(keyColumns.map((column) => [column, row[column]])),
        beforePatch,
        afterPatch,
      })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    projectRef: new URL(SUPABASE_URL).hostname.split('.')[0],
    authCoverage: { reported: auth.total, scanned: auth.users.length, errors: auth.errors },
    policy: {
      arch9LoginLocalParts: [...ARCH9_LOGIN_LOCAL_PARTS].sort(),
      automatedAndSyntheticDomain: 'example.test',
      preservedHistoryRelations: PRESERVED_HISTORY_RELATIONS,
    },
    authOperations,
    databaseOperations,
  }
}

const relationCounts = (operations) => Object.fromEntries(
  [...operations.reduce((counts, operation) => {
    counts.set(operation.relation, (counts.get(operation.relation) || 0) + 1)
    return counts
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
)

const summarizePlan = (plan, status, extra = {}) => ({
  generatedAt: new Date().toISOString(),
  projectRef: plan.projectRef,
  mode: MODE,
  status,
  authCoverage: plan.authCoverage,
  authOperations: {
    total: plan.authOperations.length,
    toArch9: plan.authOperations.filter((operation) => operation.afterEmail.endsWith('@arch9.co.za')).length,
    toExampleTest: plan.authOperations.filter((operation) => operation.afterEmail.endsWith('@example.test')).length,
  },
  databaseOperations: {
    total: plan.databaseOperations.length,
    byRelation: relationCounts(plan.databaseOperations),
  },
  preservedHistoryRelations: plan.policy.preservedHistoryRelations,
  ...extra,
})

const filterForPrimaryKey = (primaryKey) => {
  const params = new URLSearchParams()
  for (const [column, value] of Object.entries(primaryKey)) params.set(column, `eq.${value}`)
  return params
}

const readCurrentPatch = async (operation) => {
  const params = filterForPrimaryKey(operation.primaryKey)
  params.set('select', Object.keys(operation.beforePatch).join(','))
  const { data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${operation.relation}?${params}`)
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${operation.relation} primary key did not resolve exactly one row`)
  }
  return data[0]
}

const patchOperation = async (operation, direction) => {
  const expected = direction === 'forward' ? operation.beforePatch : operation.afterPatch
  const replacement = direction === 'forward' ? operation.afterPatch : operation.beforePatch
  const current = await readCurrentPatch(operation)
  if (valuesEqual(current, replacement)) return
  if (!valuesEqual(current, expected)) {
    throw new Error(`${operation.relation} changed since the migration plan was generated`)
  }
  const params = filterForPrimaryKey(operation.primaryKey)
  await fetchJson(`${SUPABASE_URL}/rest/v1/${operation.relation}?${params}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(replacement),
  })
}

const updateAuthOperation = async (operation, direction) => {
  const expected = direction === 'forward' ? operation.beforeEmail : operation.afterEmail
  const replacement = direction === 'forward' ? operation.afterEmail : operation.beforeEmail
  const expectedUserMetadata = direction === 'forward' ? operation.beforeUserMetadata : operation.afterUserMetadata
  const replacementUserMetadata = direction === 'forward' ? operation.afterUserMetadata : operation.beforeUserMetadata
  const { data: current } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users/${operation.userId}`)
  const currentEmail = String(current?.email || '').toLowerCase()
  const metadataAlreadyApplied = replacementUserMetadata === undefined || valuesEqual(current?.user_metadata || {}, replacementUserMetadata)
  if (currentEmail === replacement && metadataAlreadyApplied) return
  const metadataMatchesExpected = expectedUserMetadata === undefined || valuesEqual(current?.user_metadata || {}, expectedUserMetadata)
  if (currentEmail !== expected || !metadataMatchesExpected) {
    throw new Error(`Auth user ${operation.userId} changed since the migration plan was generated`)
  }
  const body = { email: replacement, email_confirm: true }
  if (replacementUserMetadata !== undefined) body.user_metadata = replacementUserMetadata
  await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users/${operation.userId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

const runOperations = async (operations, handler, direction) => {
  const completed = []
  const concurrency = 8
  for (let index = 0; index < operations.length; index += concurrency) {
    const batch = operations.slice(index, index + concurrency)
    const results = await Promise.allSettled(batch.map((operation) => handler(operation, direction)))
    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') completed.push(operations[index + resultIndex])
    })
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      const error = new Error(`Migration batch failed: ${failures.map((failure) => failure.reason?.message).join('; ')}`)
      error.completed = completed
      throw error
    }
  }
  return completed
}

if (MODE === 'plan' || MODE === 'verify') {
  const plan = await buildPlan()
  const status = MODE === 'verify'
    ? plan.authOperations.length === 0 && plan.databaseOperations.length === 0 ? 'verified_clean' : 'remaining_changes'
    : 'planned'
  const summary = summarizePlan(plan, status)
  if (MODE === 'plan') await writePrivateJson(PLAN_PATH, plan)
  await writePublicJson(MODE === 'verify' ? VERIFICATION_PATH : SUMMARY_PATH, summary)
  console.log(JSON.stringify(summary, null, 2))
} else {
  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8'))
  const direction = MODE === 'rollback' ? 'backward' : 'forward'
  const databaseOperations = direction === 'forward' ? plan.databaseOperations : [...plan.databaseOperations].reverse()
  const authOperations = direction === 'forward' ? plan.authOperations : [...plan.authOperations].reverse()
  let completedDatabase = []
  let completedAuth = []
  try {
    completedDatabase = await runOperations(databaseOperations, patchOperation, direction)
    completedAuth = await runOperations(authOperations, updateAuthOperation, direction)
    const summary = summarizePlan(plan, direction === 'forward' ? 'applied' : 'rolled_back', {
      completedDatabaseOperations: completedDatabase.length,
      completedAuthOperations: completedAuth.length,
    })
    await writePublicJson(SUMMARY_PATH, summary)
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    const summary = summarizePlan(plan, 'partial_failure', {
      completedDatabaseOperations: completedDatabase.length + (error.completed?.length || 0),
      completedAuthOperations: completedAuth.length,
      error: error.message,
    })
    await writePublicJson(SUMMARY_PATH, summary)
    throw error
  }
}
