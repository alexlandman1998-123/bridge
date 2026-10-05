// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AttorneyDocumentRequestForm from '../AttorneyDocumentRequestForm.jsx'
import AttorneyMatterDocumentRequests from '../AttorneyMatterDocumentRequests.jsx'

afterEach(cleanup)
const options = [{ id: 'buyer-1', title: 'Certified ID', label: 'Certified ID · Jane', requestedFrom: 'buyer' }, { id: 'seller-1', title: 'Resolution', label: 'Resolution · Seller company', requestedFrom: 'seller', disabled: true, unavailableReason: 'Request already open' }]
function Form({ disabled = false }) {
  const [form, setForm] = useState({ title: '', requestedFrom: 'seller', visibility: 'client_visible', notes: '', priority: 'normal', dueDate: '', canonicalRequirementInstanceId: '' })
  return <AttorneyDocumentRequestForm formId="request" form={form} onChange={setForm} onSubmit={event => event.preventDefault()} requirementOptions={options} requestedFromOptions={[{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' }]} visibilityOptions={[{ value: 'client_visible', label: 'Client visible' }, { value: 'internal_only', label: 'Internal' }]} disabled={disabled} />
}
it('chooses the named requirement, protects its recipient, and lets additional requests stay independent', () => {
  render(<Form />)
  fireEvent.change(screen.getByLabelText('Checklist requirement'), { target: { value: 'buyer-1' } })
  expect(screen.getByLabelText('Document requested').value).toBe('Certified ID')
  expect(screen.getByLabelText('Requested from').value).toBe('buyer')
  expect(screen.getByLabelText('Requested from').disabled).toBe(true)
  expect(screen.getByRole('option', { name: /Seller company/ }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Checklist requirement'), { target: { value: '' } })
  expect(screen.getByLabelText('Requested from').disabled).toBe(false)
  expect(screen.getByText(/without completing a checklist/)).toBeTruthy()
})
it('disables the form while saving and describes the selected visibility', () => {
  render(<Form disabled />)
  expect(screen.getByLabelText('Document requested').closest('fieldset').disabled).toBe(true)
  expect(screen.getByText(/does not confirm email delivery/)).toBeTruthy()
})
const rows = [
  { id: 'received', displayName: 'Certified ID', requestedFrom: 'buyer', visibility: 'client_visible', status: 'pending_review', statusLabel: 'Review needed', canReview: true, hasFile: true, documentId: 'file', document: { id: 'file', name: 'id.pdf' }, notes: 'All pages' },
  { id: 'correction', displayName: 'Resolution', requestedFrom: 'seller', visibility: 'internal_only', status: 'rejected', statusLabel: 'Correction needed', hasFile: true, documentId: 'old', correctionReason: 'Missing trustee signature', overdue: true },
  { id: 'waiting', displayName: 'Rates certificate', requestedFrom: 'other', status: 'requested', statusLabel: 'Awaiting document' },
]
it('filters and searches requests while sending exact files to review and replacement actions', () => {
  const onReview = vi.fn(), onUpload = vi.fn()
  render(<AttorneyMatterDocumentRequests rows={rows} onReview={onReview} onUpload={onUpload} canReview={() => true} canUpload={() => true} />)
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  expect(onReview).toHaveBeenCalledWith('approve', rows[0])
  fireEvent.click(screen.getByRole('button', { name: 'Correction needed (1)' }))
  expect(screen.queryByText('Certified ID')).toBeNull()
  expect(screen.getByText(/Missing trustee signature/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Upload replacement' }))
  expect(onUpload).toHaveBeenCalledWith(rows[1])
  fireEvent.click(screen.getByRole('button', { name: 'All requests (3)' }))
  fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'rates' } })
  expect(screen.getByText('Rates certificate')).toBeTruthy()
  expect(screen.queryByText('Resolution')).toBeNull()
})
it('keeps read-only users from mutating requests and reports a preview failure without changing status', async () => {
  render(<AttorneyMatterDocumentRequests rows={[rows[0]]} onReview={vi.fn()} onUpload={vi.fn()} onOpen={async () => { throw new Error('Access temporarily unavailable') }} />)
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Upload replacement' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Access temporarily unavailable'))
  expect(screen.getByText('Review needed')).toBeTruthy()
})
