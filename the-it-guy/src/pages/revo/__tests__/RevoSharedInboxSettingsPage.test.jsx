// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RevoSharedInboxSettingsPage from '../RevoSharedInboxSettingsPage.jsx'
const mocks = vi.hoisted(() => ({ load: vi.fn(),create:vi.fn(),organisation: { id:'org' },role:'admin' }))
vi.mock('../../../context/OrganisationContext', () => ({ useOrganisation: () => ({ organisation:mocks.organisation,membershipRole:mocks.role }) }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ user:{ id:'user' } }) }))
vi.mock('../../../components/inbox/EmailMailboxSettings.jsx', () => ({ default: ({ organisationId,userId }) => <p>Shared email settings: {organisationId} · {userId}</p> }))
vi.mock('../../../lib/organisationAccess', () => ({ isOrganisationAdminMembershipRole: role => role === 'admin' }))
vi.mock('../../../modules/revo/sharedInbox/revoSharedInboxService', () => ({ REVO_INBOX_CHANNEL_PROVIDERS: { whatsapp:[{ key:'meta_cloud_api',label:'Meta WhatsApp Cloud API' }] },loadRevoInboxChannels:mocks.load,createRevoInboxChannel:mocks.create,setRevoInboxDefaultChannel:vi.fn(),updateRevoInboxChannel:vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); mocks.role='admin'; mocks.load.mockResolvedValue([{ id:'email',channel:'email',address:'email@example.test' },{ id:'whatsapp',channel:'whatsapp',address:'+27115550100',connectionStatus:'draft' }]) })
afterEach(cleanup)
it('uses the shared email settings surface and keeps WhatsApp channel creation separate', async () => {
  render(<MemoryRouter><RevoSharedInboxSettingsPage /></MemoryRouter>)
  await screen.findByText('+27115550100',{ selector:'p' })
  expect(screen.getByText('Shared email settings: org · user')).toBeTruthy()
  expect(screen.queryByRole('heading',{ name:'email@example.test' })).toBeNull()
  fireEvent.change(screen.getByLabelText('WhatsApp business number'),{ target:{ value:'+27825550100' } })
  fireEvent.click(screen.getByRole('button',{ name:'Save WhatsApp channel' }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ channel:'whatsapp',providerKey:'meta_cloud_api',organisationId:'org',actorUserId:'user',address:'+27825550100' })))
})
it('does not offer WhatsApp administration to ordinary members', async () => {
  mocks.role='agent'
  render(<MemoryRouter><RevoSharedInboxSettingsPage /></MemoryRouter>)
  await screen.findByText('+27115550100',{ selector:'p' })
  expect(screen.queryByRole('button',{ name:'Save WhatsApp channel' })).toBeNull()
})
