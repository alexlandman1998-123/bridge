import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSellerMandateContinuityModel } from '../src/services/sellerMandateContinuityService.js'

const appRoot = resolve(import.meta.dirname, '..')

const legalWorkspacePage = readFileSync(
  resolve(appRoot, 'src/pages/LegalDocumentWorkspacePage.jsx'),
  'utf8',
)
const clientPortalWorkspaceService = readFileSync(
  resolve(appRoot, 'src/services/clientPortalWorkspaceService.js'),
  'utf8',
)
const sourceOfTruthContract = readFileSync(
  resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'),
  'utf8',
)
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

test('continuity model reports ready when signed mandate reaches all seller surfaces', () => {
  const model = buildSellerMandateContinuityModel({
    lead: { leadId: 'lead-1', mandatePacketId: 'packet-1', mandateStatus: 'signed' },
    listing: { id: 'listing-1', mandatePacketId: 'packet-1', mandateStatus: 'signed' },
    mandatePacket: {
      id: 'packet-1',
      state: 'fully_signed',
      finalSignedFilePath: 'mandates/packet-1/final.pdf',
      finalSignedFileName: 'Signed Mandate.pdf',
    },
    documents: [
      {
        id: 'doc-1',
        document_type: 'signed_mandate',
        document_name: 'Signed Mandate.pdf',
        visibility: 'seller_visible',
        file_path: 'mandates/packet-1/final.pdf',
      },
    ],
    activityEvents: [
      {
        id: 'event-1',
        eventType: 'mandate_signed',
        visibility: 'client_visible',
        eventData: { title: 'Signed mandate received', actionRoute: 'documents' },
      },
    ],
    portalContext: { mandate_packet_id: 'packet-1' },
    sellerWorkspaceToken: 'seller-token',
  })

  assert.equal(model.status, 'ready')
  assert.equal(model.ready, true)
  assert.equal(model.packetId, 'packet-1')
  assert.equal(model.signedDocumentId, 'doc-1')
  assert.equal(model.blockers.length, 0)
})

test('continuity model blocks when listing, document, and activity continuity is missing', () => {
  const model = buildSellerMandateContinuityModel({
    lead: { leadId: 'lead-1', mandatePacketId: 'packet-1', mandateStatus: 'signed' },
    listing: { id: 'listing-1', mandateStatus: 'draft' },
    mandatePacket: { id: 'packet-1', state: 'generated' },
    documents: [],
    activityEvents: [],
  })

  assert.equal(model.status, 'blocked')
  assert.equal(model.ready, false)
  assert.equal(model.blockers.some((check) => check.key === 'listing_packet_linked'), true)
  assert.equal(model.blockers.some((check) => check.key === 'seller_visible_signed_document'), true)
  assert.equal(model.blockers.some((check) => check.key === 'seller_visible_activity'), true)
})

test('legal workspace dispatches the signed mandate event consumed by pipeline workspaces', () => {
  assert.match(legalWorkspacePage, /new CustomEvent\('itg:seller-mandate-signed'/)
  assert.match(legalWorkspacePage, /sellerOnboardingToken:\s*sellerWorkspaceToken/)
  assert.match(legalWorkspacePage, /privateListingId:\s*linkedListingId/)
  assert.match(legalWorkspacePage, /mandatePacketId:\s*packetId/)
  assert.match(legalWorkspacePage, /documentId:\s*normalizeText\(linkedDocument\?\.id \|\| artifact\.finalSignedDocumentId\)/)
})

test('seller portal payload exposes mandate continuity next to seller journey data', () => {
  assert.match(clientPortalWorkspaceService, /buildSellerMandateContinuityModel/)
  assert.match(clientPortalWorkspaceService, /sellerMandateContinuity/)
  assert.match(clientPortalWorkspaceService, /mandateContinuity:\s*sellerMandateContinuity/)
  assert.match(clientPortalWorkspaceService, /mandateContinuityStatus:\s*sellerMandateContinuity\.status/)
})

test('source of truth documents phase 6 runtime continuity', () => {
  assert.match(sourceOfTruthContract, /## Signed Mandate Runtime Continuity/)
  assert.match(sourceOfTruthContract, /buildSellerMandateContinuityModel\(\)/)
  assert.match(sourceOfTruthContract, /itg:seller-mandate-signed/)
})

test('package exposes the phase 6 mandate continuity guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase6'],
    'node scripts/seller-mandate-phase6.test.mjs',
  )
})

console.log('seller mandate phase 6 tests passed')
