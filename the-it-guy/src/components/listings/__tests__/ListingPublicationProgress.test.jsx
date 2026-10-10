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
