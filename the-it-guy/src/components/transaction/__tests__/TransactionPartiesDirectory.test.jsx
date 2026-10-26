// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import RolePlayersWorkspaceTab from '../../../pages/transaction-workspace/tabs/RolePlayersWorkspaceTab.jsx'

afterEach(cleanup)
const buyer = { key: 'buyer-1', side: 'buyer', role: 'Buyer', contact: 'Alex Buyer', email: 'buyer@example.test', phone: '+27 82 123 4567', company: 'Individual' }
const seller = { key: 'seller-1', side: 'seller', role: 'Seller', contact: 'Sam Seller', email: 'seller@example.test', phone: 'Not captured', company: 'Company' }
const attorney = { key: 'transfer_attorney', role: 'Transfer Attorney', contact: 'Law Contact', company: 'Law Firm', email: 'law@example.test', phone: 'Not captured' }
const assignment = { key: 'transfer_attorney', label: 'Transfer Attorney', company: 'Law Firm', actionLabel: 'Change Assignment' }

it('shows one directory with each party and professional once and no document or onboarding sections', () => {
  render(<RolePlayersWorkspaceTab contacts={[buyer, seller, attorney]} teamCards={[assignment]} />)
  expect(screen.getAllByText('Law Contact')).toHaveLength(1)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(within(screen.getByRole('region', { name: 'Transaction contacts' })).getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByRole('heading', { name: 'Parties' })).toBeNull()
  expect(screen.queryByText('The people and firms involved in this transaction.')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Manage assignments' })).toBeNull()
  expect(screen.queryByText(/Documents|FICA|Onboarding|Legal Team|Finance/i)).toBeNull()
})
it('opens contact details from the party card with working email and phone links', () => {
  render(<RolePlayersWorkspaceTab contacts={[buyer, seller]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buyer details: Alex Buyer' }))
  const dialog = screen.getByRole('dialog', { name: 'Buyer' })
  expect(within(dialog).getByRole('link', { name: buyer.email }).getAttribute('href')).toBe('mailto:buyer@example.test')
  expect(within(dialog).getByRole('link', { name: buyer.phone }).getAttribute('href')).toBe('tel:+27821234567')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('retains direct role allocation and removes the separate duplicated team list', () => {
  const assign = vi.fn()
  render(<RolePlayersWorkspaceTab contacts={[attorney]} teamCards={[assignment]} onAssignRole={assign} canManageAssignments />)
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Transfer Attorney details: Law Contact' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change Assignment' }))
  expect(assign).toHaveBeenCalledExactlyOnceWith('transfer_attorney')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('omits inapplicable roles and presents missing contacts without fake contact links', () => {
  render(<RolePlayersWorkspaceTab contacts={[seller]} teamCards={[{ key: 'bond_originator', visible: false }]} />)
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Seller details: Sam Seller' }))
  expect(within(screen.getByRole('dialog')).getAllByRole('link')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Manage assignments' })).toBeNull()
})
