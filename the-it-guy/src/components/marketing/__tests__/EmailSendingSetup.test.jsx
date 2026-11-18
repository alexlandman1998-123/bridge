// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EmailSendingSettings } from '../EmailCampaignSettings.jsx'
import SettingsDomainsPage from '../../../pages/settings/SettingsDomainsPage.jsx'
const mocks = vi.hoisted(() => Object.fromEntries(['createEmailSender','createEmailSendingDomain','getEmailSendingPolicy','setEmailSendingControls','refreshEmailSenderVerification','sendEmailCampaignTest','verifyEmailSendingDomain','getEmailSendingSetup'].map(name => [name, vi.fn()])))
vi.mock('../../../services/emailCampaignService', () => mocks)
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { user: { id: 'principal' }, currentWorkspace: { id: 'org' } } }) }))
const domain = { id: 'domain', domain_name: 'updates.example.test', provider_domain_id: 'provider', verification_status: 'pending', dns_records: [{ record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'public-dns-proof', ttl: 'Auto' }, { record: 'SPF', type: 'MX', name: 'send', value: 'feedback.example.test', priority: 10 }] }
const sender = { id: 'sender', sender_mode: 'custom', email_sending_domain_id: domain.id, display_name: 'Agency', from_email: 'news@updates.example.test', reply_to_email: 'reply@example.test', verification_status: 'verified' }
let saved, policy
function Harness() {
  const [state, setState] = useState(saved)
  return <EmailSendingSettings organisationId="org" userId="principal" {...state} onRefresh={async () => setState({ ...saved })} />
}
const idle = () => waitFor(() => expect(screen.getByRole('button', { name: 'Refresh sending domain status' }).disabled).toBe(false))
beforeEach(() => {
  vi.clearAllMocks()
  saved = { domains: [], identities: [], loading: false }
  policy = { account_ready: true, approved_at: '2026-11-01' }
  mocks.getEmailSendingPolicy.mockImplementation(async () => policy)
  mocks.refreshEmailSenderVerification.mockResolvedValue({ platformSender: { ready: true } })
  mocks.getEmailSendingSetup.mockImplementation(async () => ({ ...saved, canManage: true }))
  mocks.createEmailSendingDomain.mockImplementation(async () => { saved = { ...saved, domains: [domain] }; return { created: true, domain: { id: domain.id } } })
  mocks.verifyEmailSendingDomain.mockImplementation(async () => { saved = { ...saved, domains: [{ ...domain, verification_status: 'verified' }] }; return { domain: { status: 'verified' } } })
  mocks.createEmailSender.mockImplementation(async () => { saved = { ...saved, identities: [sender] }; return sender })
  mocks.sendEmailCampaignTest.mockResolvedValue({ providerMessageId: 'receipt', deliveredTo: 'principal@example.test' })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
})
afterEach(cleanup)

it('guides add → DNS → sender → accepted test, preserves saved setup after remount and copies host/IT instructions', async () => {
  const view = render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Send using your own domain/ })); await idle()
  expect(screen.queryByLabelText('Sender email')).toBeNull()
  fireEvent.change(screen.getByLabelText('Domain name'), { target: { value: 'Updates.Example.Test.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
  await screen.findByRole('heading', { name: '2. Verify DNS records' }); await idle()
  expect(mocks.createEmailSendingDomain).toHaveBeenCalledWith({ organisationId: 'org', domain: 'updates.example.test' })
  fireEvent.click(screen.getByRole('button', { name: 'Copy host resend._domainkey' }))
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('resend._domainkey'))
  fireEvent.click(screen.getByRole('button', { name: 'Copy setup instructions' }))
  expect(navigator.clipboard.writeText.mock.calls.at(-1)[0]).toContain('Priority 10')
  fireEvent.click(screen.getByRole('button', { name: 'Check DNS records' }))
  await screen.findByLabelText('Sender email'); await idle()
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Agency' } })
  fireEvent.change(screen.getByLabelText('Sender email'), { target: { value: sender.from_email } })
  fireEvent.change(screen.getByLabelText('Reply-to inbox'), { target: { value: sender.reply_to_email } })
  fireEvent.click(screen.getByRole('button', { name: 'Add sender' }))
  await screen.findByText('This sending method is ready for a test'); await idle()
  fireEvent.click(screen.getByRole('button', { name: 'Send me a test' }))
  await screen.findByText(/Test accepted for sending to principal@example.test/)
  expect(mocks.sendEmailCampaignTest).toHaveBeenCalledTimes(1)
  view.unmount(); render(<Harness />)
  await screen.findByText('This sending method is ready for a test'); await idle()
  expect(screen.getByRole('button', { name: 'Send me a test' }).disabled).toBe(false)
})

it('shows account activation as the blocker after DNS and sender verification', async () => {
  saved = { domains: [{ ...domain, verification_status: 'verified' }], identities: [sender] }
  policy = { account_ready: false, account_blocker: 'activation' }
  render(<Harness />)
  await screen.findByText('Campaign sending needs account activation'); await idle()
  expect(screen.getByRole('button', { name: 'Send me a test' }).disabled).toBe(true)
})

it('does not borrow readiness from the Arch9 sender when the custom domain is pending', async () => {
  saved = { domains: [domain], identities: [{ ...sender, id: 'arch9', sender_mode: 'arch9' }] }
  render(<Harness />); await idle()
  fireEvent.click(screen.getByRole('button', { name: /Send using your own domain/ }))
  await screen.findByText('Verify your DNS records to continue')
  expect(screen.queryByText('This sending method is ready for a test')).toBeNull()
})

it('recovers a partially created domain after a lost response and allows reconnect', async () => {
  mocks.createEmailSendingDomain.mockImplementationOnce(async () => { saved = { domains: [{ ...domain, provider_domain_id: null, dns_records: [] }], identities: [] }; throw new Error('DNS records could not be confirmed') })
  render(<Harness />); await idle()
  fireEvent.click(screen.getByRole('button', { name: /Send using your own domain/ }))
  fireEvent.change(screen.getByLabelText('Domain name'), { target: { value: domain.domain_name } })
  fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
  await screen.findByText('DNS records could not be confirmed'); await idle()
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect domain' }))
  await screen.findByRole('button', { name: 'Copy host resend._domainkey' })
})

it('reports DNS failure instead of claiming verification succeeded', async () => {
  saved = { domains: [domain], identities: [] }
  mocks.verifyEmailSendingDomain.mockResolvedValue({ domain: { status: 'failed' } })
  render(<Harness />); await idle()
  fireEvent.click(screen.getByRole('button', { name: 'Check DNS records' }))
  await screen.findByText(/DNS verification needs attention/)
  expect(screen.queryByLabelText('Sender email')).toBeNull()
})

it('denies agents before mounting the configuration or automatic provider checks', async () => {
  mocks.getEmailSendingSetup.mockResolvedValue({ canManage: false, domains: [], identities: [] })
  render(<SettingsDomainsPage />)
  await screen.findByRole('heading', { name: 'Principal access required' })
  expect(mocks.refreshEmailSenderVerification).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Send using Arch9/ })).toBeNull()
})

it('preserves the form across the Domains page refresh instead of restarting setup', async () => {
  render(<SettingsDomainsPage />)
  await screen.findByRole('button', { name: /Send using your own domain/ }); await idle()
  fireEvent.click(screen.getByRole('button', { name: /Send using your own domain/ }))
  fireEvent.change(screen.getByLabelText('Domain name'), { target: { value: 'updates.example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
  await screen.findByRole('button', { name: 'Check DNS records' }); await idle()
  expect(screen.getByLabelText('Sending domain').value).toBe('domain')
  expect(screen.getByRole('button', { name: /Send using your own domain/ }).getAttribute('aria-pressed')).toBe('true')
})

it('blocks testing when sending availability could not be confirmed', async () => {
  saved = { domains: [{ ...domain, verification_status: 'verified' }], identities: [sender] }
  mocks.getEmailSendingPolicy.mockRejectedValue(new Error('Account status could not be confirmed'))
  render(<Harness />)
  await screen.findByText('Account status could not be confirmed'); await idle()
  expect(screen.getByRole('button', { name: 'Send me a test' }).disabled).toBe(true)
  expect(screen.queryByText('This sending method is ready for a test')).toBeNull()
})
