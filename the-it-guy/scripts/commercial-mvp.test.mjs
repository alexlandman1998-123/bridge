import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const crudPageSource = await fs.readFile(new URL('../src/modules/commercial/components/CommercialCrudPage.jsx', import.meta.url), 'utf8')
assert.match(crudPageSource, /Search/, 'commercial CRUD pages should expose search')
assert.match(crudPageSource, /setSortState/, 'commercial CRUD pages should support sorting')
assert.match(crudPageSource, /pageSize/, 'commercial CRUD pages should paginate large data sets')
assert.match(crudPageSource, /config\.createLabel/, 'commercial CRUD pages should expose a primary create CTA')

const tableSource = await fs.readFile(new URL('../src/modules/commercial/components/CommercialTable.jsx', import.meta.url), 'utf8')
assert.match(tableSource, /Previous/, 'commercial table should render previous pagination control')
assert.match(tableSource, /Next/, 'commercial table should render next pagination control')
assert.match(tableSource, /onSort/, 'commercial table should render sortable headers')

const documentConstants = await fs.readFile(new URL('../src/modules/commercial/commercialDocumentConstants.js', import.meta.url), 'utf8')
for (const entityType of ['commercial_landlord', 'commercial_tenant', 'commercial_property', 'commercial_vacancy', 'commercial_requirement', 'commercial_deal', 'commercial_lease']) {
  assert.match(documentConstants, new RegExp(entityType), `commercial documents should support ${entityType}`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildCommercialPrincipalDashboardData } = await server.ssrLoadModule('/src/modules/commercial/services/commercialDashboardApi.js')
  const data = buildCommercialPrincipalDashboardData({
    properties: [
      { id: 'property-1', status: 'active', gla_m2: 1000, available_space_m2: 200, property_type: 'office', landlord_id: 'landlord-1', created_at: '2026-01-01' },
      { id: 'property-2', status: 'active', gla_m2: 500, available_space_m2: 0, property_type: 'industrial', landlord_id: 'landlord-1', created_at: '2026-01-02' },
    ],
    landlords: [{ id: 'landlord-1', name: 'Demo Landlord', status: 'active' }],
    tenants: [{ id: 'tenant-1', name: 'Demo Tenant', status: 'active' }],
    vacancies: [
      { id: 'vacancy-1', status: 'available', property_id: 'property-1', landlord_id: 'landlord-1', available_area_m2: 150, created_at: '2026-01-03' },
      { id: 'vacancy-2', status: 'under_negotiation', property_id: 'property-2', landlord_id: 'landlord-1', available_area_m2: 50, created_at: '2026-01-04' },
    ],
    requirements: [
      { id: 'requirement-1', status: 'active', stage: 'shortlisting', created_at: '2026-01-05' },
      { id: 'requirement-2', status: 'active', stage: 'closed_lost', created_at: '2026-01-06' },
    ],
    deals: [
      { id: 'deal-1', status: 'active', stage: 'proposal', deal_value: 100000, assigned_broker: 'broker-1', created_at: '2026-01-07' },
      { id: 'deal-2', status: 'active', stage: 'signed', deal_value: 50000, assigned_broker: 'broker-1', created_at: '2026-01-08' },
    ],
    leases: [
      { id: 'lease-1', status: 'active', property_id: 'property-1', tenant_id: 'tenant-1', landlord_id: 'landlord-1', lease_end_date: '2026-09-01' },
    ],
    documentRequests: [
      { id: 'request-1', status: 'requested', due_date: '2026-01-01' },
      { id: 'request-2', status: 'completed', due_date: '2026-01-01' },
    ],
    headsOfTerms: [
      { id: 'hot-1', status: 'draft' },
      { id: 'hot-2', status: 'ready_for_lease' },
      { id: 'hot-3', status: 'superseded' },
    ],
  })

  assert.equal(data.summary.totalProperties, 2)
  assert.equal(data.summary.totalGla, 1500)
  assert.equal(data.summary.availableSpace, 200)
  assert.equal(data.summary.occupiedSpace, 1300)
  assert.equal(data.summary.vacancyRate, 13.3)
  assert.equal(data.summary.occupancyRate, 86.7)
  assert.equal(data.summary.activeRequirements, 1)
  assert.equal(data.summary.activeDeals, 2)
  assert.equal(data.summary.dealsInNegotiation, 1)
  assert.equal(data.summary.headsOfTerms.total, 2)
  assert.equal(data.summary.headsOfTerms.readyForLease, 1)
  assert.equal(data.summary.documentRequests.outstanding, 1)
  assert.equal(data.charts.occupancyTrend.every((row) => Number.isFinite(row.occupancy) && Number.isFinite(row.vacancy)), true)

  const emptyData = buildCommercialPrincipalDashboardData()
  assert.equal(emptyData.summary.totalGla, 0)
  assert.equal(emptyData.summary.vacancyRate, 0)
  assert.equal(emptyData.summary.occupancyRate, 100)
  assert.equal(emptyData.charts.occupancyTrend.every((row) => Number.isFinite(row.occupancy) && Number.isFinite(row.vacancy)), true)
} finally {
  await server.close()
}

console.log('commercial MVP tests passed')
