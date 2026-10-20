// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileAppointmentCreateProvider from '../MobileAppointmentCreateProvider.jsx'
import { useMobileAppointmentCreate } from '../mobileAppointmentCreateContext.js'
const mocks = vi.hoisted(() => ({ workspace: {}, organisation: {}, props: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../appointments/MobileAppointmentWorkspace.jsx', () => ({ default: props => { mocks.props(props); return <div role="dialog" aria-label="Create appointment"><button onClick={() => props.onSaved({}, 'Saved')}>Save appointment</button></div> } }))
function Trigger() { const { openAppointmentCreate } = useMobileAppointmentCreate(); const location = useLocation(); return <><button disabled={!openAppointmentCreate} onClick={openAppointmentCreate}>Add appointment</button><output aria-label="Route">{location.pathname}</output></> }
function view() { return <MemoryRouter initialEntries={['/mobile/home']}><MobileAppointmentCreateProvider><Trigger /></MobileAppointmentCreateProvider></MemoryRouter> }
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T22:30:00Z'))
  mocks.workspace = { role: 'agent', profile: { id: 'agent', fullName: 'Alex Agent' } }
  mocks.organisation = { organisation: { id: 'org' }, loading: false }
})
afterEach(() => { cleanup(); vi.useRealTimers() })
it('opens the shared calendar form over Home with the current actor, agency and SAST date', async () => {
  render(view())
  fireEvent.click(screen.getByRole('button', { name: 'Add appointment' }))
  await screen.findByRole('dialog', { name: 'Create appointment' })
  expect(screen.getByLabelText('Route').textContent).toBe('/mobile/home')
  expect(mocks.props).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'org', actor: expect.objectContaining({ id: 'agent', name: 'Alex Agent' }), selectedDate: '2026-10-21' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('closes the scoped form when the agency changes', async () => {
  const current = render(view())
  fireEvent.click(screen.getByRole('button', { name: 'Add appointment' }))
  await screen.findByRole('dialog', { name: 'Create appointment' })
  mocks.organisation = { organisation: { id: 'different-org' } }
  current.rerender(view())
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('disables creation while agency context is loading', () => {
  mocks.organisation = { loading: true }
  render(view())
  expect(screen.getByRole('button', { name: 'Add appointment' }).disabled).toBe(true)
})
