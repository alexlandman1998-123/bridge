import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const workspaceStart = source.indexOf('data-testid="buyer-onboarding-otp-intake-choice"')
const workspaceEnd = source.indexOf('{leadWorkspaceTab === \'seller\'', workspaceStart)

assert.notEqual(workspaceStart, -1, 'Onboarding / OTP workspace should expose the buyer intake choice section.')
assert.ok(workspaceEnd > workspaceStart, 'Onboarding / OTP workspace block should be sliceable.')

const workspaceBlock = source.slice(workspaceStart, workspaceEnd)
const quickStartIntroStart = source.indexOf('function resolveOtpQuickStartIntro')
const quickStartIntroEnd = source.indexOf('function dedupeByKey', quickStartIntroStart)

assert.ok(quickStartIntroStart > -1 && quickStartIntroEnd > quickStartIntroStart, 'OTP quick-start intro should be sliceable.')

const quickStartIntroBlock = source.slice(quickStartIntroStart, quickStartIntroEnd)

assert.match(quickStartIntroBlock, /Buyer onboarding can continue in parallel/, 'Quick-start copy should not make onboarding a prerequisite for OTP upload.')
assert.doesNotMatch(quickStartIntroBlock, /once buyer onboarding has been captured/i, 'Quick-start copy should not say onboarding must be captured before OTP upload.')

assert.match(workspaceBlock, /Capture Buyer Onboarding/, 'Agents should have an explicit assisted onboarding capture action in the Onboarding / OTP stage.')
assert.match(workspaceBlock, /Send Buyer Onboarding Link/, 'Agents should still have the send onboarding link action when that lane is available.')
assert.match(workspaceBlock, /data-testid="buyer-onboarding-otp-profile-warning"/, 'Incomplete buyer profile should render as a warning in the OTP stage.')
assert.match(workspaceBlock, /Upload Signed OTP remains available/, 'Profile warning should make clear that OTP upload is not blocked by incomplete onboarding.')
assert.match(workspaceBlock, /Signed OTP Upload/, 'OTP upload should be a dedicated section in the same stage.')
assert.match(workspaceBlock, /Buyer onboarding can continue in parallel/, 'OTP upload section should describe onboarding as parallel work.')
assert.match(workspaceBlock, /buyerOfferDocumentUploading \? 'Uploading OTP\.\.\.' : 'Upload Signed OTP'/, 'OTP upload button should keep an upload-only disabled state.')
assert.doesNotMatch(workspaceBlock, /disabled=\{[^}]*selectedLeadBuyerOnboardingSubmitted/, 'OTP upload should not be disabled by buyer onboarding submission state.')
assert.doesNotMatch(workspaceBlock, /disabled=\{[^}]*selectedLeadBuyerProfileModel/, 'OTP upload should not be disabled by buyer profile readiness.')
assert.doesNotMatch(workspaceBlock, /Upload the OTP once it is available/, 'Legacy generic OTP wording should be replaced with signed OTP wording.')

console.log('Buyer Onboarding / OTP Phase 1 decoupling contract passed.')
