// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpeningRequestTrace, createObservedSupabaseFetch } from '../openingRequestTrace.js'
import { createScopedReadCache } from '../../../lib/scopedReadCache.js'
const state = vi.hoisted(() => ({ client: null, optimized: false }))
vi.mock('../../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  supabase: { from: (...args) => state.client.from(...args), rpc: (...args) => state.client.rpc(...args) },
}))
vi.mock('../../../domains/developments/scopeReadApi.js', async original => {
  const actual = await original()
  return { ...actual, fetchDevelopmentIdsForOrganisation: (client, id) => actual.fetchDevelopmentIdsForOrganisation(client, id, { parallel: state.optimized }) }
})
import { fetchDocumentWorkspacePage, fetchDocumentClientWorkspace } from '../../../domains/documents/workspaceReadApi.js'
import { fetchAgencyCrmLeadWorkspace } from '../../../lib/agencyCrmRepository.js'

const org = '11111111-1111-4111-8111-111111111111', dev = '22222222-2222-4222-8222-222222222222'
const lead = '33333333-3333-4333-8333-333333333333'
const units = Array.from({ length: 60 }, (_, i) => ({ id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, development_id: dev, unit_number: String(i), status: 'Reserved', development: { id: dev, name: 'Fixture development' } }))
const transactions = units.map((unit, i) => ({ id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, unit_id: unit.id, buyer_id: `buyer-${i}`, stage: 'OTP Signed', updated_at: '2026-11-09T08:00:00Z' }))
const inValues = value => String(value || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',')
function fixtureRows(url) {
  const table = url.pathname.split('/').at(-1), select = url.searchParams.get('select')
  if (table === 'developments') return [{ id: dev }]
  if (table === 'transactions' && select === 'development_id') return [{ development_id: dev }]
  if (table === 'units') {
    const after = (url.searchParams.get('id') || '').replace(/^gt\./, '')
    return units.filter(unit => !after || unit.id > after).slice(0, Number(url.searchParams.get('limit') || 100))
  }
  if (table === 'transactions') return transactions.filter(row => inValues(url.searchParams.get('unit_id')).includes(row.unit_id))
  if (table === 'buyers') return units.map((_, i) => ({ id: `buyer-${i}`, name: `Fixture buyer ${i}` })).filter(row => inValues(url.searchParams.get('id')).includes(row.id))
  if (table === 'leads') return { lead_id: lead, organisation_id: org, contact_id: 'contact', lead_category: 'buyer', stage: 'New', created_at: '2026-11-09T08:00:00Z', updated_at: '2026-11-09T08:00:00Z' }
  if (table === 'contacts') return { contact_id: 'contact', first_name: 'Fixture' }
  if (table === 'lead_activities' || table === 'tasks') return Array.from({ length: 3 }, (_, i) => ({ activity_id: `activity-${i}`, task_id: `task-${i}`, lead_id: lead, created_at: '2026-11-09T08:00:00Z' }))
  return []
}

async function measure(kind, cached) {
  state.optimized = cached
  vi.useFakeTimers(); vi.setSystemTime(0)
  const path = kind === 'documents' ? '/documents' : `/pipeline/leads/${lead}`
  const collector = createOpeningRequestTrace({ now: Date.now })
  collector.begin(path, { startedAt: 0, timingOrigin: 'local_fixture_readiness' })
  const fetch = createObservedSupabaseFetch({ collector, getPath: () => path, fetchImpl: async (input) => {
    const url = new URL(input)
    // Controlled local transport: 2 ms database transaction + 6 ms other work.
    await new Promise(resolve => setTimeout(resolve, 8))
    return new Response(JSON.stringify(fixtureRows(url)), { headers: { 'content-type': 'application/json', 'server-timing': 'transaction;dur=2' } })
  } })
  state.client = createClient('https://fixture.local', 'sb_publishable_fixture', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch } })
  const references = cached ? createScopedReadCache({ scopeKey: 'fixture-actor:fixture-org', now: Date.now }) : null
  let firstScreenReadReadyMs = null
  const work = (async () => {
    if (kind === 'documents') {
      let afterUnitId = null, selected = []
      for (let page = 0; page < 3; page++) {
        const result = await fetchDocumentWorkspacePage({ organisationId: org, afterUnitId, referenceData: references })
        afterUnitId = result.nextCursor
        if (page === 0) { selected = result.rows.slice(0, 2); firstScreenReadReadyMs = Date.now() }
      }
      for (const row of selected) await fetchDocumentClientWorkspace(row, { referenceData: references })
    } else {
      const read = () => fetchAgencyCrmLeadWorkspace(org, lead, { relatedLimit: 3 })
      const opening = () => references ? references.read({ client: state.client, group: 'lead_opening', key: lead, load: read, maxAgeMs: 0 }) : read()
      await Promise.all([opening(), opening()])
      firstScreenReadReadyMs = Date.now()
    }
  })()
  await vi.runAllTimersAsync(); await work
  collector.usable(path)
  const report = collector.report()
  vi.useRealTimers()
  return { ...report, firstScreenReadReadyMs, workloadReadReadyMs: report.usableMs }
}
afterEach(() => vi.useRealTimers())

it('measures actual SDK fixture requests before and after reference reuse and opening-read coalescing', async () => {
  const documentsBefore = await measure('documents', false), documentsAfter = await measure('documents', true)
  const leadBefore = await measure('lead', false), leadAfter = await measure('lead', true)
  expect(documentsAfter.requestCount).toBeLessThan(documentsBefore.requestCount)
  expect(documentsAfter.responseBodyBytes).toBeLessThan(documentsBefore.responseBodyBytes)
  expect(documentsAfter.usableMs).toBeLessThan(documentsBefore.usableMs)
  expect(documentsAfter.firstScreenReadReadyMs).toBeLessThan(documentsBefore.firstScreenReadReadyMs)
  expect(leadBefore.duplicateRequestCount).toBe(4)
  expect(leadAfter.duplicateRequestCount).toBe(0)
  expect(leadAfter.requestCount).toBe(4)
  const result = { qualification: 'Local fixtures only: real Supabase SDK with an in-process fake HTTP transport; database timing and transport delays are controlled fixture values, not live PostgreSQL or browser paint measurements.', fixture: { units: 60, documentPages: 3, selectedClients: 2, concurrentLeadOpenings: 2, databaseMsPerRequest: 2, transportMsPerRequest: 8 }, documentsBefore, documentsAfter, leadBefore, leadAfter }
  if (process.env.REQUEST_MEASUREMENT_OUTPUT) writeFileSync(process.env.REQUEST_MEASUREMENT_OUTPUT, JSON.stringify(result, null, 2) + '\n')
  console.info(JSON.stringify(Object.fromEntries(Object.entries({ documentsBefore, documentsAfter, leadBefore, leadAfter }).map(([key, value]) => [key, { requests: value.requestCount, duplicates: value.duplicateRequestCount, bytes: value.responseBodyBytes, databaseMs: value.databaseTransactionMs, readReadyMs: value.usableMs }]))))
})
