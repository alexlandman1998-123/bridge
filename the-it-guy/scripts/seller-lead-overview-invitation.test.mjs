import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const page = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const activation = await readFile(new URL('../src/services/sellerPortalActivationService.js', import.meta.url), 'utf8')
const email = await readFile(new URL('../../supabase/functions/send-email/content/sellerOnboarding.ts', import.meta.url), 'utf8')
const summary = page.split('const selectedSellerSummarySections = useMemo(() => {')[1]?.split('const selectedLeadPropertyWorkspace = useMemo(')[0] || ''
const action = page.split('function handleSellerOnboardingCommand() {')[1]?.split('async function handleCaptureSellerOnboardingManually()')[0] || ''

assert.match(summary, /const propertyFromListing = selectedSellerJourney\.listingCreated === true/)
assert.ok(summary.indexOf('onboarding?.propertyAddress') < summary.indexOf('lead?.sellerPropertyAddress'))
assert.ok(summary.indexOf('lead?.sellerPropertyAddress') < summary.indexOf('listing?.propertyAddress,\n'))
assert.ok(summary.indexOf('onboarding?.propertyType') < summary.indexOf('lead?.propertyType'))
assert.doesNotMatch(summary, /\['Property Type',[\s\S]*?onboarding\?\.propertyStructureType/)
assert.match(action, /selectedLeadNeedsOnboardingReplacement \|\| !selectedSellerJourney\.onboardingSubmitted[\s\S]*requestSellerOnboardingAttorneySelection\(\)/)
assert.match(page, /listingCreated: selectedSellerJourney\.listingCreated === true/)
assert.match(activation, /listingCreated \? 'existing_listing' : 'portal_documents'/)
assert.match(activation, /const submittedStatus = onboardingStatuses\.find/)
assert.match(email, /normalizedKind === "portal_documents"/)
assert.match(email, /Thanks - your seller onboarding has been submitted\./)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { buildSellerPortalInvitationPreview } = await server.ssrLoadModule('/src/services/sellerPortalActivationService.js')
  const preListing = buildSellerPortalInvitationPreview({ listingCreated: false, propertyAddress: '12 Main Street' })
  const listed = buildSellerPortalInvitationPreview({ listingCreated: true, propertyAddress: '12 Main Street' })
  assert.match(preListing.body, /mandate and listing steps/)
  assert.doesNotMatch(preListing.body, /already listed/)
  assert.match(listed.body, /already listed/)
} finally {
  await server.close()
}

console.log('seller lead overview and invitation checks passed')
