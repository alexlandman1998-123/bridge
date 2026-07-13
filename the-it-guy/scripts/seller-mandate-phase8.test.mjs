import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createSellerMandateContinuityReport,
  getSellerMandateContinuityReleaseGate,
  renderSellerMandateContinuityMarkdown,
} from '../src/services/sellerMandateContinuityReportService.js'

const appRoot = resolve(import.meta.dirname, '..')

const reportService = readFileSync(resolve(appRoot, 'src/services/sellerMandateContinuityReportService.js'), 'utf8')
const reportScript = readFileSync(resolve(appRoot, 'scripts/report-seller-mandate-continuity.mjs'), 'utf8')
const sourceOfTruthContract = readFileSync(resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const readyRecord = {
  listing: {
    id: 'listing-ready',
    title: 'Ready signed mandate listing',
    mandatePacketId: 'packet-ready',
    mandateStatus: 'signed',
    listingStatus: 'mandate_signed',
    sellerWorkspaceToken: 'seller-token-ready',
  },
  lead: {
    id: 'lead-ready',
    mandatePacketId: 'packet-ready',
    mandateStatus: 'signed',
  },
  mandatePacket: {
    id: 'packet-ready',
    status: 'signed',
    finalSignedFilePath: 'mandates/packet-ready.pdf',
    finalSignedFileName: 'Signed Mandate.pdf',
  },
  documents: [
    {
      id: 'doc-ready',
      documentType: 'signed_mandate',
      documentName: 'Signed Mandate.pdf',
      visibility: 'seller_visible',
      filePath: 'mandates/packet-ready.pdf',
    },
  ],
  activityEvents: [
    {
      id: 'activity-ready',
      eventType: 'mandate_signed',
      visibility: 'client_visible',
      eventData: { title: 'Signed mandate received' },
    },
  ],
  portalContext: {
    mandatePacketId: 'packet-ready',
  },
  sellerWorkspaceToken: 'seller-token-ready',
}

const blockedRecord = {
  listing: {
    id: 'listing-blocked',
    title: 'Blocked signed mandate listing',
    mandateStatus: 'pending',
    listingStatus: 'mandate_signed',
  },
  lead: {
    id: 'lead-blocked',
  },
  documents: [],
  activityEvents: [],
}

test('phase 8 report service reuses the shared continuity model', () => {
  assert.match(reportService, /buildSellerMandateContinuityModel/)
  assert.match(reportService, /createSellerMandateContinuityReport/)
  assert.match(reportService, /getSellerMandateContinuityReleaseGate/)
  assert.match(reportService, /renderSellerMandateContinuityMarkdown/)
})

test('continuity report summarizes ready and blocked signed mandate records', () => {
  const report = createSellerMandateContinuityReport({
    generatedAt: '2026-07-13T08:00:00.000Z',
    records: [readyRecord, blockedRecord],
  })
  assert.equal(report.summary.total, 2)
  assert.equal(report.summary.ready, 1)
  assert.equal(report.summary.blocked, 1)
  assert.equal(report.summary.status, 'blocked')
  assert.equal(report.records[0].listingId, 'listing-blocked')
  assert.ok(report.records[0].actionItems.some((item) => item.includes('mandate packet id')))
  assert.equal(report.records.find((record) => record.listingId === 'listing-ready').ready, true)
})

test('release gate and markdown rendering are available for operational checks', () => {
  const blockedReport = createSellerMandateContinuityReport({ records: [blockedRecord] })
  const readyReport = createSellerMandateContinuityReport({ records: [readyRecord] })
  assert.equal(getSellerMandateContinuityReleaseGate(blockedReport).exitCode, 1)
  assert.equal(getSellerMandateContinuityReleaseGate(readyReport).exitCode, 0)
  const markdown = renderSellerMandateContinuityMarkdown(blockedReport)
  assert.match(markdown, /# Seller Mandate Continuity Report/)
  assert.match(markdown, /Blocked signed mandate listing/)
})

test('report script is read-only and fetches the signed mandate continuity graph', () => {
  assert.match(reportScript, /getSellerMandateContinuityDiagnosticsSnapshot/)
  assert.match(reportService, /private_listings/)
  assert.match(reportService, /private_listing_documents/)
  assert.match(reportService, /private_listing_activity/)
  assert.match(reportService, /document_packets/)
  assert.match(reportService, /client_portal_contexts/)
  assert.doesNotMatch(reportScript, /\.insert\(/)
  assert.doesNotMatch(reportScript, /\.update\(/)
  assert.doesNotMatch(reportScript, /\.upsert\(/)
  assert.doesNotMatch(reportScript, /\.delete\(/)
})

test('phase 8 operational audit is documented in the source of truth', () => {
  assert.match(sourceOfTruthContract, /## Operational Continuity Audit/)
  assert.match(sourceOfTruthContract, /createSellerMandateContinuityReport\(\)/)
  assert.match(sourceOfTruthContract, /npm run report:seller-mandate-continuity/)
  assert.match(sourceOfTruthContract, /must not\s+repair, backfill, delete, or publish data/)
})

test('package exposes the phase 8 mandate report and guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase8'],
    'node scripts/seller-mandate-phase8.test.mjs',
  )
  assert.equal(
    packageJson.scripts['report:seller-mandate-continuity'],
    'node scripts/report-seller-mandate-continuity.mjs',
  )
})

console.log('seller mandate phase 8 tests passed')
