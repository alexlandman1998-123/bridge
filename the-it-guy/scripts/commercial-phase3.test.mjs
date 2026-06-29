import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const auditSource = await read('../../docs/commercial-phase-3-ownership-audit.md')
for (const marker of [
  'Landlords',
  'Tenants',
  'Properties',
  'Vacancies',
  'Requirements',
  'Deals',
  'HOTs',
  'Leases',
  'Documents',
  'Activity',
  'branch_id',
  'team_id',
  'broker_id',
  'created_by',
  'updated_by',
]) {
  assert.match(auditSource, new RegExp(marker), `ownership audit should document ${marker}`)
}

const migrationSource = await read('../../supabase/migrations/202606080001_commercial_brokerage_hierarchy.sql')
for (const marker of [
  'create table if not exists public.commercial_teams',
  'primary_branch_id',
  'team_leader',
  'bridge_commercial_user_scope',
  'bridge_commercial_can_access_record',
  'target_created_by',
  "scope.scope_level = 'team'",
  'target_created_by = scope.user_id',
  'commercial_properties_brokerage_access',
  'commercial_requirements_brokerage_access',
  'commercial_deals_brokerage_access',
  'commercial_vacancies_brokerage_access',
  'commercial_heads_of_terms_brokerage_access',
]) {
  assert.match(migrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial brokerage migration should include ${marker}`)
}

const commercialApiSource = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'COMMERCIAL_TEAM_ROLES',
  "return 'team'",
  'team_id.eq.',
  'created_by.eq.',
  'COMMERCIAL_BROKER_SHARED_DIRECTORY_KINDS',
  'broker_id.is.null',
  'branch_id.is.null',
  'assigned_broker.eq.',
  'broker_assignment.eq.',
  'export async function logCommercialActivity',
  'listCommercialTeams(resolvedOrganisationId)',
  'teams: []',
]) {
  assert.match(commercialApiSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial API should include ${marker}`)
}

const brokerageApiSource = await read('../src/modules/commercial/services/commercialBrokerageApi.js')
for (const marker of [
  'listCommercialMembers',
  'listCommercialTeams',
  'assignCommercialRecord',
  'clearCommercialAssignment',
  'bulkAssignCommercialRecords',
  'assignmentPayloadForKind',
  'commercial_assignment_changed',
  'logAssignmentActivity',
  'canManageBrokerage',
  'assigned_broker',
  'broker_assignment',
  'team_id',
  'branch_id',
]) {
  assert.match(brokerageApiSource, new RegExp(marker), `commercial brokerage API should include ${marker}`)
}

const assignmentPageSource = await read('../src/modules/commercial/pages/CommercialBrokerAssignmentsPage.jsx')
for (const marker of [
  'BrokerPicker',
  'TeamPicker',
  'BranchPicker',
  'assignCommercialRecord',
  'bulkAssignCommercialRecords',
  'clearCommercialAssignment',
  'Unassigned Requirements',
  'Unassigned Deals',
  'Unassigned HOTs',
  'Unassigned Vacancies',
  'Unassigned Leases',
]) {
  assert.match(assignmentPageSource, new RegExp(marker), `assignment page should include ${marker}`)
}

const appSource = await read('../src/App.jsx')
for (const route of [
  'brokers/overview',
  'brokers/teams',
  'brokers/branches',
  'brokers/performance',
  'brokers/assignments',
  'brokers/:brokerId',
]) {
  assert.match(appSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `App routes should include /commercial/${route}`)
}

const crudConfigSource = await read('../src/modules/commercial/commercialCrudConfig.js')
for (const marker of [
  "key: 'branch_id'",
  "key: 'team_id'",
  "optionsFrom: 'branches'",
  "optionsFrom: 'teams'",
  "optionsFrom: 'brokers'",
]) {
  assert.match(crudConfigSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial CRUD config should expose ${marker}`)
}

const crudPageSource = await read('../src/modules/commercial/components/CommercialCrudPage.jsx')
for (const marker of [
  'lookups.teams',
  'lookups.branches',
  'lookups.brokers',
  'resolvedFilterConfigs',
  'recordMatchesFilters(record, filters, resolvedFilterConfigs)',
]) {
  assert.match(crudPageSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial CRUD shell should include ${marker}`)
}

console.log('commercial Phase 3 brokerage tests passed')
