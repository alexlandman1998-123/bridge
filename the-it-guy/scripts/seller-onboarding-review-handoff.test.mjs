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
  assert.match(pipelineSource, /sellerDocumentAction: sellerOnboardingReviewRoute === 'manual_upload' \? 'manual_upload' : 'digital_pack'/)
  assert.match(pipelineSource, /Approve & send mandate/)
})

test('listing signing workflow receives the handoff and opens the established FICA plus mandate pack', () => {
  assert.match(listingSource, /params\.get\('sellerDocumentAction'\)/)
  assert.match(listingSource, /openSellerDocumentSend\(\{ fica: true, mandate: true \}\)/)
  assert.match(listingSource, /setSellerMandateSignatureRoute\(requestedAction\)/)
  assert.match(listingSource, /params\.delete\('sellerDocumentAction'\)/)
})

test('review-handoff regression test is exposed as a package script', () => {
  assert.equal(packageJson.scripts?.['test:seller-onboarding-review-handoff'], 'node scripts/seller-onboarding-review-handoff.test.mjs')
})

console.log('seller onboarding review handoff checks passed')
