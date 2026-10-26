// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { claimMobileReward, DEFAULT_MOBILE_SOUND, getMobileMomentum, mobileSoundAllowed, readMobileSound, saveMobileSound, sastProgressDay, unlockMobileAudio, playMobileFeedback } from '../mobileMomentumService.js'

it('uses SAST midnight for daily progress and deduplicates saved events per user and organisation', () => {
  const now = new Date('2026-10-20T21:59:00Z')
  expect(sastProgressDay(now)).toBe('2026-10-20')
  expect(sastProgressDay('2026-10-20T22:00:00Z')).toBe('2026-10-21')
  expect(claimMobileReward('org:user-one', 'task', 'same', now)).toBe(true)
  expect(claimMobileReward('org:user-one', 'task', 'same', now)).toBe(false)
  expect(claimMobileReward('other-org:user-one', 'task', 'same', now)).toBe(true)
  expect(claimMobileReward('org:user-two', 'task', 'same', now)).toBe(true)
  expect(claimMobileReward('org:user-one', 'task', 'same', new Date('2026-10-20T22:01:00Z'))).toBe(true)
  expect(claimMobileReward('', 'task', 'same', now)).toBe(false)
})

it('keeps preferences opt-in, validates saved times and respects overnight and same-day quiet hours', () => {
  expect(readMobileSound('fresh')).toEqual(DEFAULT_MOBILE_SOUND)
  const settings = { ...DEFAULT_MOBILE_SOUND, enabled: true }
  expect(mobileSoundAllowed(settings, '2026-10-20T17:59:00Z')).toBe(true)
  expect(mobileSoundAllowed(settings, '2026-10-20T18:00:00Z')).toBe(false)
  expect(mobileSoundAllowed(settings, '2026-10-21T05:59:00Z')).toBe(false)
  expect(mobileSoundAllowed(settings, '2026-10-21T06:00:00Z')).toBe(true)
  expect(mobileSoundAllowed({ ...settings, enabled: false }, '2026-10-20T10:00:00Z')).toBe(false)
  expect(mobileSoundAllowed({ ...settings, quietHours: false }, '2026-10-20T20:00:00Z')).toBe(true)
  expect(mobileSoundAllowed({ ...settings, start: '10:00', end: '12:00' }, '2026-10-20T09:00:00Z')).toBe(false)
  expect(mobileSoundAllowed({ ...settings, start: '10:00', end: '10:00' }, '2026-10-20T09:00:00Z')).toBe(false)
  saveMobileSound('preferences', { ...settings, start: 'not-time' })
  expect(readMobileSound('preferences')).toEqual(settings)
})

it('keeps progress accurate after undo, contact saves and new arrivals without double-counting contacts', () => {
  const today = { taskChecklist: [{ id: 'one', completed: true }, { id: 'two', completed: false }] }
  const options = { today, contactedLeadIds: ['contacted'], leads: [{ leadId: 'pending', leadCategory: 'buyer' }, { leadId: 'seller', leadCategory: 'seller' }] }
  expect(getMobileMomentum(options)).toEqual({ totalTasks: 2, doneTasks: 1, overdueTasks: 0, contacted: 1, total: 4, percent: 50 })
  expect(getMobileMomentum({ ...options, taskChanges: { one: { id: 'one', completed: false } } }).percent).toBe(25)
  expect(getMobileMomentum({ ...options, contactChanges: ['contacted', 'pending'] }).percent).toBe(75)
  expect(getMobileMomentum({ today: { taskChecklist: [] } }).percent).toBe(0)
})

it('survives malformed or unavailable storage without breaking a confirmed save', () => {
  window.localStorage.setItem('arch9:mobile-rewards:broken', '{bad json')
  expect(claimMobileReward('broken', 'task', 'one')).toBe(true)
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  expect(claimMobileReward('no-storage', 'task', 'one')).toBe(true)
  expect(claimMobileReward('no-storage', 'task', 'one')).toBe(false)
  failure.mockRestore()
})

it('synthesizes the original three-note chime only when audio is unlocked, visible and allowed', async () => {
  const oscillators = []
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const settings = { ...DEFAULT_MOBILE_SOUND, enabled: true, quietHours: false }
  expect(playMobileFeedback('lead', settings)).toBe(false)
  vi.stubGlobal('AudioContext', class {
    state = 'running'
    currentTime = 0
    destination = {}
    createOscillator() {
      const oscillator = { frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      oscillators.push(oscillator)
      return oscillator
    }
    createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
  })
  expect(await unlockMobileAudio()).toBe(true)
  expect(playMobileFeedback('lead', { ...settings, enabled: false })).toBe(false)
  visibility.mockReturnValue('hidden')
  expect(playMobileFeedback('lead', settings)).toBe(false)
  visibility.mockReturnValue('visible')
  expect(playMobileFeedback('lead', settings)).toBe(true)
  expect(oscillators).toHaveLength(3)
  expect(oscillators.map(oscillator => oscillator.frequency.setValueAtTime.mock.calls[0][0])).toEqual([659.25, 880, 1108.73])
  expect(playMobileFeedback('task', settings)).toBe(true)
  expect(oscillators).toHaveLength(4)
  visibility.mockRestore()
  vi.unstubAllGlobals()
})

it('separates overdue work from today’s progress, including after a saved completion', () => {
  const today = { taskChecklist: [{ id: 'old', dueOnToday: false }, { id: 'today', dueOnToday: true }] }
  const model = getMobileMomentum({ today, taskChanges: { old: { id: 'old', dueOnToday: false, completed: true } } })
  expect(model).toMatchObject({ totalTasks: 1, doneTasks: 0, overdueTasks: 0, percent: 0 })
  expect(getMobileMomentum({ today })).toMatchObject({ totalTasks: 1, overdueTasks: 1 })
})
