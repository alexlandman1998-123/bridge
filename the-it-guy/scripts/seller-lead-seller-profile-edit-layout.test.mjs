import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const sellerProfileStart = source.indexOf("leadWorkspaceTab === 'seller' && selectedLeadIsSeller")
assert.notEqual(sellerProfileStart, -1, 'Seller lead Seller Profile workspace block should exist.')

const propertyTabStart = source.indexOf("leadWorkspaceTab === 'property' && selectedLeadIsSeller", sellerProfileStart)
assert.notEqual(propertyTabStart, -1, 'Seller lead Property workspace marker should follow Seller Profile block.')

const sellerProfileBlock = source.slice(sellerProfileStart, propertyTabStart)

assert.ok(sellerProfileBlock.includes('<div className="min-w-0 space-y-5">'), 'Seller Profile workspace should use a single full-width column.')
assert.ok(!sellerProfileBlock.includes('xl:grid-cols-[minmax(0,1fr)_330px]'), 'Seller Profile workspace should not render the old right-hand column grid.')

for (const removedSidebarContent of ['<aside', 'Seller Readiness', 'Quick Actions', 'Documents Overview', 'Recent Activity']) {
  assert.ok(!sellerProfileBlock.includes(removedSidebarContent), `Seller Profile workspace should not render the old sidebar content: ${removedSidebarContent}.`)
}

for (const removedSidebarData of ['selectedSellerProfileReadiness', 'selectedSellerDocumentOverview']) {
  assert.ok(!sellerProfileBlock.includes(removedSidebarData), `Seller Profile workspace should not depend on removed sidebar data: ${removedSidebarData}.`)
}

for (const editTarget of ['card.key', "'features'", "'defects'"]) {
  assert.ok(sellerProfileBlock.includes(`openSellerLeadEditModal(${editTarget})`), `Seller Profile edit button should open ${editTarget} edit mode.`)
}

assert.ok(source.includes('open={sellerLeadEditModal.open && selectedLeadIsSeller}'), 'Seller Profile edit modal should open for all seller leads.')
assert.ok(!source.includes('open={sellerLeadEditModal.open && selectedLeadIsSeller && selectedLeadHasKingstonsPipelineSignal}'), 'Seller Profile edit modal should not be gated by Kingstons pipeline signal.')
assert.ok(source.includes('onSubmit={(event) => void handleSaveSellerLeadEditDetails(event)}'), 'Seller Profile edit modal should save through the seller profile save handler.')

console.log('Seller lead seller profile edit layout verified.')
