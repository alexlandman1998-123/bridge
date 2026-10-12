// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingDocumentActions from '../ListingDocumentActions.jsx'
import SellerDocumentWorkflowActions from '../SellerDocumentWorkflowActions.jsx'
import SellerDocumentReviewActions from '../SellerDocumentReviewActions.jsx'

afterEach(cleanup)

test('dropdown reveals available workflow actions without repeated instructions and closes after a selection', () => {
  const download = vi.fn()
  render(<ListingDocumentActions label="Mandate"><SellerDocumentWorkflowActions compact item={{ label: 'Mandate' }} onDownload={download} /></ListingDocumentActions>)
  const trigger = screen.getByRole('button', { name: 'Actions for Mandate' })
  expect(screen.queryByRole('button', { name: 'Generate and download' })).toBeNull()
  fireEvent.click(trigger)
  expect(screen.queryByText('Choose a document action')).toBeNull()
  expect(screen.queryByText(/The agent chooses the document route/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Generate and download' }))
  expect(download).toHaveBeenCalledOnce()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('Escape returns focus to the trigger and outside clicks dismiss the dropdown', () => {
  render(<ListingDocumentActions label="Rates"><button type="button">Request</button></ListingDocumentActions>)
  const trigger = screen.getByRole('button', { name: 'Actions for Rates' })
  fireEvent.click(trigger)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Request' }), { key: 'Escape' })
  expect(document.activeElement).toBe(trigger)
  expect(screen.queryByRole('group')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('group')).toBeNull()
})

test('signed evidence confirmation remains available inside the dropdown before approval', () => {
  const review = vi.fn()
  const item = { label: 'Mandate', key: 'signed_mandate', status: 'uploaded', linkedDocument: { id: 'file', requirement_id: 'requirement' } }
  render(<ListingDocumentActions label="Mandate"><SellerDocumentReviewActions item={item} onReview={review} requireSignedEvidenceCheck compact /></ListingDocumentActions>)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Mandate' }))
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }))
  const approve = screen.getByRole('button', { name: 'Approve signed copy' })
  expect(approve.disabled).toBe(true)
  expect(review).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(approve)
  expect(review).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }))
})

test('manual upload passes the selected file before closing the dropdown', () => {
  const upload = vi.fn()
  render(<ListingDocumentActions label="Mandate"><SellerDocumentWorkflowActions compact item={{ label: 'Mandate' }} onUpload={upload} /></ListingDocumentActions>)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Mandate' }))
  const file = new File(['signed'], 'mandate.pdf')
  fireEvent.change(screen.getByLabelText('Upload manually Mandate'), { target: { files: [file] } })
  expect(upload).toHaveBeenCalledOnce()
  expect(screen.queryByRole('group')).toBeNull()
})
