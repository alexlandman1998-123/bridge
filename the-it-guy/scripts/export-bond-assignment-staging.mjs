#!/usr/bin/env node
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const OUTPUT_PATH = process.env.BOND_ASSIGNMENT_EXPORT_OUTPUT || '/tmp/staging-bond-assignment-export.json'
const LIMIT = Number(process.env.BOND_ASSIGNMENT_EXPORT_LIMIT || '5000')
const INCLUDE_SYNTHETIC_FIXTURES = String(process.env.BOND_ASSIGNMENT_INCLUDE_SYNTHETIC_FIXTURES || 'true').toLowerCase() !== 'false'
const INPUT_PATH = process.env.BOND_ASSIGNMENT_EXPORT_INPUT || ''

const QUERIES = Object.freeze({
  transactions: `select * from public.transactions limit ${LIMIT};`,
  transaction_participants: `select * from public.transaction_participants limit ${LIMIT * 3};`,
  transaction_role_players: `select * from public.transaction_role_players limit ${LIMIT * 3};`,
  organisations: `select * from public.organisations limit ${LIMIT};`,
  organisation_users: `select * from public.organisation_users limit ${LIMIT * 3};`,
  workspace_regions: `select * from public.workspace_regions limit ${LIMIT};`,
  workspace_units: `select * from public.workspace_units limit ${LIMIT * 3};`,
  profiles: `select * from public.profiles limit ${LIMIT * 3};`,
  authUsers: `select id, email, created_at, updated_at from auth.users limit ${LIMIT * 3};`,
})

function parseJsonOutput(stdout = '') {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error(`Could not parse Supabase JSON output: ${stdout.slice(0, 300)}`)
  }
  return JSON.parse(stdout.slice(start, end + 1))
}

function runQuery(sql) {
  const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--output', 'json', sql], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
  })

  if (result.status !== 0) {
    const errorOutput = `${result.stderr || ''}\n${result.stdout || ''}`
    const missingRelationError = /42P01/i.test(errorOutput) || /does not exist/i.test(errorOutput)
    if (missingRelationError) {
      return { rows: [], warning: 'relation_missing' }
    }
    throw new Error(
      [
        'Supabase query failed.',
        result.stderr || '',
        result.stdout || '',
      ]
        .filter(Boolean)
        .join('\n')
        .trim(),
    )
  }

  const parsed = parseJsonOutput(result.stdout || '')
  return { rows: Array.isArray(parsed?.rows) ? parsed.rows : [], warning: null }
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function isBondWorkspace(org = {}) {
  const type = normalizeText(org?.type || org?.workspace_type || '').toLowerCase()
  const kind = normalizeText(org?.workspace_kind || org?.workspaceKind || '').toLowerCase()
  return type === 'bond_originator' || kind === 'bond_company' || kind === 'personal_originator'
}

function groupByTransactionId(rows = []) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const transactionId = normalizeText(row?.transaction_id || row?.transactionId)
    if (!transactionId) continue
    if (!map.has(transactionId)) map.set(transactionId, [])
    map.get(transactionId).push(row)
  }
  return map
}

function uniqueById(rows = [], key = 'id') {
  const seen = new Set()
  const result = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = normalizeText(row?.[key] || '')
    const marker = id || JSON.stringify(row)
    if (seen.has(marker)) continue
    seen.add(marker)
    result.push(row)
  }
  return result
}

function buildSyntheticFixtures() {
  const now = new Date().toISOString()
  const ids = {
    companyWorkspace: '8f151111-1111-4111-8111-111111111111',
    personalWorkspace: '8f152222-2222-4222-8222-222222222222',
    region: '8f153333-3333-4333-8333-333333333333',
    branch: '8f154444-4444-4444-8444-444444444444',
    team: '8f155555-5555-4555-8555-555555555555',
    owner: '8f156111-1111-4111-8111-111111111111',
    director: '8f156112-1112-4112-8112-111111111112',
    hqManager: '8f156222-2222-4222-8222-222222222222',
    regionalManager: '8f156333-3333-4333-8333-333333333333',
    branchManager: '8f156444-4444-4444-8444-444444444444',
    teamLead: '8f156555-5555-4555-8555-555555555555',
    consultant: '8f156666-6666-4666-8666-666666666666',
    processor: '8f156777-7777-4777-8777-777777777777',
    compliance: '8f156888-8888-4888-8888-888888888888',
    adminStaff: '8f156999-9999-4999-8999-999999999999',
    independentOwner: '8f156aaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }

  const organisations = [
    {
      id: ids.companyWorkspace,
      name: 'Bond Company Workspace Fixture',
      type: 'bond_originator',
      workspace_kind: 'bond_company',
      created_at: now,
      updated_at: now,
    },
    {
      id: ids.personalWorkspace,
      name: 'Independent Originator Fixture',
      type: 'bond_originator',
      workspace_kind: 'personal_originator',
      created_at: now,
      updated_at: now,
    },
  ]

  const workspaceRegions = [
    {
      id: ids.region,
      workspace_id: ids.companyWorkspace,
      name: 'Gauteng Region',
      code: 'Gauteng',
      active: true,
      created_at: now,
      updated_at: now,
      created_by: ids.owner,
      updated_by: ids.owner,
    },
  ]

  const workspaceUnits = [
    {
      id: ids.branch,
      workspace_id: ids.companyWorkspace,
      region_id: ids.region,
      parent_unit_id: null,
      unit_type: 'branch',
      name: 'Sandton Branch',
      code: 'SANDTON',
      active: true,
      created_at: now,
      updated_at: now,
      created_by: ids.owner,
      updated_by: ids.owner,
    },
    {
      id: ids.team,
      workspace_id: ids.companyWorkspace,
      region_id: ids.region,
      parent_unit_id: ids.branch,
      unit_type: 'team',
      name: 'Processing Team A',
      code: 'TEAM_A',
      active: true,
      created_at: now,
      updated_at: now,
      created_by: ids.owner,
      updated_by: ids.owner,
    },
  ]

  const users = [
    { id: ids.owner, email: 'bond-owner-fixture@example.test', workspace_role: 'owner', scope_level: 'workspace_hq' },
    { id: ids.director, email: 'bond-director-fixture@example.test', workspace_role: 'director', scope_level: 'workspace_hq' },
    { id: ids.hqManager, email: 'bond-hq-fixture@example.test', workspace_role: 'hq_manager', scope_level: 'workspace_hq' },
    { id: ids.regionalManager, email: 'bond-regional-fixture@example.test', workspace_role: 'regional_manager', scope_level: 'region', region_id: ids.region },
    { id: ids.branchManager, email: 'bond-branch-fixture@example.test', workspace_role: 'branch_manager', scope_level: 'branch', workspace_unit_id: ids.branch },
    { id: ids.teamLead, email: 'bond-teamlead-fixture@example.test', workspace_role: 'team_lead', scope_level: 'team', workspace_unit_id: ids.team },
    { id: ids.consultant, email: 'bond-consultant-fixture@example.test', workspace_role: 'consultant', scope_level: 'assigned' },
    { id: ids.processor, email: 'bond-processor-fixture@example.test', workspace_role: 'processor', scope_level: 'team', workspace_unit_id: ids.team },
    { id: ids.compliance, email: 'bond-compliance-fixture@example.test', workspace_role: 'compliance', scope_level: 'workspace_hq' },
    { id: ids.adminStaff, email: 'bond-admin-fixture@example.test', workspace_role: 'admin_staff', scope_level: 'assigned' },
    { id: ids.independentOwner, email: 'bond-independent-fixture@example.test', workspace_role: 'owner', scope_level: 'workspace_hq' },
  ]

  const organisationUsers = [
    ...users
      .filter((user) => user.id !== ids.independentOwner)
      .map((user) => ({
        id: `ou-${user.id}`,
        organisation_id: ids.companyWorkspace,
        user_id: user.id,
        email: user.email,
        workspace_type: 'bond_originator',
        workspace_role: user.workspace_role,
        role: user.workspace_role,
        scope_level: user.scope_level,
        region_id: user.region_id || null,
        workspace_unit_id: user.workspace_unit_id || null,
        status: 'active',
        is_primary_owner: user.workspace_role === 'owner',
        created_at: now,
        updated_at: now,
      })),
    {
      id: `ou-${ids.independentOwner}`,
      organisation_id: ids.personalWorkspace,
      user_id: ids.independentOwner,
      email: 'bond-independent-fixture@example.test',
      workspace_type: 'bond_originator',
      workspace_role: 'owner',
      role: 'owner',
      scope_level: 'workspace_hq',
      region_id: null,
      workspace_unit_id: null,
      status: 'active',
      is_primary_owner: true,
      created_at: now,
      updated_at: now,
    },
  ]

  const authUsers = users.map((user) => ({
    id: user.id,
    email: user.email,
    created_at: now,
    updated_at: now,
  }))

  const profiles = users.map((user) => ({
    id: user.id,
    email: user.email,
    full_name: user.workspace_role,
    created_at: now,
    updated_at: now,
  }))

  const fixtureTransactions = [
    {
      id: '8f157001-0001-4701-8701-000000000001',
      organisation_id: ids.companyWorkspace,
      bond_workspace_id: ids.companyWorkspace,
      bond_region_id: ids.region,
      bond_workspace_unit_id: ids.branch,
      primary_bond_consultant_user_id: ids.consultant,
      assigned_bond_processor_user_id: null,
      assigned_bond_manager_user_id: ids.branchManager,
      assigned_bond_compliance_user_id: null,
      bond_assignment_status: 'consultant_assigned',
      bond_assignment_source: 'manual',
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'finance',
      finance_status: 'active',
    },
    {
      id: '8f157001-0002-4702-8702-000000000002',
      organisation_id: ids.companyWorkspace,
      bond_workspace_id: ids.companyWorkspace,
      bond_region_id: ids.region,
      bond_workspace_unit_id: ids.team,
      primary_bond_consultant_user_id: ids.consultant,
      assigned_bond_processor_user_id: ids.processor,
      assigned_bond_manager_user_id: ids.branchManager,
      assigned_bond_compliance_user_id: null,
      bond_assignment_status: 'processor_assigned',
      bond_assignment_source: 'manual',
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'processing',
      finance_status: 'processing_queue',
    },
    {
      id: '8f157001-0003-4703-8703-000000000003',
      organisation_id: ids.companyWorkspace,
      bond_workspace_id: ids.companyWorkspace,
      bond_region_id: ids.region,
      bond_workspace_unit_id: ids.branch,
      primary_bond_consultant_user_id: ids.consultant,
      assigned_bond_processor_user_id: ids.processor,
      assigned_bond_manager_user_id: ids.branchManager,
      assigned_bond_compliance_user_id: null,
      bond_assignment_status: 'fully_assigned',
      bond_assignment_source: 'manual',
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'blocked',
      finance_status: 'manager_escalations',
    },
    {
      id: '8f157001-0004-4704-8704-000000000004',
      organisation_id: ids.companyWorkspace,
      bond_workspace_id: ids.companyWorkspace,
      bond_region_id: ids.region,
      bond_workspace_unit_id: ids.branch,
      primary_bond_consultant_user_id: ids.consultant,
      assigned_bond_processor_user_id: ids.processor,
      assigned_bond_manager_user_id: ids.branchManager,
      assigned_bond_compliance_user_id: ids.compliance,
      bond_assignment_status: 'fully_assigned',
      bond_assignment_source: 'manual',
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'compliance',
      finance_status: 'compliance_review',
    },
    {
      id: '8f157001-0005-4705-8705-000000000005',
      organisation_id: ids.companyWorkspace,
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'finance',
      finance_status: 'missing_documents',
    },
    {
      id: '8f157001-0006-4706-8706-000000000006',
      organisation_id: ids.companyWorkspace,
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'finance',
      finance_status: 'bank_feedback',
    },
    {
      id: '8f157001-0007-4707-8707-000000000007',
      organisation_id: ids.companyWorkspace,
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'finance',
      finance_status: 'submission_readiness',
    },
    {
      id: '8f157001-0008-4708-8708-000000000008',
      organisation_id: ids.companyWorkspace,
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      bond_originator: 'Fixture Consultant',
      stage: 'finance',
      finance_status: 'overdue_applications',
    },
    {
      id: '8f157001-0009-4709-8709-000000000009',
      organisation_id: ids.companyWorkspace,
      assigned_bond_originator_email: 'bond-consultant-fixture@example.test',
      stage: 'finance',
      finance_status: 'legacy_email_only',
    },
    {
      id: '8f157001-0010-4710-8710-000000000010',
      organisation_id: ids.companyWorkspace,
      stage: 'finance',
      finance_status: 'participant_only',
    },
    {
      id: '8f157001-0011-4711-8711-000000000011',
      organisation_id: ids.companyWorkspace,
      stage: 'finance',
      finance_status: 'role_player_only',
    },
    {
      id: '8f157001-0012-4712-8712-000000000012',
      organisation_id: ids.companyWorkspace,
      bond_workspace_id: ids.companyWorkspace,
      primary_bond_consultant_user_id: ids.consultant,
      assigned_bond_originator_email: 'bond-processor-fixture@example.test',
      bond_originator: 'Mismatched Legacy Consultant',
      stage: 'finance',
      finance_status: 'canonical_legacy_mismatch',
    },
    {
      id: '8f157001-0013-4713-8713-000000000013',
      organisation_id: ids.personalWorkspace,
      bond_workspace_id: ids.personalWorkspace,
      primary_bond_consultant_user_id: ids.independentOwner,
      assigned_bond_originator_email: 'bond-independent-fixture@example.test',
      bond_originator: 'Independent Originator',
      stage: 'finance',
      finance_status: 'personal_originator',
    },
  ]

  const fixtureParticipants = [
    ...fixtureTransactions
      .filter((tx) => tx.id !== '8f157001-0011-4711-8711-000000000011')
      .map((tx) => ({
        id: `tp-${tx.id}`,
        transaction_id: tx.id,
        role_type: 'bond_originator',
        transaction_role: 'bond_originator',
        legal_role: 'bond_originator',
        user_id:
          tx.id === '8f157001-0013-4713-8713-000000000013'
            ? ids.independentOwner
            : ids.consultant,
        participant_email:
          tx.id === '8f157001-0013-4713-8713-000000000013'
            ? 'bond-independent-fixture@example.test'
            : 'bond-consultant-fixture@example.test',
        participant_name: tx.id === '8f157001-0013-4713-8713-000000000013' ? 'Independent Originator' : 'Fixture Consultant',
        status: 'active',
        organisation_id: tx.organisation_id || ids.companyWorkspace,
        workspace_id: tx.bond_workspace_id || tx.organisation_id || ids.companyWorkspace,
      })),
    {
      id: 'tp-8f157001-0010-processor',
      transaction_id: '8f157001-0010-4710-8710-000000000010',
      role_type: 'processor',
      transaction_role: 'processor',
      legal_role: 'processor',
      user_id: ids.processor,
      participant_email: 'bond-processor-fixture@example.test',
      participant_name: 'Fixture Processor',
      status: 'active',
      organisation_id: ids.companyWorkspace,
      workspace_id: ids.companyWorkspace,
    },
    {
      id: 'tp-8f157001-0004-compliance',
      transaction_id: '8f157001-0004-4704-8704-000000000004',
      role_type: 'compliance',
      transaction_role: 'compliance',
      legal_role: 'compliance',
      user_id: ids.compliance,
      participant_email: 'bond-compliance-fixture@example.test',
      participant_name: 'Fixture Compliance',
      status: 'active',
      organisation_id: ids.companyWorkspace,
      workspace_id: ids.companyWorkspace,
    },
  ]

  const fixtureRolePlayers = [
    {
      id: 'trp-8f157001-0011',
      transaction_id: '8f157001-0011-4711-8711-000000000011',
      role_type: 'bond_originator',
      role: 'bond_originator',
      user_id: ids.consultant,
      participant_email: 'bond-consultant-fixture@example.test',
      participant_name: 'Fixture Consultant',
      status: 'active',
      organisation_id: ids.companyWorkspace,
      workspace_id: ids.companyWorkspace,
    },
  ]

  return {
    organisations,
    workspaceRegions,
    workspaceUnits,
    organisationUsers,
    authUsers,
    profiles,
    transactions: fixtureTransactions,
    transactionParticipants: fixtureParticipants,
    transactionRolePlayers: fixtureRolePlayers,
    stats: {
      syntheticTransactions: fixtureTransactions.length,
      syntheticParticipants: fixtureParticipants.length,
      syntheticRolePlayers: fixtureRolePlayers.length,
      syntheticOrganisationUsers: organisationUsers.length,
      syntheticWorkspaceRegions: workspaceRegions.length,
      syntheticWorkspaceUnits: workspaceUnits.length,
    },
  }
}

function enrichPayload(payload = {}) {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : []
  const transactionParticipants = Array.isArray(payload.transaction_participants) ? payload.transaction_participants : []
  const transactionRolePlayers = Array.isArray(payload.transaction_role_players) ? payload.transaction_role_players : []
  const organisations = Array.isArray(payload.organisations) ? payload.organisations : []
  const organisationUsers = Array.isArray(payload.organisation_users) ? payload.organisation_users : []
  const workspaceRegions = Array.isArray(payload.workspace_regions) ? payload.workspace_regions : []
  const workspaceUnits = Array.isArray(payload.workspace_units) ? payload.workspace_units : []
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
  const authUsers = Array.isArray(payload.authUsers) ? payload.authUsers : []

  const participantsByTransaction = groupByTransactionId(transactionParticipants)
  const rolePlayersByTransaction = groupByTransactionId(transactionRolePlayers)

  let enrichedTransactions = transactions.map((transaction) => {
    const transactionId = normalizeText(transaction?.id || transaction?.transaction_id)
    return {
      ...transaction,
      transaction_participants: participantsByTransaction.get(transactionId) || [],
      transaction_role_players: rolePlayersByTransaction.get(transactionId) || [],
    }
  })

  let enrichedTransactionParticipants = [...transactionParticipants]
  let enrichedTransactionRolePlayers = [...transactionRolePlayers]
  let enrichedOrganisations = [...organisations]
  let enrichedOrganisationUsers = [...organisationUsers]
  let enrichedWorkspaceRegions = [...workspaceRegions]
  let enrichedWorkspaceUnits = [...workspaceUnits]
  let enrichedProfiles = [...profiles]
  let enrichedAuthUsers = [...authUsers]
  let fixtureInfo = null

  if (INCLUDE_SYNTHETIC_FIXTURES) {
    const fixtures = buildSyntheticFixtures()
    fixtureInfo = fixtures.stats
    enrichedTransactions = uniqueById([...enrichedTransactions, ...fixtures.transactions])
    enrichedTransactionParticipants = uniqueById([...enrichedTransactionParticipants, ...fixtures.transactionParticipants])
    enrichedTransactionRolePlayers = uniqueById([...enrichedTransactionRolePlayers, ...fixtures.transactionRolePlayers])
    enrichedOrganisations = uniqueById([...enrichedOrganisations, ...fixtures.organisations])
    enrichedOrganisationUsers = uniqueById([...enrichedOrganisationUsers, ...fixtures.organisationUsers])
    enrichedWorkspaceRegions = uniqueById([...enrichedWorkspaceRegions, ...fixtures.workspaceRegions])
    enrichedWorkspaceUnits = uniqueById([...enrichedWorkspaceUnits, ...fixtures.workspaceUnits])
    enrichedProfiles = uniqueById([...enrichedProfiles, ...fixtures.profiles])
    enrichedAuthUsers = uniqueById([...enrichedAuthUsers, ...fixtures.authUsers])

    const refreshedParticipantsByTransaction = groupByTransactionId(enrichedTransactionParticipants)
    const refreshedRolePlayersByTransaction = groupByTransactionId(enrichedTransactionRolePlayers)
    enrichedTransactions = enrichedTransactions.map((transaction) => {
      const transactionId = normalizeText(transaction?.id || transaction?.transaction_id)
      return {
        ...transaction,
        transaction_participants: refreshedParticipantsByTransaction.get(transactionId) || transaction.transaction_participants || [],
        transaction_role_players: refreshedRolePlayersByTransaction.get(transactionId) || transaction.transaction_role_players || [],
      }
    })
  }

  const hasBondOrganisation = enrichedOrganisations.some((org) => isBondWorkspace(org))
  const warnings = Array.isArray(payload.warnings) ? [...payload.warnings] : []
  if (!hasBondOrganisation) {
    warnings.push({
      key: 'organisations',
      warning: 'no_live_bond_organisations_detected',
      message: 'No live bond organisations were found in staging export. Synthetic fixtures were used for Phase 4D smoke coverage.',
    })
  }
  if (!workspaceRegions.length || !workspaceUnits.length) {
    warnings.push({
      key: 'workspace_hierarchy',
      warning: 'live_regions_or_units_missing',
      message: `Live staging has workspace_regions=${workspaceRegions.length} and workspace_units=${workspaceUnits.length}. Branch/regional smoke cannot be completed from live data alone.`,
    })
  }

  return {
    ...payload,
    warnings,
    transactions: enrichedTransactions,
    transaction_participants: enrichedTransactionParticipants,
    transaction_role_players: enrichedTransactionRolePlayers,
    organisations: enrichedOrganisations,
    organisation_users: enrichedOrganisationUsers,
    workspace_regions: enrichedWorkspaceRegions,
    workspace_units: enrichedWorkspaceUnits,
    profiles: enrichedProfiles,
    authUsers: enrichedAuthUsers,
    organisationUsers: enrichedOrganisationUsers,
    workspaceRegions: enrichedWorkspaceRegions,
    workspaceUnits: enrichedWorkspaceUnits,
    transactionParticipants: enrichedTransactionParticipants,
    transactionRolePlayers: enrichedTransactionRolePlayers,
    users: enrichedAuthUsers,
    fixtureInfo,
  }
}

function main() {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'supabase-db-query-linked',
    limit: LIMIT,
    warnings: [],
  }
  if (INPUT_PATH) {
    if (!fs.existsSync(INPUT_PATH)) {
      throw new Error(`BOND_ASSIGNMENT_EXPORT_INPUT was provided but file is missing: ${INPUT_PATH}`)
    }
    const existingPayload = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'))
    Object.assign(payload, existingPayload, {
      source: `file:${INPUT_PATH}`,
      generatedAt: new Date().toISOString(),
    })
  } else {
    for (const [key, sql] of Object.entries(QUERIES)) {
      const result = runQuery(sql)
      payload[key] = result.rows
      if (result.warning) {
        payload.warnings.push({ key, warning: result.warning })
      }
    }
  }

  const enrichedPayload = enrichPayload(payload)

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(enrichedPayload, null, 2)}\n`)

  const counts = Object.fromEntries(
    Object.keys(QUERIES).map((key) => [key, Array.isArray(enrichedPayload[key]) ? enrichedPayload[key].length : 0]),
  )
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        counts,
        fixtureInfo: enrichedPayload.fixtureInfo,
        warnings: enrichedPayload.warnings || [],
      },
      null,
      2,
    ),
  )
}

try {
  main()
} catch (error) {
  console.error(`Bond staging export failed: ${error?.message || error}`)
  process.exitCode = 1
}
