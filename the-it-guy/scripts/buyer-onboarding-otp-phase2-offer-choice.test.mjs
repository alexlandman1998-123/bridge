import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const makeOfferHandlerStart = source.indexOf('function handleBuyerJourneyMakeOfferAction')
const makeOfferHandlerEnd = source.indexOf('async function handleMarkBuyerQualifiedAction', makeOfferHandlerStart)
assert.ok(makeOfferHandlerStart > -1 && makeOfferHandlerEnd > makeOfferHandlerStart, 'Offer-stage action handler should be sliceable.')

const makeOfferHandlerBlock = source.slice(makeOfferHandlerStart, makeOfferHandlerEnd)

assert.doesNotMatch(makeOfferHandlerBlock, /handleSendBuyerOnboardingFromLead/, 'Offer-stage CTA should not auto-send buyer onboarding.')
assert.match(makeOfferHandlerBlock, /setLeadWorkspaceTab\(BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY\)/, 'Offer-stage CTA should open the Onboarding / OTP workspace.')
assert.match(makeOfferHandlerBlock, /Choose whether to send the buyer onboarding link or capture onboarding in-house/, 'Offer-stage CTA should ask the agent to choose the onboarding lane.')
assert.match(makeOfferHandlerBlock, /then upload the signed OTP when available/, 'Offer-stage CTA should keep OTP upload in the same step.')
assert.match(makeOfferHandlerBlock, /Schedule the first viewing before opening Onboarding \/ OTP/, 'Viewing prerequisite copy should no longer imply send/upload as the only next action.')

const overviewActionStart = source.indexOf('const buyerJourneyWhatsNext =')
const overviewActionEnd = source.indexOf('const showViewingCompletedFeedbackOverride', overviewActionStart)
assert.ok(overviewActionStart > -1 && overviewActionEnd > overviewActionStart, 'Buyer overview action model should be sliceable.')

const overviewActionBlock = source.slice(overviewActionStart, overviewActionEnd)

assert.match(overviewActionBlock, /label: 'Open Onboarding \/ OTP'/, 'Buyer overview primary action should open the choice point.')
assert.match(overviewActionBlock, /send the buyer link, capture onboarding in-house, or upload the signed OTP/, 'Buyer overview should describe all same-step choices.')
assert.doesNotMatch(overviewActionBlock, /label: selectedLeadUsesKingstonsInPersonOtpFlow \? 'Upload OTP' : 'Send onboarding'/, 'Buyer overview should not branch into upload-vs-send labels.')

const stageActionsStart = source.indexOf('<p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Stage Actions</p>')
const stageActionsEnd = source.indexOf('buyerJourneyActionStage === \'qualification\'', stageActionsStart)
assert.ok(stageActionsStart > -1 && stageActionsEnd > stageActionsStart, 'Buyer journey stage actions should be sliceable.')

const stageActionsBlock = source.slice(stageActionsStart, stageActionsEnd)

assert.match(stageActionsBlock, />Open Onboarding \/ OTP<\/Button>/, 'Buyer journey stage actions should open the Onboarding / OTP workspace.')
assert.doesNotMatch(stageActionsBlock, />Send onboarding<\/Button>/, 'Buyer journey stage actions should not auto-send onboarding from the stage CTA.')

console.log('Buyer Onboarding / OTP Phase 2 offer choice contract passed.')
