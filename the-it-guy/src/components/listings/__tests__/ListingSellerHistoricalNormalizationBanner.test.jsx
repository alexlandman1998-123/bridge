// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ListingSellerHistoricalNormalizationBanner from '../ListingSellerHistoricalNormalizationBanner.jsx'
import { getListingSellerHistoricalNormalization } from '../../../services/listings/listingSellerHistoricalNormalizationService'

vi.mock('../../../services/listings/listingSellerHistoricalNormalizationService', () => ({
  getListingSellerHistoricalNormalization: vi.fn(),
}))

const conflict = {
  requiresReview: true, label: 'Conflicting seller details', tone: 'danger',
  description: 'Historical seller sources disagree.', inferredProfileType: 'individual', actionLabel: 'Review conflicts',
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('seller history warning refresh', () => {
  it('rechecks a saved seller revision and removes a resolved warning without reopening the listing', async () => {
    getListingSellerHistoricalNormalization.mockResolvedValueOnce(conflict).mockResolvedValueOnce({ requiresReview: false })
    const { rerender } = render(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="before-save" />)
    await screen.findByText('Conflicting seller details')
    rerender(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="after-save" />)
    await waitFor(() => expect(getListingSellerHistoricalNormalization).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('seller-history-remediation')).toBeNull())
    expect(screen.queryByText('Checking historical seller data…')).toBeNull()
  })

  it('discards an older audit response that arrives after the corrected seller revision', async () => {
    let resolveOld
    getListingSellerHistoricalNormalization
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce({ requiresReview: false })
    const { rerender } = render(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="before-save" />)
    rerender(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="after-save" />)
    await waitFor(() => expect(screen.queryByText('Checking historical seller data…')).toBeNull())
    await act(async () => resolveOld(conflict))
    expect(screen.queryByTestId('seller-history-remediation')).toBeNull()
  })

  it('keeps a genuine conflict visible after saving and opens its review action', async () => {
    getListingSellerHistoricalNormalization.mockResolvedValue(conflict)
    const onReview = vi.fn()
    const { rerender } = render(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="before-save" onReview={onReview} />)
    await screen.findByText('Conflicting seller details')
    rerender(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" revision="after-save" onReview={onReview} />)
    await screen.findByText('Conflicting seller details')
    fireEvent.click(screen.getByRole('button', { name: 'Review conflicts' }))
    expect(onReview).toHaveBeenCalledWith(conflict)
  })

  it('allows a failed audit to be retried', async () => {
    getListingSellerHistoricalNormalization.mockRejectedValueOnce(new Error('Audit unavailable')).mockResolvedValueOnce({ requiresReview: false })
    render(<ListingSellerHistoricalNormalizationBanner listingId="listing-1" />)
    await screen.findByText('Audit unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByTestId('seller-history-audit-error')).toBeNull())
    await waitFor(() => expect(screen.queryByText('Checking historical seller data…')).toBeNull())
  })
})
