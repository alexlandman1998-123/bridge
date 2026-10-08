// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RentalListingDocumentsPanel from '../RentalListingDocumentsPanel.jsx'

afterEach(cleanup)
const row = { id: 'identity', title: 'Owner: Identity evidence', mode: 'preview', required: true, state: 'accepted', source: 'Landlord profile', documents: [{ id: 'owner-file', file_name: 'owner.pdf', status: 'accepted' }] }
const snapshot = { documents: [{ id: 'listing-file', name: 'General listing attachment', status: 'uploaded' }], issues: [], documentMatrix: {
  issues: [], landlords: [{ id: 'owner', title: 'Owner', rows: [row, { ...row, id: 'disclosure', title: 'This property: Signed disclosure', state: 'missing', source: 'This property', documents: [] }] }],
  tenants: [
    { id: 'app-1', title: 'Amy Tenant', status: 'submitted', rows: [{ ...row, id: 'amy-income', title: 'Primary applicant income evidence', mode: 'active', state: 'received', source: 'Tenant application', documents: [{ id: 'a', name: 'january.pdf', status: 'accepted' }, { id: 'b', name: 'february.pdf', status: 'uploaded' }] }] },
    { id: 'app-2', title: 'Bob Tenant', status: 'draft', rows: [{ ...row, id: 'bob-id', title: 'Primary applicant identity', mode: 'active', state: 'missing', source: 'Tenant application', documents: [] }] },
  ],
} }

it('shows saved landlord and property requirements even when files are missing', () => {
  render(<RentalListingDocumentsPanel snapshot={snapshot} />)
  expect(screen.getByText('Owner: Identity evidence')).toBeTruthy()
  expect(screen.getByText('This property: Signed disclosure')).toBeTruthy()
  expect(screen.getByText('owner.pdf · accepted')).toBeTruthy()
  expect(screen.getByText('missing')).toBeTruthy()
  expect(screen.getAllByText('Policy preview — pending confirmation')).toHaveLength(2)
  expect(screen.queryByText('0 / 0')).toBeNull()
})

it('keeps each tenant application and its current pack files in its own section', () => {
  render(<RentalListingDocumentsPanel snapshot={snapshot} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Tenant 2' }))
  const amy = screen.getByRole('heading', { name: 'Amy Tenant' }).closest('section')
  const bob = screen.getByRole('heading', { name: 'Bob Tenant' }).closest('section')
  expect(within(amy).getByText('january.pdf · accepted')).toBeTruthy()
  expect(within(amy).getByText('february.pdf · uploaded')).toBeTruthy()
  expect(within(amy).getByText('received')).toBeTruthy()
  expect(within(bob).queryByText('january.pdf · accepted')).toBeNull()
  expect(within(bob).getByText('missing')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Listing files 1' }))
  expect(screen.getByText('General listing attachment · uploaded')).toBeTruthy()
  expect(screen.queryByText('Owner: Identity evidence')).toBeNull()
})

it('shows loading and unavailable reads separately from absent checklists', () => {
  const view = render(<RentalListingDocumentsPanel snapshot={null} />)
  expect(screen.getByRole('status').textContent).toContain('Loading saved')
  expect(screen.queryByRole('tabpanel')).toBeNull()
  view.rerender(<RentalListingDocumentsPanel snapshot={{ documents: [], issues: [], documentMatrix: { landlords: [], tenants: [], issues: ['Landlord requirements could not be loaded. Refresh to retry.'] } }} />)
  expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
  expect(screen.getByText('Some requirements are unavailable. Refresh before relying on this matrix.')).toBeTruthy()
  view.rerender(<RentalListingDocumentsPanel snapshot={{ documents: [], issues: [], documentMatrix: { landlords: [], tenants: [], issues: [] } }} />)
  expect(screen.getByText(/No saved landlord checklist/)).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Tenant 0' }))
  expect(screen.getByText('No tenant application is linked to this listing yet.')).toBeTruthy()
})

it('preserves working matrix sections when generic listing files fail', () => {
  render(<RentalListingDocumentsPanel snapshot={{ ...snapshot, documents: [], issues: ['Documents'] }} />)
  expect(screen.getByText('Owner: Identity evidence')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Listing files 0' }))
  expect(screen.getByRole('alert').textContent).toContain('Listing files could not be loaded')
})
