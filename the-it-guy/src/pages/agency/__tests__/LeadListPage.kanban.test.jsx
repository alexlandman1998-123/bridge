// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LeadListPage from '../LeadListPage'
import LeadCreateDialog from '../../../components/leads/LeadCreateDialog'

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
