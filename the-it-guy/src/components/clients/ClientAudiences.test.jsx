// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ClientAudiences from './ClientAudiences'
import { getAudienceFilterOptions, getSavedAudiences, previewSavedAudience, saveEmailAudience } from '../../services/emailCampaignService'
vi.mock('../../services/emailCampaignService', () => ({ getAudienceFilterOptions: vi.fn(), getSavedAudiences: vi.fn(), previewSavedAudience: vi.fn(), saveEmailAudience: vi.fn(), archiveEmailAudience: vi.fn() }))
const rules = { operator: 'AND', rules: [{ field: 'contact_type', operator: 'in', value: ['buyer'] }] }
const saved = { id: 'buyers', name: 'Buyers', filter_json: rules, updated_at: new Date().toISOString() }
const contact = { id: 'first', name: 'First Buyer', email: 'first@example.test', contactType: 'buyer', area: 'Cape Town', leadStage: 'qualified', tags: ['show-day'] }
beforeEach(() => {
  getAudienceFilterOptions.mockResolvedValue({ preferred_area: ['Cape Town', 'Durban'], lead_stage: ['qualified'], tags: ['show-day'] })
  getSavedAudiences.mockResolvedValue([saved])
  previewSavedAudience.mockResolvedValue({ count: 26, contacts: [contact] })
  saveEmailAudience.mockResolvedValue(saved)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const show = () => render(<ClientAudiences organisationId="agency" userId="user" />)

test('starting points create editable drafts without saving or changing contacts', async () => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Investors Investment contacts' }))
  expect(screen.getByLabelText('Audience name').value).toBe('Investors')
  expect(screen.getByRole('button', { name: 'Remove investor from filter 1' })).toBeTruthy()
  expect(saveEmailAudience).not.toHaveBeenCalled()
  await waitFor(() => expect(previewSavedAudience).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'agency', rules: { operator: 'AND', rules: [{ field: 'contact_type', operator: 'in', value: ['investor'] }] } })))
})

test('uses existing dropdown values and saves multiple selections in one filter', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Clients by area Choose an existing area' }))
  const select = screen.getByLabelText('Filter 1 Preferred area')
  await waitFor(() => expect(within(select).getByRole('option', { name: 'Cape Town' })).toBeTruthy())
  fireEvent.change(select, { target: { value: 'Cape Town' } })
  fireEvent.change(select, { target: { value: 'Durban' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(saveEmailAudience).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'agency', audience: expect.objectContaining({ filterJson: { operator: 'AND', rules: [{ field: 'preferred_area', operator: 'in', value: ['Cape Town', 'Durban'] }] } }) })))
})

test('matching-client view pages beyond the preview and preserves builder edits', async () => {
  previewSavedAudience.mockImplementation(async ({ offset = 0 }) => ({ count: 26, contacts: [{ ...contact, name: offset ? 'Last Buyer' : 'First Buyer' }] }))
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'View matching clients for Buyers' }))
  const dialog = screen.getByRole('dialog')
  await within(dialog).findByText('First Buyer')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
  await within(dialog).findByText('Last Buyer')
  expect(previewSavedAudience).toHaveBeenLastCalledWith({ organisationId: 'agency', rules, limit: 25, offset: 25 })
  expect(within(dialog).getByRole('button', { name: 'Next' }).disabled).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Buyers' }))
  fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'My draft' } })
  const view = screen.getByRole('button', { name: 'View matching clients →' })
  await waitFor(() => expect(view.disabled).toBe(false))
  fireEvent.click(view)
  await within(screen.getByRole('dialog')).findByText('First Buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(screen.getByLabelText('Audience name').value).toBe('My draft')
})

test('matching-client failures show a retry instead of claiming an empty audience', async () => {
  show()
  const view = await screen.findByRole('button', { name: 'View matching clients for Buyers' })
  previewSavedAudience.mockRejectedValueOnce(new Error('Network unavailable'))
  fireEvent.click(view)
  const dialog = screen.getByRole('dialog')
  await within(dialog).findByText('Network unavailable')
  expect(within(dialog).queryByText('No clients match these filters.')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
  await within(dialog).findByText('First Buyer')
})

test('keeps old saved values selectable even when they are absent from current contacts', async () => {
  getSavedAudiences.mockResolvedValue([{ ...saved, filter_json: { operator: 'AND', rules: [{ field: 'tags', operator: 'in', value: ['old-tag', 'show-day'] }] } }])
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Buyers' }))
  expect(screen.getByRole('button', { name: 'Remove old-tag from filter 1' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(saveEmailAudience).toHaveBeenCalledWith(expect.objectContaining({ audience: expect.objectContaining({ filterJson: { operator: 'AND', rules: [{ field: 'tags', operator: 'in', value: ['old-tag', 'show-day'] }] } }) })))
})
