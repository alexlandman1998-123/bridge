// @vitest-environment jsdom

import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ATTORNEY_INVITE_DRAFT } from '../../../../core/appointments/attorneyInviteContract'

vi.mock('../../../../services/attorneyOperations', () => ({
  assignAttorneyAppointmentResource: vi.fn(),
  createAttorneyAppointmentInvite: vi.fn(),
  proposeAttorneyAppointmentReschedule: vi.fn(),
  resendAttorneyAppointmentCommunication: vi.fn(),
  resolveAttorneyAppointmentReschedule: vi.fn(),
  updateAttorneyAppointmentOperationalStatus: vi.fn(),
  upsertAttorneyAppointmentParticipant: vi.fn(),
}))

import { CreateInviteDrawer } from '../AttorneySchedulingWorkspace'

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
    expect(screen.getByLabelText('Location type').required).toBe(true)
    expect(screen.getByLabelText('Meeting link').required).toBe(true)
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
