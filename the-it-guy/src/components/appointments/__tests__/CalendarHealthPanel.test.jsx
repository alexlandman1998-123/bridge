// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('../../../services/calendarSupportService', () => ({ readCalendarHealth: read, calendarSupportDeadline: p => p }))
vi.mock('../AppointmentSupportPanel', () => ({ default: ({ appointmentId }) => <p>Support for {appointmentId}</p> }))
import CalendarHealthPanel from '../CalendarHealthPanel'
const report = { issues: [{ issue_key: 'one', kind: 'missing_reminder', title: 'Viewing', appointment_id: 'appt', inspectAllowed: true }], monitor: { status: 'not_started' }, truncated: false }
const panel = props => <CalendarHealthPanel organisationId="org" viewerKey="agent" {...props} />
beforeEach(() => { read.mockReset(); read.mockResolvedValue(report) })
afterEach(cleanup)
it('shows current scoped findings, warns of unverified background monitoring and opens the support dialog', async () => {
 render(panel()); await screen.findByText(/A future reminder job is missing/)
 expect(screen.getByText(/Background monitoring needs verification/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Inspect appointment', hidden: true }))
 expect(screen.getByRole('dialog', { hidden: true })).toBeTruthy(); expect(screen.getByText('Support for appt')).toBeTruthy()
})
it('does not expose an inspect action for connection-only or inaccessible appointment findings', async () => {
 read.mockResolvedValue({ ...report, issues: [{ issue_key: 'connection', kind: 'provider_disconnected', connection_id: 'conn', inspectAllowed: false, evidence: { provider: 'google' } }] })
 render(panel()); await screen.findByText(/Calendar account needs reconnection/)
 expect(screen.queryByRole('button', { name: 'Inspect appointment', hidden: true })).toBeNull()
})
it('retains verified findings after failed refresh and labels them stale', async () => {
 render(panel()); await screen.findByText(/A future reminder job is missing/)
 read.mockRejectedValueOnce(new Error('Health denied')); fireEvent(window, new Event('online'))
 await screen.findByText(/Showing the last verified result/); expect(screen.getByText(/A future reminder job is missing/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Retry health check', hidden: true })); await waitFor(() => expect(screen.queryByText(/Health denied/)).toBeNull())
})
it('never shows an old workspace issue after its late request resolves', async () => {
 let finish; read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ...report, issues: [] })
 const view = render(panel()); view.rerender(panel({ organisationId: 'other', viewerKey: 'other-agent' }))
 await screen.findByText(/No issues found/); finish(report)
 await waitFor(() => expect(screen.queryByText(/A future reminder job is missing/)).toBeNull())
})
