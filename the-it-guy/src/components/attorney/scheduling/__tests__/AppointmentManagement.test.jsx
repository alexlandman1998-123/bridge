// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppointmentDrawer } from '../AttorneySchedulingWorkspace'

afterEach(cleanup)
const appointment = { id: 'appointment-1', matterReference: 'MAT-001', status: 'Confirmed', dateTime: '2099-07-20T08:00Z', endTime: '11:30:00', updatedAt: '2026-10-03T12:00Z', organisationId: 'agency-1', schedulingOwnerId: 'staff-1', schedulingOwnerName: 'Secretary A', assignedAttorneyName: 'Attorney A' }
const props = { appointment, staffOptions: [{ value: 'staff-1', label: 'Secretary A' }, { value: 'staff-2', label: 'Secretary B' }], resources: [{ resourceId: 'room-1', resourceName: 'Room A', organisationId: 'agency-1' }, { resourceId: 'room-2', resourceName: 'Other organisation room', organisationId: 'agency-2' }], onClose: vi.fn(), onResourceAssign: vi.fn(), onStaffAssign: vi.fn(), onComplete: vi.fn(), onResendCommunication: vi.fn(), onEdit: vi.fn(), onCancel: vi.fn() }
function show(overrides = {}) { return render(<MemoryRouter><AppointmentDrawer {...props} {...overrides} /></MemoryRouter>) }

describe('Appointment management drawer', () => {
  it('retains the selected owner and offers only rooms from the appointment organisation', () => {
    const onStaffAssign = vi.fn(), onResourceAssign = vi.fn()
    show({ onStaffAssign, onResourceAssign })
    expect(screen.getByLabelText('Scheduling owner').value).toBe('staff-1')
    expect(screen.queryByRole('option', { name: 'Other organisation room' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Scheduling owner'), { target: { value: 'staff-2' } })
    expect(onStaffAssign).toHaveBeenCalledWith(appointment, { userId: 'staff-2' })
    fireEvent.change(screen.getByLabelText('Boardroom'), { target: { value: 'room-1' } })
    expect(onResourceAssign).toHaveBeenCalledWith(appointment, 'room-1')
  })
  it('keeps the original edit version when a background refresh arrives', async () => {
    const onEdit = vi.fn(async () => true)
    const view = show({ onEdit })
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    expect(screen.getByLabelText('Appointment start time').value).toBe('10:00')
    expect(screen.getByLabelText('Appointment end time').value).toBe('11:30')
    fireEvent.change(screen.getByLabelText('Appointment start time'), { target: { value: '12:00' } })
    view.rerender(<MemoryRouter><AppointmentDrawer {...props} appointment={{ ...appointment, updatedAt: '2026-10-03T12:01Z' }} onEdit={onEdit} /></MemoryRouter>)
    fireEvent.submit(screen.getByRole('form', { name: 'Edit appointment time' }))
    expect(onEdit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ startTime: '12:00', expectedUpdatedAt: appointment.updatedAt }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit appointment time' })).toBeNull())
  })
  it('retains the edit when a conflict prevents saving', async () => {
    show({ onEdit: vi.fn(async () => false) })
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Edit appointment time' }))
    await waitFor(() => expect(screen.getByRole('form', { name: 'Edit appointment time' })).toBeTruthy())
  })
  it('requires a reason and an explicit cancellation action', async () => {
    const onCancel = vi.fn(async () => true)
    show({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm cancellation' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'Buyer unavailable' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Cancel appointment' }))
    expect(onCancel).toHaveBeenCalledWith(appointment, 'Buyer unavailable')
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Cancel appointment' })).toBeNull())
  })
  it.each(['Cancelled', 'Completed', 'Declined'])('disables changes for %s appointments', status => {
    show({ appointment: { ...appointment, status } })
    for (const label of ['Edit time', 'Cancel appointment', 'Mark Completed', 'Send Reminder']) expect(screen.getByRole('button', { name: label }).disabled).toBe(true)
    expect(screen.getByLabelText('Scheduling owner').disabled).toBe(true)
    expect(screen.getByLabelText('Boardroom').disabled).toBe(true)
  })
  it('disables assignment while an operation is in progress', () => {
    show({ busyId: 'saving' })
    expect(screen.getByLabelText('Scheduling owner').disabled).toBe(true)
    expect(screen.getByLabelText('Boardroom').disabled).toBe(true)
  })
  it('shows the saved cancellation reason', () => {
    show({ appointment: { ...appointment, status: 'Cancelled', cancellationReason: 'Buyer unavailable' } })
    expect(screen.getByText('Cancellation reason: Buyer unavailable')).toBeTruthy()
  })
})
