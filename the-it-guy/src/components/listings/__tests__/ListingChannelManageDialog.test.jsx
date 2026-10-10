// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingChannelManageDialog from '../ListingChannelManageDialog'
afterEach(cleanup)
const props = { channelName: 'Property24', listingStatus: 'active', expiryDate: '2026-11-30', minExpiryDate: '2026-10-11', onClose: vi.fn(), onSave: vi.fn(async () => ({ ok: true })) }

it('uses a single save with isolated form state and closes on success', async () => {
  const onSave = vi.fn(async () => ({ ok: true }))
  const onClose = vi.fn()
  render(<ListingChannelManageDialog {...props} onSave={onSave} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('Listing expiry date'), { target: { value: '2026-12-31' } })
  fireEvent.change(screen.getByLabelText(/Listing status/), { target: { value: 'sold' } })
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(onSave).toHaveBeenCalledWith({ listingStatus: 'sold', expiryDate: '2026-12-31', retryResults: [] })
  for (const removed of ['Listing requirements', 'Portal status', 'Portal location', 'Portal leads']) expect(screen.queryByText(removed)).toBeNull()
})
it('cancel discards edits without a send', () => {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(<ListingChannelManageDialog {...props} onSave={onSave} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText(/Listing status/), { target: { value: 'under_offer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSave).not.toHaveBeenCalled()
})
it('keeps failures visible and locks completed choices during a targeted retry', async () => {
  const failed = { channel: 'Agency Website', action: 'sold', status: 'failed', detail: 'Try again.' }
  const onSave = vi.fn().mockResolvedValueOnce({ ok: false, results: [{ channel: 'Property24', status: 'sent' }, failed] }).mockResolvedValueOnce({ ok: true })
  render(<ListingChannelManageDialog {...props} onSave={onSave} />)
  fireEvent.change(screen.getByLabelText(/Listing status/), { target: { value: 'sold' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByRole('button', { name: 'Retry failed updates' })
  expect(screen.getByRole('alert').textContent).toContain('Agency Website')
  expect(screen.getByLabelText(/Listing status/).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed updates' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  expect(onSave.mock.calls[1][0].retryResults).toEqual([failed])
})
it('shows expiry only on Property24 and sale status only on sales', () => {
  const { unmount } = render(<ListingChannelManageDialog {...props} channelName="Private Property" />)
  expect(screen.queryByLabelText('Listing expiry date')).toBeNull()
  expect(screen.getByText(/Sold and Under offer update all active channels/)).toBeTruthy()
  unmount()
  render(<ListingChannelManageDialog {...props} isSale={false} />)
  expect(screen.queryByLabelText(/Listing status/)).toBeNull()
})

it('reopens saved failures as a targeted retry without resending successful channels', async () => {
  const failed = { channel: 'Private Property', action: 'sold', status: 'failed', detail: 'Try again.' }
  const onSave = vi.fn(async () => ({ ok: true }))
  render(<ListingChannelManageDialog {...props} listingStatus="sold" initialResults={[failed]} onSave={onSave} />)
  expect(screen.getByLabelText(/Listing status/).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed updates' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ listingStatus: 'sold', expiryDate: props.expiryDate, retryResults: [failed] }))
})

it('offers understandable sale actions for listings saved before publication', () => {
  render(<ListingChannelManageDialog {...props} listingStatus="mandate_signed" />)
  expect(screen.getByRole('option', { name: 'For sale' }).selected).toBe(true)
  expect(screen.getByRole('option', { name: 'Under offer' }).disabled).toBe(false)
  expect(screen.getByRole('option', { name: 'Sold' }).disabled).toBe(false)
})

it('cannot publish unchanged content from Manage listing', () => {
  render(<ListingChannelManageDialog {...props} canUpdateExpiry={false} />)
  expect(screen.queryByLabelText('Listing expiry date')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
})
