// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const runtime = vi.hoisted(() => ({ action: vi.fn(), prepare: vi.fn(), copy: vi.fn() }))
vi.mock('../../../services/crmFollowUpAiService', () => ({ crmFollowUpAction: runtime.action }))
import CrmFollowUpAssistant from '../CrmFollowUpAssistant'
const updatedAt = '2026-10-25T09:00:00Z'
const brief = { leadId: 'lead', updatedAt, fingerprint: 'source', facts: { category: 'buyer', stage: 'contacted' }, openTaskCount: 1, overdueTaskCount: 1, activityCount: 3, lastActivityAt: '2026-10-24T09:00:00Z', pendingTasks: [{ id: 'task', dueDate: '2026-10-24', overdue: true }], nextAction: 'Review the overdue follow-up tasks before preparing another.', sourcePath: '/pipeline/leads/lead?tab=activity', boundary: 'Activity is not proof of consent.' }
const result = { leadId: 'lead', updatedAt, sourceFingerprint: 'source', applicability: 'current', proposal: { title: 'Proposed follow-up', outreach: 'A considerate proposed outreach message.' } }
const component = (props = {}) => <CrmFollowUpAssistant organisationId="agency" leadId="lead" updatedAt={updatedAt} onPrepareFollowUp={runtime.prepare} {...props} />
async function load() { fireEvent.click(screen.getByRole('button', { name: 'Load saved brief' })); await screen.findByRole('button', { name: 'Refresh saved brief' }) }
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: runtime.copy } })
  runtime.action.mockImplementation(async (_, action) => action === 'generate' ? result : { brief })
  runtime.copy.mockResolvedValue()
})
afterEach(cleanup)
it('shows source-backed pending facts without generating, sending or creating tasks', async () => {
  render(component()); await load()
  expect(screen.getByText('1 open tasks')).toBeTruthy(); expect(screen.getByText('1 overdue')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View saved activity and tasks' }).getAttribute('href')).toBe(brief.sourcePath)
  expect(runtime.action).toHaveBeenCalledTimes(1); expect(runtime.prepare).not.toHaveBeenCalled()
})
it('requires explicit apply and supports undo while preserving manual outreach', async () => {
  render(component()); await load()
  const draft = screen.getByLabelText('Editable outreach draft'), original = draft.value
  fireEvent.click(screen.getByRole('button', { name: 'Generate outreach proposal' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply to outreach draft' }))
  expect(draft.value).toBe(result.proposal.outreach)
  expect(runtime.prepare).not.toHaveBeenCalled(); expect(runtime.copy).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Undo AI wording' })); expect(draft.value).toBe(original)
})
it('does not replace newer manual edits with a late AI response', async () => {
  let resolve
  runtime.action.mockImplementation(async (_, action) => action === 'generate' ? new Promise((done) => { resolve = done }) : { brief })
  render(component()); await load()
  fireEvent.click(screen.getByRole('button', { name: 'Generate outreach proposal' }))
  await waitFor(() => expect(resolve).toBeTypeOf('function'))
  fireEvent.change(screen.getByLabelText('Editable outreach draft'), { target: { value: 'My newer manual outreach.' } })
  resolve(result)
  expect((await screen.findByRole('alert')).textContent).toMatch(/changed while AI/)
  expect(screen.getByLabelText('Editable outreach draft').value).toBe('My newer manual outreach.')
  expect(screen.queryByRole('button', { name: 'Apply to outreach draft' })).toBeNull()
})
it('checks the saved source again before copying or opening the existing manual task editor', async () => {
  render(component()); await load()
  fireEvent.change(screen.getByLabelText('Editable outreach draft'), { target: { value: 'My reviewed outreach.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Open follow-up task draft' }))
  await waitFor(() => expect(runtime.prepare).toHaveBeenCalledWith({ title: 'Follow up on property enquiry', description: 'My reviewed outreach.', leadId: 'lead', updatedAt }))
  expect(runtime.action).toHaveBeenLastCalledWith('agency', 'check', { leadId: 'lead', expectedUpdatedAt: updatedAt, sourceFingerprint: 'source' }, expect.any(Object))
  fireEvent.click(screen.getByRole('button', { name: 'Copy outreach' }))
  await waitFor(() => expect(runtime.copy).toHaveBeenCalledWith('My reviewed outreach.'))
})
it('blocks stale source use and leaves the manual draft available after setup or budget failures', async () => {
  render(component()); await load()
  const manual = screen.getByLabelText('Editable outreach draft').value
  runtime.action.mockRejectedValue(new Error('This lead changed. Refresh the saved brief.'))
  fireEvent.click(screen.getByRole('button', { name: 'Open follow-up task draft' }))
  await screen.findByRole('alert'); expect(runtime.prepare).not.toHaveBeenCalled()
  runtime.action.mockRejectedValue(new Error('Agency AI spending limit reached.'))
  fireEvent.click(screen.getByRole('button', { name: 'Generate outreach proposal' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/spending limit/)
  expect(screen.getByLabelText('Editable outreach draft').value).toBe(manual)
})
it('invalidates proposals when the saved lead revision changes and never copies automatically', async () => {
  const { rerender } = render(component()); await load()
  fireEvent.click(screen.getByRole('button', { name: 'Generate outreach proposal' })); await screen.findByRole('button', { name: 'Apply to outreach draft' })
  rerender(component({ updatedAt: '2026-10-25T10:00:00Z' }))
  expect(screen.queryByRole('button', { name: 'Apply to outreach draft' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Copy outreach' }).disabled).toBe(true)
  expect(runtime.copy).not.toHaveBeenCalled()
})
it('propagates existing composer protection without losing the assistant draft', async () => {
  runtime.prepare.mockImplementation(() => { throw new Error('Finish or close your current activity draft first.') })
  render(component()); await load()
  const manual = screen.getByLabelText('Editable outreach draft').value
  fireEvent.click(screen.getByRole('button', { name: 'Open follow-up task draft' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/current activity draft/)
  expect(screen.getByLabelText('Editable outreach draft').value).toBe(manual)
})
