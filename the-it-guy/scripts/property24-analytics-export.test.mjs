import assert from 'node:assert/strict'
import { buildProperty24AnalyticsCsv, property24AnalyticsExportFilename } from '../src/services/property24AnalyticsExport.js'

const csv = buildProperty24AnalyticsCsv({
  period: { start: '2026-09-01', end: '2026-09-07' },
  performance: {
    connected: true,
    listingViews: 100,
    listingContactFormLeads: 2,
    whatsAppContactFormLeads: 3,
    totalContactLeads: 5,
    contactRate: 5,
    daily: [{ date: '2026-09-01', listingViews: 10, listingContactFormLeads: 1, whatsAppContactFormLeads: 0, totalContactLeads: 1 }],
    insights: [{ title: 'WhatsApp forms account for 60% of online forms', detail: '3 WhatsApp forms.' }],
  },
})
assert.match(csv, /"Listing views","100"/)
assert.match(csv, /"WhatsApp contact forms","3"/)
assert.match(csv, /"Daily date","Listing views"/)
assert.match(csv, /"Insight","Detail"/)
assert.equal(property24AnalyticsExportFilename({ end: '2026-09-07' }), 'property24-analytics-2026-09-07.csv')
console.log('Property24 analytics export passed.')
