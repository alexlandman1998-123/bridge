import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  normalizeLeadLifecycleStageKey,
  resolveLeadLifecyclePresentation,
} from '../src/services/leadLifecyclePresentationService.js'

assert.equal(normalizeLeadLifecycleStageKey('New Lead'), 'lead')

const buyerViewing = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Appointment Scheduled',
})
assert.equal(buyerViewing.label, 'Appointment Scheduled')
assert.equal(buyerViewing.lifecycleStage, 'viewing_scheduled')
assert.equal(buyerViewing.lifecycleStatus, 'open')
assert.equal(buyerViewing.funnelStage, 'Viewing Scheduled')
assert.equal(buyerViewing.columnId, 'viewing_contacted')
assert.equal(buyerViewing.stageTone.iconKey, 'calendar')
assert.equal(buyerViewing.reporting.appointmentScheduled, true)

const sellerMandate = resolveLeadLifecyclePresentation({
  leadCategory: 'seller',
  stage: 'Mandate Sent',
})
assert.equal(sellerMandate.columnId, 'mandate_sent')
assert.equal(sellerMandate.reporting.contacted, false)

const converted = resolveLeadLifecyclePresentation({
  leadCategory: 'buyer',
  stage: 'Converted to Transaction',
})
assert.equal(converted.columnId, 'deal_otp')
assert.equal(converted.lifecycleStage, 'transaction_created')
assert.equal(converted.lifecycleStatus, 'converted')
assert.equal(converted.reporting.dealCreated, true)

const agencyPipelineSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const agencyPipelineServiceSource = await fs.readFile(new URL('../src/lib/agencyPipelineService.js', import.meta.url), 'utf8')
const agentLeadsSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(agencyPipelineSource, /resolveLeadLifecyclePresentation\(lead, \{ linkedDeal/, 'pipeline/table rows should use shared lead lifecycle presentation')
assert.match(agencyPipelineSource, /resolveLeadLifecyclePresentation\(selectedLead\)\.label/, 'selected lead workspace should use shared lead lifecycle presentation')
assert.match(agencyPipelineServiceSource, /resolveLeadLifecyclePresentation\(lead\)/, 'principal reporting should use shared lead lifecycle presentation')
assert.match(agentLeadsSource, /resolveLeadLifecyclePresentation\(row\)/, 'standalone lead workspace and table should use shared lead lifecycle presentation')

console.log('lead lifecycle presentation tests passed')
