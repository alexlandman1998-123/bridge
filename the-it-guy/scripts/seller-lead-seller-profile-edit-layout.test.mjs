import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// The profile form is lazy, while its canonical save controller stays in the page.
const source = (await Promise.all(['AgencyPipelinePage.jsx', 'SellerLeadProfileDialog.jsx'].map(name =>
  readFile(new URL(`../src/pages/agency/${name}`, import.meta.url), 'utf8'),
))).join('\n')

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

for (const editTarget of ['card.editMode || card.key', "'features'", "'defects'"]) {
  assert.ok(sellerProfileBlock.includes(`openSellerLeadEditModal(${editTarget})`), `Seller Profile edit button should open ${editTarget} edit mode.`)
}

assert.ok(source.includes('open={sellerLeadEditModal.open && selectedLeadIsSeller}'), 'Seller Profile edit modal should open for all seller leads.')
assert.ok(!source.includes('open={sellerLeadEditModal.open && selectedLeadIsSeller && selectedLeadHasKingstonsPipelineSignal}'), 'Seller Profile edit modal should not be gated by Kingstons pipeline signal.')
assert.ok(source.includes('onSubmit={(event) => void handleSaveSellerLeadEditDetails(event)}'), 'Seller Profile edit modal should save through the seller profile save handler.')
assert.match(source, /if \(!sellerLeadEditModal\.open && !isLeadDetailSaving\) \{\s*setSellerProfileEditForm\(buildKingstonsSellerProfileEditForm\(/, 'Background lead hydration must not replace an open Seller Profile draft.')

const openHandlerStart = source.indexOf("  function openSellerLeadEditModal(mode = 'profile')")
assert.ok(openHandlerStart >= 0, 'Seller profile open handler must exist.')
const nextHandlerStart = source.indexOf('\n  function ', openHandlerStart + 1)
const openHandlerSource = source.slice(openHandlerStart, nextHandlerStart)
const persisted = { lead: { leadId: 'seller-one' }, contact: { name: 'Latest contact' }, listing: { sellerOnboarding: { status: 'submitted' } } }
const latestDraft = { firstName: 'Latest persisted seller' }
let builderInput, shownDraft
const baseline = { current: null }
const inputs = {
  selectedLead: persisted.lead, selectedLeadContact: persisted.contact, selectedLeadLinkedListing: persisted.listing,
  buildKingstonsSellerProfileEditForm: value => { builderInput = value; return latestDraft },
  sellerProfileEditBaselineRef: baseline, normalizeLeadIdentityKey: value => String(value || ''),
  setSellerProfileEditForm: value => { shownDraft = value }, setSellerLeadEditModal: () => {},
  normalizeKey: value => String(value || '').trim().toLowerCase(), setError: () => {},
}
const openProfile = Function(...Object.keys(inputs), `return (${openHandlerSource})`)(...Object.values(inputs))
openProfile('profile')
assert.deepEqual(builderInput, persisted, 'Opening the editor must use the latest saved lead, contact and listing.')
assert.equal(shownDraft, latestDraft, 'The freshly built draft must be shown in the editor.')
assert.deepEqual(baseline.current.form, latestDraft, 'Saving must compare against the opened draft.')
assert.notEqual(baseline.current.form, shownDraft, 'Editing must not mutate the comparison snapshot.')

console.log('Seller lead seller profile edit layout verified.')
