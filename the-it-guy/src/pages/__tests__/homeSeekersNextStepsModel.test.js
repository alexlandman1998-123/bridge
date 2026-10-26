// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { nextStepsCalendarFile, nextStepsErrors, previewFounderSlots, previewSessions, qualifierOutcome, readNextStepsReview, saveNextStepsReview } from '../homeSeekersNextStepsModel'
const now = new Date('2026-10-21T10:00:00Z')
const contact = { firstName: 'Local', surname: 'Reviewer', email: 'review@example.test', mobile: '+27821234567', area: 'Sandton', consent: true }
const details = { ...contact, ffc: 'Yes', sales: '5', value: '0', split: '70/30' }
beforeEach(() => localStorage.clear())
it('uses OR thresholds at the exact boundaries, with valid FFC taking precedence', () => {
  expect(qualifierOutcome({ ffc: 'Yes', sales: 5, value: 0 })).toBe('A')
  expect(qualifierOutcome({ ffc: 'Yes', sales: 0, value: 6000000 })).toBe('A')
  expect(qualifierOutcome({ ffc: 'Yes', sales: 4, value: 5999999.99 })).toBe('B')
  for (const ffc of ['No', 'Application in progress']) expect(qualifierOutcome({ ffc, sales: 20, value: 50000000 })).toBe('C')
})
it('rejects blanks, malformed and negative values instead of interpreting blanks as zero', () => {
  expect(nextStepsErrors(details)).toEqual({})
  expect(nextStepsErrors({ ...details, firstName: ' ', mobile: 'abc123456789', sales: '', value: '-1', consent: false })).toMatchObject({ firstName: expect.any(String), mobile: expect.any(String), sales: expect.any(String), value: expect.any(String), consent: expect.any(String) })
  expect(nextStepsErrors({ ...details, sales: '4.5' })).toHaveProperty('sales')
})
it('retains all outcomes and source, deduplicates retries and keeps personal details out of events', () => {
  for (const [index, ffc] of ['Yes', 'No', 'Application in progress'].entries()) saveNextStepsReview('qualifier', { ...details, ffc }, { id: `q-${index}`, now })
  saveNextStepsReview('qualifier', { ...details, sales: '2', value: '1000000' }, { id: 'under', now })
  saveNextStepsReview('qualifier', details, { id: 'q-0', now })
  const state = readNextStepsReview()
  expect(state.records.map(row => row.outcome)).toEqual(['A', 'C', 'C', 'B'])
  expect(state.events.map(row => row.event)).toEqual(['qualifier_passed', 'qualifier_failed', 'qualifier_failed', 'qualifier_failed'])
  expect(state.records.every(row => row.source === 'homeseeker_join_next_steps')).toBe(true)
  expect(JSON.stringify(state.events)).not.toContain(contact.email)
})
it('offers eight slots per week and rejects unqualified, expired and duplicate bookings', () => {
  const slots = previewFounderSlots(1, now)
  expect(slots).toHaveLength(8)
  expect(new Set(slots.map(slot => slot.start.slice(0, 10))).size).toBe(2)
  expect(() => saveNextStepsReview('oneonone', { qualifierId: 'absent', start: slots[0].id }, { now })).toThrow('qualifier')
  saveNextStepsReview('qualifier', details, { id: 'qualified', now })
  saveNextStepsReview('oneonone', { qualifierId: 'qualified', start: slots[0].id }, { now })
  saveNextStepsReview('qualifier', details, { id: 'another', now })
  expect(() => saveNextStepsReview('oneonone', { qualifierId: 'another', start: slots[0].id }, { now })).toThrow('taken')
  expect(() => saveNextStepsReview('oneonone', { qualifierId: 'qualified', start: slots[1].id }, { now })).toThrow('already')
  expect(() => saveNextStepsReview('oneonone', { qualifierId: 'another', start: '2020-01-01T10:00:00Z' }, { now })).toThrow('no longer available')
})
it('offers four future Thursdays in SAST and rolls past a session that has started', () => {
  expect(previewSessions(now).map(item => item.start)).toEqual(['2026-10-22T16:00:00.000Z', '2026-10-29T16:00:00.000Z', '2026-11-05T16:00:00.000Z', '2026-11-12T16:00:00.000Z'])
  expect(previewSessions(new Date('2026-10-22T16:00:00Z'))[0].start).toBe('2026-10-29T16:00:00.000Z')
})
it('records session RSVP distinctly and rejects expired session selections', () => {
  const session = { ...contact, salesBand: '0 to 4', session: previewSessions(now)[0].id, question: 'Fees?' }
  saveNextStepsReview('session', session, { now })
  expect(readNextStepsReview().records[0]).toMatchObject({ outcome: 'registered', details: session })
  expect(readNextStepsReview().events[0].event).toBe('session_rsvp')
  expect(() => saveNextStepsReview('session', { ...session, session: '2020-01-01' }, { now })).toThrow('no longer available')
})
it('fails explicitly when local persistence is unavailable', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable') } }
  expect(() => saveNextStepsReview('qualifier', details, { storage, now })).toThrow('Storage unavailable')
})
it('creates a 30-minute UTC invitation clearly labelled as a preview', () => {
  const file = decodeURIComponent(nextStepsCalendarFile('2026-10-22T16:00:00Z', 'Home Seekers', 'receipt'))
  expect(file).toContain('DTSTART:20261022T160000Z\r\nDTEND:20261022T163000Z')
  expect(file).toContain('No real meeting has been booked.')
})
