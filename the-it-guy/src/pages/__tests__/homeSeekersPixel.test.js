// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HOME_SEEKERS_META_PIXEL_ID, homeSeekersMeasurementConsent, pauseHomeSeekersPixel, setHomeSeekersMeasurementConsent, trackHomeSeekersPage, trackHomeSeekersRecruitmentSuccess } from '../homeSeekersPixel'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { homeSeekersRecruitmentOrganisationId as organisationId } from '../recruitment/recruitmentDocumentsModel'

const receipt = '11111111-2222-4333-8444-555555555555'
const owner = '66666666-7777-4888-8999-000000000000'
const endpoint = '/api/home-seekers/recruitment'
const applicantEndpoint = '/api/recruitment/applicant-profile'
const contact = { firstName: 'Fixture', lastName: 'Applicant', email: 'private@example.test', phone: '0821234567', privacyAccepted: true }
let browser
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
}
function events() { return browser.fbq.mock.calls.filter(args => args[0] === 'trackSingle') }
function successful(result) { return async () => ({ ok: true, json: async () => result }) }
function pack(complete = true) {
  return { emailVerification: 'verified', documentsComplete: complete, contact, documents: [{ path: `${organisationId}/${owner}/identity.pdf`, name: 'private-id.pdf' }] }
}
beforeEach(() => {
  browser = { location: new URL('https://homeseeker.co.za/join'), localStorage: storage(), sessionStorage: storage(), fbq: vi.fn(), CustomEvent: window.CustomEvent, dispatchEvent: vi.fn() }
  browser.self = browser; browser.top = browser
  vi.stubGlobal('window', browser)
})
afterEach(() => { vi.unstubAllGlobals(); document.getElementById('hs-recruitment-meta')?.remove() })

it('loads no third-party script or events before consent or after a decline', () => {
  expect(homeSeekersMeasurementConsent()).toBeNull()
  trackHomeSeekersPage('join')
  setHomeSeekersMeasurementConsent(false)
  trackHomeSeekersPage('join')
  expect(browser.fbq).not.toHaveBeenCalled()
  expect(document.getElementById('hs-recruitment-meta')).toBeNull()
})

it('initializes once, tracks each page once, and sends ViewContent only on Join', () => {
  setHomeSeekersMeasurementConsent(true)
  trackHomeSeekersPage('join'); trackHomeSeekersPage('join')
  expect(events().map(args => args[2])).toEqual(['PageView', 'ViewContent'])
  expect(events()[1]).toEqual(['trackSingle', HOME_SEEKERS_META_PIXEL_ID, 'ViewContent', { content_name: 'Agent Join Page' }])
  expect(browser.fbq.mock.calls.filter(args => args[0] === 'init')).toHaveLength(1)
  expect(browser.fbq).toHaveBeenCalledWith('set', 'autoConfig', false, HOME_SEEKERS_META_PIXEL_ID)
  expect(browser.fbq.disablePushState).toBe(true)
  expect(document.getElementById('hs-recruitment-meta').getAttribute('src')).toBe('https://connect.facebook.net/en_US/fbevents.js')
  browser.location = new URL('https://homeseeker.co.za/selling')
  trackHomeSeekersPage('selling')
  expect(events().map(args => args[2])).toEqual(['PageView', 'ViewContent', 'PageView'])
  setHomeSeekersMeasurementConsent(false)
  trackHomeSeekersPage('declined')
  expect(events()).toHaveLength(3)
  expect(browser.fbq).toHaveBeenCalledWith('consent', 'revoke')
})

it.each([
  'https://home-seekers-website-preview.vercel.app/join', 'http://localhost:4187/join',
  'https://homeseeker.co.za/demo/homeseekers/join', 'https://homeseeker.co.za/join?arch9_preview=1',
  'https://app.arch9.co.za/dashboard', 'https://app.arch9.co.za/agency/recruitment',
])('does not send events from previews or private workspaces: %s', url => {
  browser.location = new URL(url)
  setHomeSeekersMeasurementConsent(true); trackHomeSeekersPage(url)
  expect(events()).toHaveLength(0)
  expect(document.getElementById('hs-recruitment-meta')).toBeNull()
})

it('blocks embedded and internal preview visits', () => {
  setHomeSeekersMeasurementConsent(true)
  browser.top = {}
  trackHomeSeekersPage('embedded')
  browser.top = browser
  browser.location = new URL('https://homeseeker.co.za/join?arch9_preview=1')
  trackHomeSeekersPage('preview')
  browser.location = new URL('https://homeseeker.co.za/join')
  trackHomeSeekersPage('internal')
  expect(events()).toHaveLength(0)
})

it('fires Lead only after an accepted signup, and deduplicates retries', async () => {
  setHomeSeekersMeasurementConsent(true)
  const details = { contact, password: 'FixturePassword123', submissionKey: receipt }
  await expect(recruitmentSignupRequest('signup', details, { endpoint, fetcher: async () => ({ ok: false, status: 503, json: async () => ({ error: 'Try again' }) }) })).rejects.toThrow('Try again')
  expect(events()).toHaveLength(0)
  const fetcher = successful({ accepted: true, accountCreated: true })
  await recruitmentSignupRequest('signup', details, { endpoint, fetcher })
  await recruitmentSignupRequest('signup', details, { endpoint, fetcher })
  expect(events()).toEqual([['trackSingle', HOME_SEEKERS_META_PIXEL_ID, 'Lead', { content_name: 'Agent Application' }]])
  expect(JSON.stringify(events())).not.toContain(contact.email)
  expect(JSON.stringify(events())).not.toContain(receipt)
})

it('counts successful verification once, without counting code requests, failed codes or resumed sessions', async () => {
  setHomeSeekersMeasurementConsent(true)
  const applicant = { emailVerification: 'verified', contactSubmissionKey: receipt, contact }
  const fetcher = successful({ applicant })
  await recruitmentSignupRequest('resume', {}, { endpoint, fetcher })
  await recruitmentSignupRequest('verify_email', {}, { endpoint, fetcher: successful({ applicant: { ...applicant, emailVerification: 'unverified' } }) })
  expect(events()).toHaveLength(0)
  await recruitmentSignupRequest('verify_email', {}, { endpoint, fetcher })
  await recruitmentSignupRequest('verify_email', {}, { endpoint, fetcher })
  expect(events()).toEqual([['trackSingle', HOME_SEEKERS_META_PIXEL_ID, 'CompleteRegistration', { content_name: 'Agent Email Verified' }]])
})

it('counts documents only after the server confirms a complete pack in My Profile', async () => {
  browser.location = new URL('https://app.arch9.co.za/applicant/my-profile')
  setHomeSeekersMeasurementConsent(true)
  const options = { endpoint: applicantEndpoint }
  await recruitmentSignupRequest('prepare_document', {}, { ...options, fetcher: successful({ uploadUrl: 'https://storage.test/upload' }) })
  await recruitmentSignupRequest('commit_document', {}, { ...options, fetcher: successful({ saved: true, applicant: pack(false) }) })
  await recruitmentSignupRequest('commit_document', {}, { ...options, fetcher: successful({ saved: false, applicant: pack() }) })
  expect(events()).toHaveLength(0)
  const fetcher = successful({ saved: true, applicant: pack() })
  await recruitmentSignupRequest('commit_document', {}, { ...options, fetcher })
  await recruitmentSignupRequest('commit_document', {}, { ...options, fetcher })
  await recruitmentSignupRequest('resume', {}, { ...options, fetcher })
  expect(events()).toEqual([['trackSingle', HOME_SEEKERS_META_PIXEL_ID, 'SubmitApplication', { content_name: 'Agent Documents Uploaded' }]])
  expect(JSON.stringify(events())).not.toMatch(/private|\.pdf|storage|66666666/)
})

it('ignores simulated milestones and other agencies even if their data resembles Home Seekers', () => {
  setHomeSeekersMeasurementConsent(true)
  trackHomeSeekersRecruitmentSuccess('verify_email', { applicant: { emailVerification: 'verified', contactSubmissionKey: receipt } }, { endpoint: '/api/public/recruitment-intake' })
  trackHomeSeekersRecruitmentSuccess('signup', { accepted: true, preview: true }, { endpoint, submissionKey: receipt })
  trackHomeSeekersRecruitmentSuccess('commit_document', { saved: true, applicant: { ...pack(), documents: [{ path: `other/${owner}/id.pdf` }] } }, { endpoint: applicantEndpoint })
  expect(events()).toHaveLength(0)
})

it('retains consent and milestone deduplication across reloads', async () => {
  setHomeSeekersMeasurementConsent(true)
  trackHomeSeekersRecruitmentSuccess('signup', { accepted: true }, { endpoint, submissionKey: receipt })
  vi.resetModules()
  const fresh = await import('../homeSeekersPixel')
  expect(fresh.homeSeekersMeasurementConsent()).toBe('granted')
  fresh.trackHomeSeekersRecruitmentSuccess('signup', { accepted: true }, { endpoint, submissionKey: receipt })
  expect(events()).toHaveLength(1)
})

it('keeps successful application requests successful if tracking is blocked or throws', async () => {
  setHomeSeekersMeasurementConsent(true)
  browser.fbq.mockImplementation(() => { throw new Error('Blocked by extension') })
  const details = { contact, password: 'FixturePassword123', submissionKey: receipt }
  await expect(recruitmentSignupRequest('signup', details, { endpoint, fetcher: successful({ accepted: true, accountCreated: true }) })).resolves.toMatchObject({ accepted: true })
})

it('provides the Meta queue before the library loads', () => {
  delete browser.fbq
  setHomeSeekersMeasurementConsent(true); trackHomeSeekersPage('join')
  expect(browser._fbq).toBe(browser.fbq)
  expect(browser.fbq.queue.filter(args => args[0] === 'trackSingle').map(args => args[2])).toEqual(['PageView', 'ViewContent'])
  browser.fbq.callMethod = vi.fn()
  browser.location = new URL('https://homeseeker.co.za/about')
  trackHomeSeekersPage('about')
  expect(browser.fbq.callMethod).toHaveBeenCalledWith('trackSingle', HOME_SEEKERS_META_PIXEL_ID, 'PageView', {})
})

it('honours consent and deduplicates in memory when browser storage is blocked', () => {
  browser.localStorage = browser.sessionStorage = { getItem() { throw Error('Storage blocked') }, setItem() { throw Error('Storage blocked') } }
  setHomeSeekersMeasurementConsent(true)
  trackHomeSeekersRecruitmentSuccess('signup', { accepted: true }, { endpoint, submissionKey: receipt })
  trackHomeSeekersRecruitmentSuccess('signup', { accepted: true }, { endpoint, submissionKey: receipt })
  expect(events()).toHaveLength(1)
})

it('pauses the pixel on leaving the applicant portal and restores the saved choice on return', () => {
  browser.location = new URL('https://app.arch9.co.za/applicant/my-profile')
  setHomeSeekersMeasurementConsent(true); trackHomeSeekersPage('profile')
  pauseHomeSeekersPixel()
  expect(browser.fbq).toHaveBeenLastCalledWith('consent', 'revoke')
  expect(homeSeekersMeasurementConsent()).toBe('granted')
  setHomeSeekersMeasurementConsent(true)
  expect(browser.fbq).toHaveBeenLastCalledWith('consent', 'grant')
})
