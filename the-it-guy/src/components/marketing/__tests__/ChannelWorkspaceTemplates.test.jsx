// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import ChannelWorkspaceTemplates from '../ChannelWorkspaceTemplates'
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../services/marketingChannelTemplateService', async (original) => ({ ...(await original()), loadChannelTemplates: mocks.load }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { user: { id: 'me' }, currentMembership: { role: 'principal' } } }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function Location() { return <output>{useLocation().search}</output> }
function mount(channel) { render(<MemoryRouter><ChannelWorkspaceTemplates channel={channel} organisationId="agency" /><Location /></MemoryRouter>) }
it.each(['email', 'whatsapp'])('loads the shared %s library and opens the canonical Studio editor', async (channel) => {
 mocks.load.mockResolvedValue([
  { id: 'email-id', name: 'Agency email', channel: 'email', visibility: 'agency', title: 'Hi', body: 'Email copy' },
  { id: 'wa-id', name: 'Agency WhatsApp', channel: 'whatsapp', visibility: 'agency', body: 'WhatsApp copy' },
  { id: 'private', name: 'Private colleague', channel, visibility: 'personal', created_by: 'other', body: 'Private' },
 ])
 mount(channel)
 await screen.findByRole('heading', { name: channel === 'email' ? 'Agency email' : 'Agency WhatsApp' })
 expect(screen.queryByText(channel === 'email' ? 'Agency WhatsApp' : 'Agency email')).toBeNull()
 expect(screen.queryByText('Private colleague')).toBeNull()
 expect(mocks.load).toHaveBeenCalledWith('agency')
 fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
 expect(screen.getByRole('status').textContent).toContain(`format=${channel}&view=channel-template-edit&id=${channel === 'email' ? 'email-id' : 'wa-id'}`)
})
it('keeps built-in email starters available when shared storage is missing', async () => {
 mocks.load.mockRejectedValue(new Error('Channel template storage is not enabled in this environment yet.'))
 mount('email')
 await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button', { name: 'Customise Property showcase' }))
 expect(screen.getByRole('status').textContent).toContain('format=email&view=channel-template-create&starter=property-showcase')
})
