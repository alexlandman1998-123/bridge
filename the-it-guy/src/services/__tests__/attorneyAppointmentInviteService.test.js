import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: null,
  notify: vi.fn(),
  schedule: vi.fn(),
}))

vi.mock('../attorneyFirmServiceShared', () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'attorney@example.com',
    user_metadata: { full_name: 'Test Attorney' },
  })),
  isMissingColumnError: vi.fn(() => false),
  isMissingTableError: vi.fn(() => false),
  normalizeText: (value = '') => String(value || '').trim(),
  requireClient: () => mocks.client,
}))

vi.mock('../appointmentNotificationService', () => ({
  notifyAppointmentParticipants: mocks.notify,
  scheduleAppointmentReminders: mocks.schedule,
  cancelAppointmentReminders: vi.fn(),
}))

import { createAttorneyAppointmentInvite } from '../attorneyOperations'

function validInvite(overrides = {}) {
  return {
    organisationId: '11111111-1111-4111-8111-111111111111',
    transactionId: '22222222-2222-4222-8222-222222222222',
    appointmentType: 'attorney_consultation',
    recipientName: 'Test Client',
    recipientEmail: 'client@example.com',
    date: '2099-07-20',
    startTime: '10:00',
    locationMode: 'video_call',
    location: 'https://meet.example.com/invite',
    ...overrides,
  }
}

function createDatabase({ participantError = null, rollbackError = null } = {}) {
  const state = {
    appointmentPayload: null,
    participantRows: null,
    rollbackAppointmentId: null,
  }

  const client = {
    from(table) {
      if (table === 'appointments') {
        return {
          insert(payload) {
            state.appointmentPayload = payload
            return {
              select() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        appointment_id: payload.appointment_id,
                        transaction_id: payload.transaction_id,
                        status: payload.status,
                        visibility_scope: payload.visibility_scope,
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
          delete() {
            return {
              async eq(_column, appointmentId) {
                state.rollbackAppointmentId = appointmentId
                return { error: rollbackError }
              },
            }
          },
        }
      }
      if (table === 'appointment_participants') {
        return {
          async insert(rows) {
            state.participantRows = rows
            return { error: participantError }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }

  return { client, state }
}

beforeEach(() => {
  const database = createDatabase()
  mocks.client = database.client
  mocks.notify.mockReset().mockResolvedValue([{ email: { sent: true, status: 'sent' } }])
  mocks.schedule.mockReset().mockResolvedValue([{ id: 'reminder-1' }])
})

describe('createAttorneyAppointmentInvite', () => {
  it('persists canonical values and targets only the invitee participant', async () => {
    const database = createDatabase()
    mocks.client = database.client

    const result = await createAttorneyAppointmentInvite(validInvite())

    expect(database.state.appointmentPayload).toMatchObject({
      appointment_type: 'attorney_consultation',
      timezone: 'Africa/Johannesburg',
      location_type: 'video_call',
      meeting_url: 'https://meet.example.com/invite',
    })
    expect(database.state.participantRows).toHaveLength(2)
    expect(database.state.participantRows[0]).toMatchObject({
      email: 'client@example.com',
      participant_role: 'Client',
      rsvp_status: 'Pending',
    })
    expect(database.state.participantRows[1]).toMatchObject({
      email: 'attorney@example.com',
      participant_role: 'Attorney',
      rsvp_status: 'Accepted',
    })
    const recipientId = database.state.participantRows[0].participant_id
    expect(mocks.notify).toHaveBeenCalledWith(
      result.appointmentId,
      'appointment_confirmation_required',
      expect.objectContaining({ recipientParticipantIds: [recipientId] }),
    )
    expect(mocks.schedule).toHaveBeenCalledWith(result.appointmentId, { recipientParticipantIds: [recipientId] })
    expect(result.delivery).toMatchObject({ status: 'sent', sentCount: 1 })
  })

  it('rolls back the appointment when participant persistence fails', async () => {
    const database = createDatabase({ participantError: new Error('participant insert failed') })
    mocks.client = database.client

    await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toMatchObject({
      name: 'AttorneyInvitePersistenceError',
      code: 'ATTORNEY_INVITE_PARTICIPANT_PERSISTENCE_FAILED',
      appointmentRolledBack: true,
    })
    expect(database.state.rollbackAppointmentId).toBe(database.state.appointmentPayload.appointment_id)
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('retains the appointment and reports retryable delivery failure', async () => {
    const database = createDatabase()
    mocks.client = database.client
    mocks.notify.mockRejectedValueOnce(new Error('provider unavailable'))

    const result = await createAttorneyAppointmentInvite(validInvite())

    expect(database.state.rollbackAppointmentId).toBeNull()
    expect(result.delivery).toMatchObject({
      status: 'failed',
      retryable: true,
      failureReasons: ['provider unavailable'],
    })
  })

  it('surfaces rollback failure without masking the persistence cause', async () => {
    const database = createDatabase({
      participantError: new Error('participant insert failed'),
      rollbackError: new Error('rollback failed'),
    })
    mocks.client = database.client

    await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toMatchObject({
      code: 'ATTORNEY_INVITE_PARTICIPANT_PERSISTENCE_FAILED',
      appointmentRolledBack: false,
      cause: expect.objectContaining({ message: 'participant insert failed' }),
    })
  })
})
