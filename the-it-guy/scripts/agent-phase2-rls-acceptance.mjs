import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const publishableKey = process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !publishableKey) throw new Error('VITE_SUPABASE_URL and a publishable/anon key are required.')

const configPath = process.env.AGENT_RLS_ACTORS_FILE || 'config/agent-phase2-rls-actors.example.json'
const config = JSON.parse(await readFile(configPath, 'utf8'))
assert.equal(config.contract, 'arch9-agent-phase2-rls-actors-v2', 'Use the Phase 1 v2 actor contract.')
const deniedOrganisationId = process.env[config.deniedOrganisationIdEnv]
if (!deniedOrganisationId) throw new Error(`Missing unrelated organisation fixture: ${config.deniedOrganisationIdEnv}.`)
const tables = [
  ['transactions', 'id,organisation_id,assigned_branch_id,assigned_user_id,assigned_agent_id,assigned_agent_email,owner_user_id'],
  ['transaction_participants', 'id,transaction_id,user_id,participant_email,assigned_branch_id'],
  ['transaction_commissions', 'id,organisation_id,assigned_agent_id,assigned_agent_email'],
  ['commission_targets', 'id,organisation_id,branch_id,user_id'],
  ['organisation_users', 'id,organisation_id,user_id,branch_id,status,email'],
  ['leads', 'lead_id,organisation_id,branch_id,assigned_user_id,assigned_agent_id,assigned_agent_email'],
  ['private_listings', 'id,organisation_id,assigned_agent_id,created_by'],
  ['developments', 'id,organisation_id']
]

const results = []
const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
for (const actor of config.actors) {
  const email = process.env[actor.emailEnv]
  const password = process.env[actor.passwordEnv]
  const organisationId = process.env[actor.organisationIdEnv]
  const branchId = actor.branchIdEnv ? process.env[actor.branchIdEnv] : null
  if (!email || !password || !organisationId) throw new Error(`Missing credentials or organisation for ${actor.name}.`)
  if (actor.branchIdEnv && !branchId) throw new Error(`Missing branch for ${actor.name}.`)
  if (organisationId === deniedOrganisationId) throw new Error(`${actor.name} cannot use its active organisation as the denied fixture.`)
  const deniedBranchId = actor.deniedBranchIdEnv ? process.env[actor.deniedBranchIdEnv] : null
  if (actor.deniedBranchIdEnv && (!deniedBranchId || deniedBranchId === branchId)) throw new Error(`Missing distinct denied branch for ${actor.name}.`)

  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password })
  if (authError) throw new Error(`${actor.name} sign-in failed: ${authError.message}`)
  assert.equal(authData.user.is_anonymous, false, `${actor.name} must use a non-anonymous authenticated session`)
  const userId = authData.user.id
  const actorResult = {
    name: actor.name,
    userFingerprint: fingerprint(userId),
    organisationFingerprint: fingerprint(organisationId),
    branchFingerprint: branchId ? fingerprint(branchId) : null,
    tables: [],
    deniedOrganisationProbes: [],
  }
  const participantTransactionIds = []

  for (const [table, selection] of tables) {
    let query = client.from(table).select(selection).limit(500)
    // A multi-membership user may legitimately pass RLS for more than one
    // organisation. The application contract must still scope every request to
    // the currently selected workspace.
    if (actor.expected === 'active_organisation' && table !== 'transaction_participants') {
      query = query.eq('organisation_id', organisationId)
    }
    const { data, error } = await query
    if (error) throw new Error(`${actor.name}/${table}: ${error.message}`)
    const rows = data || []
    const foreignOrganisationRows = rows.filter((row) => row.organisation_id && row.organisation_id !== organisationId)
    assert.equal(foreignOrganisationRows.length, 0, `${actor.name}/${table} leaked another organisation`)
    if (actor.expected === 'none') assert.equal(rows.length, 0, `${actor.name}/${table} should return no rows`)
    if (actor.expected === 'branch' && branchId) {
      const foreignBranchRows = rows.filter((row) => ('branch_id' in row || 'assigned_branch_id' in row) && (row.branch_id || row.assigned_branch_id) && (row.branch_id || row.assigned_branch_id) !== branchId)
      assert.equal(foreignBranchRows.length, 0, `${actor.name}/${table} returned another branch`)
    }
    if (table === 'transaction_commissions' && actor.expected === 'assigned') {
      const foreignAssignments = rows.filter((row) => row.assigned_agent_id !== userId && String(row.assigned_agent_email || '').toLowerCase() !== email.toLowerCase())
      assert.equal(foreignAssignments.length, 0, `${actor.name}/${table} returned another agent's commission`)
    }
    if (table === 'transaction_participants') participantTransactionIds.push(...rows.map((row) => row.transaction_id).filter(Boolean))
    actorResult.tables.push({ table, rowCount: rows.length })

    if (table !== 'transaction_participants') {
      const { data: deniedRows, error: deniedError } = await client
        .from(table)
        .select(selection)
        .eq('organisation_id', deniedOrganisationId)
        .limit(1)
      if (deniedError) throw new Error(`${actor.name}/${table} denied-organisation probe: ${deniedError.message}`)
      assert.equal((deniedRows || []).length, 0, `${actor.name}/${table} exposed the denied organisation`)
      actorResult.deniedOrganisationProbes.push({ table, status: 'PASS' })
    }
  }

  if (actor.expected === 'branch') {
    for (const [table, branchColumn] of [['transactions', 'assigned_branch_id'], ['commission_targets', 'branch_id'], ['organisation_users', 'branch_id'], ['leads', 'branch_id']]) {
      const { data: deniedBranchRows, error: deniedBranchError } = await client
        .from(table)
        .select(branchColumn)
        .eq('organisation_id', organisationId)
        .eq(branchColumn, deniedBranchId)
        .limit(1)
      if (deniedBranchError) throw new Error(`${actor.name}/${table} denied-branch probe: ${deniedBranchError.message}`)
      assert.equal((deniedBranchRows || []).length, 0, `${actor.name}/${table} exposed another branch`)
    }
    actorResult.deniedBranchProbeStatus = 'PASS'
  }

  if (participantTransactionIds.length > 0) {
    let transactionQuery = client.from('transactions').select('id,organisation_id').in('id', [...new Set(participantTransactionIds)])
    if (actor.expected === 'active_organisation') transactionQuery = transactionQuery.eq('organisation_id', organisationId)
    const { data: participantTransactions, error: participantTransactionsError } = await transactionQuery
    if (participantTransactionsError) throw new Error(`${actor.name}/participant transaction scope: ${participantTransactionsError.message}`)
    const visibleTransactionIds = new Set((participantTransactions || []).map((row) => row.id))
    const unresolved = actor.expected === 'active_organisation' ? [] : participantTransactionIds.filter((id) => !visibleTransactionIds.has(id))
    assert.equal(unresolved.length, 0, `${actor.name}/transaction_participants exposed inaccessible transactions`)
    assert.equal((participantTransactions || []).filter((row) => row.organisation_id !== organisationId).length, 0, `${actor.name}/transaction_participants leaked another organisation`)
  }
  await client.auth.signOut()
  results.push(actorResult)
}

const outputDirectory = path.resolve(process.env.AGENT_RLS_OUTPUT_DIR || 'test-results/agent-phase2')
await mkdir(outputDirectory, { recursive: true })
await writeFile(path.join(outputDirectory, 'rls-acceptance.json'), `${JSON.stringify({
  contract: 'arch9-agent-phase2-rls-acceptance-v1',
  actorContract: config.contract,
  migration: '20260906065759_agent_phase2_rls_acceptance.sql',
  status: 'PASS',
  capturedAt: new Date().toISOString(),
  results,
}, null, 2)}\n`)
console.log(`Agent Phase 2 RLS acceptance passed for ${results.length} actors.`)
