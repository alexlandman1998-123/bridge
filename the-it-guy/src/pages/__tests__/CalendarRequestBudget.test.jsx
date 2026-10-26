// @vitest-environment jsdom
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ health: vi.fn(), provider: vi.fn(), support: vi.fn(), delivery: vi.fn(), mobile: vi.fn(), management: vi.fn(), bookings: vi.fn(), inventory: vi.fn() }))
const context = vi.hoisted(() => ({ workspace: { role: 'agent', profile: { id: 'agent' }, currentWorkspace: { id: 'org' }, currentMembership: { role: 'owner' } }, organisation: { organisation: { id: 'org' }, loading: false } }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => context.workspace }))
vi.mock('../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => context.organisation }))
vi.mock('../../services/calendarSupportService', () => ({ readCalendarHealth: api.health, readAppointmentSupport: api.support }))
vi.mock('../../services/calendarProviderService', () => ({ readCalendarProviderStatus: api.provider }))
vi.mock('../../services/appointmentNotificationService', () => ({ readCalendarDeliveryJobs: api.delivery }))
vi.mock('../../services/mobileDashboardService.js', () => ({ getMobileCalendarSnapshotAsync: api.mobile }))
vi.mock('../../services/rentals/rentalManagementService', () => ({ listRentalManagementWorkspace: api.management }))
vi.mock('../../services/rentals/rentalShortTermBookingRepository.js', () => ({ listShortTermBookings: api.bookings }))
vi.mock('../../services/rentals/rentalShortTermInventoryRepository.js', () => ({ listShortTermUnitInventory: api.inventory }))
import CalendarHealthPanel from '../../components/appointments/CalendarHealthPanel'
import ConnectedCalendarPanel from '../../components/appointments/ConnectedCalendarPanel'
import AppointmentSupportPanel from '../../components/appointments/AppointmentSupportPanel'
import AppointmentDeliveryStatus from '../../components/appointments/AppointmentDeliveryStatus'
import MobileCalendarPage from '../mobile/MobileCalendarPage'
import RentalCalendarPage from '../rentals/RentalCalendarPage'
import ShortTermRentalCalendarPage from '../rentals/ShortTermRentalCalendarPage'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  for (const read of Object.values(api)) read.mockReset().mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
for (const [name, Component, props, reader, getSignal] of [
  ['health', CalendarHealthPanel, { organisationId: 'org', viewerKey: 'agent' }, 'health', args => args[1].signal],
  ['connections', ConnectedCalendarPanel, { organisationId: 'org', viewerKey: 'agent' }, 'provider', args => args[2].signal],
  ['support', AppointmentSupportPanel, { organisationId: 'org', viewerKey: 'agent', appointmentId: 'booking' }, 'support', args => args[2].signal],
  ['delivery', AppointmentDeliveryStatus, { viewerKey: 'agent', appointment: { appointmentId: 'booking', calendarDeliveryManaged: true } }, 'delivery', args => args[1].signal],
  ['mobile', MobileCalendarPage, {}, 'mobile', args => args[0].signal],
  ['rental operations', RentalCalendarPage, {}, 'management', args => args[1].signal],
  ['short-term rentals', ShortTermRentalCalendarPage, {}, 'bookings', args => args[1].signal],
]) {
  it(`${name} keeps twenty focus events behind one request and aborts on unmount`, async () => {
    const view = render(<MemoryRouter><Component {...props} /></MemoryRouter>)
    await act(async () => {})
    for (let n = 0; n < 20; n++) {
      act(() => window.dispatchEvent(new Event('focus')))
      await act(async () => vi.advanceTimersByTimeAsync(150))
    }
    expect(api[reader]).toHaveBeenCalledTimes(1)
    const signal = getSignal(api[reader].mock.calls[0])
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(api[reader]).toHaveBeenCalledTimes(1)
  })
}
