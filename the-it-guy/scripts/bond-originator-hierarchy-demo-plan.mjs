#!/usr/bin/env node
import crypto from 'node:crypto'

const NAMESPACE = 'bond_originator_hierarchy_demo'

function uuid(seed) {
  const hash = crypto.createHash('sha1').update(`${NAMESPACE}:${seed}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function email(slug) {
  return `${slug}@bond-demo.bridge.local`
}

function now(index = 0) {
  const date = new Date('2026-05-31T08:00:00.000Z')
  date.setMinutes(date.getMinutes() + index)
  return date.toISOString()
}

function organisation(key, name, workspaceKind = 'bond_company') {
  return {
    id: uuid(`org:${key}`),
    name,
    type: 'bond_originator',
    workspace_type: 'bond_originator',
    workspace_kind: workspaceKind,
    metadata: { fixture_namespace: NAMESPACE, fixture_key: key },
    created_at: now(),
    updated_at: now(),
  }
}

function region(org, key, name, index) {
  return {
    id: uuid(`region:${org.id}:${key}`),
    workspace_id: org.id,
    name,
    code: key.toUpperCase(),
    active: true,
    metadata: { fixture_namespace: NAMESPACE },
    created_at: now(index),
    updated_at: now(index),
  }
}

function unit(org, key, name, { regionId = null, parentUnitId = null, unitType = 'branch', index = 0 } = {}) {
  return {
    id: uuid(`unit:${org.id}:${key}`),
    workspace_id: org.id,
    region_id: regionId,
    parent_unit_id: parentUnitId,
    unit_type: unitType,
    name,
    code: key.toUpperCase(),
    active: true,
    metadata: { fixture_namespace: NAMESPACE },
    created_at: now(index),
    updated_at: now(index),
  }
}

function membership(org, key, role, scopeLevel, { regionId = null, unitId = null, index = 0 } = {}) {
  const userId = uuid(`user:${org.id}:${key}`)
  return {
    id: uuid(`membership:${org.id}:${key}`),
    organisation_id: org.id,
    user_id: userId,
    email: email(key),
    role: 'bond_originator',
    workspace_role: role,
    organisation_role: role,
    workspace_type: 'bond_originator',
    scope_level: scopeLevel,
    region_id: regionId,
    workspace_unit_id: unitId,
    status: 'active',
    first_name: key.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    last_name: 'Demo',
    scope_metadata: { fixture_namespace: NAMESPACE },
    created_at: now(index),
    updated_at: now(index),
  }
}

function buyer(key, index) {
  return {
    id: uuid(`buyer:${key}`),
    name: `Buyer ${key}`,
    email: email(`buyer-${key}`),
    phone: '+27000000000',
    created_at: now(index),
    updated_at: now(index),
  }
}

function application({ org, key, index, regionId = null, branchId = null, teamId = null, userId = null, status = 'consultant_assigned' }) {
  const transactionId = uuid(`tx:${key}`)
  const buyerRow = buyer(key, index)
  return {
    buyer: buyerRow,
    transaction: {
      id: transactionId,
      buyer_id: buyerRow.id,
      organisation_id: org.id,
      bond_workspace_id: org.id,
      bond_region_id: regionId,
      bond_workspace_unit_id: teamId || branchId,
      primary_bond_consultant_user_id: userId,
      transaction_reference: `BOND-DEMO-${key.toUpperCase()}`,
      transaction_type: 'private_property',
      property_type: 'residential',
      property_address_line_1: `${index + 1} Demo Bond Street`,
      city: 'Johannesburg',
      finance_type: index % 5 === 0 ? 'hybrid' : 'bond',
      finance_managed_by: 'bond_originator',
      stage: 'Reserved',
      current_main_stage: 'OTP',
      lifecycle_state: 'active',
      is_active: true,
      created_at: now(index),
      updated_at: now(index),
    },
    bondApplication: {
      id: uuid(`bond-application:${key}`),
      transaction_id: transactionId,
      buyer_party_id: buyerRow.id,
      application_type: 'originator_intake',
      bank_name: 'Bond Originator Intake',
      status: 'pending',
      assigned_organisation_id: org.id,
      assigned_region_id: regionId,
      assigned_branch_id: branchId,
      assigned_team_id: teamId,
      assigned_workspace_unit_id: teamId || branchId,
      assigned_user_id: userId,
      assignment_status: status,
      assignment_source: 'demo_seed',
      metadata: { fixture_namespace: NAMESPACE },
      created_at: now(index),
      updated_at: now(index),
    },
  }
}

function createNationalGroup() {
  const org = organisation('ooba-national', 'Ooba-Style National Originator Demo')
  const hqUnit = unit(org, 'national-hq', 'National HQ', { unitType: 'hq_department', index: 0 })
  const regions = ['Gauteng', 'Western Cape', 'KwaZulu-Natal'].map((name, index) =>
    region(org, name.toLowerCase().replaceAll(' ', '-'), name, index),
  )
  const branches = regions.flatMap((regionRow, regionIndex) =>
    [0, 1].map((branchIndex) =>
      unit(org, `${regionRow.code.toLowerCase()}-branch-${branchIndex + 1}`, `${regionRow.name} Branch ${branchIndex + 1}`, {
        regionId: regionRow.id,
        index: regionIndex * 2 + branchIndex,
      }),
    ),
  )
  const hq = [
    membership(org, 'ooba-hq-admin', 'bond_hq_admin', 'organisation', { unitId: hqUnit.id, index: 1 }),
    membership(org, 'ooba-hq-manager', 'bond_hq_manager', 'organisation', { unitId: hqUnit.id, index: 2 }),
    membership(org, 'ooba-reporting-user', 'viewer', 'organisation', { unitId: hqUnit.id, index: 3 }),
  ]
  const regionalManagers = regions.slice(0, 2).map((regionRow, index) =>
    membership(org, `ooba-regional-${index + 1}`, 'bond_regional_manager', 'region', { regionId: regionRow.id, index: 10 + index }),
  )
  const branchManagers = branches.map((branch, index) =>
    membership(org, `ooba-branch-manager-${index + 1}`, 'bond_branch_manager', 'branch', {
      regionId: branch.region_id,
      unitId: branch.id,
      index: 20 + index,
    }),
  )
  const consultants = Array.from({ length: 20 }, (_, index) => {
    const branch = branches[index % branches.length]
    return membership(org, `ooba-consultant-${index + 1}`, 'bond_consultant', 'user', {
      regionId: branch.region_id,
      unitId: branch.id,
      index: 40 + index,
    })
  })
  const applications = Array.from({ length: 80 }, (_, index) => {
    const consultant = consultants[index % consultants.length]
    return application({
      org,
      key: `ooba-${index + 1}`,
      index,
      regionId: consultant.region_id,
      branchId: consultant.workspace_unit_id,
      userId: consultant.user_id,
    })
  })
  return { org, regions, units: [hqUnit, ...branches], users: [...hq, ...regionalManagers, ...branchManagers, ...consultants], applications }
}

function createSmallCompany() {
  const org = organisation('small-originator', 'Small Originator Company Demo')
  const branch = unit(org, 'main-branch', 'Main Branch', { index: 1 })
  const users = [
    membership(org, 'small-owner', 'bond_hq_admin', 'organisation', { index: 1 }),
    membership(org, 'small-branch-manager', 'bond_branch_manager', 'branch', { unitId: branch.id, index: 2 }),
    ...Array.from({ length: 3 }, (_, index) =>
      membership(org, `small-consultant-${index + 1}`, 'bond_consultant', 'user', { unitId: branch.id, index: 10 + index }),
    ),
  ]
  const consultants = users.filter((user) => user.workspace_role === 'bond_consultant')
  const applications = Array.from({ length: 15 }, (_, index) => {
    const consultant = consultants[index % consultants.length]
    return application({ org, key: `small-${index + 1}`, index, branchId: branch.id, userId: consultant.user_id })
  })
  return { org, regions: [], units: [branch], users, applications }
}

function createIndependentConsultant() {
  const org = organisation('independent-originator', 'Independent Consultant Demo', 'personal_originator')
  const owner = membership(org, 'independent-consultant', 'bond_independent_consultant', 'independent', { index: 1 })
  const applications = Array.from({ length: 8 }, (_, index) =>
    application({ org, key: `independent-${index + 1}`, index, userId: owner.user_id, status: 'independent_assigned' }),
  )
  return { org, regions: [], units: [], users: [owner], applications }
}

function assertPlanIntegrity(plan) {
  const transactionIds = new Set(plan.transactions.map((transaction) => transaction.id))
  const applicationTransactionIds = new Set(plan.transaction_bond_applications.map((applicationRow) => applicationRow.transaction_id))
  const duplicateTransactionIds = plan.transactions
    .map((transaction) => transaction.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index)
  const orphanApplications = plan.transaction_bond_applications.filter((applicationRow) => !transactionIds.has(applicationRow.transaction_id))
  const applicationsWithoutTransactions = plan.transactions.filter((transaction) => !applicationTransactionIds.has(transaction.id))
  const independentApplications = plan.transaction_bond_applications.filter((applicationRow) =>
    applicationRow.assignment_status === 'independent_assigned'
  )
  const independentScopeFailures = independentApplications.filter((applicationRow) =>
    applicationRow.assigned_region_id || applicationRow.assigned_branch_id || applicationRow.assigned_team_id || applicationRow.assigned_workspace_unit_id
  )

  return {
    duplicateTransactionIds,
    orphanApplications: orphanApplications.map((applicationRow) => applicationRow.id),
    applicationsWithoutTransactions: applicationsWithoutTransactions.map((transaction) => transaction.id),
    independentScopeFailures: independentScopeFailures.map((applicationRow) => applicationRow.id),
    passed:
      duplicateTransactionIds.length === 0
      && orphanApplications.length === 0
      && applicationsWithoutTransactions.length === 0
      && independentScopeFailures.length === 0,
  }
}

export function buildBondOriginatorHierarchyDemoPlan() {
  const groups = [createNationalGroup(), createSmallCompany(), createIndependentConsultant()]
  const applications = groups.flatMap((group) => group.applications)
  const plan = {
    namespace: NAMESPACE,
    organisations: groups.map((group) => group.org),
    workspace_regions: groups.flatMap((group) => group.regions),
    workspace_units: groups.flatMap((group) => group.units),
    organisation_users: groups.flatMap((group) => group.users),
    buyers: applications.map((entry) => entry.buyer),
    transactions: applications.map((entry) => entry.transaction),
    transaction_bond_applications: applications.map((entry) => entry.bondApplication),
    summary: {
      organisations: groups.length,
      national: { hq: 1, regions: 3, branches: 6, consultants: 20, applications: 80 },
      smallCompany: { branches: 1, consultants: 3, applications: 15 },
      independent: { regions: 0, branches: 0, consultants: 1, applications: 8 },
      totals: {
        users: groups.flatMap((group) => group.users).length,
        transactions: applications.length,
        bondApplications: applications.length,
      },
    },
  }
  return { ...plan, integrity: assertPlanIntegrity(plan) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = buildBondOriginatorHierarchyDemoPlan()
  if (process.argv.includes('--summary')) {
    console.log(JSON.stringify({ ...plan.summary, integrity: plan.integrity }, null, 2))
  } else {
    console.log(JSON.stringify(plan, null, 2))
  }
}
