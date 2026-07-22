#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import pg from 'pg'

const STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
const FIRM_ID = '1694cca1-2081-4c58-be8b-88a1e927c0ba'
const PREVIOUS_ATTORNEY_USER_ID = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'
const REPLACEMENT_ATTORNEY_USER_ID = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'
const EXPECTED_ASSIGNMENT_COUNT = 43
const APPLY_CONFIRMATION = 'REPAIR_43_ATTORNEY_ASSIGNMENTS'

function parseArgs(argv) {
  const options = { apply: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--plan') options.apply = false
    else if (argument === '--apply') options.apply = true
    else if (argument === '--confirm') options.confirm = argv[++index]
    else if (argument === '--json') options.json = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function stagingTarget() {
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`SUPABASE_STAGING_PROJECT_REF must equal ${STAGING_PROJECT_REF}.`)
  }
  if (!dbUrl) throw new Error('SUPABASE_STAGING_DB_URL is required.')
  let decodedDbUrl = dbUrl
  try { decodedDbUrl = decodeURIComponent(dbUrl) } catch { /* retain the original for identity checking */ }
  if (!decodedDbUrl.includes(projectRef)) {
    throw new Error('The staging database URL does not contain SUPABASE_STAGING_PROJECT_REF.')
  }
  return { projectRef, dbUrl }
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase10-attorney-assignment-repair.mjs --plan [--json]')
  console.log(`  node scripts/supabase-phase10-attorney-assignment-repair.mjs --apply --confirm ${APPLY_CONFIRMATION} [--json]`)
}

function assertAssignmentSet(rows) {
  if (rows.length !== EXPECTED_ASSIGNMENT_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_ASSIGNMENT_COUNT} repair candidates; found ${rows.length}.`)
  }
  const invalid = rows.filter((row) =>
    row.attorney_user_id !== PREVIOUS_ATTORNEY_USER_ID ||
    row.primary_attorney_id !== PREVIOUS_ATTORNEY_USER_ID ||
    row.attorney_firm_id !== FIRM_ID ||
    row.firm_id !== FIRM_ID ||
    row.attorney_role !== 'transfer_attorney' ||
    row.assignment_status !== 'active' ||
    row.is_primary !== true
  )
  if (invalid.length > 0) throw new Error(`${invalid.length} repair candidates do not match the approved precondition.`)
  if (new Set(rows.map((row) => row.transaction_id)).size !== EXPECTED_ASSIGNMENT_COUNT) {
    throw new Error('Repair candidates must represent 43 distinct transactions.')
  }
}

async function loadAssignments(client, { lock = false } = {}) {
  const result = await client.query(`
    select id, transaction_id, attorney_role, assignment_status, is_primary,
           attorney_firm_id, firm_id, attorney_user_id, primary_attorney_id
    from public.transaction_attorney_assignments
    where attorney_firm_id = $1
      and attorney_role = 'transfer_attorney'
      and assignment_status = 'active'
      and is_primary = true
      and attorney_user_id = $2
    order by id
    ${lock ? 'for update' : ''}
  `, [FIRM_ID, PREVIOUS_ATTORNEY_USER_ID])
  return result.rows
}

async function assertReplacementIsEligible(client) {
  const result = await client.query(`
    select exists (
      select 1
      from public.attorney_firm_members
      where firm_id = $1
        and user_id = $2
        and status = 'active'
        and role = 'firm_admin'
    ) as eligible
  `, [FIRM_ID, REPLACEMENT_ATTORNEY_USER_ID])
  if (result.rows[0]?.eligible !== true) {
    throw new Error('The replacement user is no longer an active administrator of the target firm.')
  }
}

async function integrityCounts(client) {
  const result = await client.query(`
    select integrity_status, count(*)::integer as count
    from public.attorney_role_integrity_v1
    where firm_id = $1
    group by integrity_status
    order by integrity_status
  `, [FIRM_ID])
  return Object.fromEntries(result.rows.map((row) => [row.integrity_status, row.count]))
}

async function applyRepair(client, rows) {
  const remediationRunId = randomUUID()
  const assignmentIds = rows.map((row) => row.id)
  const updated = await client.query(`
    update public.transaction_attorney_assignments
    set attorney_user_id = $1,
        primary_attorney_id = $1,
        updated_at = now()
    where id = any($2::uuid[])
      and attorney_user_id = $3
      and primary_attorney_id = $3
    returning id
  `, [REPLACEMENT_ATTORNEY_USER_ID, assignmentIds, PREVIOUS_ATTORNEY_USER_ID])
  if (updated.rowCount !== EXPECTED_ASSIGNMENT_COUNT) {
    throw new Error(`Expected to update ${EXPECTED_ASSIGNMENT_COUNT} assignments; updated ${updated.rowCount}.`)
  }

  const inserted = await client.query(`
    insert into public.transaction_events (
      transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
    )
    select
      assignment.transaction_id,
      'attorney_primary_replaced',
      jsonb_build_object(
        'message', 'Transfer attorney reassigned during Phase 10 integrity remediation.',
        'visibility', 'internal',
        'attorneyRole', assignment.attorney_role,
        'attorneyRoleLabel', 'Transfer Attorney',
        'assignmentId', assignment.id,
        'firmId', assignment.attorney_firm_id,
        'attorneyUserId', $1::uuid,
        'isPrimary', true,
        'assignmentKind', 'primary',
        'previousAssignmentId', assignment.id,
        'previousAttorneyUserId', $2::uuid,
        'remediationPhase', 'phase10',
        'remediationReason', 'cross_firm_attorney_assignment_integrity',
        'remediationRunId', $3::uuid
      ),
      $1::uuid,
      'attorney',
      'internal'
    from public.transaction_attorney_assignments assignment
    where assignment.id = any($4::uuid[])
    returning id
  `, [REPLACEMENT_ATTORNEY_USER_ID, PREVIOUS_ATTORNEY_USER_ID, remediationRunId, assignmentIds])
  if (inserted.rowCount !== EXPECTED_ASSIGNMENT_COUNT) {
    throw new Error(`Expected to create ${EXPECTED_ASSIGNMENT_COUNT} audit events; created ${inserted.rowCount}.`)
  }

  const postIntegrity = await integrityCounts(client)
  const blocking = Object.entries(postIntegrity)
    .filter(([status]) => status !== 'healthy')
    .reduce((sum, [, count]) => sum + count, 0)
  if (blocking !== 0) throw new Error(`Attorney integrity still has ${blocking} blocking rows after repair.`)

  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [REPLACEMENT_ATTORNEY_USER_ID])
  const certification = await client.query(
    `select (public.certify_attorney_role_release_phase9($1)).*`,
    [FIRM_ID],
  )
  if (certification.rows[0]?.status !== 'certified') throw new Error('Phase 9 firm certification did not succeed.')

  return {
    remediationRunId,
    updatedAssignmentCount: updated.rowCount,
    auditEventCount: inserted.rowCount,
    postIntegrity,
    certification: {
      status: certification.rows[0].status,
      version: certification.rows[0].certification_version,
      integrityRowCount: certification.rows[0].integrity_row_count,
    },
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return printUsage()
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Applying the repair requires --confirm ${APPLY_CONFIRMATION}.`)
  }

  const target = stagingTarget()
  const client = new pg.Client({ connectionString: target.dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await assertReplacementIsEligible(client)
    const beforeIntegrity = await integrityCounts(client)
    if (!options.apply) {
      const rows = await loadAssignments(client)
      assertAssignmentSet(rows)
      const result = {
        mode: 'plan',
        targetProjectRef: target.projectRef,
        targetFirmId: FIRM_ID,
        assignmentCount: rows.length,
        distinctTransactionCount: new Set(rows.map((row) => row.transaction_id)).size,
        beforeIntegrity,
        proposedAction: 'Reassign to the firm\'s existing active administrator and create one audit event per assignment.',
      }
      console.log(options.json ? JSON.stringify(result, null, 2) : result.proposedAction)
      return
    }

    await client.query('begin')
    try {
      const rows = await loadAssignments(client, { lock: true })
      assertAssignmentSet(rows)
      const repair = await applyRepair(client, rows)
      await client.query('commit')
      console.log(JSON.stringify({
        mode: 'apply',
        targetProjectRef: target.projectRef,
        targetFirmId: FIRM_ID,
        beforeIntegrity,
        ...repair,
      }, null, 2))
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
