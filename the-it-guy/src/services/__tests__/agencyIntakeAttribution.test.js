// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { readAgencyIntakeAttribution, submitAgencyPublicIntake } from '../agencyPublicIntakeService'
afterEach(() => { window.sessionStorage.clear(); vi.unstubAllGlobals() })

test('untagged form navigation retains campaign tracking while keeping the current listing selection', () => {
  const first = readAgencyIntakeAttribution(new URLSearchParams('utm_source=facebook&utm_campaign=lyle-launch&listing=old'), 'revo')
  const converted = readAgencyIntakeAttribution(new URLSearchParams('listing=the-lyle&listingTitle=The+Lyle'), 'revo')
  expect(converted.utm).toEqual(first.utm)
  expect(converted.context.clientAttribution.firstTouch).toEqual(first.context.clientAttribution.firstTouch)
  expect(converted.selectedListings[0].slug).toBe('the-lyle')
  expect(readAgencyIntakeAttribution(new URLSearchParams(), 'other-agency').utm).toEqual({})
})
test('actual enquiry submission forwards first/latest evidence through the existing endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) })
  vi.stubGlobal('fetch', fetch)
  const attribution = readAgencyIntakeAttribution(new URLSearchParams('utm_source=email&utm_campaign=lyle-launch'), 'revo')
  await submitAgencyPublicIntake({ slug: 'revo', idempotencyKey: 'reviewable-test-command', payload: { intent: 'buy', utm: attribution.utm, context: attribution.context } })
  const [url, options] = fetch.mock.calls[0]
  expect(url).toBe('/api/public/agency-intake?slug=revo')
  expect(options.method).toBe('POST')
  const body = JSON.parse(options.body)
  expect(body.context.clientAttribution.firstTouch.utm.utm_campaign).toBe('lyle-launch')
  expect(body.context.clientAttribution.lastTouch.utm.utm_source).toBe('email')
  expect(body.utm).toEqual(attribution.utm)
})
