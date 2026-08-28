import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { getRouteQueryOwners, PRIMARY_ROUTE_QUERY_OWNERSHIP } from '../src/lib/routeQueryOwnership.js'
import {
  __schemaAvailabilityRegistryTestUtils,
  clearSchemaAvailabilityRegistry,
  isSchemaSourceUnavailable,
  markSchemaSourceUnavailable,
} from '../src/lib/schemaAvailabilityRegistry.js'

const queryOwnerSource = await readFile(new URL('../src/hooks/useRouteQueryOwner.js', import.meta.url), 'utf8')
const pipelinePageSource = await readFile(new URL('../src/pages/PipelineOverviewPage.jsx', import.meta.url), 'utf8')
const pipelineServiceSource = await readFile(new URL('../src/services/principalPipelineOverviewService.js', import.meta.url), 'utf8')
const privateListingSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const agencyBranchSource = await readFile(new URL('../src/services/agencyBranchService.js', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const sidebarSource = await readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const organisationProviderSource = await readFile(new URL('../src/context/OrganisationContext.jsx', import.meta.url), 'utf8')

test.afterEach(() => {
  clearSchemaAvailabilityRegistry()
})

test('primary routes declare one route-level query owner while reports own no queries', () => {
  const activeRoutes = [
    '/dashboard',
    '/pipeline/overview',
    '/pipeline',
    '/transactions',
    '/units',
    '/listings',
    '/developments',
    '/clients',
  ]

  for (const route of activeRoutes) {
    assert.equal(PRIMARY_ROUTE_QUERY_OWNERSHIP[route].length, 1, `${route} must have one explicit owner`)
  }
  assert.deepEqual(getRouteQueryOwners('/pipeline/overview/stalled'), ['pipeline-overview'])
  assert.deepEqual(getRouteQueryOwners('/reports'), [])
  assert.deepEqual(getRouteQueryOwners('/mobile/reports'), [])
})

test('route query owners replace duplicate requests and abort all work on unmount', () => {
  assert.match(queryOwnerSource, /controllersRef\.current\.get\(key\)\?\.abort\(\)/)
  assert.match(queryOwnerSource, /new AbortController\(\)/)
  assert.match(queryOwnerSource, /for \(const controller of controllers\.values\(\)\) controller\.abort\(\)/)
  assert.match(queryOwnerSource, /return await loader\(controller\.signal\)/)
})

test('pipeline overview owns one consolidated loader with stable primitive dependencies', () => {
  assert.match(pipelinePageSource, /useRouteQueryOwner\('pipeline-overview'\)/)
  assert.match(pipelinePageSource, /runRouteQuery\('overview', \(signal\) => getPrincipalPipelineOverview\(\{/)
  assert.match(pipelinePageSource, /canViewAll,\s+signal,/)
  assert.match(pipelinePageSource, /filters\.agentId, filters\.branchId, filters\.dateRange/)
  assert.doesNotMatch(pipelinePageSource, /organisationId, filters, runRouteQuery/)
})

test('pipeline Supabase reads receive the route abort signal', () => {
  const abortSignalUses = pipelineServiceSource.match(/query = query\.abortSignal\(signal\)/g) || []
  assert.equal(abortSignalUses.length, 2)
  assert.match(pipelineServiceSource, /export async function getPrincipalPipelineOverview\(\{[\s\S]+signal = null,/)
  assert.match(pipelineServiceSource, /safeSelect\('transactions',[\s\S]+\{ organisationId: remoteOrganisationId, order: 'updated_at', limit: 1600, signal \}\)/)
  assert.match(pipelineServiceSource, /safeSelectByIds\('transaction_subprocess_steps',[\s\S]+\{ idColumn: 'subprocess_id', order: 'updated_at', limit: 2000, signal \}\)/)
})

test('missing private_listings is remembered once for every listing query entry point', () => {
  assert.equal(markSchemaSourceUnavailable('private_listings'), true)
  assert.equal(markSchemaSourceUnavailable('PRIVATE_LISTINGS'), false)
  assert.equal(isSchemaSourceUnavailable('private_listings'), true)
  assert.deepEqual(__schemaAvailabilityRegistryTestUtils.getUnavailableSources(), ['private_listings'])

  for (const entryPoint of [
    'getPrivateListingById',
    'getOrganisationPrivateListings',
    'getAgentPrivateListings',
    'getAgentPrivateListingSummaries',
  ]) {
    const start = privateListingSource.indexOf(`function ${entryPoint}`)
    assert.notEqual(start, -1, `${entryPoint} must exist`)
    const nextFunction = privateListingSource.indexOf('\nexport async function ', start + 1)
    const body = privateListingSource.slice(start, nextFunction === -1 ? undefined : nextFunction)
    assert.match(body, /hasMissingTableCache\('private_listings'\)/)
    assert.match(body, /rememberMissingTable\('private_listings'\)/)
  }

  assert.match(agencyBranchSource, /if \(isSchemaSourceUnavailable\('private_listings'\)\) return \[\]/)
  assert.match(agencyBranchSource, /markSchemaSourceUnavailable\('private_listings'\)/)
})

test('shared app shells do not inherit primary-page query services', () => {
  for (const source of [appSource, sidebarSource, organisationProviderSource]) {
    assert.doesNotMatch(source, /principalPipelineOverviewService/)
    assert.doesNotMatch(source, /privateListingService/)
    assert.doesNotMatch(source, /agencyBranchService/)
  }
})
