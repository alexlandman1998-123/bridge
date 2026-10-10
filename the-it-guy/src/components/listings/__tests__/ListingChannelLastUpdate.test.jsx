// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ListingChannelLastUpdate from '../ListingChannelLastUpdate'
afterEach(cleanup)
it('shows the newest event once, including a failure newer than a previous success', () => {
  const { container } = render(<ListingChannelLastUpdate publicationState={{ submittedAt: '2026-10-01T10:00:00Z', acceptedAt: '2026-10-01T11:00:00Z', verifiedAt: '2026-10-01T12:00:00Z', failedAt: '2026-10-02T10:00:00Z' }} />)
  expect(screen.getByText(/^Failed ·/)).toBeTruthy()
  expect(container.querySelectorAll('p')).toHaveLength(1)
})
it('shows a newer website update instead of old publication history', () => {
  render(<ListingChannelLastUpdate publicationState={{ failedAt: '2026-10-01T10:00:00Z' }} publication={{ publishedAt: '2026-10-01T09:00:00Z', lastSyncedAt: '2026-10-02T10:00:00Z' }} />)
  expect(screen.getByText(/^Updated ·/)).toBeTruthy()
})
it('keeps withdrawn listings distinguishable and ignores invalid timestamps', () => {
  render(<ListingChannelLastUpdate publicationState={{ withdrawnAt: '2026-10-02T10:00:00Z', failedAt: 'invalid' }} />)
  expect(screen.getByText(/^Withdrawn ·/)).toBeTruthy()
})
