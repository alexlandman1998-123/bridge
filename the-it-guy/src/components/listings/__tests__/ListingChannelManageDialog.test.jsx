// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListingChannelManageDialog from '../ListingChannelManageDialog'
afterEach(() => { cleanup(); vi.clearAllMocks() })
const props = {
  channelName: 'Property24', listingStatus: 'active', expiryDate: '2026-11-30', minExpiryDate: '2026-10-11', canUpdateExpiry: true,
  canUpdate: true, canRelist: true, canWithdraw: true, canExpire: true,
  listing: { address: '24 Oak Avenue', priceLabel: 'R 2,450,000', statusLabel: 'For sale' },
  portal: { reference: '116284', statusLabel: 'Live', publicUrl: 'https://www.property24.com/for-sale/example/116284', checkedAt: '2026-10-12T19:40:00Z', publicationState: { stage: 'accepted', submittedAt: '2026-10-12T19:39:00Z', publishedSnapshot: {}, changes: [{ key: 'price', label: 'Price', previousValue: '2500000', currentValue: '2450000' }] } },
  onClose: vi.fn(), onSave: vi.fn(async () => ({ ok: true })), onFix: vi.fn(), onRefresh: vi.fn(async () => ({ ok: true })), onPreview: vi.fn(async () => ({ ok: true })), onUpdate: vi.fn(async () => ({ ok: true })), onRelist: vi.fn(), onWithdraw: vi.fn(), onExpire: vi.fn(),
}
const click = name => fireEvent.click(screen.getByRole('button', { name, exact: true }))

it('shows this portal, saved changes and separate sent/check timestamps', () => {
  render(<ListingChannelManageDialog {...props} />)
  expect(screen.getByRole('heading', { name: 'Manage Property24 listing' })).toBeTruthy()
  expect(screen.getByText('24 Oak Avenue')).toBeTruthy()
  expect(screen.getByText('Last sent')).toBeTruthy()
  expect(screen.getByText('Last status check')).toBeTruthy()
  expect(screen.getByText(/accepted the last submission/)).toBeTruthy()
  fireEvent.click(screen.getByText('Review changes (1)'))
  expect(screen.getByText('2500000 → 2450000')).toBeTruthy()
  expect(screen.queryByText('Private Property')).toBeNull()
})
it('opens the actual public advert with safe new-tab attributes', () => {
  render(<ListingChannelManageDialog {...props} />)
  const link = screen.getByRole('link', { name: 'View advert' })
  expect(link.getAttribute('href')).toBe(props.portal.publicUrl)
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noreferrer')
})
it('does not render a link for an unsafe or missing URL', () => {
  render(<ListingChannelManageDialog {...props} portal={{ publicUrl: 'javascript:alert(1)' }} />)
  expect(screen.queryByRole('link', { name: 'View advert' })).toBeNull()
  expect(screen.getByText('Public listing link unavailable')).toBeTruthy()
})
it('checks status and requirements without sending an advert update', async () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Check latest status')
  await screen.findByText('Latest channel status checked.')
  expect(props.onRefresh).toHaveBeenCalledOnce()
  click('Check requirements')
  await screen.findByText(/Listing requirements checked/)
  expect(props.onPreview).toHaveBeenCalledOnce()
  expect(props.onUpdate).not.toHaveBeenCalled()
  expect(props.onSave).not.toHaveBeenCalled()
})
it('requires confirmation before updating and retains the popup for results', async () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Update advert')
  expect(props.onUpdate).not.toHaveBeenCalled()
  expect(screen.getByText(/Other channels will not receive a content update/)).toBeTruthy()
  click('Send update')
  await screen.findByText(/Update accepted. Check the public advert/)
  expect(props.onUpdate).toHaveBeenCalledOnce()
  expect(props.onClose).not.toHaveBeenCalled()
})
it('cancel discards an update confirmation without sending', () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Update advert'); click('Cancel')
  expect(props.onUpdate).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Send update' })).toBeNull()
})
it('shows rejected actions inside the popup and allows retry', async () => {
  const onUpdate = vi.fn().mockRejectedValueOnce(new Error('Portal unavailable.')).mockResolvedValueOnce({ ok: true })
  render(<ListingChannelManageDialog {...props} onUpdate={onUpdate} />)
  click('Update advert'); click('Send update')
  expect((await screen.findByRole('alert')).textContent).toContain('Portal unavailable.')
  click('Send update')
  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
  await screen.findByText(/Update accepted/)
})
it('prevents duplicate sends and closing during an in-flight request', async () => {
  let finish
  const onUpdate = vi.fn(() => new Promise(resolve => { finish = resolve }))
  render(<ListingChannelManageDialog {...props} onUpdate={onUpdate} />)
  click('Update advert')
  const send = screen.getByRole('button', { name: 'Send update' })
  fireEvent.click(send); fireEvent.click(send)
  expect(onUpdate).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Done' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull()
  finish({ ok: true })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' }).disabled).toBe(false))
})
it.each(['sold', 'under_offer'])('confirms %s as a whole-listing status change', async status => {
  const onSave = vi.fn(async () => ({ ok: true, results: [{ channel: 'Property24', action: status, status: 'sent', detail: 'Accepted.' }] }))
  render(<ListingChannelManageDialog {...props} onSave={onSave} />)
  click('Change listing status')
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: status } })
  expect(screen.getByText(/updates every active channel/)).toBeTruthy()
  click('Save changes')
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ listingStatus: status, expiryDate: props.expiryDate, retryResults: [] }))
  expect(await screen.findByText('Property24 · Accepted · check advert')).toBeTruthy()
})
it('extends expiry on Property24 without changing listing status', async () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Extend expiry')
  fireEvent.change(screen.getByLabelText('Listing expiry date'), { target: { value: '2026-12-31' } })
  click('Save changes')
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ listingStatus: 'active', expiryDate: '2026-12-31', retryResults: [] }))
})
it('blocks invalid expiry dates before any send', () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Extend expiry')
  fireEvent.change(screen.getByLabelText('Listing expiry date'), { target: { value: '2026-10-01' } })
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
  expect(props.onSave).not.toHaveBeenCalled()
})
it('never exposes expiry actions on Private Property', () => {
  render(<ListingChannelManageDialog {...props} channelName="Private Property" canUpdateExpiry={false} canExpire={false} onExpire={undefined} />)
  expect(screen.queryByRole('button', { name: 'Extend expiry' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Expire advert' })).toBeNull()
})
it.each([['Relist / reactivate', 'onRelist'], ['Withdraw advert', 'onWithdraw'], ['Expire advert', 'onExpire'], ['Edit listing details', 'onFix']])('%s opens the corresponding existing workflow', (label, handler) => {
  render(<ListingChannelManageDialog {...props} />)
  click(label)
  expect(props[handler]).toHaveBeenCalledOnce()
  expect(props.onUpdate).not.toHaveBeenCalled()
})
it('disables inappropriate actions for an inactive advert and completed sale', () => {
  render(<ListingChannelManageDialog {...props} listingStatus="sold" canUpdate={false} canRelist={false} canWithdraw={false} canExpire={false} />)
  for (const label of ['Update advert', 'Relist / reactivate', 'Withdraw advert', 'Expire advert', 'Change listing status']) expect(screen.getByRole('button', { name: label }).disabled).toBe(true)
})
it('shows durable portal failures, warnings and readable technical details', () => {
  const detail = 'System.SoapException: the supplier rejected this request.'
  render(<ListingChannelManageDialog {...props} portal={{ ...props.portal, issues: [detail], warnings: ['Address is locked on the existing advert.'] }} />)
  expect(screen.getByRole('alert').textContent).toContain('portal could not process')
  fireEvent.click(screen.getByText('Technical details'))
  expect(screen.getByText(detail)).toBeTruthy()
  expect(screen.getByText('Address is locked on the existing advert.')).toBeTruthy()
})
it('retries a failed content update only after explicit confirmation', async () => {
  const onRetry = vi.fn(async () => ({ ok: true }))
  render(<ListingChannelManageDialog {...props} portal={{ ...props.portal, issues: ['Previous update failed.'] }} onRetry={onRetry} />)
  click('Retry failed update')
  expect(onRetry).not.toHaveBeenCalled()
  click('Retry on this channel')
  await waitFor(() => expect(onRetry).toHaveBeenCalledOnce())
})
it('retains successful status results and retries only failed channels', async () => {
  const failed = { channel: 'Private Property', action: 'sold', status: 'failed', detail: 'Try again.' }
  const onSave = vi.fn().mockResolvedValueOnce({ ok: false, results: [{ channel: 'Property24', action: 'sold', status: 'sent' }, failed] }).mockResolvedValueOnce({ ok: true })
  render(<ListingChannelManageDialog {...props} onSave={onSave} />)
  click('Change listing status')
  fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: 'sold' } })
  click('Save changes')
  await screen.findByRole('button', { name: 'Retry failed status updates' })
  expect(screen.getByLabelText('Listing status').disabled).toBe(true)
  click('Retry failed status updates')
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  expect(onSave.mock.calls[1][0].retryResults).toEqual([failed])
})
it('reopens a saved status failure without resending successful channels', async () => {
  const failed = { channel: 'Private Property', action: 'sold', status: 'failed', detail: 'Try again.' }
  const onSave = vi.fn(async () => ({ ok: true }))
  render(<ListingChannelManageDialog {...props} listingStatus="sold" initialResults={[failed]} onSave={onSave} />)
  click('Retry failed status updates')
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ listingStatus: 'sold', expiryDate: props.expiryDate, retryResults: [failed] }))
})
it('opens channel-specific activity without sending requests', () => {
  render(<ListingChannelManageDialog {...props} portal={{ ...props.portal, activity: [{ id: 'event-1', title: 'Property24 update accepted', detail: 'Check public advert.', at: '2026-10-12T19:40:00Z', by: 'Alex' }] }} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Recent activity' }))
  expect(screen.getByText('Property24 update accepted')).toBeTruthy()
  expect(props.onUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  expect(screen.getByText('Portal status')).toBeTruthy()
})
it('confirms public-page verification before recording it', async () => {
  const onVerify = vi.fn(async () => ({ ok: true }))
  render(<ListingChannelManageDialog {...props} onVerify={onVerify} />)
  click('Confirm public advert is current')
  expect(onVerify).not.toHaveBeenCalled()
  click('Confirm verification')
  await waitFor(() => expect(onVerify).toHaveBeenCalledOnce())
})
it('hands off required syndication review without falsely reporting success', async () => {
  render(<ListingChannelManageDialog {...props} onUpdate={async () => ({ deferred: true })} />)
  click('Update advert'); click('Send update')
  await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce())
  expect(screen.queryByText(/Update accepted/)).toBeNull()
})
it('Done and Escape close without writing data', () => {
  render(<ListingChannelManageDialog {...props} />)
  click('Done')
  expect(props.onClose).toHaveBeenCalledOnce()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(props.onClose).toHaveBeenCalledTimes(2)
  expect(props.onSave).not.toHaveBeenCalled()
})

it.each(['Property24', 'Private Property'])('saves the %s live advert link without publishing', async channelName => {
  const onSavePublicUrl = vi.fn(async () => ({ ok: true }))
  const value = channelName === 'Property24' ? 'https://www.property24.com/for-sale/example/12345' : 'https://www.privateproperty.co.za/for-sale/gauteng/example/T12345'
  render(<ListingChannelManageDialog {...props} channelName={channelName} portal={{ ...props.portal, publicUrl: '' }} onSavePublicUrl={onSavePublicUrl} />)
  fireEvent.change(screen.getByLabelText('Live portal link'), { target: { value } })
  click('Save link')
  await waitFor(() => expect(onSavePublicUrl).toHaveBeenCalledWith(value))
  expect(props.onUpdate).not.toHaveBeenCalled()
  expect(props.onSave).not.toHaveBeenCalled()
  expect(props.onClose).not.toHaveBeenCalled()
})
it.each(['https://www.privateproperty.co.za/for-sale/example/T123', 'https://property24.com.evil.test/listing', 'http://www.property24.com/for-sale/example/123', 'https://user:secret@www.property24.com/listing/123', 'https://www.property24.com/'])('rejects an invalid Property24 link: %s', async value => {
  const onSavePublicUrl = vi.fn()
  render(<ListingChannelManageDialog {...props} onSavePublicUrl={onSavePublicUrl} />)
  fireEvent.change(screen.getByLabelText('Live portal link'), { target: { value } })
  click('Save link')
  expect((await screen.findByRole('alert')).textContent).toContain('exact HTTPS Property24 advert URL')
  expect(onSavePublicUrl).not.toHaveBeenCalled()
})
it('keeps the pasted live link after a save failure', async () => {
  const onSavePublicUrl = vi.fn(async () => { throw new Error('Link could not be saved.') })
  render(<ListingChannelManageDialog {...props} onSavePublicUrl={onSavePublicUrl} />)
  const value = 'https://www.property24.com/for-sale/example/12345'
  fireEvent.change(screen.getByLabelText('Live portal link'), { target: { value } })
  click('Save link')
  await screen.findByText('Link could not be saved.')
  expect(screen.getByLabelText('Live portal link').value).toBe(value)
})
