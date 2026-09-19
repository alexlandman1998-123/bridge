import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [pipelineSource, listingSource, packageJson] = await Promise.all([
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
])

function test(name, run) {
  try {
    run()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('seller journey review opens the onboarding review modal instead of only scrolling the rail', () => {
  const reviewAction = pipelineSource.match(/if \(id === 'review_seller_onboarding'\) \{([\s\S]*?)\n    \}/)
  assert.ok(reviewAction, 'review seller onboarding action must exist')
  assert.match(reviewAction[1], /openSellerOnboardingReview\(\)/)
  assert.doesNotMatch(reviewAction[1], /scrollIntoView/)
  assert.match(pipelineSource, /title="Review submitted seller onboarding"/)
})

test('review handoff preserves both digital and physical signing choices', () => {
  assert.match(pipelineSource, /sellerOnboardingReviewRoute === 'digital_pack'/)
  assert.match(pipelineSource, /sellerOnboardingReviewRoute === 'manual_upload'/)
  assert.match(pipelineSource, /Open FICA \+ mandate signing pack/)
  assert.match(pipelineSource, /Open physical-signing pack/)
  assert.match(pipelineSource, /function openSellerLeadSigningPack\(\)/)
  assert.match(pipelineSource, /openSellerLeadSigningPack\(\)/)
})

test('opening the mandate pack does not create a market listing', () => {
  const action = pipelineSource.match(/if \(id === 'generate_mandate'\) \{([\s\S]*?)\n    \}/)
  assert.ok(action, 'generate mandate action must exist')
  assert.doesNotMatch(action[1], /handleCreateListingFromSellerLead/)
  assert.match(action[1], /market listing is not created by preparing a mandate/)

  const handoff = pipelineSource.match(/function continueSellerOnboardingReview\(\) \{([\s\S]*?)\n  \}/)
  assert.ok(handoff, 'seller onboarding review handoff must exist')
  assert.doesNotMatch(handoff[1], /createPrivateListing|handleCreateListingFromSellerLead/)
  assert.doesNotMatch(handoff[1], /navigate\(/)
})

test('seller lead owns the signing-pack send action', () => {
  assert.match(pipelineSource, /async function sendSellerLeadSigningPack\(\)/)
  assert.match(pipelineSource, /invokeEdgeFunction\('listing-mandate-signing'/)
  assert.match(pipelineSource, /selectedDocuments: \['fica', 'mandate'\]/)
  assert.match(pipelineSource, /The signing links were prepared but email delivery was not confirmed/)
  assert.match(pipelineSource, /createSellerOnboardingFormalPackApproval/)
  assert.match(pipelineSource, /createSellerOnboardingFormalPackDispatch/)
  assert.match(pipelineSource, /createSellerOnboardingManualSigningPack/)
  assert.match(pipelineSource, /Primary document contact/)
  assert.doesNotMatch(pipelineSource.match(/function continueSellerOnboardingReview\(\) \{([\s\S]*?)\n  \}/)?.[1] || '', /sellerDocumentAction/)
})

test('review-handoff regression test is exposed as a package script', () => {
  assert.equal(packageJson.scripts?.['test:seller-onboarding-review-handoff'], 'node scripts/seller-onboarding-review-handoff.test.mjs')
})

console.log('seller onboarding review handoff checks passed')
