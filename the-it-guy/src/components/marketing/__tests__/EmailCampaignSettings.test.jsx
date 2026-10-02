// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmailCampaignSettings from '../EmailCampaignSettings'
const mocks = vi.hoisted(() => ({ createDomain: vi.fn(), createSender: vi.fn(), verify: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../services/emailCampaignService', () => ({ createEmailSendingDomain: mocks.createDomain, createEmailSender: mocks.createSender, verifyEmailSendingDomain: mocks.verify, refreshEmailSenderVerification: mocks.refresh }))
const domain = { id: 'domain', domain_name: 'updates.agency.co.za', verification_status: 'pending', provider_domain_id: 'provider', dns_records: [{ name: 'mail.updates', type: 'TXT', value: 'public-dns-value' }] }
const props = { organisationId: 'org', userId: 'user', domains: [domain], identities: [], onRefresh: vi.fn() }
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('Email settings', () => {
  it('rejects URLs and adds a normalized domain through the existing service', async () => {
    mocks.createDomain.mockResolvedValue({ created: true })
    render(<EmailCampaignSettings {...props} />)
    fireEvent.change(screen.getByLabelText('Domain name'), { target: { value: 'https://agency.co.za/path' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Enter a domain name'))
    expect(mocks.createDomain).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Domain name'), { target: { value: ' Updates.Agency.co.za ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    await waitFor(() => expect(mocks.createDomain).toHaveBeenCalledWith({ organisationId: 'org', domain: 'updates.agency.co.za' }))
    await screen.findByText(/Domain added/)
    expect(props.onRefresh).toHaveBeenCalled()
  })
  it('checks DNS verification and prevents senders from using a different domain', async () => {
    mocks.verify.mockResolvedValue({ domain: { status: 'verified' } })
    render(<EmailCampaignSettings {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check domain verification' }))
    await screen.findByText('updates.agency.co.za is verified.')
    expect(mocks.verify).toHaveBeenCalledWith({ organisationId: 'org', domainId: 'domain' })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Agency' } })
    fireEvent.change(screen.getByLabelText('Sending domain'), { target: { value: 'domain' } })
    fireEvent.change(screen.getByLabelText('Sender email'), { target: { value: 'agent@other.co.za' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add sender' }))
    await screen.findByText('Use an address ending in @updates.agency.co.za.')
    expect(mocks.createSender).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Sender email'), { target: { value: 'Agent@Updates.Agency.co.za' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add sender' }))
    await waitFor(() => expect(mocks.createSender).toHaveBeenCalledWith({ organisationId: 'org', userId: 'user', displayName: 'Agency', email: 'agent@updates.agency.co.za', sendingDomainId: 'domain' }))
  })
  it('reports service errors and disables mutations when workspace data is unavailable', async () => {
    mocks.verify.mockRejectedValue(new Error('Admin access required'))
    const { rerender } = render(<EmailCampaignSettings {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check domain verification' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Admin access required')
    rerender(<EmailCampaignSettings {...props} error="Unable to load" />)
    expect(screen.getByRole('button', { name: 'Add domain' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Recheck verification' }).disabled).toBe(true)
  })
})
