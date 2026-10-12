// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingChannelActions from '../ListingChannelActions'
import { saveListingChannelManagement } from '../../../services/listings/listingChannelManagement'

afterEach(cleanup)
const base = { status: 'active', isSale: true, busy: false, onWithdraw: vi.fn(), onUnderOffer: vi.fn(), onSold: vi.fn() }

it('routes the withdrawal button to the existing all-channel withdrawal flow', () => {
  const onWithdraw = vi.fn()
  render(<ListingChannelActions {...base} onWithdraw={onWithdraw} />)
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw Listings' }))
  expect(onWithdraw).toHaveBeenCalledOnce()
  expect(screen.getAllByRole('button')).toHaveLength(3)
})

for (const [label, status, callback] of [['Mark as under offer', 'under_offer', 'onUnderOffer'], ['Mark as sold', 'sold', 'onSold']]) {
  it(`${label} can use the shared workflow to reach every active platform`, async () => {
    const sendUpdate = vi.fn(async () => {})
    const done = vi.fn()
    const run = async () => {
      const result = await saveListingChannelManagement({
        channel: 'Agency Website', draft: { listingStatus: 'active', listingType: 'sale' }, listingStatus: status,
        activeChannels: ['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'],
      }, { saveDraft: async () => ({ ok: true }), recordStarted: async () => {}, recordStage: async () => {}, sendUpdate, recordFinished: async () => {} })
      done(result)
    }
    render(<ListingChannelActions {...base} {...{ [callback]: run }} />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(sendUpdate.mock.calls.map(([target]) => target.channel)).toEqual(['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'])
    expect(sendUpdate.mock.calls.every(([target]) => target.action === status)).toBe(true)
  })
}

it('blocks overlapping mutations and invalid sale transitions', () => {
  const onSold = vi.fn()
  const view = render(<ListingChannelActions {...base} busy onSold={onSold} />)
  for (const button of screen.getAllByRole('button')) expect(button.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as sold' }))
  expect(onSold).not.toHaveBeenCalled()
  view.rerender(<ListingChannelActions {...base} status="under_offer" onSold={onSold} />)
  expect(screen.getByRole('button', { name: 'Mark as under offer' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Mark as sold' }).disabled).toBe(false)
  view.rerender(<ListingChannelActions {...base} status="sold" />)
  expect(screen.getByRole('button', { name: 'Mark as sold' }).disabled).toBe(true)
  view.rerender(<ListingChannelActions {...base} isSale={false} />)
  expect(screen.getByRole('button', { name: 'Mark as under offer' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Mark as sold' }).disabled).toBe(true)
})
