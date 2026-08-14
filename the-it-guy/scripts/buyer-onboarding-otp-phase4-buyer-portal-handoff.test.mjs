import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(source, /import \{ getOrCreateClientPortalLink \} from '..\/..\/lib\/api'/, 'OTP upload should reuse the transaction client portal link helper.')

const uploadFormStateStart = source.indexOf('const [buyerOfferUploadForm, setBuyerOfferUploadForm] = useState({')
const uploadFormStateEnd = source.indexOf('})', uploadFormStateStart)
assert.ok(uploadFormStateStart > -1 && uploadFormStateEnd > uploadFormStateStart, 'Buyer OTP upload form state should be sliceable.')
const uploadFormStateBlock = source.slice(uploadFormStateStart, uploadFormStateEnd)
assert.match(uploadFormStateBlock, /sendBuyerPortalLink: false/, 'Buyer portal handoff should be an explicit upload-form decision.')

const portalHelperStart = source.indexOf('async function sendBuyerPortalLinkAfterOtpUpload')
const portalHelperEnd = source.indexOf('function openBuyerOtpUploadPicker', portalHelperStart)
assert.ok(portalHelperStart > -1 && portalHelperEnd > portalHelperStart, 'Buyer portal handoff helper should be sliceable.')
const portalHelperBlock = source.slice(portalHelperStart, portalHelperEnd)

assert.match(portalHelperBlock, /getOrCreateClientPortalLink\(portalContext\)/, 'Portal handoff should create or reuse the canonical transaction portal link.')
assert.match(portalHelperBlock, /type: 'client_portal_link'/, 'Portal handoff should send the canonical client portal email type.')
assert.match(portalHelperBlock, /reason: 'missing_portal_context'/, 'Portal handoff should skip cleanly when transaction, development, or unit context is missing.')
assert.match(portalHelperBlock, /reason: 'missing_buyer_email'/, 'Portal handoff should skip cleanly when buyer email is missing.')

const uploadHandlerStart = source.indexOf('async function handleUploadBuyerOfferDocument')
const uploadHandlerEnd = source.indexOf('function openSelectedLeadOtpEditor', uploadHandlerStart)
assert.ok(uploadHandlerStart > -1 && uploadHandlerEnd > uploadHandlerStart, 'OTP upload handler should be sliceable.')
const uploadHandlerBlock = source.slice(uploadHandlerStart, uploadHandlerEnd)

assert.match(uploadHandlerBlock, /shouldSendBuyerPortalLink = otpAttorneyInstructionContext\?\.sendBuyerPortalLink === true \|\| buyerOfferUploadForm\.sendBuyerPortalLink === true/, 'OTP upload should honour the modal or upload-form buyer portal decision.')
assert.match(uploadHandlerBlock, /buyerPortalLinkRequested: shouldSendBuyerPortalLink/, 'Uploaded OTP metadata should record whether buyer portal handoff was requested.')
assert.match(uploadHandlerBlock, /buyerPortalHandoffResult = await sendBuyerPortalLinkAfterOtpUpload/, 'OTP upload should attempt portal handoff after transaction context exists.')
assert.match(uploadHandlerBlock, /buyerPortalHandoffWarning/, 'Portal handoff warnings should be tracked without aborting the OTP upload.')
assert.match(uploadHandlerBlock, /buyerOtpPortalHandoff/, 'Lead payload should persist the portal handoff result for follow-up.')
assert.match(uploadHandlerBlock, /OTP uploaded, but the buyer portal handoff needs attention/, 'Portal handoff failure should surface as an attention warning after upload.')
assert.match(uploadHandlerBlock, /Buyer portal link sent\./, 'Successful handoff should be visible in activity or success messaging.')

const uploadCardHeading = source.indexOf('Signed OTP Upload')
const uploadCardStart = source.lastIndexOf('<section', uploadCardHeading)
const uploadCardEnd = source.indexOf('</section>', source.indexOf('Upload Signed OTP', uploadCardStart))
assert.ok(uploadCardStart > -1 && uploadCardEnd > uploadCardStart, 'Signed OTP upload card should be sliceable.')
const uploadCardBlock = source.slice(uploadCardStart, uploadCardEnd)
assert.match(uploadCardBlock, /Buyer portal link/, 'Signed OTP upload card should expose the buyer portal handoff choice.')
assert.match(uploadCardBlock, /sendBuyerPortalLink: previous\.sendBuyerPortalLink !== true/, 'Signed OTP upload card should toggle the buyer portal handoff choice.')

const modalTestIdIndex = source.indexOf('data-testid="buyer-otp-attorney-of-record-modal"')
const modalStart = source.lastIndexOf('<Modal', modalTestIdIndex)
const modalEnd = source.indexOf('<Modal', modalTestIdIndex + 1)
assert.ok(modalTestIdIndex > -1 && modalStart > -1 && modalEnd > modalStart, 'Attorney of record modal should be sliceable.')
const modalBlock = source.slice(modalStart, modalEnd)

assert.match(modalBlock, /Buyer portal link/, 'Attorney modal should carry the buyer portal handoff decision.')
assert.match(modalBlock, /sendBuyerPortalLink/, 'Attorney modal should toggle the portal decision before upload.')
assert.match(modalBlock, /Upload OTP & Send Portal|Upload OTP, Send Instruction & Portal/, 'Attorney modal primary action should reflect the portal send path.')

console.log('Buyer Onboarding / OTP Phase 4 buyer portal handoff contract passed.')
