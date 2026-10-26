// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TransactionOverviewProgress from '../TransactionOverviewProgress.jsx'
afterEach(cleanup)
const workflows = [
  { key: 'finance', label: 'Finance', detail: 'Waiting on bond quotes', owner: 'Bank', status: 'waiting', target: 'finance' },
  { key: 'transfer', label: 'Transfer', detail: 'Transfer documents being signed', status: 'in_progress', target: 'transfer' },
]
it('places a concise workflow status card beside the three requested deal facts', () => {
  render(<TransactionOverviewProgress workflows={workflows} dealSummary={{ purchasePriceLabel: 'R 4 850 000', financeTypeLabel: 'Cash', existingBondLabel: 'No' }} />)
  expect(screen.getByRole('heading', { name: 'Current progress' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Deal Summary' })).toBeTruthy()
  expect(screen.getByText('Waiting on bond quotes')).toBeTruthy()
  expect(screen.queryByText('Transfer documents being signed')).toBeNull()
  expect(screen.queryByText('2 workflows')).toBeNull()
  expect(screen.getByText('R 4 850 000')).toBeTruthy()
  expect(screen.getByText('Cash')).toBeTruthy()
  expect(screen.getByText('Existing bond')).toBeTruthy()
  expect(screen.getByText('No')).toBeTruthy()
  expect(screen.queryByText(/Recent Activity|Next Best Action|Recommended because|Publish|LTV|Purchase Funding/)).toBeNull()
  const region = screen.getByRole('region', { name: 'Transaction progress and deal summary' })
  expect(within(region).getAllByRole('article')).toHaveLength(2)
  expect(region.className).toContain('items-stretch')
})
it('opens the immediate workflow without offering completion or messaging actions', () => {
  const open = vi.fn()
  render(<TransactionOverviewProgress workflows={workflows} onOpenWorkspace={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Finance' }))
  expect(open.mock.calls).toEqual([['finance']])
  expect(screen.queryByRole('button', { name: /Complete|Send|Call|Review|WhatsApp/ })).toBeNull()
})
it('follows the saved active workflow instead of an earlier unconfirmed task', () => {
  render(<TransactionOverviewProgress workflows={[...workflows, { key: 'cancellation', label: 'Bond cancellation', detail: 'Waiting on cancellation figures', status: 'waiting', target: 'transfer', isActive: true }]} onOpenWorkspace={() => {}} />)
  expect(screen.getByText('Waiting on cancellation figures')).toBeTruthy()
  expect(screen.queryByText('Waiting on bond quotes')).toBeNull()
  expect(screen.getByRole('button', { name: 'Open Conveyancing' })).toBeTruthy()
})
it('retains unknown facts and suppresses stale details during loading', () => {
  render(<TransactionOverviewProgress workflows={workflows} loading onOpenWorkspace={() => {}} />)
  expect(screen.getAllByText('Not captured')).toHaveLength(2)
  expect(screen.getByText('Not confirmed')).toBeTruthy()
  expect(screen.queryByText('Waiting on bond quotes')).toBeNull()
  expect(screen.getAllByRole('button').every(button => button.disabled)).toBe(true)
})
