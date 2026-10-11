// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ClientTransactionsPanel, { LocalClientTransactionPreviewPage } from './ClientTransactionsPanel'
import { getLocalClientPreview } from '../../core/clients/localClientPreview'
import { fetchTransactionsByParticipantSummary } from '../../lib/transactionsListApi'

vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ profile: { id: 'agent', email: 'agent@example.test' } }) }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../lib/transactionsListApi', () => ({ fetchTransactionsByParticipantSummary: vi.fn() }))
const fixture = getLocalClientPreview({ client: { id: 'preview-client', organisationId: '322c3853-2d82-4413-97e6-b4cd8bc32a7c', email: 'alexlandman1998@gmail.com', name: 'Alexander Landman' } }, { development: true, hostname: 'localhost', now: Date.parse('2026-10-10T08:00:00Z') })
function CurrentRoute() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}</output> }
const show = props => render(<MemoryRouter initialEntries={['/clients/preview-client']}><ClientTransactionsPanel client={fixture.client} transactions={fixture.transactions} preview {...props} /><CurrentRoute /></MemoryRouter>)
beforeEach(() => { fetchTransactionsByParticipantSummary.mockResolvedValue([]) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('property cards open a details dialog without leaving the client, and Escape returns focus', async () => {
  show()
  const card = screen.getByRole('button', { name: 'View transaction details for 694 Cicely Street' })
  expect(within(card).getByRole('img').getAttribute('src')).toBe('/demo-listing-images/revo-sales-cover.png')
  card.focus()
  fireEvent.click(card)
  const dialog = screen.getByRole('dialog', { name: '694 Cicely Street' })
  expect(within(dialog).getByText('Confirm bond instructions and prepare the transfer documents.')).toBeTruthy()
  expect(within(dialog).getByText('Jamie Smit')).toBeTruthy()
  expect(within(dialog).getByText('Transaction milestones')).toBeTruthy()
  expect(within(dialog).getByRole('link', { name: 'Open full transaction' }).getAttribute('href')).toBe('/transactions/preview-transaction-cicely')
  expect(screen.getByLabelText('Current route').textContent).toBe('/clients/preview-client')
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(card)
  expect(fetchTransactionsByParticipantSummary).not.toHaveBeenCalled()
})

test('the full transaction link opens the corresponding local preview and can return to the profile', async () => {
  const preview = { transaction: fixture.transactions[0], client: fixture.client, profilePath: '/clients/preview-client' }
  render(<MemoryRouter initialEntries={['/clients/preview-client']}><Routes><Route path="/clients/:clientId" element={<ClientTransactionsPanel client={fixture.client} transactions={fixture.transactions} preview />} /><Route path="/transactions/:transactionId" element={<LocalClientTransactionPreviewPage preview={preview} />} /></Routes><CurrentRoute /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'View transaction details for 694 Cicely Street' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open full transaction' }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/transactions/preview-transaction-cicely')
  expect(screen.getByText('Mock transaction')).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Back to Alexander Landman' }))
  expect(screen.getByRole('button', { name: 'View transaction details for 694 Cicely Street' })).toBeTruthy()
})

test('live cards hydrate only their linked transactions and keep full links pointing at the transaction workspace', async () => {
  fetchTransactionsByParticipantSummary.mockResolvedValue([{ transaction: { id: 'deal', property_address_line_1: '18 Willow Lane', transaction_reference: 'REVO-14', stage: 'Bond approved', purchase_price: 3200000, property_image_url: '/live-cover.jpg' } }, { transaction: { id: 'other', property_address_line_1: 'Unrelated property' } }])
  show({ preview: false, transactions: [{ id: 'deal', reference: 'REVO-14', propertyLabel: '18 Willow Lane', stageLabel: 'Bond approved', status: 'Active', typeLabel: 'Buyer' }] })
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('/live-cover.jpg'))
  expect(screen.queryByText('Unrelated property')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View transaction details for 18 Willow Lane' }))
  expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open full transaction' }).getAttribute('href')).toBe('/transactions/deal')
  expect(fetchTransactionsByParticipantSummary).toHaveBeenCalledWith(expect.objectContaining({ userId: 'agent', roleType: 'agent', organisationId: fixture.client.organisationId }))
})

test('a failed property image keeps the card usable and empty profiles make no detail request', () => {
  const { unmount } = show({ transactions: [fixture.transactions[0]] })
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Property image unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View transaction details for 694 Cicely Street' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  unmount()
  show({ transactions: [], preview: false })
  expect(screen.getByText('No linked transactions yet')).toBeTruthy()
  expect(fetchTransactionsByParticipantSummary).not.toHaveBeenCalled()
})
