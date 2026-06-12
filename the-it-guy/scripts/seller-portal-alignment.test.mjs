import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'
import { buildSellerJourney } from '../src/services/sellerJourneyService.js'

const serviceSource = await fs.readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
assert.match(serviceSource, /buildSellerJourney/)
assert.match(serviceSource, /buildSellerPortalJourneyView/)

const clientPortalSource = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
assert.match(clientPortalSource, /sharedSellerPortalJourney/)
assert.match(clientPortalSource, /SellerStatusCards/)
assert.match(clientPortalSource, /sellerStatusCards/)
assert.match(clientPortalSource, /SellerPortalReadiness/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildSellerPortalJourneyView } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
  const journey = buildSellerJourney({
    lead: {
      leadId: 'seller-portal-1',
      leadCategory: 'seller',
      sellerPropertyAddress: '7 Portal Road',
      sellerOnboardingToken: 'seller-token',
      sellerOnboardingStatus: 'completed',
      listingId: 'listing-portal-1',
      mandatePacketId: 'packet-portal-1',
      createdAt: '2026-06-01T08:00:00Z',
    },
    appointments: [
      {
        leadId: 'seller-portal-1',
        appointmentType: 'seller_valuation',
        status: 'completed',
        completedAt: '2026-06-02T08:00:00Z',
      },
    ],
    listing: {
      id: 'listing-portal-1',
      sellerLeadId: 'seller-portal-1',
      listingStatus: 'active',
      listingVisibility: 'active_market',
      mandateStatus: 'signed',
      createdAt: '2026-06-04T08:00:00Z',
      activatedAt: '2026-06-05T08:00:00Z',
    },
    mandatePacketStatus: {
      packet: { id: 'packet-portal-1', status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
    documents: [
      { id: 'doc-1', documentType: 'id', status: 'approved', url: '/id.pdf' },
      { id: 'doc-2', documentType: 'title_deed', status: 'uploaded', url: '/title.pdf' },
    ],
  })

  const portalView = buildSellerPortalJourneyView({
    journey,
    requiredDocuments: [
      { key: 'id', label: 'ID', status: 'approved', complete: true },
      { key: 'rates', label: 'Rates Account', status: 'required', complete: false },
    ],
    documents: [
      { id: 'doc-1', document_type: 'id', status: 'approved' },
    ],
    offers: [
      { id: 'offer-1', status: 'seller_review', amount: 2300000 },
      { id: 'offer-2', status: 'rejected', amount: 2100000 },
    ],
  })

  assert.equal(portalView.currentStage.key, 'listing_live')
  assert.equal(portalView.stageMeta.currentStage.key, 'listing_live')
  assert.equal(portalView.stageMeta.currentStage.message.includes('listing is live'), true)
  assert.equal(portalView.progressPercent, 89)
  assert.equal(portalView.stages.find((step) => step.key === 'mandate_signed').state, 'completed')
  assert.equal(portalView.statusCards.find((card) => card.key === 'appointment').value, 'Completed')
  assert.equal(portalView.statusCards.find((card) => card.key === 'mandate').value, 'Signed')
  assert.equal(portalView.statusCards.find((card) => card.key === 'listing').value, 'Live')
  assert.equal(portalView.statusCards.find((card) => card.key === 'documents').value, '1 Outstanding')
  assert.equal(portalView.statusCards.find((card) => card.key === 'offers').value, '1 Received')
  assert.equal(portalView.statusCards.find((card) => card.key === 'readiness').value, 'Listing Live')
  assert.equal(portalView.readiness.status, 'completed')
  assert.equal(portalView.documents.find((document) => String(document.label).toLowerCase() === 'id').status, 'Approved')
} finally {
  await server.close()
}

console.log('seller portal alignment tests passed')
