// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LeadListPage from '../LeadListPage'
import LeadCreateDialog from '../../../components/leads/LeadCreateDialog'
import { buildAgencyLeadListModel } from '../agencyLeadListModel'

afterEach(cleanup)
it.each(['buyer', 'seller'])('opens the canonical %s capture form from an empty Kanban board and submits it', async (category) => {
  const save = vi.fn()
  function Board() {
    const [open, setOpen] = useState(false)
    return <><LeadListPage category={category} categoryLabel={category === 'seller' ? 'Seller' : 'Buyer'} viewMode="kanban" onAddLead={(selected) => { expect(selected).toBe(category); setOpen(true) }} />
      {open ? <LeadCreateDialog open category={category} agents={[]} currentAgent={{ id: 'agent-1', name: 'Kevin' }} onClose={() => setOpen(false)} onSave={save} /> : null}</>
  }
  render(<Board />)
  fireEvent.click(screen.getByRole('button', { name: `Create ${category === 'seller' ? 'Seller' : 'Buyer'} Lead` }))
  const dialog = await screen.findByRole('dialog')
  for (const [label, value] of [['First name', 'Jane'], ['Last name', 'Contact'], ['Mobile', '0721234567'], ['Email', 'jane@example.com']]) fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Lead' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ category, firstName: 'Jane', email: 'jane@example.com', agentId: 'agent-1' }))
})

it('does not offer new capture on the Archived Kanban board', () => {
  render(<LeadListPage category="archived" viewMode="kanban" />)
  expect(screen.queryByRole('button', { name: /Create .* Lead|Add .* Lead/ })).toBeNull()
})

it('shows real open-task deadlines, leaves undated tasks neutral, and ignores completed follow-ups', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 9, 10, 0))
  try {
    const leads = ['today', 'tomorrow', 'overdue', 'undated'].map((id) => ({ leadId: id, name: id, leadCategory: 'buyer', stage: 'Qualified' }))
    const tasks = [
      { leadId: 'today', title: 'Call buyer', dueDate: '2026-10-09', status: 'Pending' },
      { leadId: 'tomorrow', title: 'Viewing', dueDate: '2026-10-10', status: 'Pending' },
      { leadId: 'overdue', title: 'Confirm finance', dueDate: '2026-10-08', status: 'Pending' },
      { leadId: 'undated', title: 'Discuss requirements', status: 'Pending' },
      { leadId: 'tomorrow', title: 'Already done', dueDate: '2026-10-01', status: 'Completed' },
    ]
    const model = buildAgencyLeadListModel({ leads, tasks })
    render(<LeadListPage viewMode="kanban" kanbanColumns={model.columns} />)
    expect(within(screen.getByRole('button', { name: 'Open lead today' })).getByText('Today')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: 'Open lead tomorrow' })).getByText('Tomorrow')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: 'Open lead overdue' })).getByText(/Overdue/)).toBeTruthy()
    expect(within(screen.getByRole('button', { name: 'Open lead undated' })).queryByText(/Overdue|Today|Tomorrow/)).toBeNull()
    expect(screen.queryByText('Already done')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps opening and moving the original lead after a failed property image', () => {
  const onOpenLead = vi.fn()
  const onMoveLead = vi.fn()
  const model = buildAgencyLeadListModel({ leads: [{ leadId: 'lead-1', name: 'Sarah Williams', leadCategory: 'buyer', stage: 'Qualified', propertyImageUrl: '/missing.jpg', propertyInterest: 'Harbour Heights' }] })
  render(<LeadListPage viewMode="kanban" kanbanColumns={model.columns} onOpenLead={onOpenLead} onMoveLead={onMoveLead} />)
  fireEvent.error(screen.getByRole('img', { name: 'Harbour Heights' }))
  const card = screen.getByRole('button', { name: 'Open lead Sarah Williams' })
  expect(within(card).getByText('SW')).toBeTruthy()
  fireEvent.keyDown(card, { key: 'Enter' })
  expect(onOpenLead).toHaveBeenCalledWith('lead-1')
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'lead-1') }
  fireEvent.dragStart(card, { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: 'Contacted' }), { dataTransfer })
  expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'lead-1')
  expect(onMoveLead).toHaveBeenCalledWith('lead-1', 'contacted')
})
