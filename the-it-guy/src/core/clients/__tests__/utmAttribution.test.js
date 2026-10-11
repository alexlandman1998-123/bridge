import { expect, test } from 'vitest'
import { attributionHost, captureAgencyIntakeAttribution, normalizeAttributionTouch, normalizeUtmAttribution } from '../utmAttribution'

const memory = () => {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), values }
}
const at = Date.parse('2026-10-09T10:00:00Z')
const capture = (query, agency, storage, now = at) => captureAgencyIntakeAttribution(new URLSearchParams(query), agency, { storage, now, pageUrl: 'https://thelyle.co.za/?token=secret', referrer: 'https://facebook.com/?email=secret' })

test('normalizes camel/snake tags, ignores objects and unknown data, and bounds strings', () => {
  expect(normalizeUtmAttribution({ utmSource: ' Facebook ', utm_medium: '\npaid_social', utmCampaign: 'x'.repeat(500), utm_content: { password: 'secret' }, utmTerm: 2, token: 'secret' })).toEqual({ utm_source: 'Facebook', utm_medium: 'paid_social', utm_campaign: 'x'.repeat(160) })
  expect(normalizeUtmAttribution(['bad'])).toEqual({})
})
test('preserves first source and updates the latest tagged source within an agency session', () => {
  const storage = memory()
  capture('utm_source=facebook&utm_campaign=launch-a', 'revo', storage)
  const changed = capture('utm_source=google&utm_medium=cpc&utm_campaign=launch-b', 'revo', storage, at + 60000)
  expect(changed.firstTouch.utm.utm_campaign).toBe('launch-a')
  expect(changed.lastTouch.utm.utm_campaign).toBe('launch-b')
  const untagged = capture('', 'revo', storage, at + 120000)
  expect(untagged).toEqual(changed)
  expect(capture('utm_source=google&utm_medium=cpc&utm_campaign=launch-b', 'revo', storage, at + 180000)).toEqual(changed)
})
test('separate agencies, expired sessions and corrupt evidence cannot inherit campaign tracking', () => {
  const storage = memory()
  capture('utm_source=facebook', 'revo', storage)
  expect(capture('', 'kingstons', storage).lastTouch.utm).toEqual({})
  expect(capture('', 'revo', storage, at + 25 * 3600000).firstTouch.utm).toEqual({})
  storage.setItem('arch9:agency-intake-attribution:v1:revo', 'bad json')
  expect(capture('utm_campaign=new', 'revo', storage).firstTouch.utm.utm_campaign).toBe('new')
})
test('storage failures are optional and tracking contains no URL, credential or identity', () => {
  const blocked = { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Quota') } }
  const result = capture('utm_source=qr&token=secret&clientId=forged', 'revo', blocked)
  expect(result.firstTouch.landingHost).toBe('thelyle.co.za')
  expect(result.firstTouch.referrerHost).toBe('facebook.com')
  expect(JSON.stringify(result)).not.toMatch(/secret|forged|\?token|clientId/)
  expect(attributionHost('https://user:password@example.test/?token=secret')).toBe('')
  expect(attributionHost('javascript:alert(1)')).toBe('')
})
test('first untagged visit stays recorded when a later campaign arrives', () => {
  const storage = memory()
  capture('', 'revo', storage)
  const result = capture('utm_source=email&utm_campaign=launch', 'revo', storage, at + 60000)
  expect(result.firstTouch.sourceChannel).toBe('website')
  expect(result.firstTouch.utm).toEqual({})
  expect(result.lastTouch.utm.utm_source).toBe('email')
  expect(normalizeAttributionTouch({ capturedAt: 'invalid', utm: { utmSource: 'google' }, email: 'secret' })).toEqual({ utm: { utm_source: 'google' }, sourceChannel: '', campaignCode: '', landingHost: '', referrerHost: '' })
})
