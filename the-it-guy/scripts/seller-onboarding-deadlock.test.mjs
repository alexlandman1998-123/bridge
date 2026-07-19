import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const listingDetailSource = await fs.readFile(new URL('src/pages/AgentListingDetail.jsx', appRoot), 'utf8')
const privateListingSource = await fs.readFile(new URL('src/services/privateListingService.js', appRoot), 'utf8')

const editSellerHandler = listingDetailSource.match(/function handleEditSellerProfile\(\) \{[\s\S]*?\n  }\n\n  async function handleSaveSellerContact/)?.[0] || ''
const saveSellerHandler = listingDetailSource.match(/async function handleSaveSellerContact\(event\) \{[\s\S]*?\n  }\n\n  function handleDownloadSellerProfilePdf/)?.[0] || ''
const sendPortalHandler = listingDetailSource.match(/async function handleResendSellerClientPortalLink\(\) \{[\s\S]*?\n  }\n\n  async function handleResetSellerPortalPasswordAndResend/)?.[0] || ''
const sendOnboarding = privateListingSource.match(/export async function sendSellerOnboarding\([\s\S]*?\n}\n\nexport async function/)?.[0] || ''

assert.match(editSellerHandler, /setSellerContactEditorOpen\(true\)/, 'Edit Seller must open a contact editor without requiring a portal link.')
assert.doesNotMatch(editSellerHandler, /No seller portal link is linked yet/, 'Edit Seller must not direct the user back to onboarding before contact data can be changed.')
assert.match(saveSellerHandler, /updatePrivateListing\(/, 'Seller contact changes must persist to the listing.')
assert.match(saveSellerHandler, /updatePrivateListingOnboardingFormData\(/, 'Seller contact changes must create or update a draft onboarding record.')
assert.match(saveSellerHandler, /status: .*not_started/, 'Pre-onboarding contact saves must preserve a non-completed onboarding status.')
assert.match(saveSellerHandler, /fetchAgencyCrmLeadWorkspace/, 'Seller contact saves must find the linked CRM contact.')
assert.match(saveSellerHandler, /updateAgencyCrmContactRecord/, 'Seller contact saves must update the linked CRM contact.')
assert.match(sendPortalHandler, /if \(!resolveSellerPortalTokenFromListing\(listingRecord\)\) \{\s*await handleSendSellerOnboardingFollowUp\(\)/, 'Send Seller Portal Link must create/send onboarding when no portal token exists.')
assert.match(listingDetailSource, /Seller contact details/, 'Seller workspace must render the pre-onboarding contact editor.')
assert.match(listingDetailSource, /No portal link required/, 'Seller workspace must explain that contact editing is independent of onboarding.')
assert.match(sendOnboarding, /sellerFirstName,[\s\S]*?firstName: sellerFirstName/, 'New onboarding records must include the seller first name.')
assert.match(sendOnboarding, /sellerEmail: resolvedSellerEmail/, 'New onboarding records must include the seller email.')
assert.match(sendOnboarding, /sellerPhone: resolvedSellerPhone/, 'New onboarding records must include the seller phone.')

console.log('seller onboarding deadlock checks passed')
