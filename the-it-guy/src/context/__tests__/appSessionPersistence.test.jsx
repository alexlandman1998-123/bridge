// @vitest-environment jsdom
import React from 'react'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const start = source.indexOf('function AppLayout(')
const end = source.indexOf('\nconst WORKSPACE_GATE_SLOW_MS', start)
if (start < 0 || end < 0) throw new Error('The real app layout could not be found.')
// Compile outside jsdom so esbuild uses Node's matching TextEncoder/typed arrays.
const layoutCode = execFileSync(process.execPath, ['-e', `
  const { transformSync } = require('esbuild')
  process.stdout.write(transformSync(require('node:fs').readFileSync(0, 'utf8'), {
    loader: 'jsx', jsxFactory: 'React.createElement',
  }).code)
`], { input: source.slice(start, end), encoding: 'utf8', cwd: process.cwd() })

function mountLayout(pathname = '/dashboard') {
  const onLogout = vi.fn()
  const navigate = vi.fn()
  const ctx = {
    React, ...React, window, document, Event, Date,
    useWorkspace: () => ({ workspace: { id: 'agency-1' }, role: 'agent', profile: {} }),
    useLocation: () => ({ pathname }), useNavigate: () => navigate,
    getStableRouteContentKey: path => path,
    resetLockedShellWindowScroll: vi.fn(), markRouteRendered: vi.fn(), markRouteFirstVisibleContent: vi.fn(),
    Sidebar: () => null, SidebarSkeleton: () => null, HeaderSkeleton: () => null,
    PageSkeleton: () => null, ModalSkeleton: () => null,
    HeaderBar: ({ onLogout: logout }) => <button onClick={logout}>Sign out</button>,
    Outlet: () => <div>Signed-in workspace</div>,
    // Let the same regression reproduce the original live timer when run against
    // its source. The current app has no timeout constants or timer to consume them.
    INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000, WARNING_DELAY_MS: 14 * 60 * 1000,
    ACTIVITY_TIMER_RESET_THROTTLE_MS: 1000,
  }
  vm.createContext(ctx)
  vm.runInContext(layoutCode, ctx)
  const session = { access_token: 'fixture-token', user: { id: 'agent-1' } }
  render(React.createElement(ctx.AppLayout, { onLogout, user: session.user, session }))
  return { onLogout, navigate }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it.each(['/dashboard', '/pipeline/leads/lead-1', '/bond/dashboard', '/commercial/properties'])('%s remains signed in after a full day without activity', async pathname => {
  const { onLogout, navigate } = mountLayout(pathname)
  await act(async () => { await vi.advanceTimersByTimeAsync(14 * 60 * 1000) })
  expect(screen.queryByText('Stay signed in')).toBeNull()
  expect(screen.queryByText(/signed out soon/)).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000) })
  expect(onLogout).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  expect(screen.getByText('Signed-in workspace')).toBeTruthy()
})

it('returning to a tab after a long idle period keeps its workspace open', async () => {
  const { onLogout, navigate } = mountLayout()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => { await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000) })
  visibility.mockReturnValue('visible')
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(onLogout).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  expect(screen.getByText('Signed-in workspace')).toBeTruthy()
})

it('manual sign out remains available after a long idle period', async () => {
  const { onLogout } = mountLayout()
  await act(async () => { await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000) })
  expect(onLogout).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(onLogout).toHaveBeenCalledOnce()
})
