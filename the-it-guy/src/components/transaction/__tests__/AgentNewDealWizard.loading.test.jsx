// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { listOrganisationPreferredPartners } from '../../../lib/settingsApi.js'
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js'
import AgentNewDealWizard from '../../AgentNewDealWizard.jsx'
import { readAgentPrivateListings } from '../../../lib/agentListingStorage.js'
import { getPrivateListing, getAgentPrivateListingSummaries } from '../../../services/privateListingService.js'

vi.mock('../../../lib/api.js', () => ({ createTransactionFromWizard: vi.fn(async () => ({ transactionId: 'saved-deal' })), uploadDocument: vi.fn(), fetchDevelopmentOptions: vi.fn(async () => []), fetchUnitsForTransactionSetup: vi.fn(async () => []) }))
vi.mock('../../../services/transactionCaptureHandoffService.js', () => ({ ensureTransactionCaptureInvitations: vi.fn(async () => []) }))
vi.mock('../../../services/transactionHandoffRegisterService.js', () => ({ readTransactionHandoffRegister: vi.fn(async () => ({ items: [] })) }))
vi.mock('../../../services/documents/transactionCanonicalDocumentRequirementService.js', () => ({ fetchTransactionDocumentRequirementsByTransactionIds: vi.fn(async () => ({ 'saved-deal': [] })) }))
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../../lib/settingsApi.js', () => ({ fetchOrganisationSettings: vi.fn(async () => null), listOrganisationPartnerRoutingRules: vi.fn(async () => []), listOrganisationPreferredPartners: vi.fn(async () => []), listUserPreferredPartnerRoutingRules: vi.fn(async () => []), resolveCommissionSnapshotForAgent: vi.fn(async () => null) }))
vi.mock('../../../context/WorkspaceContext.jsx', () => {
  const context = { workspace: { id: 'all', type: 'agency' }, profile: { id: 'agent', email: 'agent@example.com', fullName: 'Agent' }, currentMembership: {}, role: 'agent' }
  return { useWorkspace: () => context }
})
vi.mock('../../../lib/agentListingStorage.js', () => ({ readAgentPrivateListings: vi.fn(() => []), writeAgentPrivateListings: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); readAgentPrivateListings.mockReturnValue([]); listOrganisationPreferredPartners.mockResolvedValue([]); window.localStorage.clear() })
vi.mock('../../../services/privateListingService.js', () => ({ getPrivateListing: vi.fn(async () => null), getAgentPrivateListingSummaries: vi.fn(async () => []), getPrivateListingCoverImageUrls: vi.fn(async () => ({})) }))
it('waits only for the selected listing details, without waiting for partner setup or loading every full listing', async () => {
  listOrganisationPreferredPartners.mockImplementationOnce(() => new Promise(() => {}))
  const summary = { id: 'selected-listing', title: 'Selected home', propertyAddress: '12 Selected Street', askingPrice: 2000000 }
  readAgentPrivateListings.mockReturnValue([summary])
  let resolveSummaries
  getAgentPrivateListingSummaries.mockImplementationOnce(() => new Promise((resolve) => { resolveSummaries = resolve }))
  let resolveDetails
  getPrivateListing.mockImplementationOnce(() => new Promise((resolve) => { resolveDetails = resolve }))
  expect(isSupabaseConfigured).toBe(true)
  render(<MemoryRouter><AgentNewDealWizard open onClose={() => {}} /></MemoryRouter>)
  expect(getAgentPrivateListingSummaries).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(false)
  expect(screen.getByRole('button', { name: 'Active Listing' }).disabled).toBe(false)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' })))
  fireEvent.click(screen.getByRole('button', { name: 'Active Listing' }))
  fireEvent.click(await screen.findByRole('option', { name: /Selected home/ }))
  await waitFor(() => expect(getPrivateListing).toHaveBeenCalledWith(summary.id, { includeRequirementsAndDocuments: false }))
  expect(screen.getByRole('button', { name: 'Loading property…' }).disabled).toBe(true)
  resolveDetails({ ...summary, seller: { name: 'Canonical Seller', email: 'canonical@example.com' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(false))
  await act(async () => { resolveSummaries([summary]) })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const seller = within(screen.getByRole('region', { name: 'Seller party details' }))
  expect(seller.getByLabelText('Name').value).toBe('Canonical')
  expect(seller.getByLabelText('Email').value).toBe('canonical@example.com')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('button', { name: 'Create Transaction' }).disabled).toBe(false)
})
