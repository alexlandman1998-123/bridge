import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  normalizeLeadLifecycleStageKey,
  resolveLeadLifecyclePresentation,
} from '../src/services/leadLifecyclePresentationService.js'

assert.equal(normalizeLeadLifecycleStageKey('New Lead'), 'lead')
assert.equal(normalizeLeadLifecycleStageKey('Offer Link Sent'), 'offer_onboarding_link_sent')
assert.equal(normalizeLeadLifecycleStageKey('Offer Accepted'), 'signed_by_all_parties')

const buyerViewing = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Appointment Scheduled',
})
assert.equal(buyerViewing.label, 'Viewing')
assert.equal(buyerViewing.funnelStage, 'Viewing')
assert.equal(buyerViewing.columnId, 'viewing')
assert.equal(buyerViewing.stageTone.iconKey, 'calendar')
assert.equal(buyerViewing.reporting.appointmentScheduled, true)

const offerLinkSent = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Offer Link Sent',
})
assert.equal(offerLinkSent.label, 'Transaction Setup')
assert.equal(offerLinkSent.funnelStage, 'Transaction Setup')
assert.equal(offerLinkSent.columnId, 'transaction_setup')

const otpReady = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Ready to Generate OTP',
})
assert.equal(otpReady.columnId, 'offer')
assert.equal(otpReady.funnelStage, 'Offer')

const sellerMandate = resolveLeadLifecyclePresentation({
  leadCategory: 'seller',
  stage: 'Mandate Sent',
})
assert.equal(sellerMandate.key, 'seller_onboarding_submitted')
assert.equal(sellerMandate.label, 'Onboarding Submitted')
assert.equal(sellerMandate.columnId, 'lead')
assert.equal(sellerMandate.reporting.contacted, false)

const sellerNewLead = resolveLeadLifecyclePresentation({
  leadCategory: 'seller',
  stage: 'New Lead',
  status: 'New',
})
assert.equal(sellerNewLead.key, 'new_lead')
assert.equal(sellerNewLead.label, 'New Lead')
assert.equal(sellerNewLead.funnelStage, 'New Lead')
assert.equal(sellerNewLead.columnId, 'lead')

const sellerOnboardingSent = resolveLeadLifecyclePresentation({
  leadCategory: 'seller',
  stage: 'Onboarding Sent',
  status: 'Sent',
})
assert.equal(sellerOnboardingSent.key, 'seller_onboarding_sent')
assert.equal(sellerOnboardingSent.label, 'Onboarding Sent')
assert.equal(sellerOnboardingSent.funnelStage, 'Onboarding Sent')
assert.equal(sellerOnboardingSent.columnId, 'lead')

const converted = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Converted to Transaction',
})
assert.equal(converted.columnId, 'transaction')
assert.equal(converted.reporting.dealCreated, true)

const agencyPipelineSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const agencyPipelineServiceSource = await fs.readFile(new URL('../src/lib/agencyPipelineService.js', import.meta.url), 'utf8')
const agentLeadsSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(agencyPipelineSource, /resolveLeadLifecyclePresentation\(lead, \{ linkedDeal/, 'pipeline/table rows should use shared lead lifecycle presentation')
assert.match(agencyPipelineSource, /resolveLeadLifecyclePresentation\(selectedLead\)\.label/, 'selected lead workspace should use shared lead lifecycle presentation')
assert.match(agencyPipelineServiceSource, /resolveLeadLifecyclePresentation\(lead\)/, 'principal reporting should use shared lead lifecycle presentation')
assert.match(agentLeadsSource, /<AgencyPipelinePage initialViewMode="leads" \/>/, 'standalone lead workspace should delegate to the shared agency pipeline page')

console.log('lead lifecycle presentation tests passed')
