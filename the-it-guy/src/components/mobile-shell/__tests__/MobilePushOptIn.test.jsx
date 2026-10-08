// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MobilePushOptIn } from '../MobilePushOptIn.jsx'
import { mobileWebPushService } from '../../../services/mobileWebPushService.js'

let user = { id: 'a' }
vi.mock('../../../context/AuthSessionContext.jsx', () => ({ useAuthSession: () => ({ user }) }))
vi.mock('../../../services/mobileWebPushService.js', () => ({ mobileWebPushService: { load: vi.fn(), enable: vi.fn(), disable: vi.fn(), test: vi.fn() } }))
vi.mock('../../../services/mobileProductivityService.js', () => ({ setNotificationPreference: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); user = { id: 'a' }; mobileWebPushService.load.mockResolvedValue({ publicKey: 'key', subscriptionId: null }) })
afterEach(cleanup)

test('a failed registration never unlocks the test button', async () => {
  mobileWebPushService.enable.mockRejectedValue(new Error('Registration failed'))
  render(<MobilePushOptIn />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enable Notifications' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Enable Notifications' }))
  await screen.findByText('Registration failed')
  expect(screen.queryByRole('button', { name: 'Send me a test' })).toBeNull()
})

test('enable, test acceptance, expired device, and account change use real status', async () => {
  mobileWebPushService.enable.mockResolvedValue({ publicKey: 'key', subscriptionId: 'saved' })
  mobileWebPushService.test.mockResolvedValue({ accepted: true, message: 'Check your lock screen.' })
  const view = render(<MobilePushOptIn />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enable Notifications' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Enable Notifications' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Send me a test' }))
  await screen.findByText('Check your lock screen.')
  expect(mobileWebPushService.test).toHaveBeenCalledWith('a', 'saved')
  mobileWebPushService.test.mockRejectedValue(Object.assign(new Error('Enable again'), { status: 410 }))
  fireEvent.click(screen.getByRole('button', { name: 'Send me a test' }))
  await waitFor(() => expect(mobileWebPushService.load).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: 'Send me a test' })).toBeNull()
  user = { id: 'b' }
  view.rerender(<MobilePushOptIn />)
  await waitFor(() => expect(mobileWebPushService.load).toHaveBeenCalledWith('b'))
  expect(screen.queryByText('Enable again')).toBeNull()
})

test('unsupported devices and signed-out users have no enable/test action', async () => {
  mobileWebPushService.load.mockResolvedValue({ unavailable: true, message: 'Open from your Home Screen.' })
  const view = render(<MobilePushOptIn />)
  await screen.findByText('Open from your Home Screen.')
  expect(screen.queryByRole('button', { name: 'Enable Notifications' })).toBeNull()
  user = null
  view.rerender(<MobilePushOptIn />)
  expect(screen.getByText('Sign in to enable notifications.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Send me a test' })).toBeNull()
})

test('a registration response from the previous account cannot enable the new account', async () => {
  let resolve
  mobileWebPushService.enable.mockReturnValue(new Promise((done) => { resolve = done }))
  const view = render(<MobilePushOptIn />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enable Notifications' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Enable Notifications' }))
  user = { id: 'b' }
  view.rerender(<MobilePushOptIn />)
  await waitFor(() => expect(mobileWebPushService.load).toHaveBeenCalledWith('b'))
  resolve({ publicKey: 'key', subscriptionId: 'old-account' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enable Notifications' }).disabled).toBe(false))
  expect(screen.queryByRole('button', { name: 'Send me a test' })).toBeNull()
})
