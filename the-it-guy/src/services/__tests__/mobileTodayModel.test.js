import { describe, expect, it } from 'vitest'
import { buildMobileToday } from '../mobileTodayModel.js'

const now = new Date('2026-10-06T10:00:00Z')
const profile = { id: 'me', email: 'me@example.test' }
const task = (id, dueDate, extra = {}) => ({ taskId: id, title: `Call ${id}`, assignedAgentId: 'me', dueDate, status: 'Pending', ...extra })
const appointment = (id, dateTime, extra = {}) => ({ id, dateTime, status: 'confirmed', statusKey: 'confirmed', typeLabel: 'Property Viewing', ...extra })

describe('mobile Today priorities', () => {
  it('counts due work, excludes closed and other-agent tasks, and prioritises overdue follow-ups', () => {
    const today = buildMobileToday({ now, profile,
      tasks: [task('future', '2026-10-07'), task('due', '2026-10-06'), task('late', '2026-10-05'), task('closed', '2026-10-05', { status: 'Completed' }), task('other', '2026-10-05', { assignedAgentId: 'someone-else' })],
      appointments: [appointment('soon', '2026-10-06T10:30:00Z'), appointment('cancelled', '2026-10-06T11:00:00Z', { status: 'cancelled' })],
      deals: [{ id: 'one', nextAction: 'Review signed OTP', to: '/mobile/transaction/one' }, { id: 'two' }],
    })
    expect(today.counts).toEqual({ appointments: 1, followUps: 2, deals: 1 })
    expect(today.action.id).toBe('task:late')
    expect(today.radar.map((item) => item.id)).toEqual(['appointment:soon', 'task:due'])
    expect(today.items.followUps.map((item) => item.id)).toEqual(['task:late', 'task:due', 'task:future'])
  })

  it('treats date-only follow-ups as due today rather than overdue at midnight', () => {
    const today = buildMobileToday({ now, profile, tasks: [task('today', '2026-10-06')] })
    expect(today.action.status).toBe('Pending')
    expect(today.action.meta).toBe('Today')
    expect(today.counts.followUps).toBe(1)
  })

  it('uses SAST days at UTC midnight boundaries and interprets naive appointment times as SAST', () => {
    const today = buildMobileToday({ now: new Date('2026-10-05T22:30:00Z'), profile,
      tasks: [task('due', '2026-10-06')],
      appointments: [appointment('early', '2026-10-06T01:00:00'), appointment('tomorrow', '2026-10-06T22:30:00Z')],
    })
    expect(today.counts).toEqual({ appointments: 1, followUps: 1, deals: 0 })
    expect(today.action.id).toBe('appointment:early')
    expect(today.action.meta).toBe('Today · 01:00')
  })

  it('allows principals to see team follow-ups but shows no personal tasks without a known identity', () => {
    const tasks = [task('one', '2026-10-05'), task('two', '2026-10-06', { assignedAgentId: 'other' })]
    expect(buildMobileToday({ now, category: 'principal', tasks }).counts.followUps).toBe(2)
    expect(buildMobileToday({ now, tasks }).counts.followUps).toBe(0)
  })

  it('keeps unavailable sources distinct from empty work and never suggests fallback work', () => {
    const today = buildMobileToday({ now, profile, tasks: [task('late', '2026-10-05')], deals: [{ id: 'one', nextAction: 'Fake' }],
      availability: { appointments: false, followUps: false, deals: false },
    })
    expect(today.counts).toEqual({ appointments: null, followUps: null, deals: null })
    expect(today.action).toBeNull()
    expect(today.radar).toEqual([])
  })

  it('only proposes recorded deal actions, ahead of future follow-ups, with the correct destination', () => {
    const today = buildMobileToday({ now, profile, tasks: [task('future', '2026-10-07')],
      deals: [{ id: 'no-action', title: 'No action' }, { id: 'action', nextAction: 'Send the signed OTP', title: '18 Oak Avenue', to: '/mobile/transaction/action' }],
    })
    expect(today.action).toMatchObject({ title: 'Send the signed OTP', body: '18 Oak Avenue', to: '/mobile/transaction/action' })
    expect(today.counts.deals).toBe(1)
  })

  it('does not invent work on a clear day or show historical appointments as upcoming', () => {
    const today = buildMobileToday({ now, appointments: [appointment('old', '2026-09-01T10:00:00Z'), appointment('invalid', 'invalid')] })
    expect(today.action).toBeNull()
    expect(today.counts).toEqual({ appointments: 0, followUps: 0, deals: 0 })
  })
})
