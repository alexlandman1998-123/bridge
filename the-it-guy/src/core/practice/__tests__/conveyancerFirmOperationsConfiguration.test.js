import assert from 'node:assert/strict'
import {
  addFirmWorkingHours,
  bindMatterToFirmConfiguration,
  buildFirmCapacityProjection,
  buildFirmOperationalIntelligence,
  buildFirmOperationsConfiguration,
  buildFirmSupervisoryQueue,
  compareFirmOperationsConfigurations,
  FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY,
  previewMatterConfigurationAdoption,
  searchFirmMatters,
} from '../conveyancerFirmOperationsConfiguration.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matterId = '50000000-0000-4000-8000-000000000001'
const managerId = '60000000-0000-4000-8000-000000000001'
const attorneyId = '70000000-0000-4000-8000-000000000001'
const secretaryId = '80000000-0000-4000-8000-000000000001'

function manager(role = 'firm_manager', userId = managerId) {
  return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team }
}

function configInput(overrides = {}) {
  return {
    configurationId: 'firm-config:g7:1', revision: 1, organisationId: org, attorneyFirmId: firm, status: 'published', effectiveAt: '2026-07-01T00:00:00Z', reason: 'Initial governed practice configuration.', configuredBy: manager(),
    structure: { branches: [{ branchId: branch, name: 'Cape Town' }], departments: [{ departmentId: 'department:g7:transfers', branchId: branch, name: 'Transfers' }], teams: [{ teamId: team, departmentId: 'department:g7:transfers', name: 'Transfer Team' }] },
    roleCapabilities: [
      { role: 'firm_manager', capabilities: ['view_matter', 'allocate_matter', 'delegate_work', 'manage_practice'] },
      { role: 'responsible_attorney', capabilities: ['view_matter', 'edit_matter', 'legal_review', 'approve_legal_instrument'] },
      { role: 'conveyancing_secretary', capabilities: ['view_matter', 'edit_matter', 'capture_evidence', 'prepare_correspondence'] },
    ],
    approvalThresholds: [{ approvalKey: 'trust_payment_high_value', minimumApprovals: 2, requiredRoles: ['accounts', 'supervising_attorney'], thresholdMinor: 10000000, currency: 'ZAR', prohibitSelfApproval: true }],
    delegationLimits: [{ role: 'responsible_attorney', capabilities: ['review_evidence', 'prepare_correspondence'], maximumHours: 72, matterScoped: true }],
    playbooks: [{ playbookId: 'playbook:g7:transfer', matterType: 'property_transfer', lane: 'transfer', planDefinitionId: 'matter-plan:transfer', planDefinitionVersion: '3.0.0', exceptionLibraryVersion: '2.0.0' }],
    slaPolicies: [{ slaKey: 'client_document_request', matterType: 'property_transfer', acknowledgeHours: 8, targetHours: 24, escalateHours: 48, calendarId: 'calendar:g7:za', escalationRole: 'supervising_attorney' }],
    contentAssignments: [{ assignmentKey: 'transfer_instruction', matterType: 'property_transfer', documentType: 'instruction_acknowledgement', templateVersionId: 'template:g7:instruction:4', templateFingerprint: 'fnv1a_1234abcd', clausePackVersionId: 'clauses:g7:za:2', clausePackFingerprint: 'fnv1a_abcdef12' }],
    calendars: [{ calendarId: 'calendar:g7:za', name: 'South Africa working calendar', timezone: 'Africa/Johannesburg', workingDays: [1, 2, 3, 4, 5], startsAt: '08:00', endsAt: '17:00', holidays: ['2026-07-20'] }],
    queuePriorities: [{ signal: 'blocked', weight: 100 }, { signal: 'overdue', weight: 50 }, { signal: 'aging_day', weight: 1 }, { signal: 'registration_ready', weight: 10 }],
    capacityRules: [{ ruleId: 'capacity:g7:secretary', role: 'conveyancing_secretary', teamId: team, maximumWeightedLoad: 4, busyAtPercent: 80 }, { ruleId: 'capacity:g7:default', role: '*', maximumWeightedLoad: 10, busyAtPercent: 80 }],
    ...overrides,
  }
}

function configuration(overrides = {}) {
  const result = buildFirmOperationsConfiguration(configInput(overrides))
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.configuration
}

function matter(overrides = {}) {
  return { transactionId: matterId, organisationId: org, attorneyFirmId: firm, matterReference: 'TR-2026-0042', matterType: 'property_transfer', status: 'in_progress', branchId: branch, teamId: team, ownerUserId: secretaryId, openedAt: '2026-05-01T00:00:00Z', propertyDescription: '12 Long Street Cape Town', erfNumber: 'ERF 42', partyNames: ['A Seller', 'B Buyer'], externalReferences: ['OTP-42'], actions: [], blockers: [], currency: 'ZAR', ...overrides }
}

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error }
}

test('builds a published, versioned firm operations configuration', () => {
  const result = buildFirmOperationsConfiguration(configInput())
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.configuration.revision, 1)
  assert.match(result.configuration.fingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.equal(result.configuration.controls.existingMatterRewritten, false)
})

test('requires a tenant-bound firm manager to configure the practice', () => {
  const result = buildFirmOperationsConfiguration(configInput({ configuredBy: manager('responsible_attorney', attorneyId) }))
  assert.ok(result.errors.includes('firm_configuration_manager_authority_required'))
})

test('validates branch, department and team references', () => {
  const input = configInput()
  input.structure.teams[0].departmentId = 'department:missing'
  const result = buildFirmOperationsConfiguration(input)
  assert.ok(result.errors.includes('firm_configuration_teams_invalid'))
})

test('can narrow G1 capabilities but cannot expand a role baseline', () => {
  const result = buildFirmOperationsConfiguration(configInput({ roleCapabilities: [{ role: 'conveyancing_secretary', capabilities: ['approve_trust_payment'] }] }))
  assert.ok(result.errors.includes('firm_configuration_role_capability_expands_baseline:conveyancing_secretary'))
})

test('rejects non-delegable powers and malformed approval thresholds', () => {
  const delegated = buildFirmOperationsConfiguration(configInput({ delegationLimits: [{ role: 'responsible_attorney', capabilities: ['approve_legal_instrument'], maximumHours: 24 }] }))
  assert.ok(delegated.errors.includes('firm_configuration_delegation_limit_invalid'))
  const approval = buildFirmOperationsConfiguration(configInput({ approvalThresholds: [{ approvalKey: 'high_value', minimumApprovals: 1, requiredRoles: ['accounts', 'supervising_attorney'], thresholdMinor: 1 }] }))
  assert.ok(approval.errors.includes('firm_configuration_approval_threshold_invalid'))
})

test('binds exact playbook, SLA, template and clause-pack versions', () => {
  const value = configuration()
  assert.equal(value.playbooks[0].planDefinitionVersion, '3.0.0')
  assert.equal(value.slaPolicies[0].calendarId, 'calendar:g7:za')
  assert.equal(value.contentAssignments[0].clausePackVersionId, 'clauses:g7:za:2')
})

test('calculates SLA dates around weekends and configured holidays', () => {
  const result = addFirmWorkingHours({ configuration: configuration(), calendarId: 'calendar:g7:za', startsAt: '2026-07-17T16:00:00Z', hours: 2 })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.dueAt, '2026-07-21T09:00:00.000Z')
})

test('enforces consecutive configuration lineage and exposes impact', () => {
  const first = configuration()
  const second = configuration({ configurationId: 'firm-config:g7:2', revision: 2, predecessorConfigurationId: first.configurationId, predecessorFingerprint: first.fingerprint, reason: 'Increase blocked-matter priority.', queuePriorities: [{ signal: 'blocked', weight: 120 }, { signal: 'overdue', weight: 50 }, { signal: 'aging_day', weight: 1 }] })
  const boundMatter = matter({ configurationBinding: { fingerprint: first.fingerprint } })
  const comparison = compareFirmOperationsConfigurations({ previous: first, next: second, activeMatters: [boundMatter] })
  assert.equal(comparison.ok, true, JSON.stringify(comparison.errors))
  assert.deepEqual(comparison.comparison.changedSections, ['queuePriorities'])
  assert.equal(comparison.comparison.requiresExplicitAdoption, true)
  assert.equal(comparison.comparison.existingMattersRewritten, false)
})

test('binds new matters and prevents silent rebinding of existing matters', () => {
  const first = configuration()
  const initial = bindMatterToFirmConfiguration({ matter: matter(), configuration: first, boundAt: '2026-07-16T08:00:00Z', boundBy: manager() })
  assert.equal(initial.ok, true, JSON.stringify(initial.errors))
  const existing = matter({ configurationBinding: initial.binding })
  const blocked = bindMatterToFirmConfiguration({ matter: existing, configuration: first, boundAt: '2026-07-16T09:00:00Z', boundBy: manager() })
  assert.ok(blocked.errors.includes('firm_configuration_existing_binding_requires_explicit_adoption'))
})

test('previews explicit adoption without executing it', () => {
  const first = configuration()
  const second = configuration({ configurationId: 'firm-config:g7:2', revision: 2, predecessorConfigurationId: first.configurationId, predecessorFingerprint: first.fingerprint, reason: 'Revised working model.', calendars: [{ ...first.calendars[0], endsAt: '16:30' }] })
  const target = matter({ configurationBinding: { fingerprint: first.fingerprint } })
  const result = previewMatterConfigurationAdoption({ matter: target, currentConfiguration: first, targetConfiguration: second, actor: manager(), reason: 'Adopt revised calendar after reviewing open deadlines.', previewedAt: '2026-07-16T10:00:00Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.preview.changedSections, ['calendars'])
  assert.equal(result.preview.adoptionExecuted, false)
})

test('produces a transparent, read-only supervisory priority queue', () => {
  const result = buildFirmSupervisoryQueue({ configuration: configuration(), asOf: '2026-07-16T12:00:00Z', matters: [matter({ transactionId: matterId, blockers: [{ blockerId: 'b1' }] }), matter({ transactionId: '50000000-0000-4000-8000-000000000002', openedAt: '2026-07-01T00:00:00Z', actions: [{ state: 'open', dueAt: '2026-07-15T00:00:00Z' }] })] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.queue.items[0].transactionId, matterId)
  assert.equal(result.queue.items[0].topReason, 'blocked')
  assert.equal(result.queue.assignmentsChanged, false)
})

test('projects member and team capacity without assigning work', () => {
  const result = buildFirmCapacityProjection({ configuration: configuration(), members: [{ userId: secretaryId, name: 'Secretary One', role: 'conveyancing_secretary', teamId: team }], workItems: [{ ownerUserId: secretaryId, state: 'open', weight: 3 }, { ownerUserId: secretaryId, state: 'blocked', weight: 2 }] })
  assert.equal(result.members[0].capacityStatus, 'overloaded')
  assert.equal(result.overloadedMemberCount, 1)
  assert.equal(result.assignmentsChanged, false)
})

test('searches across matter references while enforcing per-matter access', () => {
  const secondId = '50000000-0000-4000-8000-000000000002'
  const result = searchFirmMatters({ configuration: configuration(), query: 'Long Street', matters: [matter(), matter({ transactionId: secondId, matterReference: 'SECRET-1' })], accessDecisions: [{ transactionId: matterId, allowed: true }, { transactionId: secondId, allowed: false }] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.search.resultCount, 1)
  assert.equal(result.search.results[0].transactionId, matterId)
  assert.equal(result.search.restrictedMattersExcluded, true)
})

test('reports aging, blockers and explainable registration forecasts', () => {
  const result = buildFirmOperationalIntelligence({ configuration: configuration(), asOf: '2026-07-16T12:00:00Z', matters: [matter({ blockers: [{ blockerId: 'municipal-clearance' }], expectedRegistrationAt: '2026-08-15T00:00:00Z', forecastConfidence: 0.45 })], members: [] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.report.aging.blockedMatterCount, 1)
  assert.equal(result.report.registrationForecast[0].basis, 'matter_estimate')
  assert.equal(result.report.legalOutcomePredicted, false)
})

test('calculates staff indicators and fee projections in integer minor units', () => {
  const completed = matter({ status: 'closed', completedAt: '2026-06-25T00:00:00Z', targetCompletionAt: '2026-06-30T00:00:00Z', projectedFeeMinor: 250000, projectedDirectCostMinor: 50000 })
  const active = matter({ transactionId: '50000000-0000-4000-8000-000000000002', projectedFeeMinor: 300000, projectedDirectCostMinor: 80000 })
  const result = buildFirmOperationalIntelligence({ configuration: configuration(), asOf: '2026-07-16T12:00:00Z', matters: [completed, active], members: [{ userId: secretaryId, name: 'Secretary One', teamId: team }] })
  assert.equal(result.report.performance[0].completedMatterCount, 1)
  assert.equal(result.report.performance[0].onTimeRate, 1)
  assert.equal(result.report.profitability.projectedFeeMinor, 300000)
  assert.equal(result.report.profitability.projectedProfitMinor, 220000)
  assert.equal(result.report.profitability.basis, 'non_trust_projection')
})

test('keeps all G7 projections and previews inside the declared boundary', () => {
  assert.deepEqual(FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY, { existingMatterRewritten: false, matterConfigurationAdopted: false, actionAssigned: false, actionCompleted: false, notificationSent: false, documentGenerated: false, providerCalled: false, registrationOutcomeChanged: false })
})
