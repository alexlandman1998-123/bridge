import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  envFile: false,
  server: { middlewareMode: true },
})

try {
  const { createPropertyDataProvider, propertyDataProvider } = await server.ssrLoadModule('/src/services/propertyIntelligence/propertyDataProvider.js')
  const { createHttpPropertyDataProvider } = await server.ssrLoadModule('/src/services/propertyIntelligence/httpPropertyDataProvider.js')
  const { createMockPropertyDataProvider } = await server.ssrLoadModule('/src/services/propertyIntelligence/mockPropertyDataProvider.js')
  const { PROPERTY_REPORT_TYPE_IDS } = await server.ssrLoadModule('/src/services/propertyIntelligence/propertyDataProviderContract.js')
  const {
    buildPropertyReportProspectActivity,
    buildPropertyReportProspectDraft,
    buildPropertyReportProspectPayload,
    isPropertyReportAlreadyCanvassed,
  } = await server.ssrLoadModule('/src/services/propertyIntelligence/propertyReportCanvassing.js')

  assert.equal(propertyDataProvider.mode, 'mock', 'Phase 2 should select the mock provider by default')
  assert.equal(propertyDataProvider.isDemoData, true, 'mock property data should always identify itself as demonstration data')
  assert.equal(propertyDataProvider.capabilities.parcelBoundaries, true, 'the provider should expose parcel boundaries for the Phase 3 map')

  const allProperties = await propertyDataProvider.searchProperties()
  assert.equal(allProperties.total, 24, 'the mock provider should expose a useful deterministic parcel set')
  assert.equal(allProperties.items.every((property) => property.isDemoData === true), true, 'every public property should remain visibly fictional')
  assert.equal(allProperties.items.every((property) => Array.isArray(property.parcelBoundary) && property.parcelBoundary.length === 4), true, 'each mock property should include a clickable parcel boundary')

  const erfSearch = await propertyDataProvider.searchProperties({ query: 'Erf 2817' })
  assert.equal(erfSearch.total, 1, 'property search should match an erf-number query')
  assert.equal(erfSearch.items[0].erfNumber, '2817')

  const filteredSearch = await propertyDataProvider.searchProperties({
    propertyType: 'House',
    minValue: 1000000,
    maxValue: 5000000,
  })
  assert.equal(filteredSearch.items.length > 0, true, 'property search should support type and value filters')
  assert.equal(filteredSearch.items.every((property) => property.propertyType === 'House'), true)

  const firstProperty = allProperties.items[0]
  const boundedSearch = await propertyDataProvider.getPropertiesInBounds({
    north: firstProperty.latitude + 0.0002,
    south: firstProperty.latitude - 0.0002,
    east: firstProperty.longitude + 0.00025,
    west: firstProperty.longitude - 0.00025,
  })
  assert.equal(boundedSearch.items.some((property) => property.id === firstProperty.id), true, 'bounds search should return properties inside the visible map')

  const preview = await propertyDataProvider.getPropertyPreview(firstProperty.id)
  assert.equal(preview.reportData, undefined, 'public previews should not reveal report-only ownership data')
  assert.equal(JSON.stringify(preview).includes('registeredOwner'), false, 'ownership information should remain behind the report flow')

  const selectedPropertyIds = allProperties.items.slice(0, 3).map((property) => property.id)
  const quote = await propertyDataProvider.priceReports({
    propertyIds: selectedPropertyIds,
    reportTypes: PROPERTY_REPORT_TYPE_IDS,
  })
  assert.equal(quote.propertyCount, 3)
  assert.equal(quote.reportCount, 9)
  assert.equal(quote.total, 255, 'three complete fictional property report packs should match the R255 concept quote')
  assert.equal(quote.currency, 'ZAR')
  assert.equal(quote.isDemoPricing, true)

  const deterministicProvider = createMockPropertyDataProvider({ now: () => new Date('2026-09-01T08:00:00.000Z') })
  const order = await deterministicProvider.requestReports({
    organisationId: 'agency-demo-1',
    requestedBy: 'agent-demo-1',
    propertyIds: selectedPropertyIds,
    reportTypes: PROPERTY_REPORT_TYPE_IDS,
  })
  assert.equal(order.status, 'queued', 'Phase 2 should expose an API-shaped mock report order')
  assert.equal(order.requestedAt, '2026-09-01T08:00:00.000Z')
  assert.equal(order.isDemoData, true)

  const scopedOrders = await deterministicProvider.getReportOrders({ organisationId: 'agency-demo-1' })
  const otherAgencyOrders = await deterministicProvider.getReportOrders({ organisationId: 'agency-demo-2' })
  assert.equal(scopedOrders.total, 1, 'mock report orders should support organisation scoping')
  assert.equal(otherAgencyOrders.total, 0, 'one organisation should not receive another organisation mock order')

  let progressingTimeMs = new Date('2026-09-01T09:00:00.000Z').getTime()
  const progressingProvider = createMockPropertyDataProvider({ now: () => new Date(progressingTimeMs) })
  const progressingOrder = await progressingProvider.requestReports({
    organisationId: 'agency-demo-progress',
    requestedBy: 'agent-demo-1',
    propertyIds: selectedPropertyIds,
    reportTypes: PROPERTY_REPORT_TYPE_IDS,
  })
  assert.equal(progressingOrder.status, 'queued', 'new mock report orders should begin queued')
  await assert.rejects(progressingProvider.getReportOrder(progressingOrder.id), /not ready yet/, 'report-only details should remain unavailable before completion')
  progressingTimeMs += 700
  const processingOrders = await progressingProvider.getReportOrders({ organisationId: 'agency-demo-progress' })
  assert.equal(processingOrders.items[0].status, 'processing', 'mock report orders should progress to processing')
  progressingTimeMs += 900
  const readyOrders = await progressingProvider.getReportOrders({ organisationId: 'agency-demo-progress' })
  assert.equal(readyOrders.items[0].status, 'ready', 'mock report orders should progress to ready')
  assert.equal(Boolean(readyOrders.items[0].completedAt), true, 'ready mock report orders should expose a completion time')
  assert.equal(JSON.stringify(readyOrders.items[0]).includes('registeredOwner'), false, 'report history summaries should not reveal fictional ownership details')
  const completedOrder = await progressingProvider.getReportOrder(progressingOrder.id)
  assert.equal(completedOrder.propertyReports.length, 3, 'completed orders should expose one detailed report pack per property')
  assert.equal(completedOrder.propertyReports[0].isDemoData, true)
  assert.equal(Boolean(completedOrder.propertyReports[0].deedsSummary.registeredOwner), true, 'completed report details should expose the explicitly fictional owner')
  assert.equal(completedOrder.propertyReports[0].transferHistory.length, 2, 'completed report details should expose fictional transfer history')
  assert.equal(completedOrder.propertyReports[0].valuation.indicativeValue > 0, true, 'completed report details should expose an indicative valuation')

  const completedReport = completedOrder.propertyReports[0]
  const draft = buildPropertyReportProspectDraft(completedReport)
  assert.equal(Boolean(draft.firstName), true, 'Phase 6 should prefill a fictional owner name for review')
  const prospectPayload = buildPropertyReportProspectPayload(completedReport, draft, {
    organisationId: 'agency-demo-progress',
    assignedAgentId: 'agent-demo-1',
    assignedAgentName: 'Demo Agent',
  })
  assert.equal(prospectPayload.prospectType, 'Seller Prospect')
  assert.equal(prospectPayload.source, 'Property Intelligence')
  assert.equal(prospectPayload.canvassingMethod, 'Area Farming')
  assert.equal(prospectPayload.formattedAddress, completedReport.property.formattedAddress)
  assert.equal(prospectPayload.estimatedValue, completedReport.valuation.indicativeValue)
  assert.equal(prospectPayload.notes.includes('fictional demonstration data'), true, 'converted prospects should retain a prominent demo-data warning')
  assert.equal(isPropertyReportAlreadyCanvassed([{ notes: prospectPayload.notes }], completedReport.property.id), true, 'Phase 6 should detect an already-converted property marker')
  assert.equal(isPropertyReportAlreadyCanvassed([{ notes: prospectPayload.notes }], completedOrder.propertyReports[1].property.id), false, 'the duplicate guard should remain property-specific')
  const prospectActivity = buildPropertyReportProspectActivity(completedReport, { id: 'prospect-demo-1' }, { organisationId: 'agency-demo-progress' })
  assert.equal(prospectActivity.prospectId, 'prospect-demo-1')
  assert.equal(prospectActivity.metadata.isDemoData, true)
  const transferOnlyReport = { ...completedReport, reportTypes: [{ id: 'transfer_history', label: 'Transfer history' }] }
  const transferOnlyDraft = buildPropertyReportProspectDraft(transferOnlyReport)
  const transferOnlyPayload = buildPropertyReportProspectPayload(transferOnlyReport, transferOnlyDraft, { organisationId: 'agency-demo-progress' })
  assert.equal(transferOnlyDraft.firstName, 'Property', 'ownership should not be prefilled when a deeds summary was not purchased')
  assert.equal(transferOnlyPayload.notes.includes('Fictional registered owner:'), false, 'unselected deeds information should remain outside the prospect payload')
  assert.equal(transferOnlyPayload.estimatedValue, 0, 'unselected valuation information should remain outside the prospect payload')

  const apiCalls = []
  const apiProvider = createHttpPropertyDataProvider({
    baseUrl: '/api/property-intelligence',
    fetchImpl: async (url, options) => {
      apiCalls.push({ url, options })
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    },
  })
  assert.equal(apiProvider.mode, 'api')
  await apiProvider.searchProperties({ query: 'Erf 2817', propertyType: 'House' })
  await apiProvider.getPropertiesInBounds(null, { area: 'Somerset West' })
  await apiProvider.priceReports({ propertyIds: ['property-1'], reportTypes: ['deeds_summary'] })
  await apiProvider.requestReports({ organisationId: 'agency-1', propertyIds: ['property-1'], reportTypes: ['deeds_summary'] })
  await apiProvider.getReportOrders({ organisationId: 'agency-1' })
  await apiProvider.getReportOrder('order/1')
  assert.match(apiCalls[0].url, /^\/api\/property-intelligence\/properties\/search\?/, 'API mode should route searches through the configured Arch9 endpoint')
  assert.match(apiCalls[0].url, /query=Erf\+2817/)
  assert.equal(apiCalls[0].options.credentials, 'include')
  assert.equal(apiCalls[0].options.headers.Authorization, undefined, 'the browser adapter should not send a vendor secret')
  assert.equal(apiCalls[2].options.method, 'POST')
  assert.deepEqual(JSON.parse(apiCalls[2].options.body), { propertyIds: ['property-1'], reportTypes: ['deeds_summary'] })
  assert.equal(apiCalls[5].url.endsWith('/reports/orders/order%2F1'), true, 'provider identifiers should be encoded before use in a URL')
  assert.throws(() => createHttpPropertyDataProvider({ baseUrl: 'http://vendor.example.test', fetchImpl: async () => ({}) }), /must use HTTPS/, 'API mode should reject insecure remote endpoints')
  assert.throws(() => createPropertyDataProvider({ mode: 'api', apiOptions: {} }), /base URL is required/, 'API mode should fail closed when its server endpoint is missing')

  assert.throws(() => createPropertyDataProvider({ mode: 'live' }), /not configured/, 'unconfigured live providers should fail closed')

  console.log('residential property data provider checks passed')
} finally {
  await server.close()
}
