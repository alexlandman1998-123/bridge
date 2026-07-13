import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getSellerMandateContinuityDiagnosticsSnapshot,
} from '../src/services/sellerMandateContinuityReportService.js'

const appRoot = resolve(import.meta.dirname, '..')

const reportService = readFileSync(resolve(appRoot, 'src/services/sellerMandateContinuityReportService.js'), 'utf8')
const diagnosticsPage = readFileSync(resolve(appRoot, 'src/pages/PlatformDiagnosticsPage.jsx'), 'utf8')
const sourceOfTruthContract = readFileSync(resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function createQueryBuilder(rows = [], tableName = '') {
  return {
    select() {
      return this
    },
    or() {
      return this
    },
    order() {
      return this
    },
    limit() {
      return this
    },
    eq() {
      return this
    },
    in() {
      return this
    },
    then(resolveThen) {
      return Promise.resolve({ data: rows, error: null }).then(resolveThen)
    },
    tableName,
  }
}

await test('report service exposes a shared diagnostics snapshot for phase 9', async () => {
  const tables = {
    private_listings: [
      {
        id: 'listing-ready',
        organisation_id: 'workspace-1',
        title: 'Ready listing',
        mandate_packet_id: 'packet-ready',
        mandate_status: 'signed',
        listing_status: 'mandate_signed',
        seller_lead_id: 'lead-ready',
        seller_workspace_token: 'seller-token-ready',
      },
    ],
    private_listing_documents: [
      {
        id: 'document-ready',
        private_listing_id: 'listing-ready',
        document_type: 'signed_mandate',
        document_name: 'Signed Mandate.pdf',
        document_visibility: 'seller_visible',
        file_path: 'mandates/packet-ready.pdf',
      },
    ],
    private_listing_activity: [
      {
        id: 'activity-ready',
        private_listing_id: 'listing-ready',
        activity_type: 'mandate_signed',
        visibility: 'client_visible',
        metadata: { visibility: 'client_visible' },
      },
    ],
    leads: [
      {
        lead_id: 'lead-ready',
        mandate_packet_id: 'packet-ready',
        mandate_status: 'signed',
      },
    ],
    document_packets: [
      {
        id: 'packet-ready',
        status: 'signed',
        final_signed_file_path: 'mandates/packet-ready.pdf',
      },
    ],
    client_portal_contexts: [
      {
        seller_workspace_token: 'seller-token-ready',
        mandate_packet_id: 'packet-ready',
      },
    ],
  }
  const client = {
    from(tableName) {
      return createQueryBuilder(tables[tableName] || [], tableName)
    },
  }

  const snapshot = await getSellerMandateContinuityDiagnosticsSnapshot({
    client,
    organisationId: 'workspace-1',
    limit: 10,
  })
  assert.equal(snapshot.summary.ready, 1)
  assert.equal(snapshot.gate.status, 'pass')
  assert.equal(snapshot.organisationId, 'workspace-1')
  assert.deepEqual(snapshot.queryWarnings, [])
})

await test('platform diagnostics imports and runs seller mandate continuity diagnostics', () => {
  assert.match(diagnosticsPage, /getSellerMandateContinuityDiagnosticsSnapshot/)
  assert.match(diagnosticsPage, /getSellerMandateContinuityReleaseGate/)
  assert.match(diagnosticsPage, /const \[mandateContinuity, setMandateContinuity\] = useState\(null\)/)
  assert.match(diagnosticsPage, /loadSellerMandateContinuityDiagnostics/)
  assert.match(diagnosticsPage, /organisationId:\s*currentWorkspace\?\.id/)
  assert.match(diagnosticsPage, /Run mandate continuity/)
})

await test('platform diagnostics renders a read-only seller mandate continuity panel', () => {
  assert.match(diagnosticsPage, />Seller mandate continuity</)
  assert.match(diagnosticsPage, /Audit signed mandate linkage across listings, leads, seller-visible documents, seller portal context, and activity feed\./)
  assert.match(diagnosticsPage, /mandateContinuityRows/)
  assert.match(diagnosticsPage, /mandateContinuityWarnings/)
  assert.match(diagnosticsPage, /record\.actionItems\?\.\[0\]/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.insert\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.update\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.upsert\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.delete\(/)
})

await test('phase 9 diagnostics console visibility is documented', () => {
  assert.match(sourceOfTruthContract, /## Diagnostics Console Visibility/)
  assert.match(sourceOfTruthContract, /getSellerMandateContinuityDiagnosticsSnapshot\(\)/)
  assert.match(sourceOfTruthContract, /does not repair records, resend documents, mutate activity, or\s+publish listings/)
})

await test('package exposes the phase 9 mandate diagnostics guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase9'],
    'node scripts/seller-mandate-phase9.test.mjs',
  )
})

await test('shared report service remains read-only', () => {
  assert.match(reportService, /fetchSellerMandateContinuityRows/)
  assert.match(reportService, /getSellerMandateContinuityDiagnosticsSnapshot/)
  assert.doesNotMatch(reportService, /\.insert\(/)
  assert.doesNotMatch(reportService, /\.update\(/)
  assert.doesNotMatch(reportService, /\.upsert\(/)
  assert.doesNotMatch(reportService, /\.delete\(/)
})

console.log('seller mandate phase 9 tests passed')
