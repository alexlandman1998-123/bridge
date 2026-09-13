import assert from 'node:assert/strict'
import {
  getProperty24StatisticsContract,
  normalizeProperty24ListingStatistics,
  normalizeProperty24ListingStatisticsSummary,
  PROPERTY24_STATISTICS_CONTRACT_VERSION,
} from '../server/property24/index.js'

const contract = getProperty24StatisticsContract()
const metricByKey = new Map(contract.metrics.map((metric) => [metric.key, metric]))

assert.equal(contract.version, PROPERTY24_STATISTICS_CONTRACT_VERSION)
assert.equal(metricByKey.get('listingContactFormLeads')?.property24Field, 'requestDetailsLeads')
assert.equal(metricByKey.get('whatsAppContactFormLeads')?.property24Field, 'whatsAppLeads')
assert.equal(metricByKey.get('totalContactLeads')?.property24Field, 'totalContactLeads')
assert.equal(metricByKey.get('listingViews')?.property24Field, 'viewCount')
assert.ok(contract.reportingRules.some((rule) => rule.includes('never combined with Arch9 WhatsApp campaign results')))
assert.ok(contract.reportingRules.some((rule) => rule.includes('never calculated by Arch9')))

const listingStatistic = normalizeProperty24ListingStatistics({
  listingNumber: 12345678,
  agencyId: 123,
  date: '2026-09-13',
  viewCount: 80,
  alertCount: 5,
  telLeads: 4,
  smsLeads: 1,
  requestDetailsLeads: 12,
  whatsAppLeads: 7,
  totalLeads: 24,
  totalContactLeads: 24,
  price: 18500,
  streetAddress: { streetName: 'Main Road' },
  futureContactTypeLeads: 2,
})
assert.equal(listingStatistic.listingContactFormLeads, 12)
assert.equal(listingStatistic.whatsAppContactFormLeads, 7)
assert.equal(listingStatistic.totalContactLeads, 24)
assert.equal(listingStatistic.raw.futureContactTypeLeads, 2)
assert.deepEqual(listingStatistic.unexpectedFields, ['futureContactTypeLeads'])
assert.equal(listingStatistic.warnings.length, 1)

const summaryStatistic = normalizeProperty24ListingStatisticsSummary({
  periodId: 1,
  agencyId: 123,
  propertyCount: 10,
  viewCount: 80,
  requestDetailsLeads: 12,
  whatsAppLeads: 7,
  totalLeads: 24,
})
assert.equal(summaryStatistic.whatsAppContactFormLeads, 7)
assert.equal(summaryStatistic.totalContactLeads, null)
assert.equal(summaryStatistic.unexpectedFields.length, 0)

console.log('Property24 statistics reporting contract passed')
