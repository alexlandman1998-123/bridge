import { expect, it } from 'vitest'
import { crmFollowUpBrief, crmFollowUpManualDraft } from '../crmFollowUpAiModel'
const lead = { lead_id: 'lead', updated_at: '2026-10-25T09:00:00Z', lead_category: 'Buyer', stage: 'Contacted', area_interest: 'Brooklyn' }
it('uses SAST calendar dates and separates source facts from the model summary', () => {
  const tasks = [{ task_id: 'a', due_date: '2026-10-25', status: 'Pending' }, { task_id: 'b', due_date: null, status: 'Pending' }, { task_id: 'c', due_date: '2026-10-20', status: 'Completed' }]
  const result = crmFollowUpBrief(lead, tasks, { activity_date: '2026-10-24T20:00:00Z' }, 4, new Date('2026-10-25T22:10:00Z'))
  expect(result.overdueTaskCount).toBe(1); expect(result.openTaskCount).toBe(2)
  expect(result.pendingTasks).toEqual([{ id: 'a', dueDate: '2026-10-25', overdue: true }, { id: 'b', dueDate: null, overdue: false }])
  expect(result.facts).not.toHaveProperty('lastActivityAt'); expect(result.facts).not.toHaveProperty('leadId')
  expect(result.nextAction).toMatch(/overdue/)
})
it('keeps a useful manual outreach path in English and Afrikaans without invented timing', () => {
  expect(crmFollowUpManualDraft()).toMatch(/no longer relevant/)
  expect(crmFollowUpManualDraft('af')).toMatch(/nie meer relevant/)
  expect(crmFollowUpManualDraft()).not.toMatch(/today|tomorrow|appointment/)
  expect(crmFollowUpBrief(lead, [], null, 0, new Date('2026-10-25')).nextAction).toMatch(/choose an appropriate date and owner/)
})
