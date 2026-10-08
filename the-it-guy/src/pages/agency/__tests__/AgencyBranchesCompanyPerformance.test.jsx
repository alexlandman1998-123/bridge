// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ getOverview: vi.fn() }))
vi.mock('../../../services/agencyBranchService', () => ({ getAgencyBranchOverview: api.getOverview, createBranch: vi.fn(), deleteBranch: vi.fn() }))
vi.mock('../../../services/workspaceUserInviteService', () => ({ createPrincipalClaimInvite: vi.fn() }))
vi.mock('../../../lib/location/upsertArea', () => ({ upsertAreaFromAddress: vi.fn() }))
vi.mock('../../../components/location/AddressAutocomplete', () => ({ default: () => null }))
import { WorkspaceContext } from '../../../context/WorkspaceContextBase'
import AgencyBranchesPage from '../AgencyBranchesPage'
function overview(organisationId = 'kingdom', period = 'this_month', extra = {}) {
  const metric = { value: 0, previousValue: 0, changePercent: null, sparkline: [] }
  return { organisationId, period, totals: { companyPipeline: 11995000, activeTransactions: 0, activeListings: 5, activeTeam: 3, unassignedListings: 1 }, periodMetrics: { pipeline: metric, listings: { ...metric, value: 2 }, transactions: metric, team: metric }, branches: [], ...extra }
}
function Page({ organisationId = 'kingdom' }) {
  return <WorkspaceContext.Provider value={{ currentWorkspace: { id: organisationId } }}><MemoryRouter><AgencyBranchesPage /></MemoryRouter></WorkspaceContext.Provider>
}
function card(label) { return within(screen.getByText(label).closest('article')) }
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
beforeEach(() => api.getOverview.mockImplementation(async (org, period) => overview(org, period)))
afterEach(() => { cleanup(); vi.resetAllMocks(); window.history.replaceState(null, '', '/') })
it('shows current company stock and leadership team separately from monthly activity', async () => {
  render(<Page />)
  await screen.findByText('Company Performance')
  expect(api.getOverview).toHaveBeenCalledWith('kingdom', 'this_month')
  expect(card('Sales pipeline value').getByText(/11.?995.?000/)).toBeTruthy()
  expect(card('Current listings').getByText('5')).toBeTruthy()
  expect(card('Current listings').getByText('2 added this month')).toBeTruthy()
  expect(card('Active team').getByText('3')).toBeTruthy()
  expect(card('Active transactions').getByText('0')).toBeTruthy()
  expect(screen.getByText(/awaiting branch allocation included/)).toBeTruthy()
  expect(screen.queryByText('No history yet')).toBeNull()
  expect(screen.queryByText(/100%/)).toBeNull()
})
it('changes activity period while preserving current totals', async () => {
  render(<Page />)
  fireEvent.click(await screen.findByRole('button', { name: 'Last Month' }))
  await waitFor(() => expect(api.getOverview).toHaveBeenLastCalledWith('kingdom', 'last_month'))
  await screen.findByText('2 added last month')
  expect(card('Current listings').getByText('5')).toBeTruthy()
})
it('shows a retryable error without false zero figures on an initial failed load', async () => {
  api.getOverview.mockRejectedValueOnce(new Error('Unable to read listings'))
  render(<Page />)
  expect((await screen.findByRole('alert')).textContent).toContain('Company figures have not been loaded')
  expect(screen.queryByText('Company Performance')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Company Performance')
  expect(card('Current listings').getByText('5')).toBeTruthy()
})
it('keeps last successful same-company figures when refresh fails', async () => {
  render(<Page />)
  await screen.findByText('Company Performance')
  api.getOverview.mockRejectedValueOnce(new Error('Network unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Last successfully loaded figures')
  expect(card('Current listings').getByText('5')).toBeTruthy()
})
it('ignores a late response after changing organisations', async () => {
  const late = deferred()
  api.getOverview.mockImplementation((org) => org === 'kingdom' ? late.promise : Promise.resolve(overview(org, 'this_month', { totals: { activeListings: 17, activeTeam: 2, activeTransactions: 1, companyPipeline: 4000000 } })))
  const view = render(<Page />)
  await waitFor(() => expect(api.getOverview).toHaveBeenCalledWith('kingdom', 'this_month'))
  view.rerender(<Page organisationId="i-sell" />)
  await screen.findByText('17')
  await act(async () => late.resolve(overview('kingdom')))
  expect(card('Current listings').getByText('17')).toBeTruthy()
  expect(screen.queryByText('5')).toBeNull()
})
it('rejects a service response for a different company', async () => {
  api.getOverview.mockResolvedValue(overview('other-company'))
  render(<Page />)
  await screen.findByRole('alert')
  expect(screen.queryByText('Company Performance')).toBeNull()
})
it('labels saved figures with their loaded period when a period change fails', async () => {
  render(<Page />)
  await screen.findByText('Company Performance')
  api.getOverview.mockRejectedValueOnce(new Error('Activity unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Last Month' }))
  await screen.findByRole('alert')
  expect(screen.getByText('2 added this month')).toBeTruthy()
  expect(screen.queryByText('2 added last month')).toBeNull()
})
