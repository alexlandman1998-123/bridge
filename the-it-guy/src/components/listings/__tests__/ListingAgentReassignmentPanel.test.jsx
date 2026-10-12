// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { listOrganisationUsersForWorkspace } from '../../../lib/settingsApi'
import { reassignListingAgent } from '../../../services/listingAgentReassignmentService'

vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsers: vi.fn(), listOrganisationUsersForWorkspace: vi.fn() }))
vi.mock('../../../services/listingAgentReassignmentService', () => ({ reassignListingAgent: vi.fn() }))
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
import { renderToStaticMarkup } from 'react-dom/server'
import ListingAgentReassignmentPanel from '../ListingAgentReassignmentPanel.jsx'

test('listing agent card renders before an agent directory match is loaded', () => {
  const html = renderToStaticMarkup(
    <ListingAgentReassignmentPanel
      listingId="listing-1"
      listing={{ id: 'listing-1', assignedAgentName: 'Avery Agent' }}
      agent={{ name: 'Avery Agent' }}
    />,
  )

  expect(html).toContain('Avery Agent')
  expect(html).toContain('listing-agent-reassignment')
})

test('listing agent card shows an unassigned state when no agent profile exists', () => {
  const html = renderToStaticMarkup(
    <ListingAgentReassignmentPanel listingId="listing-2" listing={{ id: 'listing-2' }} agent={null} />,
  )

  expect(html).toContain('Unassigned')
})

const listing = { assignedAgentId: 'primary', organisationId: 'agency', additionalAgentIds: [] }
const directory = [
 { userId: 'primary', fullName: 'Primary Agent', role: 'agent', status: 'active' },
 { userId: 'extra', fullName: 'Second Agent', role: 'agent', status: 'active' },
 { userId: 'third', fullName: 'Third Agent', role: 'agent', status: 'active' },
 { userId: 'inactive', fullName: 'Inactive Agent', role: 'agent', status: 'inactive' },
 { userId: 'assistant', fullName: 'Agency Assistant', role: 'assistant', status: 'active' },
]

test('adds several contacts without replacing the primary and preserves them after reload', async () => {
 listOrganisationUsersForWorkspace.mockResolvedValue(directory)
 reassignListingAgent.mockResolvedValue({ listing: { additional_agent_ids: ['extra', 'third'] }, portalUpdateRequired: true })
 const view = render(<ListingAgentReassignmentPanel listingId="listing" listing={listing} />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit additional agents' }))
 const extra = await screen.findByRole('checkbox', { name: 'Second Agent' })
 expect(screen.queryByRole('checkbox', { name: 'Primary Agent' })).toBeNull()
 expect(screen.queryByText('Inactive Agent')).toBeNull()
 expect(screen.queryByText('Agency Assistant')).toBeNull()
 fireEvent.click(extra)
 fireEvent.click(screen.getByRole('checkbox', { name: 'Third Agent' }))
 fireEvent.click(screen.getByRole('button', { name: 'Save additional agents' }))
 await waitFor(() => expect(reassignListingAgent).toHaveBeenCalledWith('listing', 'primary', { listingType: 'sale', additionalAgentIds: ['extra', 'third'], expectedAdditionalAgentIds: [] }))
 await screen.findByText(/Additional agents saved/)
 expect(screen.getByText('Additional agents (2)')).toBeTruthy()
 view.unmount()
 render(<ListingAgentReassignmentPanel listingId="listing" listing={{ ...listing, additionalAgentIds: ['extra', 'third'] }} />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit additional agents' }))
 expect((await screen.findByRole('checkbox', { name: 'Second Agent' })).checked).toBe(true)
 expect(screen.getByRole('checkbox', { name: 'Third Agent' }).checked).toBe(true)
})

test('removes all additional rental contacts and retains edits when a save conflicts', async () => {
 listOrganisationUsersForWorkspace.mockResolvedValue(directory)
 reassignListingAgent.mockRejectedValueOnce(new Error('The listing agents changed elsewhere. Refresh and try again.')).mockResolvedValueOnce({ listing: { additional_agent_ids: [] }, portalUpdateRequired: true })
 render(<ListingAgentReassignmentPanel listingId="rental" listing={{ ...listing, additionalAgentIds: ['extra'] }} listingType="rental" />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit additional agents' }))
 fireEvent.click(await screen.findByRole('checkbox', { name: 'Second Agent' }))
 fireEvent.click(screen.getByRole('button', { name: 'Save additional agents' }))
 await screen.findByText(/listing agents changed elsewhere/)
 expect(screen.getByRole('checkbox', { name: 'Second Agent' }).checked).toBe(false)
 expect(screen.getByText('Additional agents (1)')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Save additional agents' }))
 await screen.findByText(/Additional agents saved/)
 expect(reassignListingAgent).toHaveBeenLastCalledWith('rental', 'primary', { listingType: 'rental', additionalAgentIds: [], expectedAdditionalAgentIds: ['extra'] })
 expect(screen.getByText('Additional agents (0)')).toBeTruthy()
})

test('cancel discards contact edits without saving', async () => {
 listOrganisationUsersForWorkspace.mockResolvedValue(directory)
 render(<ListingAgentReassignmentPanel listingId="listing" listing={listing} />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit additional agents' }))
 fireEvent.click(await screen.findByRole('checkbox', { name: 'Second Agent' }))
 fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
 expect(reassignListingAgent).not.toHaveBeenCalled()
 expect(screen.getByText('Additional agents (0)')).toBeTruthy()
})
