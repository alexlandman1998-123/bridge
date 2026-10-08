// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ read: vi.fn(), recover: vi.fn() }))
vi.mock('../../../services/calendarSupportService', () => ({ readAppointmentSupport: api.read, recoverAppointmentDelivery: api.recover, calendarSupportDeadline: p => p }))
import AppointmentSupportPanel from '../AppointmentSupportPanel'
const snapshot = { revision: 2, status: 'requested', reconcileAllowed: true, jobs: [{ id: 'job', revision: 2, event_kind: 'invite', channel: 'email', recipient_email: 'client@example.test', status: 'failed', attempt_count: 5, max_attempts: 5, retry_allowed: true }], history: [{ source: 'change', created_at: '2026-10-09T10:00Z', revision: 2, status: 'requested', changed_fields: ['start_time'] }], participants: [{ id: 'client', name: 'Buyer', role: 'Client', response: 'Pending', required: true }] }
const panel = props => <AppointmentSupportPanel organisationId="org" appointmentId="appt" viewerKey="agent" appointmentRevision={2} {...props} />
beforeEach(() => { vi.resetAllMocks(); api.read.mockResolvedValue(snapshot); api.recover.mockResolvedValue({ queued: 1, retired: 0 }) })
afterEach(cleanup)
it('shows saved revision, response and receipts and requires a reason before recovery', async () => {
 render(panel()); await screen.findByText(/Revision 2 · requested/)
 expect(screen.getByText(/Buyer · Client · required · Pending/)).toBeTruthy()
 const retry = screen.getByRole('button', { name: 'Retry eligible delivery' }); expect(retry.disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Recovery reason'), { target: { value: 'Provider recovered' } }); fireEvent.click(retry)
 await screen.findByText(/1 job\(s\) queued/)
 expect(api.recover.mock.calls[0][0]).toMatchObject({ organisationId: 'org', appointmentId: 'appt', revision: 2, action: 'retry', jobId: 'job', reason: 'Provider recovered' })
 expect(api.recover.mock.calls[0][0].commandId).toMatch(/^[0-9a-f-]{36}$/)
 expect(screen.queryByText(/successfully delivered/)).toBeNull()
})
it('retains an unchanged command after a lost response and blocks double clicks', async () => {
 let finish; api.recover.mockImplementationOnce(() => new Promise((_, reject) => { finish = reject }))
 render(panel()); await screen.findByRole('button', { name: 'Reconcile future reminders' })
 fireEvent.change(screen.getByLabelText('Recovery reason'), { target: { value: 'Checked missing jobs' } })
 const button = screen.getByRole('button', { name: 'Reconcile future reminders' }); fireEvent.click(button); fireEvent.click(button)
 expect(api.recover).toHaveBeenCalledTimes(1); finish(new Error('Receipt lost'))
 await screen.findByText('Receipt lost'); fireEvent.click(button); await screen.findByText(/job\(s\) queued/)
 expect(api.recover.mock.calls[1][0].commandId).toBe(api.recover.mock.calls[0][0].commandId)
})
it('keeps action failures visible after a successful background refresh', async () => {
 api.recover.mockRejectedValue(new Error('Retry denied'))
 render(panel()); await screen.findByLabelText('Recovery reason'); fireEvent.change(screen.getByLabelText('Recovery reason'), { target: { value: 'Reviewed' } })
 fireEvent.click(screen.getByRole('button', { name: 'Retry eligible delivery' })); await screen.findByText('Retry denied')
 fireEvent(window, new Event('online')); await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2)); expect(screen.getByText('Retry denied')).toBeTruthy()
})
it('retains verified data after a failed read but disables recovery until Retry verifies it', async () => {
 render(panel()); await screen.findByLabelText('Recovery reason'); fireEvent.change(screen.getByLabelText('Recovery reason'), { target: { value: 'Reviewed' } })
 api.read.mockRejectedValueOnce(new Error('Read failed')); fireEvent(window, new Event('online')); await screen.findByText(/Showing the last verified details/)
 expect(screen.getByRole('button', { name: 'Retry eligible delivery' }).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', { name: 'Retry support read' })); await waitFor(() => expect(screen.queryByText(/Read failed/)).toBeNull())
 expect(screen.getByRole('button', { name: 'Retry eligible delivery' }).disabled).toBe(false)
})
it('hides a late former workspace result and clears recovery reasons', async () => {
 let finish; api.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ...snapshot, jobs: [], reconcileAllowed: false })
 const view = render(panel()); view.rerender(panel({ organisationId: 'new', viewerKey: 'new' }))
 await screen.findByText(/Revision 2 · requested/); finish(snapshot)
 await waitFor(() => expect(screen.queryByText(/client@example.test/)).toBeNull())
 expect(screen.queryByRole('button', { name: 'Retry eligible delivery' })).toBeNull()
})
it('does not show recovery controls after permission denial or without a viewer', async () => {
 api.read.mockRejectedValue(new Error('Support access denied')); const view = render(panel())
 await screen.findByRole('alert'); expect(screen.queryByLabelText('Recovery reason')).toBeNull()
 view.rerender(panel({ viewerKey: '' })); expect(screen.queryByRole('region')).toBeNull(); expect(api.read).toHaveBeenCalledTimes(1)
})
