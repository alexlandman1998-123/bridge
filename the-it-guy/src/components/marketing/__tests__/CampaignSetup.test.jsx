// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CampaignSetup from '../CampaignSetup'
const runtime = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), data: null, profile: null, context: null }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentWorkspace: { id: 'agency', name: 'Oak & Stone' }, profile: runtime.profile }) }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => runtime.context }))
vi.mock('../../../services/campaignSetupService', () => ({ loadCampaignSetup: runtime.load, saveCampaignSetup: runtime.save }))
const prefs = () => ({ agencyName: 'Oak & Stone', services: ['Sales'], serviceAreas: ['Constantia'], language: 'en-ZA', tone: 'Warm and approachable', buyerDestination: 'agent', sellerDestination: 'agent', agencyConfirmed: true, styleConfirmed: true, routingConfirmed: true })
const record = (preferences, extra = {}) => ({ organisation_id: 'agency', schema_version: 1, status: 'complete', preferences, confirmed_preferences: preferences, revision: 1, last_step: 1, ...extra })
const mount = (props = {}) => render(<CampaignSetup organisationId="agency" userId="me" canManage {...props} />)
beforeEach(() => {
  vi.clearAllMocks()
  runtime.profile = { fullName: 'Sarah Jacobs', email: 'sarah@example.com', phoneNumber: '0821234567', language: 'en-ZA' }
  runtime.context = { organisation: { id: 'agency', name: 'Oak & Stone' }, onboarding: { agencyInformation: { agencyName: 'Oak & Stone', businessLines: ['sales'] }, branding: { brandColours: { primary: '#274C69' } } } }
  runtime.data = { agency: null, agent: null, warnings: [], sources: { organisation: { active_areas: ['Constantia'] } } }
  runtime.load.mockImplementation(async () => structuredClone(runtime.data))
  runtime.save.mockImplementation(async (org, input) => {
    const key = input.kind === 'agency' ? 'agency' : 'agent'
    const result = record(input.preferences, {
      organisation_id: org, user_id: input.kind === 'agent' ? 'me' : undefined,
      revision: (input.record?.revision || 0) + 1,
      status: input.complete ? 'complete' : 'draft', last_step: input.step,
      source_snapshot: input.source,
      confirmed_preferences: input.complete ? input.preferences : input.record?.confirmed_preferences || null,
    })
    runtime.data[key] = result
    return result
  })
})
afterEach(cleanup)

it('automatically opens first-use setup and confirms existing agency details without retyping them', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Here’s what we know about your agency' })
  expect(screen.queryByRole('textbox', { name: 'Public agency name' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Service areas' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and continue' }))
  await screen.findByRole('heading', { name: 'How should your campaigns sound?' })
  expect(runtime.save).toHaveBeenCalledWith('agency', expect.objectContaining({ complete: false, step: 2, preferences: expect.objectContaining({ agencyName: 'Oak & Stone', serviceAreas: ['Constantia'], agencyConfirmed: true }) }))
  expect(screen.getByLabelText('Campaign language').value).toBe('en-ZA')
})
it('completes the agency setup, then asks only for the agent’s public confirmation', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and continue' }))
  await screen.findByRole('heading', { name: 'How should your campaigns sound?' })
  fireEvent.click(screen.getByRole('radio', { name: /Warm and approachable/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and continue' }))
  await screen.findByRole('heading', { name: 'Where should enquiries go?' })
  fireEvent.click(screen.getByRole('button', { name: 'Save agency preferences' }))
  await screen.findByRole('heading', { name: 'Confirm your public campaign details' })
  expect(runtime.data.agency.preferences.offers).toEqual([])
  expect(runtime.data.agency.preferences).toMatchObject({ agencyConfirmed: true, styleConfirmed: true, routingConfirmed: true })
  fireEvent.click(screen.getByRole('checkbox', { name: /These are the public details/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm my details' }))
  await screen.findByText('Your public campaign details are confirmed.')
  expect(screen.queryByRole('heading', { name: 'Confirm your public campaign details' })).toBeNull()
  expect(runtime.data.agent.preferences).toMatchObject({ name: 'Sarah Jacobs', email: 'sarah@example.com', detailsConfirmed: true, whatsapp: '' })
})
it('lets agents inherit shared preferences without repeating the agency setup', async () => {
  runtime.data.agency = record(prefs())
  mount({ canManage: false })
  await screen.findByRole('heading', { name: 'Confirm your public campaign details' })
  expect(screen.queryByLabelText('Campaign language')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Review agency setup' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Public email' })).toBeNull()
  expect(screen.getByLabelText('Confirmed WhatsApp number (optional)').value).toBe('')
})
it('saves unfinished preferences and resumes the stored step on another visit', async () => {
  runtime.data.agency = record({ ...prefs(), tone: '' }, { status: 'draft', confirmed_preferences: null, last_step: 2 })
  const view = mount()
  await screen.findByRole('heading', { name: 'How should your campaigns sound?' })
  fireEvent.click(screen.getByRole('radio', { name: /Premium and understated/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save and finish later' }))
  await screen.findByText('Draft saved. You can resume setup here.')
  view.unmount()
  mount()
  await screen.findByRole('heading', { name: 'How should your campaigns sound?' })
  expect(screen.getByRole('radio', { name: /Premium and understated/ }).checked).toBe(true)
})
it('keeps edits when saving fails or another administrator has changed the setup', async () => {
  runtime.save.mockRejectedValue(new Error('Setup changed in another session.'))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Change Public agency name' }))
  fireEvent.change(screen.getByLabelText('Public agency name'), { target: { value: 'My edited campaign name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and continue' }))
  expect((await screen.findByRole('alert')).textContent).toContain('another session')
  expect(screen.getByLabelText('Public agency name').value).toBe('My edited campaign name')
})
it('does not reopen completed setup on every visit and offers a targeted profile-change review', async () => {
  runtime.data.agency = record(prefs())
  runtime.data.agent = record({ name: 'Old public name', email: 'sarah@example.com', detailsConfirmed: true }, { user_id: 'me', source_snapshot: { name: 'Old name' } })
  mount({ canManage: false })
  await screen.findByText(/Your agency preferences and public contact details are saved/)
  expect(screen.queryByRole('heading', { name: 'Confirm your public campaign details' })).toBeNull()
  expect(screen.getByText(/Saved profile details have changed/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'My campaign details' }))
  const form = screen.getByRole('button', { name: 'Confirm my details' }).closest('form')
  expect(within(form).getByText('Old public name')).toBeTruthy()
  fireEvent.click(within(form).getByRole('button', { name: 'Use latest saved name' }))
  expect(within(form).getByText('Sarah Jacobs')).toBeTruthy()
  expect(runtime.save).not.toHaveBeenCalled()
})
it('shows unavailable storage clearly while leaving the campaign workspace usable', async () => {
  runtime.load.mockRejectedValueOnce(new Error('Campaign setup is not enabled in this environment yet.'))
  mount()
  await screen.findByText(/not enabled in this environment/)
  expect(screen.queryByRole('button', { name: 'Save agency preferences' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry campaign setup' }))
  await screen.findByRole('heading', { name: 'Here’s what we know about your agency' })
})
it('ignores a late response from the previous agency', async () => {
  let finishOld
  runtime.load.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
  const view = mount()
  await waitFor(() => expect(runtime.load).toHaveBeenCalled())
  view.rerender(<CampaignSetup organisationId="other" userId="me" canManage />)
  await screen.findByRole('heading', { name: 'Here’s what we know about your agency' })
  finishOld({ ...runtime.data, agency: record({ agencyName: 'Leaked old agency' }) })
  await waitFor(() => expect(screen.queryByText('Leaked old agency')).toBeNull())
})
it('does not reuse stale account details from a different signed-in user', async () => {
  runtime.profile = { id: 'previous-user', fullName: 'Previous User', email: 'previous@example.com' }
  mount({ canManage: false })
  await screen.findByRole('heading', { name: 'Confirm your public campaign details' })
  expect(screen.getByLabelText('Public name').value).toBe('')
  expect(screen.getByLabelText('Public email').value).toBe('')
  expect(screen.queryByText('Previous User')).toBeNull()
})
