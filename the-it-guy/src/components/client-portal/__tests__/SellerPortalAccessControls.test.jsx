// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import SellerPortalAccessControls from '../SellerPortalAccessControls.jsx'
import { getSellerPortalAccessState, manageSellerPortalAccess } from '../../../services/privateListingService.js'

vi.mock('../../../services/privateListingService.js', () => ({ getSellerPortalAccessState: vi.fn(), manageSellerPortalAccess: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('revoke needs confirmation and uses only the current listing token', async () => {
  const onStateChange = vi.fn()
  manageSellerPortalAccess.mockResolvedValue({ ok: true })
  getSellerPortalAccessState.mockResolvedValue({ linkActive: false })
  render(<SellerPortalAccessControls token="seller-only-realty" accessState={{ linkActive: true }} onStateChange={onStateChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Revoke Portal' }))
  expect(manageSellerPortalAccess).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(manageSellerPortalAccess).toHaveBeenCalledWith('seller-only-realty', { action: 'revoke' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Portal access revoked.'))
  expect(onStateChange).toHaveBeenCalledWith({ linkActive: false })
})

test('failed mutations keep existing access and display the error', async () => {
  const onStateChange = vi.fn()
  manageSellerPortalAccess.mockRejectedValue(new Error('Access denied'))
  render(<SellerPortalAccessControls token="seller-only-realty" accessState={{ linkActive: false }} onStateChange={onStateChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Reactivate Portal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Access denied'))
  expect(onStateChange).not.toHaveBeenCalled()
})

test('session sign-out preserves the portal lifecycle when the refresh fails', async () => {
  const onStateChange = vi.fn()
  manageSellerPortalAccess.mockResolvedValue({ ok: true })
  getSellerPortalAccessState.mockRejectedValue(new Error('Temporary failure'))
  render(<SellerPortalAccessControls token="seller-only-realty" accessState={{ linkActive: true }} onStateChange={onStateChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign Out Sessions' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Seller sessions signed out.'))
  expect(manageSellerPortalAccess).toHaveBeenCalledWith('seller-only-realty', { action: 'revoke_sessions' })
  expect(onStateChange).not.toHaveBeenCalled()
})
