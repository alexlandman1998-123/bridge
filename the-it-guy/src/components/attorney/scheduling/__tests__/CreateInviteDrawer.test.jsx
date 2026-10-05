// @vitest-environment jsdom

import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_ATTORNEY_INVITE_DRAFT } from '../../../../core/appointments/attorneyInviteContract'

const actions = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../../../services/attorneyCalendarRolloutService', () => ({
  getAttorneyCalendarRolloutStatus: vi.fn(async () => ({ enabled: true })),
  resolveAttorneyCalendarEnvironment: () => 'development',
}))
vi.mock('../../../../services/attorneyOperations', () => ({
  assignAttorneyAppointmentResource: vi.fn(),
  createAttorneyAppointmentInvite: actions.create,
  manageAttorneyWorkspaceAppointment: vi.fn(),
  proposeAttorneyAppointmentReschedule: vi.fn(),
  resendAttorneyAppointmentCommunication: vi.fn(),
  resolveAttorneyAppointmentReschedule: vi.fn(),
  updateAttorneyAppointmentOperationalStatus: vi.fn(),
  upsertAttorneyAppointmentParticipant: vi.fn(),
}))

import AttorneySchedulingWorkspace, { CreateInviteDrawer } from '../AttorneySchedulingWorkspace'
import LegalTaskAppointmentForm from '../../workflow/LegalTaskAppointmentForm'

afterEach(cleanup)

const matters = [{ matterId: 'matter-1', matterReference: 'MAT-001', clientName: 'Test Client' }]
const resources = [{ resourceId: 'room-1', resourceName: 'Boardroom A' }]

function DrawerHarness({ busyId = '', onClose = vi.fn(), onSubmit = vi.fn() }) {
  const [draft, setDraft] = useState({ ...DEFAULT_ATTORNEY_INVITE_DRAFT })
  return (
    <CreateInviteDrawer
      open
      draft={draft}
      setDraft={setDraft}
      matterOptions={matters}
      resources={resources}
      busyId={busyId}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}

describe('CreateInviteDrawer', () => {
  it('does not render while closed', () => {
    const { container } = render(
      <CreateInviteDrawer
        open={false}
        draft={{ ...DEFAULT_ATTORNEY_INVITE_DRAFT }}
        setDraft={vi.fn()}
        matterOptions={matters}
        resources={resources}
        busyId=""
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders every invite type and required base fields', () => {
    render(<DrawerHarness />)

    expect(screen.getByRole('complementary', { name: 'Create attorney invite' })).toBeTruthy()
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3)
    expect(screen.getByRole('button', { pressed: true }).textContent).toContain('Transfer Signing')
    expect(screen.getByLabelText('Matter').required).toBe(true)
    expect(screen.getByLabelText('Invitee email').required).toBe(true)
    expect(screen.getByLabelText('Date').required).toBe(true)
    expect(screen.getByLabelText('Start time').required).toBe(true)
    expect(screen.getByLabelText('End time')).toBeTruthy()
    expect(screen.getByLabelText('Location type').required).toBe(true)
    expect(screen.getByLabelText('Meeting link').required).toBe(true)
    expect(screen.queryByLabelText('Boardroom')).toBeNull()
    expect(screen.queryByText('All day')).toBeNull()
    expect(screen.queryByText('Repeat')).toBeNull()
    expect(screen.queryByText('Attorneys / Staff')).toBeNull()
    expect(screen.queryByText('Reminder')).toBeNull()
  })

  it('switches conditional location controls without losing the form', () => {
    render(<DrawerHarness />)

    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'boardroom' } })
    expect(screen.getByLabelText('Boardroom').required).toBe(true)
    expect(screen.getByRole('option', { name: 'Boardroom A' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'physical_address' } })
    expect(screen.getByLabelText('Location').required).toBe(true)
    expect(screen.queryByLabelText('Boardroom')).toBeNull()
  })

  it('supports cancel, submit, and in-progress protection', () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn((event) => event.preventDefault())
    const { rerender } = render(<DrawerHarness onClose={onClose} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.submit(screen.getByRole('button', { name: 'Create Invite' }).closest('form'))
    expect(onSubmit).toHaveBeenCalledOnce()

    rerender(<DrawerHarness busyId="create-invite" onClose={onClose} onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Create Invite' }).disabled).toBe(true)
  })
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('keeps the calendar usable after saving while refresh and delivery are pending', async () => {
  const persistence = deferred()
  const delivery = deferred()
  const refresh = deferred()
  actions.create.mockReset().mockReturnValue(persistence.promise)
  const onWorkspaceChanged = vi.fn(() => refresh.promise)
  const matterRows = [{ matterId: '22222222-2222-4222-8222-222222222222', matterReference: 'MAT-2', organisationId: '33333333-3333-4333-8333-333333333333', clientName: 'Buyer', matterType: 'Transfer' }]
  const props = { matterRows, organisationId: '11111111-1111-4111-8111-111111111111', onWorkspaceChanged }
  const { rerender } = render(<MemoryRouter><AttorneySchedulingWorkspace {...props} /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('button', { name: /Create Invite/ }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Month' }))
  fireEvent.change(screen.getByPlaceholderText('Search matters, clients or appointments...'), { target: { value: 'Buyer' } })
  fireEvent.click(screen.getByRole('button', { name: /Create Invite/ }))
  fireEvent.change(screen.getByLabelText('Matter'), { target: { value: matterRows[0].matterId } })
  fireEvent.change(screen.getByLabelText('Invitee email'), { target: { value: 'buyer@example.test' } })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-07-20' } })
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
  fireEvent.change(screen.getByLabelText('Meeting link'), { target: { value: 'https://meet.example.test/signing' } })
  fireEvent.click(screen.getByLabelText('Send notifications'))
  const form = within(screen.getByRole('complementary', { name: 'Create attorney invite' })).getByRole('button', { name: 'Create Invite' }).closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(actions.create).toHaveBeenCalledOnce()
  expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ organisationId: matterRows[0].organisationId, sendNotifications: false }))

  const saved = { appointmentId: 'saved', transactionId: matterRows[0].matterId, delivery: { status: 'processing' }, deliveryCompletion: delivery.promise }
  await act(async () => { persistence.resolve(saved) })
  expect(screen.queryByRole('complementary', { name: 'Create attorney invite' })).toBeNull()
  expect(screen.queryByText('Processing scheduling action...')).toBeNull()
  expect(screen.getByText('Appointment saved. Invite delivery is in progress.')).toBeTruthy()
  expect(onWorkspaceChanged).toHaveBeenCalledWith({ savedAppointment: saved })
  rerender(<MemoryRouter><AttorneySchedulingWorkspace {...props} appointmentRows={[]} /></MemoryRouter>)
  expect(screen.getByRole('button', { name: 'Month' }).className).toContain('is-active')
  expect(screen.getByPlaceholderText('Search matters, clients or appointments...').value).toBe('Buyer')
  await act(async () => { refresh.reject(new Error('refresh offline')) })
  expect(screen.getByText(/Changes saved.*calendar could not refresh/)).toBeTruthy()
  await act(async () => { delivery.resolve({ delivery: { status: 'failed' } }) })
  expect(screen.getByText(/Appointment saved, but the invite email could not be delivered/)).toBeTruthy()
  expect(actions.create).toHaveBeenCalledOnce()
})

it('releases the task form after persistence and updates delivery without creating another appointment', async () => {
  const delivery = deferred()
  const onCreate = vi.fn(async () => ({ appointmentId: 'saved-task', delivery: { status: 'processing' }, deliveryCompletion: delivery.promise, message: 'Appointment saved. Invite delivery is in progress.' }))
  const onResend = vi.fn()
  render(<LegalTaskAppointmentForm task={{ label: 'Buyer signing' }} recipient={{ name: 'Buyer', email: 'buyer@example.test' }} onCreate={onCreate} onResend={onResend} />)
  fireEvent.submit(screen.getByRole('button', { name: 'Schedule & send invite' }).closest('form'))
  await screen.findByText(/Invite delivery is in progress/)
  expect(screen.queryByRole('button', { name: 'Resend invite' })).toBeNull()
  await act(async () => { delivery.resolve({ delivery: { status: 'failed' } }) })
  expect(screen.getByRole('button', { name: 'Resend invite' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Resend invite' }))
  await waitFor(() => expect(onResend).toHaveBeenCalledWith('saved-task'))
  expect(onCreate).toHaveBeenCalledOnce()
})

it('reports a task refresh failure separately from the saved appointment', async () => {
  const refresh = deferred()
  render(<LegalTaskAppointmentForm task={{ label: 'Buyer signing' }} onCreate={async () => ({
    appointmentId: 'saved-task', message: 'Appointment saved.', delivery: { status: 'sent' }, refreshCompletion: refresh.promise,
  })} />)
  fireEvent.submit(screen.getByRole('button', { name: 'Schedule & send invite' }).closest('form'))
  await screen.findByText('Appointment saved.')
  await act(async () => { refresh.resolve({ ok: false, message: 'Appointment saved. Refresh the matter to load the latest appointment details.' }) })
  expect(screen.getByRole('alert').textContent).toContain('Refresh the matter')
  expect(screen.getByRole('status').textContent).toBe('Appointment saved.')
  expect(screen.queryByRole('button', { name: 'Schedule & send invite' })).toBeNull()
})
