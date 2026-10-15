// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RentalWebsiteChannelManagement from '../RentalWebsiteChannelManagement'

afterEach(cleanup)
const listing = { id: 'rental-1', address: '12 Example Avenue', priceLabel: 'R 14,000 per month', listingStatus: 'active' }
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Manage listing', hidden: true }))

it('uses the sales Manage dialog and keeps failed website publication visible for retry', async () => {
  const publish = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Website unavailable.' }).mockResolvedValueOnce({ ok: true, message: 'Website advert published.' })
  render(<RentalWebsiteChannelManagement channelName="Agency Website" listing={listing} publication={{ status: 'unpublished' }} onPublish={publish} onEdit={() => {}} />)
  open()
  const dialog = within(screen.getByRole('dialog', { name: 'Manage Agency Website listing' }))
  expect(dialog.getByRole('tab', { name: 'Recent activity' })).toBeTruthy()
  expect(dialog.queryByText('Whole listing')).toBeNull()
  fireEvent.click(dialog.getByRole('button', { name: 'Publish to website' }))
  expect(publish).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole('button', { name: 'Publish listing' }))
  await dialog.findByText('Website unavailable.')
  expect(dialog.queryByText('Listing published to the website.')).toBeNull()
  fireEvent.click(dialog.getByRole('button', { name: 'Publish listing' }))
  await dialog.findByText('Website advert published.')
  expect(publish).toHaveBeenCalledTimes(2)
})

it('requires confirmation before withdrawing only the selected website advert', async () => {
  const withdraw = vi.fn().mockResolvedValue({ ok: true, message: 'Kingdom advert withdrawn.' })
  render(<RentalWebsiteChannelManagement channelName="Kingdom Website" listing={listing} publication={{ status: 'published' }} onWithdraw={withdraw} onEdit={() => {}} />)
  open()
  const dialog = within(screen.getByRole('dialog', { name: 'Manage Kingdom Website listing' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Withdraw advert' }))
  expect(withdraw).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
  expect(withdraw).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole('button', { name: 'Withdraw advert' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm withdrawal' }))
  await dialog.findByText('Kingdom advert withdrawn.')
  expect(withdraw).toHaveBeenCalledOnce()
})
