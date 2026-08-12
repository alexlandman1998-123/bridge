import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const pagePath = path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx')
const listingDetailPath = path.join(repoRoot, 'src/pages/AgentListingDetail.jsx')
const source = fs.readFileSync(pagePath, 'utf8')
const listingDetailSource = fs.readFileSync(listingDetailPath, 'utf8')
const removedPauseLabel = ['Digital signing', 'paused'].join(' ')
const removedSellerPackAction = ['Upload the signed Seller Pack documents', 'instead.'].join(' ')

function assertIncludes(snippet, message) {
  assert.ok(source.includes(snippet), message)
}

for (const [key, label] of [
  ['signed_mandate', 'Signed Mandate'],
  ['signed_defect_form', 'Signed Defect Form'],
  ['signed_fica_form', 'Signed FICA Form'],
]) {
  assertIncludes(`key: '${key}'`, `Kingstons Seller Pack must define ${key}.`)
  assertIncludes(`label: '${label}'`, `Kingstons Seller Pack must label ${label}.`)
}

assertIncludes('kingstons-seller-pack-overview', 'Overview tab must expose the three-column Kingston Seller Pack upload panel.')
assertIncludes('selectedKingstonsFormalValuationRow ? [selectedKingstonsFormalValuationRow] : []', 'Documents tab must include the Formal Valuation Document baseline row.')
assertIncludes('selectedLeadHasKingstonsPipelineSignal ? selectedKingstonsSellerPackRows : []', 'Documents tab must include the Kingstons legal Seller Pack baseline rows.')
assertIncludes("category: 'legal'", 'Signed Seller Pack rows must be grouped under Legal Documents.')
assertIncludes('handleKingstonsSellerPackUpload', 'Seller Pack uploads must have a dedicated upload handler.')
assertIncludes('openKingstonsSellerPackWizard', 'FICA seller details must be captured through the Seller Pack wizard.')
assertIncludes('Capture details', 'FICA upload must present a capture-details gate before upload.')
assertIncludes('Choose whether the FICA seller is a natural person or juristic person', 'Seller Portal link must be gated by FICA seller type.')
assertIncludes('Complete the Kingston Seller Pack before creating the listing.', 'Create listing must be gated by Seller Pack completion.')
assertIncludes('Send Seller Portal Link', 'Seller tab must use the Seller Portal Link wording.')
assertIncludes("selectedLeadHasKingstonsPipelineSignal && leadWorkspaceTab === 'mandate'", 'Kingstons seller leads must be redirected away from the digital Mandate tab.')
assertIncludes("handleLeadWorkspaceTabSelection('documents')", 'Kingstons digital mandate actions must redirect agents to manual Seller Pack uploads.')
assertIncludes("...(selectedLeadHasKingstonsPipelineSignal ? [] : [{ key: 'mandate', label: 'Mandate', meta: '' }])", 'Kingstons seller leads must not show the Mandate tab in the live workspace.')
assertIncludes("id === 'complete_seller_pack' || id === 'seller_pack_signed'", 'Kingstons quick actions must route manual Seller Pack actions.')
assertIncludes("openKingstonsSellerPackWizard(selectedKingstonsSellerPackSummary.sellerTypeCaptured ? 'details' : 'type')", 'Kingstons quick actions must prefer the manual Seller Pack capture/upload path over generated mandate/PDF actions.')
assert.ok(!/>\s*Seller Journey\s*<\/p>[\s\S]{0,2000}leadWorkspaceTab === 'seller'/.test(source), 'Seller Journey block should not remain at the bottom of the Seller tab.')
assert.equal(source.includes(removedPauseLabel), false, 'Kingstons seller lead workspace must not show the removed digital signing warning.')
assert.equal(source.includes(removedSellerPackAction), false, 'Kingstons seller lead workspace must not show the removed seller pack action copy.')

assert.ok(
    listingDetailSource.includes('listingHasKingstonsSellerProcess') &&
    listingDetailSource.includes('Upload signed Seller Pack') &&
    listingDetailSource.includes('open={mandateStartOpen && !listingHasKingstonsSellerProcess}') &&
    listingDetailSource.includes("openSellerWorkspaceSection('documents')"),
  'Kingstons listing detail must hide digital onboarding/mandate starts and route agents to manual Seller Pack upload.',
)
assert.equal(listingDetailSource.includes(removedPauseLabel), false, 'Kingstons listing detail must not show the removed digital signing warning.')
assert.equal(listingDetailSource.includes(removedSellerPackAction), false, 'Kingstons listing detail must not show the removed seller pack action copy.')
assert.equal(listingDetailSource.includes('kingstons-listing-digital-signing-decision'), false, 'Kingstons listing detail must not render the old digital signing warning panel.')

console.log('Kingstons seller lead pack phase 1 guard passed.')
