// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmailCampaignBuilder from '../EmailCampaignBuilder'
const mocks = vi.hoisted(() => ({ save: vi.fn(), get: vi.fn() }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { name: 'Kingdom Real Estate' }, user: { email: 'agent@example.com' } } }) }))
vi.mock('../../../services/privateListingService', () => ({ getOrganisationPrivateListings: async () => [] }))
vi.mock('../../../services/emailCampaignService', () => ({ saveEmailCampaign: mocks.save, getEmailDraft: mocks.get, getEmailRevisions: async () => [], previewEmailAudience: async () => 12, createEmailSender: vi.fn(), preflightEmailCampaign: vi.fn(), refreshEmailSenderVerification: vi.fn(), saveEmailTemplate: vi.fn(), scheduleEmailCampaign: vi.fn(), sendEmailCampaignTest: vi.fn() }))
const workspace = { organisationId: 'org', userId: 'user', contacts: [], templates: [], savedAudiences: [], subscriptionTypes: [{ id: 'consent', name: 'Property updates' }], identities: [{ id: 'sender', display_name: 'Kingdom', from_email: 'hello@example.com', verification_status: 'verified' }], refresh: vi.fn() }
const Audience = () => <div>Audience controls</div>
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })
describe('Campaign setup', () => {
  it('blocks future steps with field-level guidance and synchronizes campaign title', async () => {
    mocks.save.mockResolvedValue({ id: 'draft-1' })
    render(<EmailCampaignBuilder workspace={workspace} AudienceStudio={Audience} onBack={() => {}} />)
    expect(screen.getByRole('button', { name: /Continue to audience/ }).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Campaign title' }), { target: { value: 'September buyers' } })
    expect(screen.getByLabelText('Internal campaign name')).toHaveProperty('value', 'September buyers')
    fireEvent.click(screen.getByRole('button', { name: /4 Review/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Complete the required campaign details before continuing.')
    expect(screen.getByText('Add a subject line before continuing.')).toBeTruthy()
  })
  it('lets users return to completed steps to fix invalid edits', async () => {
    mocks.save.mockResolvedValue({ id: 'draft-1' })
    render(<EmailCampaignBuilder workspace={workspace} AudienceStudio={Audience} onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText('Subject line'), { target: { value: 'A property update' } })
    fireEvent.change(screen.getByLabelText(/Send permission/), { target: { value: 'consent' } })
    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: 'sender' } })
    fireEvent.click(screen.getByRole('button', { name: /3 Content/ }))
    await screen.findByRole('heading', { name: 'Edit content' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Campaign title' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Details Complete/ }))
    expect(await screen.findByLabelText('Internal campaign name')).toHaveProperty('value', '')
    expect(screen.getByText('Give your campaign an internal name.')).toBeTruthy()
  })
  it('saves incomplete drafts once and retains edits made during an in-flight save', async () => {
    let resolveFirst
    mocks.save.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve })).mockResolvedValue({ id: 'draft-1' })
    render(<EmailCampaignBuilder workspace={workspace} AudienceStudio={Audience} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('textbox', { name: 'Campaign title' }), { target: { value: 'Latest edit' } })
    await act(async () => resolveFirst({ id: 'draft-1' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2), { timeout: 2200 })
    expect(mocks.save.mock.calls[1][0].campaign).toMatchObject({ id: 'draft-1', name: 'Latest edit' })
  })
})
