// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileHome from '../MobileHome.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, cached: vi.fn(), read: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/mobileDashboardService', () => ({
  getCachedMobileDashboardSnapshot: mocks.cached,
  getMobileDashboardSnapshot: () => null,
  getMobileDashboardSnapshotAsync: mocks.read,
  MOBILE_DASHBOARD_UPDATED_EVENTS: ['itg:agency-crm-updated', 'itg:transaction-updated', 'itg:transaction-created'],
}))
vi.mock('../../../services/observability/monitoring', () => ({ trackMobileMetric: vi.fn() }))
vi.mock('../../../components/mobile-shell/AgentDashboard', () => ({ default: ({ snapshot }) => <h1>Today for {snapshot.displayName}</h1> }))

const saved = { category: 'developer', displayName: 'Alexander' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'developer', profile: { id: 'me' }, currentWorkspace: { id: 'org-one' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.cached.mockReturnValue(saved)
  mocks.read.mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)

it('shows the recent saved home immediately while newer data is loading', async () => {
  render(<MemoryRouter><MobileHome /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Today for Alexander' })).toBeTruthy()
  expect(screen.queryByLabelText('Loading mobile dashboard')).toBeNull()
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Today for Alexander' })).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledWith({ workspace: mocks.workspace, organisation: mocks.organisation.organisation, force: false })
})

it('hides the previous workspace immediately when switching organisations, then renders only the new result', async () => {
  const { rerender } = render(<MemoryRouter><MobileHome /></MemoryRouter>)
  await act(async () => {})
  mocks.workspace = { ...mocks.workspace, currentWorkspace: { id: 'org-two' } }
  mocks.organisation = { organisation: { id: 'org-two' }, loading: false }
  mocks.cached.mockReturnValue(null)
  let resolveNew
  mocks.read.mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve }))
  rerender(<MemoryRouter><MobileHome /></MemoryRouter>)
  expect(screen.queryByRole('heading', { name: 'Today for Alexander' })).toBeNull()
  await act(async () => {})
  expect(screen.getByLabelText('Loading mobile dashboard')).toBeTruthy()
  await act(async () => resolveNew({ ...saved, displayName: 'New workspace' }))
  expect(screen.getByRole('heading', { name: 'Today for New workspace' })).toBeTruthy()
})

it('fetches fresh records after a transaction update rather than continuing to use cached data', async () => {
  render(<MemoryRouter><MobileHome /></MemoryRouter>)
  await act(async () => {})
  mocks.read.mockResolvedValueOnce({ ...saved, displayName: 'Updated dashboard' })
  await act(async () => window.dispatchEvent(new Event('itg:transaction-updated')))
  expect(mocks.read).toHaveBeenLastCalledWith({ workspace: mocks.workspace, organisation: mocks.organisation.organisation, force: true })
  expect(screen.getByRole('heading', { name: 'Today for Updated dashboard' })).toBeTruthy()
})
