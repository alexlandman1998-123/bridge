import { describe, expect, it } from 'vitest'
import { appointmentMatchesAgent, appointmentReadState } from '../appointmentReadModel.js'
import { buildAppointmentDashboardData } from '../../../services/appointmentDashboardService.js'
import { buildAppointmentsDashboardSummary } from '../../../lib/agencyPipelineService.js'
import { buildAppointmentsDashboardSummary as buildDashboardSummary } from '../../../lib/dashboardSecondaryApi.js'
import { getPrincipalAgentDetailCommandCentre } from '../../../modules/agency/agents/principalAgentCommandCentreService.js'

const now = new Date('2026-10-08T22:00:00Z')
const agent = { id: 'agent', userId: 'account', email: 'agent@example.test', name: 'Same Name' }
const booking = { appointmentId: 'master', assignedAgentId: 'other', status: 'confirmed', dateTime: '2026-10-08T22:30:00Z', endDateTime: '2026-10-08T23:00:00Z', timezone: 'Africa/Johannesburg', participants: [{ userId: 'account', participantRole: 'Agent' }] }

describe('one appointment interpretation across readers', () => {
  it('exposes the summary builder through the dashboard API', () => {
    expect(buildDashboardSummary).toBe(buildAppointmentsDashboardSummary)
    expect(buildDashboardSummary([booking], { now }).today).toHaveLength(1)
  })
  for (const [status, category] of [['confirmed', 'upcoming'], ['completed', 'history'], ['cancelled', 'history'], ['declined', 'history'], ['no_show', 'history'], ['draft', 'draft']]) {
    it(`${status} has the same upcoming meaning on profile and dashboard`, () => {
      const row = { ...booking, status }
      const dashboard = buildAppointmentDashboardData({ module: 'agent', userId: 'account', appointments: [row], now })
      const profile = getPrincipalAgentDetailCommandCentre({ agent, appointments: [row], now })
      expect(appointmentReadState(row, now).category).toBe(category)
      expect(profile.calendarSummary.upcomingItems.length).toBe(dashboard.counts.upcoming)
      expect(dashboard.nextAppointment?.id || null).toBe(category === 'upcoming' ? 'master' : null)
    })
  }
  it('expires a hold at its deadline without needing a database cleanup job', () => {
    const row = { ...booking, status: 'requested', requestIssuedAt: now.toISOString(), holdExpiresAt: '2026-10-08T22:10:00Z' }
    expect(appointmentReadState(row, now).category).toBe('upcoming')
    const expired = new Date('2026-10-08T22:10:00Z')
    const dashboard = buildAppointmentDashboardData({ appointments: [row], now: expired })
    expect(dashboard.counts).toMatchObject({ upcoming: 0, pendingConfirmation: 0, needsFollowUp: 1 })
    expect(dashboard.nextAppointment).toBeNull()
    expect(dashboard.followUpAppointments[0].id).toBe('master')
  })
  it('retains a confirmed original while replacement approval is pending', () => {
    expect(appointmentReadState({ ...booking, status: 'alternative_proposed', hasConfirmedReservation: true, holdExpiresAt: '2026-10-01T00:00Z' }, now).category).toBe('upcoming')
  })
  it('keeps in-progress work separate from the next future appointment, and ended work in follow-up', () => {
    expect(appointmentReadState(booking, new Date('2026-10-08T22:30:00Z')).category).toBe('in_progress')
    expect(appointmentReadState(booking, new Date('2026-10-08T23:00:00Z')).category).toBe('follow_up')
    const data = buildAppointmentDashboardData({ appointments: [booking], now: new Date('2026-10-08T22:40:00Z') })
    expect(data.nextAppointment).toBeNull()
    expect(data.groups.find((group) => group.label === 'Today').appointments).toHaveLength(1)
  })
  it('groups SAST midnight identically using split date fields or stored UTC instants', () => {
    const split = { ...booking, appointmentId: 'split', dateTime: null, endDateTime: null, date: '2026-10-09', startTime: '00:30', endTime: '01:00' }
    const profile = getPrincipalAgentDetailCommandCentre({ agent, appointments: [split], now })
    const dashboard = buildAppointmentDashboardData({ appointments: [split], now })
    const summary = buildAppointmentsDashboardSummary([split], { now })
    expect(profile.calendarSummary.todayItems[0].dateTime).toBe('2026-10-08T22:30:00.000Z')
    expect(dashboard.calendarStrip.appointmentsToday).toBe(1)
    expect(summary.today).toHaveLength(1)
  })
  it('does not call an invalid schedule upcoming', () => {
    expect(appointmentReadState({ ...booking, dateTime: 'invalid', endDateTime: null }, now).category).toBe('follow_up')
  })
  it('displays a named-zone legacy clock on the same SAST day in every reader', () => {
    const row = { ...booking, dateTime: null, endDateTime: null, date: '2026-10-08', startTime: '23:30', endTime: '23:50', timezone: 'America/New_York' }
    const dashboard = buildAppointmentDashboardData({ appointments: [row], now })
    const profile = getPrincipalAgentDetailCommandCentre({ agent, appointments: [row], now })
    expect(dashboard.nextAppointment.dateTime).toBe('2026-10-09T03:30:00.000Z')
    expect(dashboard.nextAppointment.timeLabel).toBe('05:30')
    expect(profile.calendarSummary.todayItems[0].dateTime).toBe(dashboard.nextAppointment.dateTime)
    expect(buildAppointmentsDashboardSummary([row], { now }).today).toHaveLength(1)
  })
  it('interprets a legacy timestamp without an offset in its named zone, not the computer timezone', () => {
    const row = { ...booking, dateTime: '2026-10-08T23:30', endDateTime: '2026-10-08T23:50' }
    const clock = new Date('2026-10-08T20:00Z')
    expect(buildAppointmentsDashboardSummary([row], { now: clock }).today).toHaveLength(1)
    expect(buildAppointmentDashboardData({ appointments: [row], now: clock }).nextAppointment.dateTime).toBe('2026-10-08T21:30:00.000Z')
  })
})

describe('appointment identity scope', () => {
  for (const identity of [{ createdBy: 'account' }, { assigned_agent_id: 'account' }, { scheduling_owner_user_id: 'account' }, { participants: [{ user_id: 'account' }] }, { participants: [{ email: 'AGENT@EXAMPLE.TEST' }] }]) {
    it(`recognises ${JSON.stringify(identity)} without a display-name match`, () => {
      expect(appointmentMatchesAgent({ ...booking, participants: [], ...identity }, agent)).toBe(true)
    })
  }
  it('excludes revoked attendees from profile and dashboard even on historical rows', () => {
    const revoked = { ...booking, participants: [{ userId: 'account', email: agent.email, rsvpRevokedAt: now.toISOString() }] }
    expect(appointmentMatchesAgent(revoked, agent)).toBe(false)
    expect(getPrincipalAgentDetailCommandCentre({ agent, appointments: [revoked], now }).calendarSummary.upcomingItems).toEqual([])
    expect(buildAppointmentDashboardData({ module: 'agent', userId: 'account', appointments: [revoked], now }).appointments).toEqual([])
  })
  it('preserves independent creator access after attendance removal', () => {
    expect(appointmentMatchesAgent({ ...booking, created_by: 'account', participants: [{ user_id: 'account', rsvp_revoked_at: now.toISOString() }] }, agent)).toBe(true)
  })
  it('does not associate appointments by the agent display name or the appointment ID', () => {
    expect(appointmentMatchesAgent({ ...booking, appointmentId: 'account', id: 'account', assignedAgentName: 'Same Name', participants: [{ name: 'Same Name' }] }, agent)).toBe(false)
  })
})
