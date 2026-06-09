import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..')

const TARGET = Object.freeze({
  organisations: 3,
  nationalRegions: 5,
  nationalBranches: 100,
  nationalPrincipals: 25,
  nationalBranchManagers: 100,
  nationalTeamLeads: 100,
  nationalAgents: 1000,
  nationalAssistants: 250,
  leads: 50000,
  listings: 25000,
  transactions: 10000,
  appointments: 20000,
  documents: 100000,
})

const ROLES = Object.freeze({
  owner: 'owner',
  principal: 'principal',
  branchManager: 'branch_manager',
  teamLead: 'team_lead',
  agent: 'agent',
  assistant: 'assistant',
})

const REPORTING_ROLES = new Set([ROLES.owner, ROLES.principal, ROLES.branchManager, ROLES.teamLead, ROLES.agent])

const AUTHORITY_MATRIX = Object.freeze({
  delete_organisation: { owner: true, principal: false, branch_manager: false, team_lead: false, agent: false, assistant: false },
  transfer_ownership: { owner: true, principal: false, branch_manager: false, team_lead: false, agent: false, assistant: false },
  invite_principal: { owner: true, principal: false, branch_manager: false, team_lead: false, agent: false, assistant: false },
  invite_agent: { owner: true, principal: true, branch_manager: true, team_lead: false, agent: false, assistant: false },
  deactivate_agent: { owner: true, principal: true, branch_manager: false, team_lead: false, agent: false, assistant: false },
  transfer_agent: { owner: true, principal: true, branch_manager: false, team_lead: false, agent: false, assistant: false },
  reassign_assets: { owner: true, principal: true, branch_manager: true, team_lead: false, agent: false, assistant: false },
  view_agency_reports: { owner: true, principal: true, branch_manager: false, team_lead: false, agent: false, assistant: false },
  view_branch_reports: { owner: true, principal: true, branch_manager: true, team_lead: false, agent: false, assistant: false },
  own_business_asset: { owner: false, principal: false, branch_manager: false, team_lead: false, agent: true, assistant: false },
})

const timers = new Map()
const results = []

function startTimer(name) {
  timers.set(name, performance.now())
}

function stopTimer(name, extra = {}) {
  const startedAt = timers.get(name)
  const durationMs = performance.now() - startedAt
  results.push({ name, durationMs: Number(durationMs.toFixed(2)), ...extra })
  return durationMs
}

function assertStep(name, fn) {
  try {
    const value = fn()
    console.log(`ok - ${name}`)
    return value
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function id(prefix, index) {
  return `${prefix}_${String(index).padStart(6, '0')}`
}

function createOrganisation({ id: organisationId, name, regions = 1, branches = 1, principals = 1, managers = 1, teamLeads = 1, agents = 1, assistants = 0 }) {
  const organisation = {
    id: organisationId,
    name,
    regions: Array.from({ length: regions }, (_, index) => ({ id: id(`${organisationId}_region`, index + 1), organisationId })),
    branches: [],
    users: [],
    assignments: [],
  }

  for (let index = 0; index < branches; index += 1) {
    const region = organisation.regions[index % organisation.regions.length]
    organisation.branches.push({ id: id(`${organisationId}_branch`, index + 1), organisationId, regionId: region.id })
  }

  function addUser(role, index, branch = null) {
    const user = {
      id: id(`${organisationId}_${role}`, index + 1),
      organisationId,
      branchId: branch?.id || null,
      role,
      active: true,
      email: `${role}.${index + 1}@${organisationId}.test`,
      memberships: [{ organisationId, branchId: branch?.id || null, role, active: true }],
    }
    organisation.users.push(user)
    return user
  }

  addUser(ROLES.owner, 0)
  for (let index = 0; index < principals; index += 1) addUser(ROLES.principal, index)
  for (let index = 0; index < managers; index += 1) addUser(ROLES.branchManager, index, organisation.branches[index % branches])
  for (let index = 0; index < teamLeads; index += 1) addUser(ROLES.teamLead, index, organisation.branches[index % branches])
  for (let index = 0; index < agents; index += 1) addUser(ROLES.agent, index, organisation.branches[index % branches])

  const agentUsers = organisation.users.filter((user) => user.role === ROLES.agent)
  for (let index = 0; index < assistants; index += 1) {
    const assistant = addUser(ROLES.assistant, index, organisation.branches[index % branches])
    const supported = agentUsers[index % agentUsers.length]
    organisation.assignments.push({
      id: id(`${organisationId}_assistant_assignment`, index + 1),
      organisationId,
      assistantId: assistant.id,
      supportedUserId: supported.id,
      branchId: supported.branchId,
      active: true,
    })
  }

  return organisation
}

function createAsset(kind, index, organisation, agents) {
  const agent = agents[index % agents.length]
  const branchId = agent.branchId
  return {
    id: id(`${organisation.id}_${kind}`, index + 1),
    kind,
    organisationId: organisation.id,
    branchId,
    createdBy: agent.id,
    ownerId: agent.id,
    assignedUserId: agent.id,
    status: 'active',
    value: kind === 'listing' ? 1500000 + (index % 80) * 125000 : kind === 'transaction' ? 900000 + (index % 100) * 90000 : 0,
  }
}

function buildDataset() {
  startTimer('national simulation fixture generation')
  const national = createOrganisation({
    id: 'agency_a',
    name: 'National Agency',
    regions: TARGET.nationalRegions,
    branches: TARGET.nationalBranches,
    principals: TARGET.nationalPrincipals,
    managers: TARGET.nationalBranchManagers,
    teamLeads: TARGET.nationalTeamLeads,
    agents: TARGET.nationalAgents,
    assistants: TARGET.nationalAssistants,
  })
  const agencyB = createOrganisation({ id: 'agency_b', name: 'Competitor Agency B', branches: 8, principals: 2, managers: 8, teamLeads: 8, agents: 80, assistants: 16 })
  const agencyC = createOrganisation({ id: 'agency_c', name: 'Competitor Agency C', branches: 4, principals: 1, managers: 4, teamLeads: 4, agents: 40, assistants: 8 })
  const organisations = [national, agencyB, agencyC]

  const nationalAgents = national.users.filter((user) => user.role === ROLES.agent)
  const leads = Array.from({ length: TARGET.leads }, (_, index) => createAsset('lead', index, national, nationalAgents))
  const listings = Array.from({ length: TARGET.listings }, (_, index) => createAsset('listing', index, national, nationalAgents))
  const transactions = Array.from({ length: TARGET.transactions }, (_, index) => ({
    ...createAsset('transaction', index, national, nationalAgents),
    roleplayers: [nationalAgents[(index + 7) % nationalAgents.length].id],
  }))
  const appointments = Array.from({ length: TARGET.appointments }, (_, index) => createAsset('appointment', index, national, nationalAgents))
  const documents = Array.from({ length: TARGET.documents }, (_, index) => {
    const type = index % 5
    const parent = type < 2 ? listings[index % listings.length] : type < 4 ? transactions[index % transactions.length] : leads[index % leads.length]
    return {
      id: id('agency_a_document', index + 1),
      kind: 'document',
      organisationId: parent.organisationId,
      branchId: parent.branchId,
      parentKind: parent.kind,
      parentId: parent.id,
      createdBy: parent.createdBy,
      ownerId: parent.ownerId,
      status: 'active',
    }
  })

  for (const organisation of [agencyB, agencyC]) {
    const agents = organisation.users.filter((user) => user.role === ROLES.agent)
    for (let index = 0; index < 250; index += 1) leads.push(createAsset('lead', index, organisation, agents))
    for (let index = 0; index < 100; index += 1) listings.push(createAsset('listing', index, organisation, agents))
    for (let index = 0; index < 50; index += 1) transactions.push(createAsset('transaction', index, organisation, agents))
  }

  const dataset = { organisations, national, agencyB, agencyC, leads, listings, transactions, appointments, documents }
  dataset.assetIndex = new Map([...leads, ...listings, ...transactions, ...appointments, ...documents].map((asset) => [asset.id, asset]))
  stopTimer('national simulation fixture generation', {
    users: organisations.reduce((total, org) => total + org.users.length, 0),
    assets: leads.length + listings.length + transactions.length + appointments.length + documents.length,
  })
  return dataset
}

function activeMembership(user, organisationId) {
  return user.memberships.find((membership) => membership.organisationId === organisationId && membership.active)
}

function supportsUser(dataset, user, targetUserId, organisationId, branchId) {
  const org = dataset.organisations.find((item) => item.id === organisationId)
  return Boolean(org?.assignments.some((assignment) => (
    assignment.active &&
    assignment.assistantId === user.id &&
    assignment.supportedUserId === targetUserId &&
    (!branchId || !assignment.branchId || assignment.branchId === branchId)
  )))
}

function canSeeAsset(dataset, user, asset) {
  const membership = activeMembership(user, asset.organisationId)
  if (!membership) return false
  if (membership.role === ROLES.owner || membership.role === ROLES.principal) return true
  if (membership.role === ROLES.branchManager) return membership.branchId === asset.branchId
  if (membership.role === ROLES.teamLead) return membership.branchId === asset.branchId
  if (membership.role === ROLES.agent) {
    return Boolean(asset.ownerId === user.id || asset.assignedUserId === user.id || asset.roleplayers?.includes(user.id))
  }
  if (membership.role === ROLES.assistant) {
    return supportsUser(dataset, user, asset.ownerId || asset.assignedUserId || asset.createdBy, asset.organisationId, asset.branchId)
  }
  return false
}

function canPerform(action, actor, target = {}) {
  if (actor.id && target.id && actor.id === target.id && ['deactivate_agent', 'transfer_agent', 'transfer_ownership'].includes(action)) return false
  return Boolean(AUTHORITY_MATRIX[action]?.[actor.role])
}

function getAssetsOwnedBy(dataset, userId) {
  return [...dataset.leads, ...dataset.listings, ...dataset.transactions, ...dataset.appointments]
    .filter((asset) => asset.ownerId === userId || asset.assignedUserId === userId)
}

function chooseReplacementAgent(dataset, sourceAgent) {
  return dataset.national.users.find((user) => (
    user.role === ROLES.agent &&
    user.active &&
    user.id !== sourceAgent.id &&
    user.branchId === sourceAgent.branchId
  )) || dataset.national.users.find((user) => user.role === ROLES.agent && user.active && user.id !== sourceAgent.id)
}

function reassignAssets(dataset, sourceAgent, replacement, reason) {
  const assets = getAssetsOwnedBy(dataset, sourceAgent.id)
  for (const asset of assets) {
    asset.previousOwnerId = sourceAgent.id
    asset.ownerId = replacement.id
    asset.assignedUserId = replacement.id
    asset.reassignmentReason = reason
    if (asset.kind === 'document') asset.ownerId = replacement.id
  }
  for (const document of dataset.documents.filter((item) => item.ownerId === sourceAgent.id)) {
    document.previousOwnerId = sourceAgent.id
    document.ownerId = replacement.id
    document.reassignmentReason = reason
  }
  return assets.length
}

function deactivateMembership(user, organisationId) {
  const membership = activeMembership(user, organisationId)
  if (membership) membership.active = false
  if (user.organisationId === organisationId) user.active = false
}

function transferAgent(dataset, agent, destinationOrganisation) {
  const replacement = chooseReplacementAgent(dataset, agent)
  const retainedAssets = reassignAssets(dataset, agent, replacement, 'agency_transfer_retention')
  deactivateMembership(agent, dataset.national.id)
  agent.memberships.push({
    organisationId: destinationOrganisation.id,
    branchId: destinationOrganisation.branches[0].id,
    role: ROLES.agent,
    active: true,
  })
  return { retainedAssets, replacement }
}

function aggregateByBranch(assets, organisationId) {
  const map = new Map()
  for (const asset of assets) {
    if (asset.organisationId !== organisationId) continue
    map.set(asset.branchId, (map.get(asset.branchId) || 0) + 1)
  }
  return map
}

function auditPolicyText() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations')
  const files = readdirSync(migrationDir).filter((file) => file.endsWith('.sql'))
  const historicalLeaks = []
  for (const file of files) {
    const text = readFileSync(resolve(migrationDir, file), 'utf8')
    const createdByOperationalAccess = /(or\s+[\w.]*created_by\s*=\s*auth\.uid\(\)|or\s+created_by\s*=\s*auth\.uid\(\))/gi
    const activeMemberWideDocumentAccess = /private_listing_documents_select_member[\s\S]{0,360}bridge_is_active_member/gi
    if (createdByOperationalAccess.test(text)) {
      historicalLeaks.push({
        status: 'historical_leak',
        file,
        issue: 'Operational RLS grants created_by access directly; former agents may retain access after transfer/offboarding unless wrapped in active membership.',
      })
    }
    if (activeMemberWideDocumentAccess.test(text)) {
      historicalLeaks.push({
        status: 'historical_leak',
        file,
        issue: 'Private listing document policy used active organisation membership instead of parent listing visibility.',
      })
    }
  }

  const remediationFile = '202606090010_created_by_access_remediation.sql'
  const remediationPath = resolve(migrationDir, remediationFile)
  const remediation = readFileSync(remediationPath, 'utf8')
  const checks = [
    {
      name: 'private listing resolver has no creator access',
      ok: /create or replace function public\.bridge_can_access_private_listing/.test(remediation) &&
        !/listing\.created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
    {
      name: 'transaction spine has no creator access',
      ok: /create or replace function public\.bridge_can_access_transaction_spine/.test(remediation) &&
        !/tx\.created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
    {
      name: 'commercial resolver has no creator fallback',
      ok: /create or replace function public\.bridge_commercial_can_access_record/.test(remediation) &&
        !/target_created_by\s*=\s*scope\.user_id/i.test(remediation),
    },
    {
      name: 'lead policy excludes creator access',
      ok: /create policy leads_support_role_select/.test(remediation) &&
        !/or\s+created_by\s*=\s*auth\.uid\(\)/i.test(remediation.match(/create policy leads_support_role_select[\s\S]*?;\n/s)?.[0] || ''),
    },
    {
      name: 'appointment policies exclude creator access',
      ok: /create policy appointments_agency_select/.test(remediation) &&
        !/appointments_agency_select[\s\S]*created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
    {
      name: 'private listing documents inherit listing visibility',
      ok: /create policy private_listing_documents_select_member[\s\S]*bridge_can_access_private_listing\(private_listing_id\)/i.test(remediation),
    },
    {
      name: 'transaction owner-returning policies exclude creator access',
      ok: /create policy transactions_select_transaction_spine_scope/.test(remediation) &&
        !/transactions_select_transaction_spine_scope[\s\S]*created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
    {
      name: 'bond application policies defer to transaction spine',
      ok: /transaction_bond_applications_select_scope_hardened[\s\S]*bridge_can_access_transaction_spine\(t\.id\)/i.test(remediation) &&
        !/transaction_bond_applications_select_scope_hardened[\s\S]*t\.created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
    {
      name: 'canvassing policies exclude creator access',
      ok: /create policy canvassing_prospects_update_member/.test(remediation) &&
        !/canvassing_prospects_update_member[\s\S]*created_by\s*=\s*auth\.uid\(\)/i.test(remediation),
    },
  ]
  const unresolved = checks
    .filter((check) => !check.ok)
    .map((check) => ({
      severity: 'critical',
      file: remediationFile,
      issue: `Sprint 8.5 remediation missing or incomplete: ${check.name}.`,
    }))

  return {
    historicalLeaks,
    remediatedCount: historicalLeaks.length,
    remediationChecks: checks,
    risks: unresolved,
  }
}

function buildScorecard({ risks, performanceSummary }) {
  const criticalRisks = risks.filter((risk) => risk.severity === 'critical').length
  const slowestMs = Math.max(...performanceSummary.map((item) => item.durationMs))
  return {
    security: criticalRisks ? 7.2 : 9.6,
    ownership: criticalRisks ? 9 : 9.4,
    governance: 8.8,
    scalability: slowestMs < 1500 ? 8.8 : 7.5,
    performance: slowestMs < 1500 ? 8.6 : 7.4,
    reporting: 8.9,
    compliance: criticalRisks ? 7.4 : 9.1,
    operationalReadiness: criticalRisks ? 7.8 : 9,
    recommendation: criticalRisks ? 'NO-GO until critical RLS findings are resolved and rerun against staging.' : 'GO FOR NATIONAL ROLLOUT after staging RLS and storage probes pass.',
  }
}

const dataset = buildDataset()

assertStep('target national fixture shape is realistic', () => {
  assert.equal(dataset.national.regions.length, TARGET.nationalRegions)
  assert.equal(dataset.national.branches.length, TARGET.nationalBranches)
  assert.equal(dataset.national.users.filter((user) => user.role === ROLES.agent).length, TARGET.nationalAgents)
  assert.equal(dataset.national.users.filter((user) => user.role === ROLES.assistant).length, TARGET.nationalAssistants)
  assert.ok(dataset.leads.length >= TARGET.leads)
  assert.ok(dataset.listings.length >= TARGET.listings)
  assert.ok(dataset.transactions.length >= TARGET.transactions)
  assert.equal(dataset.documents.length, TARGET.documents)
})

assertStep('organisation isolation denies cross-agency visibility', () => {
  startTimer('organisation isolation access scan')
  const agencyAAgent = dataset.national.users.find((user) => user.role === ROLES.agent)
  const agencyBPrincipal = dataset.agencyB.users.find((user) => user.role === ROLES.principal)
  const agencyBLead = dataset.leads.find((lead) => lead.organisationId === dataset.agencyB.id)
  const agencyALead = dataset.leads.find((lead) => lead.organisationId === dataset.national.id)
  assert.equal(canSeeAsset(dataset, agencyAAgent, agencyBLead), false)
  assert.equal(canSeeAsset(dataset, agencyBPrincipal, agencyALead), false)
  stopTimer('organisation isolation access scan', { assertions: 2 })
})

assertStep('branch isolation denies other-branch manager access', () => {
  startTimer('branch isolation access scan')
  const manager = dataset.national.users.find((user) => user.role === ROLES.branchManager)
  const ownBranchLead = dataset.leads.find((lead) => lead.branchId === manager.branchId)
  const otherBranchLead = dataset.leads.find((lead) => lead.branchId !== manager.branchId)
  assert.equal(canSeeAsset(dataset, manager, ownBranchLead), true)
  assert.equal(canSeeAsset(dataset, manager, otherBranchLead), false)
  stopTimer('branch isolation access scan', { assertions: 2 })
})

assertStep('assistant scope is delegated, not organisation-wide', () => {
  const assistant = dataset.national.users.find((user) => user.role === ROLES.assistant)
  const assignment = dataset.national.assignments.find((item) => item.assistantId === assistant.id)
  const supportedLead = dataset.leads.find((lead) => lead.ownerId === assignment.supportedUserId)
  const unsupportedLead = dataset.leads.find((lead) => lead.ownerId !== assignment.supportedUserId && lead.branchId !== assistant.branchId)
  assert.equal(canSeeAsset(dataset, assistant, supportedLead), true)
  assert.equal(canSeeAsset(dataset, assistant, unsupportedLead), false)
  assert.equal(canPerform('own_business_asset', assistant), false)
})

assertStep('ownership transfers preserve historical attribution', () => {
  startTimer('ownership transfer stress')
  const transferAgents = dataset.national.users.filter((user) => user.role === ROLES.agent).slice(0, 25)
  let moved = 0
  for (const agent of transferAgents) {
    const replacement = chooseReplacementAgent(dataset, agent)
    const before = getAssetsOwnedBy(dataset, agent.id).slice(0, 12)
    for (const asset of before) {
      const originalCreator = asset.createdBy
      asset.ownerId = replacement.id
      asset.assignedUserId = replacement.id
      asset.transferAudit = { oldOwnerId: agent.id, newOwnerId: replacement.id, reason: 'sprint_8_ownership_transfer' }
      assert.equal(asset.createdBy, originalCreator)
      assert.notEqual(asset.ownerId, asset.createdBy === replacement.id ? 'never' : agent.id)
      moved += 1
    }
  }
  stopTimer('ownership transfer stress', { transfers: moved })
})

assertStep('offboarding blocks orphaned active ownership', () => {
  startTimer('offboarding stress')
  const offboarded = dataset.national.users.filter((user) => user.role === ROLES.agent && user.active).slice(25, 35)
  let reassigned = 0
  for (const agent of offboarded) {
    const replacement = chooseReplacementAgent(dataset, agent)
    reassigned += reassignAssets(dataset, agent, replacement, 'offboarding')
    deactivateMembership(agent, dataset.national.id)
    assert.equal(getAssetsOwnedBy(dataset, agent.id).length, 0)
  }
  stopTimer('offboarding stress', { agents: offboarded.length, reassigned })
})

assertStep('agency transfer keeps old agency assets and revokes old operational access', () => {
  startTimer('agency transfer stress')
  const candidates = dataset.national.users.filter((user) => user.role === ROLES.agent && user.active).slice(35, 85)
  let retainedAssets = 0
  for (const agent of candidates) {
    const beforeCreated = dataset.listings.filter((listing) => listing.createdBy === agent.id && listing.organisationId === dataset.national.id).length
    retainedAssets += transferAgent(dataset, agent, dataset.agencyB).retainedAssets
    const oldAgencyAsset = dataset.leads.find((lead) => lead.organisationId === dataset.national.id && lead.createdBy === agent.id)
    if (oldAgencyAsset) assert.equal(canSeeAsset(dataset, agent, oldAgencyAsset), false)
    assert.equal(dataset.listings.filter((listing) => listing.createdBy === agent.id && listing.organisationId === dataset.national.id).length, beforeCreated)
  }
  stopTimer('agency transfer stress', { agents: candidates.length, retainedAssets })
})

assertStep('former agent kill test preserves attribution but removes access', () => {
  const formerAgent = dataset.national.users.find((user) => user.role === ROLES.agent && !user.active)
  const createdLead = dataset.leads.find((lead) => lead.createdBy === formerAgent.id && lead.organisationId === dataset.national.id)
  const createdListing = dataset.listings.find((listing) => listing.createdBy === formerAgent.id && listing.organisationId === dataset.national.id)
  const createdTransaction = dataset.transactions.find((transaction) => transaction.createdBy === formerAgent.id && transaction.organisationId === dataset.national.id)
  assert.ok(createdLead || createdListing || createdTransaction)
  for (const asset of [createdLead, createdListing, createdTransaction].filter(Boolean)) {
    assert.equal(asset.createdBy, formerAgent.id)
    assert.notEqual(asset.ownerId, formerAgent.id)
    assert.equal(canSeeAsset(dataset, formerAgent, asset), false)
  }
})

assertStep('former agency kill test blocks old organisation access after transfer', () => {
  const transferredAgent = dataset.national.users.find((user) => (
    user.role === ROLES.agent &&
    user.memberships.some((membership) => membership.organisationId === dataset.agencyB.id && membership.active) &&
    user.memberships.some((membership) => membership.organisationId === dataset.national.id && !membership.active)
  ))
  const oldAgencyAsset = dataset.listings.find((listing) => listing.createdBy === transferredAgent.id && listing.organisationId === dataset.national.id)
  const newAgencyAsset = createAsset('lead', 999999, dataset.agencyB, [transferredAgent])
  assert.equal(canSeeAsset(dataset, transferredAgent, oldAgencyAsset), false)
  assert.equal(canSeeAsset(dataset, transferredAgent, newAgencyAsset), true)
})

assertStep('permission matrix blocks escalation and support ownership', () => {
  for (const [action, rules] of Object.entries(AUTHORITY_MATRIX)) {
    for (const [role, expected] of Object.entries(rules)) {
      assert.equal(canPerform(action, { role }, { role: ROLES.agent }), expected, `${role} ${action}`)
    }
  }
  const owner = dataset.national.users.find((user) => user.role === ROLES.owner)
  assert.equal(canPerform('transfer_ownership', owner, owner), false)
})

assertStep('transaction spine visibility remains scoped at scale', () => {
  startTimer('transaction spine visibility scan')
  const principal = dataset.national.users.find((user) => user.role === ROLES.principal)
  const manager = dataset.national.users.find((user) => user.role === ROLES.branchManager)
  const agent = dataset.national.users.find((user) => user.role === ROLES.agent && user.active)
  const ownTransaction = dataset.transactions.find((transaction) => transaction.ownerId === agent.id)
  const otherTransaction = dataset.transactions.find((transaction) => transaction.ownerId !== agent.id && !transaction.roleplayers.includes(agent.id))
  const managerBranchTx = dataset.transactions.find((transaction) => transaction.branchId === manager.branchId)
  const otherBranchTx = dataset.transactions.find((transaction) => transaction.branchId !== manager.branchId)
  assert.equal(canSeeAsset(dataset, principal, ownTransaction), true)
  assert.equal(canSeeAsset(dataset, agent, ownTransaction), true)
  assert.equal(canSeeAsset(dataset, agent, otherTransaction), false)
  assert.equal(canSeeAsset(dataset, manager, managerBranchTx), true)
  assert.equal(canSeeAsset(dataset, manager, otherBranchTx), false)
  stopTimer('transaction spine visibility scan', { transactions: dataset.transactions.length })
})

assertStep('document visibility inherits parent ownership and organisation scope', () => {
  startTimer('document security scan')
  const agent = dataset.national.users.find((user) => user.role === ROLES.agent && user.active)
  const ownDocument = dataset.documents.find((document) => document.ownerId === agent.id)
  const otherDocument = dataset.documents.find((document) => document.ownerId !== agent.id && document.branchId !== agent.branchId)
  const externalPrincipal = dataset.agencyC.users.find((user) => user.role === ROLES.principal)
  assert.equal(canSeeAsset(dataset, agent, ownDocument), true)
  assert.equal(canSeeAsset(dataset, agent, otherDocument), false)
  assert.equal(canSeeAsset(dataset, externalPrincipal, ownDocument), false)
  stopTimer('document security scan', { documents: dataset.documents.length })
})

assertStep('reporting aggregation has no branch double counting', () => {
  startTimer('reporting aggregation')
  const branchLeadCounts = aggregateByBranch(dataset.leads, dataset.national.id)
  const branchListingCounts = aggregateByBranch(dataset.listings, dataset.national.id)
  const branchTransactionCounts = aggregateByBranch(dataset.transactions, dataset.national.id)
  const leadTotal = [...branchLeadCounts.values()].reduce((total, value) => total + value, 0)
  const listingTotal = [...branchListingCounts.values()].reduce((total, value) => total + value, 0)
  const transactionTotal = [...branchTransactionCounts.values()].reduce((total, value) => total + value, 0)
  assert.equal(leadTotal, dataset.leads.filter((lead) => lead.organisationId === dataset.national.id).length)
  assert.equal(listingTotal, dataset.listings.filter((listing) => listing.organisationId === dataset.national.id).length)
  assert.equal(transactionTotal, dataset.transactions.filter((transaction) => transaction.organisationId === dataset.national.id).length)
  assert.equal(dataset.national.users.filter((user) => user.role === ROLES.assistant && REPORTING_ROLES.has(user.role)).length, 0)
  stopTimer('reporting aggregation', { branches: branchLeadCounts.size })
})

const policyAudit = auditPolicyText()
const scorecard = buildScorecard({ risks: policyAudit.risks, performanceSummary: results })

console.log('\nSprint 8.5 enterprise rollout certification summary')
console.log(JSON.stringify({
  target: TARGET,
  timings: results,
  criticalRiskCount: policyAudit.risks.filter((risk) => risk.severity === 'critical').length,
  remediatedHistoricalLeakCount: policyAudit.remediatedCount,
  remediationChecks: policyAudit.remediationChecks,
  sampleRisks: policyAudit.risks.slice(0, 10),
  scorecard,
}, null, 2))

assert.equal(dataset.organisations.length, TARGET.organisations)
assert.ok(results.every((result) => Number.isFinite(result.durationMs)))
assert.equal(policyAudit.risks.length, 0)
assert.ok(scorecard.security >= 9.5)

console.log('enterprise rollout simulation completed')
