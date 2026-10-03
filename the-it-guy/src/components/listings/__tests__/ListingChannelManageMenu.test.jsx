// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingChannelManageMenu from '../ListingChannelManageMenu'
afterEach(cleanup)

it('dismisses on outside click and Escape, restoring focus for Escape', async () => {
  render(<ListingChannelManageMenu channelName="Property24"><button>Check listing requirements</button></ListingChannelManageMenu>)
  const summary = screen.getByText('Manage')
  const menu = summary.closest('details')
  fireEvent.click(summary)
  await waitFor(() => expect(menu.open).toBe(true))
  fireEvent.pointerDown(document.body)
  await waitFor(() => expect(menu.open).toBe(false))
  fireEvent.click(summary)
  await waitFor(() => expect(menu.open).toBe(true))
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(menu.open).toBe(false))
  expect(document.activeElement).toBe(summary)
})

it('closes after selecting an action without losing its handler', async () => {
  const check = vi.fn()
  render(<ListingChannelManageMenu channelName="Private Property"><button onClick={check}>Check listing requirements</button></ListingChannelManageMenu>)
  const menu = screen.getByText('Manage').closest('details')
  fireEvent.click(screen.getByText('Manage'))
  await waitFor(() => expect(menu.open).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Check listing requirements' }))
  expect(check).toHaveBeenCalledTimes(1)
  expect(menu.open).toBe(false)
})

it('keeps only one portal menu open', async () => {
  render(<><ListingChannelManageMenu channelName="Property24"><button>P24 action</button></ListingChannelManageMenu><ListingChannelManageMenu channelName="Private Property"><button>PP action</button></ListingChannelManageMenu></>)
  const summaries = screen.getAllByText('Manage')
  fireEvent.click(summaries[0])
  await waitFor(() => expect(summaries[0].closest('details').open).toBe(true))
  fireEvent.click(summaries[1])
  await waitFor(() => {
    expect(summaries[1].closest('details').open).toBe(true)
    expect(summaries[0].closest('details').open).toBe(false)
  })
})
