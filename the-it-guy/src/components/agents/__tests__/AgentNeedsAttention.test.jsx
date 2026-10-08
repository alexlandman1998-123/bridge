// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentNeedsAttention from '../AgentNeedsAttention'
import { loadAgentNeedsAttentionRecords } from '../../../services/agentNeedsAttentionService'
import { AGENCY_CRM_UPDATED_EVENT } from '../../../lib/agencyCrmUpdateBus'

vi.mock('../../../services/agentNeedsAttentionService', () => ({ loadAgentNeedsAttentionRecords: vi.fn() }))
const agent = { userId: 'agent', organisationId: 'org', email: 'agent@example.com' }
const lead = { lead_id: 'lead', organisation_id: 'org', assigned_agent_id: 'agent', stage: 'New Lead', contact_id: 'client', enquired_property_title: '24 Oak Street' }
const records = { leads: [lead], contacts: [{ contact_id: 'client', organisation_id: 'org', first_name: 'Sam', last_name: 'Smith' }], tasks: [] }
function show(selected = agent) {
  return render(<MemoryRouter><Routes><Route path="/" element={<AgentNeedsAttention agent={selected} />} /><Route path="/pipeline/leads/:id" element={<p>Lead workspace opened</p>} /></Routes></MemoryRouter>)
}
beforeEach(() => { vi.resetAllMocks(); loadAgentNeedsAttentionRecords.mockResolvedValue(records) })
afterEach(cleanup)

it('opens the actual lead workspace from the named action and shows client/property/reason/date', async () => {
  show()
  const link = await screen.findByRole('link', { name: 'Open lead for Sam Smith' })
  expect(link.getAttribute('href')).toBe('/pipeline/leads/lead')
  expect(screen.getByText('24 Oak Street')).toBeTruthy()
  expect(screen.getByText('New lead awaiting contact')).toBeTruthy()
  expect(screen.getByText('No due date')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.click(link)
  expect(screen.getByText('Lead workspace opened')).toBeTruthy()
})

it('opens the linked lead Activity tab for a follow-up and uses red only for overdue dates', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  loadAgentNeedsAttentionRecords.mockResolvedValue({ ...records, tasks: [
    { task_id: 'overdue', organisation_id: 'org', lead_id: 'lead', title: 'Overdue callback', status: 'Pending', due_date: '2020-01-01' },
    { task_id: 'today', organisation_id: 'org', lead_id: 'lead', title: 'Today callback', status: 'Pending', due_date: today },
  ] })
  show()
  const links = await screen.findAllByRole('link', { name: 'Open follow-up for Sam Smith' })
  expect(links[0].getAttribute('href')).toBe('/pipeline/leads/lead?tab=activity')
  expect(screen.getByText(/Overdue ·/).className).toContain('text-[#b42318]')
  expect(screen.getByText(/Due Today/).className).not.toContain('text-[#b42318]')
  fireEvent.click(links[0])
  expect(screen.getByText('Lead workspace opened')).toBeTruthy()
})

it('offers retry on read failure, without claiming there is no work', async () => {
  loadAgentNeedsAttentionRecords.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce({ leads: [], tasks: [], contacts: [] })
  show()
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText(/No new leads awaiting/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText(/No new leads awaiting/)).toBeTruthy()
})

it('removes completed work after the CRM update event and ignores another organisation’s event', async () => {
  loadAgentNeedsAttentionRecords.mockResolvedValueOnce(records).mockResolvedValue({ ...records, leads: [{ ...lead, first_contacted_at: '2026-10-08T09:00:00Z' }] })
  show()
  await screen.findByRole('link', { name: 'Open lead for Sam Smith' })
  fireEvent(window, new CustomEvent(AGENCY_CRM_UPDATED_EVENT, { detail: { organisationId: 'other' } }))
  expect(loadAgentNeedsAttentionRecords).toHaveBeenCalledTimes(1)
  fireEvent(window, new CustomEvent(AGENCY_CRM_UPDATED_EVENT, { detail: { organisationId: 'org' } }))
  expect(await screen.findByText(/No new leads awaiting/)).toBeTruthy()
})

it('ignores an old request when the selected agent changes', async () => {
  let resolveOld
  loadAgentNeedsAttentionRecords.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve })).mockResolvedValueOnce({ leads: [], tasks: [], contacts: [] })
  const view = show()
  view.rerender(<MemoryRouter><AgentNeedsAttention agent={{ ...agent, userId: 'other' }} /></MemoryRouter>)
  await screen.findByText(/No new leads awaiting/)
  resolveOld(records)
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Open lead for Sam Smith' })).toBeNull())
})
