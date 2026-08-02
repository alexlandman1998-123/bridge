import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildAgentLeadRows } = await server.ssrLoadModule('/src/services/agentLeadWorkspaceService.js')
  const rows = buildAgentLeadRows({
    leads: [{
      leadId: 'seller-submitted-placeholder',
      leadSource: 'Manual Entry',
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      name: 'Unnamed Lead',
      listingId: 'listing-submitted',
      createdAt: '2026-05-05T08:00:00.000Z',
    }],
    contacts: [],
    listings: [{
      id: 'listing-submitted',
      seller_lead_id: 'seller-submitted-placeholder',
      listing_status: 'seller_lead',
      seller_onboarding_status: 'completed',
      seller_onboarding: {
        status: 'completed',
        form_data: {
          fullName: 'Adrian Lansberg',
          email: 'adrian@example.test',
          phone: '+27823334444',
          propertyAddress: '39 Dromedaris Avenue, Reigerpark',
          suburb: 'Reigerpark',
          city: 'Boksburg',
        },
      },
    }],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Adrian Lansberg')
  assert.equal(rows[0].email, 'adrian@example.test')
  assert.equal(rows[0].phone, '+27823334444')
  assert.equal(rows[0].sellerPropertyAddress, '39 Dromedaris Avenue, Reigerpark, Boksburg')
  assert.equal(rows[0].listings[0].title, '39 Dromedaris Avenue, Reigerpark')

  const canonicalRows = buildAgentLeadRows({
    leads: [{
      leadId: 'seller-canonical-placeholder',
      leadSource: 'Manual Entry',
      leadCategory: 'seller',
      stage: 'Seller Onboarding Sent',
      status: 'Sent',
      name: 'Unnamed Lead',
      listingId: 'listing-canonical',
      createdAt: '2026-05-05T08:00:00.000Z',
    }],
    contacts: [],
    listings: [{
      id: 'listing-canonical',
      listing_status: 'seller_lead',
      sellerName: 'Bianca Seller',
      sellerEmail: 'bianca@example.test',
      sellerPhone: '+27825556666',
      sellerCanonicalFacts: {
        sellerName: 'Canonical Seller',
      },
    }],
  })

  assert.equal(canonicalRows[0].name, 'Bianca Seller')
  assert.equal(canonicalRows[0].email, 'bianca@example.test')
  assert.equal(canonicalRows[0].phone, '+27825556666')

  const canonicalFactsRows = buildAgentLeadRows({
    leads: [{
      leadId: 'seller-canonical-facts-placeholder',
      leadSource: 'Manual Entry',
      leadCategory: 'seller',
      stage: 'Seller Onboarding Sent',
      status: 'Sent',
      name: 'Unnamed Lead',
      listingId: 'listing-canonical-facts',
      createdAt: '2026-05-05T08:00:00.000Z',
    }],
    contacts: [],
    listings: [{
      id: 'listing-canonical-facts',
      listing_status: 'seller_lead',
      sellerCanonicalFacts: {
        sellerName: 'Canonical Seller',
      },
    }],
  })

  assert.equal(canonicalFactsRows[0].name, 'Canonical Seller')

  const sentOnlyRows = buildAgentLeadRows({
    leads: [{
      leadId: 'seller-sent-placeholder',
      leadSource: 'Manual Entry',
      leadCategory: 'seller',
      stage: 'Seller Onboarding Sent',
      status: 'Seller Onboarding Sent',
      name: 'Unnamed Lead',
      sellerPropertyAddress: '409 Queens Cres, Menlo Park',
      listingId: 'listing-sent-only',
      createdAt: '2026-07-26T18:00:00.000Z',
    }],
    contacts: [],
    listings: [{
      id: 'listing-sent-only',
      seller_lead_id: 'seller-sent-placeholder',
      listing_status: 'seller_lead',
      title: 'Untitled listing',
      seller_onboarding_status: 'sent',
    }],
  })

  assert.equal(sentOnlyRows[0].name, 'Seller lead - 409 Queens Cres, Menlo Park')
  assert.notEqual(sentOnlyRows[0].name, 'Unnamed Lead')

  const mandatePacketRows = buildAgentLeadRows({
    leads: [{
      leadId: 'seller-with-duplicate-mandates',
      leadSource: 'Manual Entry',
      leadCategory: 'seller',
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      name: 'Generated Packet Seller',
      createdAt: '2026-08-02T18:00:00.000Z',
    }],
    documentPackets: [
      {
        id: 'draft-newer',
        lead_id: 'seller-with-duplicate-mandates',
        packet_type: 'mandate',
        status: 'draft',
        current_version_number: 1,
        updated_at: '2026-08-02T18:48:24.000Z',
      },
      {
        id: 'generated-older',
        lead_id: 'seller-with-duplicate-mandates',
        packet_type: 'mandate',
        status: 'draft',
        current_version_number: 2,
        updated_at: '2026-08-02T13:46:19.000Z',
      },
    ],
  })

  assert.equal(mandatePacketRows[0].mandatePacket.id, 'generated-older')
  assert.equal(mandatePacketRows[0].mandatePacketId, 'generated-older')

  const serviceSource = await readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
  assert.match(serviceSource, /resolvedWorkspaceListingId = normalizeText\(workspace\?\.listingId/, 'lead workspace fetch should retain repository-resolved listing ids')
  assert.match(serviceSource, /listingId: getListingId\(lead\) \|\| resolvedWorkspaceListingId/, 'lead workspace context should use repository-resolved listing ids')
  assert.match(serviceSource, /sortMandatePacketsForSigning/, 'lead workspace should prefer signable mandate packets over newer draft-only retries')

  const pageSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
  assert.match(pageSource, /lifecycle\.includes\('seller'\)/, 'seller lifecycle stages should force seller workspace rendering')
  assert.match(pageSource, /safeRow\.sellerOnboarding \|\| safeRow\.seller_onboarding/, 'seller onboarding payloads should force seller workspace rendering')
  assert.match(pageSource, /sellerDisplayName/, 'seller workspace header should render a sanitized display name')

  console.log('Seller lead display fallback verified.')
} finally {
  await server.close()
}
