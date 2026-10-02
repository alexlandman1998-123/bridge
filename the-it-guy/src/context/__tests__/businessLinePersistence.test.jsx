// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext'

vi.mock('../AuthSessionContext', () => ({ useAuthSession: () => ({ authState, selectWorkspace: vi.fn() }) }))
vi.mock('../../lib/envValidation', () => ({ getFeatureFlags: () => ({}) }))
const authState = {
  status: 'authenticated', appRole: 'agent', workspaceType: 'agency', workspaceRole: 'principal',
  user: { id: 'agent-1' }, profile: { id: 'agent-1', role: 'agent' },
  currentWorkspace: { id: 'org-1', type: 'agency', settingsJson: { businessLines: ['sales', 'rentals', 'short_term_rentals'] } },
  currentMembership: { status: 'active', workspaceRole: 'principal', organisationId: 'org-1', moduleMetadata: { businessWorkspaces: ['sales', 'rentals', 'short_term_rentals'] } },
  activeMemberships: [], pendingMemberships: [], suspendedMemberships: [],
}
afterEach(() => { cleanup(); window.localStorage.clear() })
function Probe({ firstRender }) {
  const context = useWorkspace()
  firstRender?.(context.businessWorkspaceId)
  return <><span data-testid="line">{context.businessWorkspaceId}</span><button onClick={() => context.setBusinessWorkspace('rentals')}>Rentals</button></>
}
it('restores the saved line on the first render and saves a changed line for remount', () => {
  window.localStorage.setItem('arch9:business-workspace:v1', JSON.stringify({ key: 'agent-1:org-1', workspace: 'short_term_rentals' }))
  const firstRender = vi.fn()
  const mounted = render(<WorkspaceProvider><Probe firstRender={firstRender} /></WorkspaceProvider>)
  expect(firstRender.mock.calls[0][0]).toBe('short_term_rentals')
  fireEvent.click(screen.getByText('Rentals'))
  expect(JSON.parse(window.localStorage.getItem('arch9:business-workspace:v1')).workspace).toBe('rentals')
  mounted.unmount()
  render(<WorkspaceProvider><Probe /></WorkspaceProvider>)
  expect(screen.getByTestId('line').textContent).toBe('rentals')
})
