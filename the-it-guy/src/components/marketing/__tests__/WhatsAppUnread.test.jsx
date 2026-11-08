// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppUnread from '../WhatsAppUnread'
import { metaIntegrationRequest } from '../../../services/metaIntegrationService'
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: vi.fn() }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); metaIntegrationRequest.mockResolvedValue({ unreadCount: 2 }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const badge = (org = 'org', enabled = true) => <MemoryRouter><WhatsAppUnread organisationId={org} viewerId="viewer" enabled={enabled} /></MemoryRouter>

it('pauses hidden-tab polling for ten minutes, then reconciles when visible', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  render(badge())
  await tick(600000)
  expect(metaIntegrationRequest).not.toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await tick(100)
  expect(metaIntegrationRequest).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link').getAttribute('aria-label')).toContain('2 unread')
})

it('does not overlap unread checks during repeated read events or a slow connection', async () => {
  let finish
  metaIntegrationRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(badge())
  await tick(100)
  act(() => { for (let i = 0; i < 100; i++) window.dispatchEvent(new Event('arch9:whatsapp-read')) })
  await tick(60000)
  expect(metaIntegrationRequest).toHaveBeenCalledTimes(1)
  await act(async () => finish({ unreadCount: 4 }))
  expect(screen.getByRole('link').getAttribute('aria-label')).toContain('4 unread')
})

it('ignores a previous organisation response and does no work when disabled', async () => {
  let finish
  metaIntegrationRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { rerender } = render(badge())
  await tick(100)
  rerender(badge('other'))
  await tick(100)
  await act(async () => finish({ unreadCount: 999 }))
  expect(screen.getByRole('link').getAttribute('aria-label')).toContain('2 unread')
  rerender(badge('other', false))
  await tick(600000)
  expect(metaIntegrationRequest).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('link')).toBeNull()
})
