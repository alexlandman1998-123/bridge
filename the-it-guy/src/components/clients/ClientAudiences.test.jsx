// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientAudiences from './ClientAudiences'
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), preview: vi.fn() }))
vi.mock('../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: async () => [] }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../services/marketingAudienceService', async original => ({ ...await original(), loadMarketingAudiences: api.load, saveMarketingAudience: api.save, previewMarketingAudience: api.preview }))
const org = '11111111-1111-4111-8111-111111111111'
const legacy = filter => ({ id: 'saved', name: 'Saved targeting', description: '', revision: 4, created_by: 'actor', visibility: 'agency', definition: { emailFilter: filter } })
beforeEach(() => {
  api.load.mockResolvedValue({ audiences: [], actorId: 'actor', canShare: true, total: 0, subscriptionTypes: [] })
  api.save.mockImplementation(async (_org, draft) => ({ ...draft, id: 'saved', revision: 5 }))
  api.preview.mockResolvedValue({ matched: 0, emailEligible: 0, whatsappEligible: 0, recent: 0, rows: [], reviewHash: 'hash' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('Clients creates a personal audience in the same library used by campaigns', async () => {
  render(<ClientAudiences organisationId={org} userId="actor" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create audience' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Create audience' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Audience name' }), { target: { value: 'My buyers' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(org, expect.objectContaining({ name: 'My buyers', visibility: 'personal', definition: expect.objectContaining({ match: 'all' }) })))
})

test.each([{}, { area: 'Cape Town', branch_id: 'branch', assigned_user_id: 'staff', contact_ids: ['selected'] }, { operator: 'OR', rules: [{ operator: 'AND', rules: [{ field: 'tags', operator: 'in', value: ['launch'] }] }] }])('renaming imported email targeting retains its exact restrictions: %j', async filter => {
  api.load.mockResolvedValue({ audiences: [legacy(filter)], actorId: 'actor', canShare: true, total: 1, subscriptionTypes: [] })
  render(<ClientAudiences organisationId={org} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  expect(screen.getByText(/The exact saved email filters are retained/)).toBeTruthy()
  expect(screen.queryByLabelText('Rule 1 field')).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'Audience name' }), { target: { value: 'Renamed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(org, expect.objectContaining({ id: 'saved', revision: 4, name: 'Renamed', definition: { emailFilter: filter } })))
})

test('duplicating imported targeting creates a personal copy without changing its filters', async () => {
  const filter = { branch_id: 'branch', contact_ids: ['selected'] }
  api.load.mockResolvedValue({ audiences: [legacy(filter)], actorId: 'actor', canShare: true, total: 1, subscriptionTypes: [] })
  render(<ClientAudiences organisationId={org} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Saved targeting' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(org, expect.objectContaining({ name: 'Saved targeting copy', visibility: 'personal', definition: { emailFilter: filter } })))
  expect(api.save.mock.calls[0][1].id).toBeUndefined()
})
