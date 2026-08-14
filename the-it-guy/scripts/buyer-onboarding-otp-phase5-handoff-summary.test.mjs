import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(source, /const BUYER_OTP_HANDOFF_TONE_META = \{/, 'Phase 5 should define stable handoff tone metadata for status chips.')

const summaryHelperStart = source.indexOf('function buildBuyerOtpHandoffSummary')
const summaryHelperEnd = source.indexOf('function getKingstonsSellerPackState', summaryHelperStart)
assert.ok(summaryHelperStart > -1 && summaryHelperEnd > summaryHelperStart, 'Buyer OTP handoff summary helper should be sliceable.')
const summaryHelperBlock = source.slice(summaryHelperStart, summaryHelperEnd)

assert.match(summaryHelperBlock, /buyerOtpAttorneyInstruction/, 'Summary should read the saved attorney instruction payload.')
assert.match(summaryHelperBlock, /buyerOtpPortalHandoff/, 'Summary should read the saved buyer portal handoff payload.')
assert.match(summaryHelperBlock, /Signed OTP/, 'Summary should include the signed OTP upload status.')
assert.match(summaryHelperBlock, /Attorney of record/, 'Summary should include the attorney-of-record status.')
assert.match(summaryHelperBlock, /Transfer instruction/, 'Summary should include the transfer instruction status.')
assert.match(summaryHelperBlock, /Buyer portal link/, 'Summary should include the buyer portal handoff status.')
assert.match(summaryHelperBlock, /Needs attention/, 'Summary should surface handoff warnings instead of hiding them.')
assert.match(summaryHelperBlock, /formatDateTime/, 'Summary should display upload and send timing in a readable format.')

const summaryMemoStart = source.indexOf('const selectedLeadBuyerOtpHandoffSummary = useMemo')
const summaryMemoEnd = source.indexOf('const selectedLeadLifecycleDiagnosticOffer', summaryMemoStart)
assert.ok(summaryMemoStart > -1 && summaryMemoEnd > summaryMemoStart, 'Selected lead handoff summary memo should be sliceable.')
const summaryMemoBlock = source.slice(summaryMemoStart, summaryMemoEnd)
assert.match(summaryMemoBlock, /buildBuyerOtpHandoffSummary\(selectedLead\)/, 'Lead workspace should derive the handoff summary from the selected lead.')

const overviewPanelIndex = source.indexOf('data-testid="buyer-otp-handoff-summary"')
const overviewPanelStart = source.lastIndexOf('<section', overviewPanelIndex)
const overviewPanelEnd = source.indexOf('</section>', overviewPanelIndex)
assert.ok(overviewPanelIndex > -1 && overviewPanelStart > -1 && overviewPanelEnd > overviewPanelStart, 'Overview handoff summary panel should be sliceable.')
const overviewPanelBlock = source.slice(overviewPanelStart, overviewPanelEnd)
assert.match(overviewPanelBlock, /Post-OTP Handoff/, 'Buyer overview should label the handoff summary clearly.')
assert.match(overviewPanelBlock, /Transaction handoff status/, 'Buyer overview should show transaction handoff status.')
assert.match(overviewPanelBlock, /selectedLeadBuyerOtpHandoffSummary\.items\.map/, 'Buyer overview should render every handoff status item.')

const workspacePanelIndex = source.indexOf('data-testid="buyer-otp-handoff-summary-workspace"')
const workspacePanelStart = source.lastIndexOf('<section', workspacePanelIndex)
const workspacePanelEnd = source.indexOf('</section>', workspacePanelIndex)
assert.ok(workspacePanelIndex > -1 && workspacePanelStart > -1 && workspacePanelEnd > workspacePanelStart, 'Workspace handoff summary panel should be sliceable.')
const workspacePanelBlock = source.slice(workspacePanelStart, workspacePanelEnd)
assert.match(workspacePanelBlock, /Post-OTP Handoff/, 'Onboarding / OTP workspace should label the handoff summary clearly.')
assert.match(workspacePanelBlock, /OTP uploaded/, 'Onboarding / OTP workspace should show OTP upload timing when available.')
assert.match(workspacePanelBlock, /selectedLeadBuyerOtpHandoffSummary\.items\.map/, 'Onboarding / OTP workspace should render every handoff status item.')

console.log('Buyer Onboarding / OTP Phase 5 handoff summary contract passed.')
