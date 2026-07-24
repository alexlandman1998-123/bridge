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

  const pageSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
  assert.match(pageSource, /lifecycle\.includes\('seller'\)/, 'seller lifecycle stages should force seller workspace rendering')
  assert.match(pageSource, /safeRow\.sellerOnboarding \|\| safeRow\.seller_onboarding/, 'seller onboarding payloads should force seller workspace rendering')

  console.log('Seller lead display fallback verified.')
} finally {
  await server.close()
}
