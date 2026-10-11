// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingPublicationProgress from '../ListingPublicationProgress'
afterEach(cleanup)
const result = (status, retryable = false) => ({ key: 'property24', label: 'Property24', status, retryable, message: 'Channel response.' })
it('offers targeted retry for confirmed failures while keeping successful receipts visible', () => {
  const onRetry = vi.fn()
  render(<ListingPublicationProgress results={[result('needs_attention', true), { ...result('submitted'), key: 'private_property', label: 'Private Property' }]} onRetry={onRetry} />)
  expect(screen.getByText('Private Property')).toBeTruthy()
  expect(screen.getByText(/Successful channels will not be resent/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed channels' }))
  expect(onRetry).toHaveBeenCalledOnce()
})
it('offers a check without a retry for an unconfirmed request', () => {
  const onCheckStatus = vi.fn()
  render(<ListingPublicationProgress results={[result('uncertain')]} onCheckStatus={onCheckStatus} />)
  expect(screen.queryByRole('button', { name: 'Retry failed channels' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
  expect(onCheckStatus).toHaveBeenCalledOnce()
})
it('cannot retry failed channels while another submission is still running', () => {
  render(<ListingPublicationProgress results={[result('needs_attention', true), { ...result('publishing'), key: 'private_property' }]} onRetry={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Retry failed channels' }).disabled).toBe(true)
})
it('gives a private saved listing a next action without inventing publication', () => {
  const review = vi.fn()
  render(<ListingPublicationProgress saved title="12 Example Road" listingStatus="draft" channels={[]} onReview={review} />)
  expect(screen.getByText(/Saved as a draft/)).toBeTruthy()
  expect(screen.queryByText('Request accepted')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue draft' }))
  expect(review).toHaveBeenCalledOnce()
})
it('separates a queued request from provider acceptance and a live advert', () => {
  render(<ListingPublicationProgress results={[{ ...result('publishing'), jobState: 'queued', jobId: 'saved-job' }, { ...result('submitted'), key: 'private_property', label: 'Private Property' }]} />)
  expect(screen.getByText(/waiting to send/)).toBeTruthy()
  expect(screen.getByText(/Check the public advert before treating it as live/)).toBeTruthy()
  expect(screen.queryByText(/Channel response/)).toBeNull()
})
it('asks the agent to stay until the advertising request has a durable receipt', () => {
  render(<ListingPublicationProgress results={[result('publishing')]} />)
  expect(screen.getByText(/Keep this page open/)).toBeTruthy()
  expect(screen.queryByText(/continues after you leave/)).toBeNull()
})
it('keeps summary navigation closed while the save or queue request is in flight', () => {
  const leave = vi.fn()
  render(<ListingPublicationProgress busy results={[result('publishing')]} onViewListing={leave} onFollowUp={leave} onDocuments={leave} />)
  for (const name of ['View listing', 'Seller details', 'Documents']) {
    const button = screen.getByRole('button', { name })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
  }
  expect(leave).not.toHaveBeenCalled()
})
it('keeps genuine failure and uncertainty guidance together without retrying the unknown request', () => {
  render(<ListingPublicationProgress results={[result('needs_attention', true), { ...result('uncertain'), key: 'private_property' }]} onRetry={vi.fn()} />)
  expect(screen.getByText(/Successful channels will not be resent/)).toBeTruthy()
  expect(screen.getByText(/An unconfirmed request will not be retried/)).toBeTruthy()
})
it('has no dead retry button on a screen that requires review first', () => {
  render(<ListingPublicationProgress results={[result('needs_attention', true)]} onReview={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Retry failed channels' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Review advertising' })).toBeTruthy()
})
it('marks receipts as previous results after saving unsent changes and keeps owner follow-ups separate', () => {
  const followUp = vi.fn(), documents = vi.fn()
  render(<ListingPublicationProgress saved changesNotSent results={[result('submitted')]} onFollowUp={followUp} onDocuments={documents} followUpLabel="Landlord details" />)
  expect(screen.getByText(/This save did not update your public adverts/)).toBeTruthy()
  expect(screen.getByText('Previous advertising request')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Landlord details' }))
  expect(followUp).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Documents' }))
  expect(documents).toHaveBeenCalledOnce()
  expect(followUp).toHaveBeenCalledOnce()
})
it('requires unsaved changes to be saved before a retry unless the retry explicitly saves them', () => {
  const { rerender } = render(<ListingPublicationProgress unsavedChanges results={[result('needs_attention', true)]} onRetry={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Retry failed channels' }).disabled).toBe(true)
  rerender(<ListingPublicationProgress unsavedChanges retrySavesChanges results={[result('needs_attention', true)]} onRetry={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Save and retry failed channels' }).disabled).toBe(false)
})
