import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildAttorneyCommunicationControl,
  buildAttorneyCommunicationTemplates,
} from '../src/core/transactions/attorneyCommunicationControl.js'

const templates = buildAttorneyCommunicationTemplates({
  matterReference: 'MAT-1042',
  stageLabel: 'Clearances',
  nextActionLabel: 'Obtain the rates clearance certificate',
})

assert.deepEqual(templates.map((template) => template.key), ['client_progress', 'professional_follow_up', 'internal_note'])
assert.deepEqual(templates.map((template) => template.visibility), ['client_visible', 'shared', 'internal'])
assert.match(templates[0].body, /MAT-1042/)
assert.match(templates[0].body, /Clearances/)

const control = buildAttorneyCommunicationControl({
  activityFeed: [
    { id: 'system', kind: 'system', body: 'Stage changed', visibility: 'system', createdAt: '2026-07-18T11:00:00Z' },
    { id: 'client', kind: 'discussion', body: 'Client update', visibility: 'client_safe', createdAt: '2026-07-17T11:00:00Z' },
    { id: 'professional', kind: 'discussion', body: 'Professional update', visibility: 'shared', createdAt: '2026-07-18T10:00:00Z' },
    { id: 'internal', kind: 'discussion', body: 'Private file note', visibility: 'internal', createdAt: '2026-07-18T09:00:00Z' },
  ],
  workflows: [
    {
      key: 'transfer',
      required: true,
      lane: {
        laneKey: 'transfer',
        label: 'Transfer Attorney',
        followUpSummary: {
          items: [
            { id: 'rates', title: 'Rates clearance certificate', status: 'overdue', statusLabel: 'Overdue', audience: 'municipality', visibility: 'professional_shared' },
            { id: 'fica', title: 'Buyer FICA', status: 'due_soon', audience: 'buyer', visibility: 'client_visible' },
            { id: 'done', title: 'Resolved item', status: 'open', actioned: true },
          ],
        },
      },
    },
  ],
  matterReference: 'MAT-1042',
})

assert.equal(control.latestByAudience.client.id, 'client')
assert.equal(control.latestByAudience.professional.id, 'professional')
assert.equal(control.latestByAudience.internal.id, 'internal')
assert.equal(control.recentCommunications.length, 3, 'system activity must not be presented as human communication')
assert.equal(control.followUps.length, 2, 'actioned follow-ups must leave the response queue')
assert.equal(control.followUps[0].id, 'rates', 'overdue follow-ups should be shown first')
assert.equal(control.counts.overdue, 1)
assert.equal(control.counts.needsAttention, 1)
assert.equal(control.recommendedTemplateKey, 'professional_follow_up')

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
for (const expected of [
  'function AttorneyCommunicationCentre',
  'Matter Communication Centre',
  "{ id: 'activity', label: 'Communications' }",
  'Waiting for a response',
  'Last update by audience',
  'handleDraftCommunicationTemplate',
  'showDetailedCommunicationLog',
  'handleWorkflowFollowUpCommand(followUp.workflow?.lane, followUp.item)',
]) {
  assert.ok(source.includes(expected), `Phase 4 communication centre should include: ${expected}`)
}

console.log('Attorney communication control Phase 4 checks passed.')
