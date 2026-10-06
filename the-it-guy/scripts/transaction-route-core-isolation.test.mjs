import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateMatterPropertyContext } from '../src/services/matterPropertyContext.js'
import { resolveSectionalTitleIdentity } from '../src/services/portalCanonicalFieldFallbacks.js'
const source = readFileSync('src/lib/api.js','utf8')
const start = source.indexOf('async function buildTransactionWorkspaceShellFromTransaction(')
const end = source.indexOf('\nexport async function fetchTransactionCoreById', start)
const factory = new Function('hydrateMatterPropertyContext', 'normalizeStage', 'normalizeMainStage', 'resolveAttorneyOperationalStageKey',
  'getDefaultTrustInvestmentForm','getDefaultHandoverRecord','getDefaultOccupationalRentRecord','buildDefaultSubprocessState',
  'normalizePurchaserType','getPurchaserTypeLabel','getRolePermissions','summarizeDocumentRequests','summarizeChecklistItems',
  'DEFAULT_DEVELOPMENT_SETTINGS', `${source.slice(start,end)}; return buildTransactionWorkspaceShellFromTransaction`)
const forbidden = () => { throw Error('Optional relation must not block route core') }
const identity = value => value
const empty = () => ({})
const build = factory(forbidden,identity,identity,identity,empty,empty,empty,empty,identity,identity,empty,empty,empty,{})
const shell = await build({from:forbidden}, {id:'matter',buyer_id:'buyer',development_id:'development'}, {routeOnly:true})
assert.equal(shell.transaction.id, 'matter')
assert.equal(shell.buyer,null)
assert.equal(shell.development,null)
assert.ok(source.includes('buildTransactionWorkspaceShellFromTransaction(client, query.data, { routeOnly: true })'))
const page=readFileSync('src/pages/AttorneyTransactionDetail.jsx','utf8')
assert.ok(page.includes('Retry matter'))
assert.ok(page.includes('if (resetMatterScopeRef.current === currentMatterAccessKey) return'))
assert.ok(page.includes('if (liveMatterScopeRef.current !== loadScope) return null'))
assert.ok(page.includes('void fetchTransactionPropertyContextById(matterId)'), 'Header property data hydrates independently after route verification')
const workspaceApi = await import('../src/lib/transactionWorkspaceApi.js')
assert.equal(typeof workspaceApi.fetchTransactionPropertyContextById, 'function', 'The lazy workspace API must expose the header’s property lookup')

const propertyStart = source.indexOf('export async function fetchTransactionPropertyContextById(')
const propertyEnd = source.indexOf('\nexport async function getTransactionRollup', propertyStart)
assert.ok(propertyStart > 0 && propertyEnd > propertyStart)
const propertyFactory = new Function('fetchTransactionRouteCoreById', 'hydrateMatterPropertyContext', 'requireClient',
  `${source.slice(propertyStart, propertyEnd).replace(/^export /, '')}; return fetchTransactionPropertyContextById`)
const propertyTransaction = {
  id: 'matter-004', unit_id: 'unit-004', development_id: 'development',
  property_tenure: 'sectional_title', property_address_line_1: '99 Leith Road', purchase_price: 2190000,
}
const queries = []
const propertyClient = {
  from(table) {
    assert.ok(['units', 'developments', 'development_profiles'].includes(table), `Unexpected optional query: ${table}`)
    return {
      select(select) {
        return {
          async in(column, ids) {
            queries.push({ table, column, ids })
            if (table === 'units') {
              assert.deepEqual(ids, ['unit-004'], 'Only the matter’s linked unit may be read')
              if (select.includes('unit_label')) return { error: { code: '42703', message: 'unit_label does not exist' } }
              return { data: [{ id: 'unit-004', development_id: 'development', unit_number: '004' }] }
            }
            assert.deepEqual(ids, ['development'], 'Only the linked development may be read')
            if (table === 'development_profiles') return { error: { code: '42P01', message: 'Optional profile table does not exist' } }
            return { data: [{ id: 'development', name: 'Junoah Estate', location: '99 Leith Road' }] }
          },
        }
      },
    }
  },
}
const loadProperty = propertyFactory(
  async id => id === propertyTransaction.id ? { transaction: propertyTransaction } : null,
  hydrateMatterPropertyContext,
  () => propertyClient,
)
const propertyDetail = await loadProperty('matter-004')
assert.deepEqual(resolveSectionalTitleIdentity(propertyDetail), { complexName: 'Junoah Estate', unitNumber: '004' })
assert.deepEqual(resolveSectionalTitleIdentity({ transaction: propertyDetail.transaction }), { complexName: 'Junoah Estate', unitNumber: '004' }, 'Embedded property data must remain usable during a route refresh')
assert.deepEqual(resolveSectionalTitleIdentity({ transaction: {
  propertyUnit: { unitLabel: 'Unit 004' }, propertyDevelopment: { name: 'Junoah Estate' },
} }), { complexName: 'Junoah Estate', unitNumber: '004' })
assert.deepEqual(resolveSectionalTitleIdentity({ transaction: { development_name: 'Junoah Estate', unit_number: '004' } }), { complexName: 'Junoah Estate', unitNumber: '004' })
assert.deepEqual(resolveSectionalTitleIdentity({ transaction: { property_address_line_1: '99 Leith Road', section_number: '4' } }), { complexName: '', unitNumber: '' }, 'Neither the street number nor legal section number proves the marketing unit')
const queryCount = queries.length
assert.equal(await loadProperty('missing'), null)
assert.equal(queries.length, queryCount, 'Unverified routes must not load property records')
console.log('PASS: core remains independent of optional queries; Junoah Unit 004 resolves through targeted reads, compatibility fallback and embedded property data')
