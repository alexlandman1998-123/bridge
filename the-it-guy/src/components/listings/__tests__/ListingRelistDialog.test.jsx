// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingRelistDialog from '../ListingRelistDialog.jsx'
afterEach(cleanup)
const props = { channels: ['Property24', 'Private Property'], expiryDate: '2027-01-10', minExpiryDate: '2026-10-13', onClose: vi.fn(), onEdit: vi.fn() }

it('requires same-property confirmation and makes no send until Relist is clicked', async () => {
  const onRelist = vi.fn(async () => [])
  render(<ListingRelistDialog {...props} onRelist={onRelist} />)
  const button = screen.getByRole('button', { name: 'Relist selected channels' })
  expect(button.disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('This is the same property as the original advert.'))
  expect(onRelist).not.toHaveBeenCalled()
  fireEvent.click(button)
  await waitFor(() => expect(onRelist).toHaveBeenCalledOnce())
  expect(onRelist.mock.calls[0][0].channels).toEqual(props.channels)
})
it('keeps completed portals out of a continuation and shows both outcomes', async () => {
  const done = { channel: 'Property24', status: 'completed', detail: 'Saved edits received.' }
  const pending = { channel: 'Private Property', status: 'pending', detail: 'Waiting for activation.' }
  const onRelist = vi.fn().mockResolvedValueOnce([done, pending]).mockResolvedValueOnce([done, { ...pending, status: 'completed' }])
  render(<ListingRelistDialog {...props} onRelist={onRelist} />)
  fireEvent.click(screen.getByLabelText('This is the same property as the original advert.'))
  fireEvent.click(screen.getByRole('button', { name: 'Relist selected channels' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Check and continue' }))
  await waitFor(() => expect(onRelist).toHaveBeenCalledTimes(2))
  expect(onRelist.mock.calls[1][0].channels).toEqual(['Private Property'])
  expect(onRelist.mock.calls[1][0].previousResults).toEqual([done, pending])
  await screen.findByRole('button', { name: 'Done' })
})
it('locks sending and closing while a request is in progress', async () => {
  let finish
  const onRelist = vi.fn(() => new Promise(resolve => { finish = resolve }))
  render(<ListingRelistDialog {...props} onRelist={onRelist} />)
  fireEvent.click(screen.getByLabelText('This is the same property as the original advert.'))
  fireEvent.click(screen.getByRole('button', { name: 'Relist selected channels' }))
  expect(screen.getByRole('button', { name: 'Close' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Relisting…' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Relisting…' }))
  expect(onRelist).toHaveBeenCalledOnce()
  finish([])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close' }).disabled).toBe(false))
})
it('offers editing for an address blocker and no retry of an uncertain content send', async () => {
  const onRelist = vi.fn(async () => [{ channel: 'Property24', status: 'uncertain', detail: 'Check the advert before sending again.' }])
  render(<ListingRelistDialog {...props} initialChannel="Property24" onRelist={onRelist} />)
  expect(screen.getByLabelText('Private Property').checked).toBe(false)
  fireEvent.click(screen.getByLabelText('This is the same property as the original advert.'))
  fireEvent.click(screen.getByRole('button', { name: 'Relist selected channels' }))
  await screen.findByText('Check the advert before sending again.')
  expect(screen.queryByRole('button', { name: 'Check and continue' })).toBeNull()
})
it('Close before starting leaves listings untouched', () => {
  const onRelist = vi.fn()
  const onClose = vi.fn()
  render(<ListingRelistDialog {...props} onRelist={onRelist} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onRelist).not.toHaveBeenCalled()
})

it('lets an agent edit details after a portal blocks the address', async () => {
  const onEdit = vi.fn()
  render(<ListingRelistDialog {...props} onEdit={onEdit} onRelist={async () => [{ channel: 'Private Property', status: 'blocked', detail: 'Correct the address or create a new listing.' }]} />)
  fireEvent.click(screen.getByLabelText('This is the same property as the original advert.'))
  fireEvent.click(screen.getByRole('button', { name: 'Relist selected channels' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }))
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onEdit).toHaveBeenCalledWith('Private Property')
})
