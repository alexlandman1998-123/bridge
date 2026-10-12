// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingDeletionBlockedNotice from '../ListingDeletionBlockedNotice.jsx'
import { getListingDeletionBlock } from '../../../services/privateListingDeletion.js'
afterEach(cleanup)

it('explains the delete-only restriction and offers withdrawal without automatically doing it', () => {
  const onManageWithdrawal = vi.fn()
  render(<ListingDeletionBlockedNotice block={getListingDeletionBlock({ code: '23503' })} onManageWithdrawal={onManageWithdrawal} />)
  expect(screen.getByRole('alert').textContent).toContain('still withdraw')
  expect(onManageWithdrawal).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open withdrawal controls' }))
  expect(onManageWithdrawal).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
})
it('keeps the action disabled during a pending delete and hides it for unrelated failures', () => {
  const onManageWithdrawal = vi.fn()
  const { rerender } = render(<ListingDeletionBlockedNotice block={getListingDeletionBlock({ code: 'listing_must_be_withdrawn' })} disabled onManageWithdrawal={onManageWithdrawal} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open withdrawal controls' }))
  expect(onManageWithdrawal).not.toHaveBeenCalled()
  rerender(<ListingDeletionBlockedNotice block={getListingDeletionBlock({ code: '42501' })} onManageWithdrawal={onManageWithdrawal} />)
  expect(screen.queryByRole('alert')).toBeNull()
})
