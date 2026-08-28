import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const agencySource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const headerSource = await readFile(new URL('../src/components/HeaderBar.jsx', import.meta.url), 'utf8')

test('route lead snapshots retain object identity between unrelated renders', () => {
  const snapshotStart = agencySource.indexOf('const routeLeadSnapshotLead = useMemo(() => {')
  const selectedLeadStart = agencySource.indexOf('const selectedLeadRecord =', snapshotStart)
  assert.ok(snapshotStart > 0, 'route lead snapshot must be memoized')
  assert.ok(selectedLeadStart > snapshotStart, 'selected lead should follow the memoized route snapshot')
  const snapshotSource = agencySource.slice(snapshotStart, selectedLeadStart)
  assert.match(snapshotSource, /routeLeadHydrationStatus/)
  assert.doesNotMatch(snapshotSource, /\}\)\(\)/, 'route snapshot must not use a render-time IIFE')
})

test('offer loading is keyed by query values rather than object and array identities', () => {
  const queryStart = agencySource.indexOf('const selectedLeadOfferQueryKey = JSON.stringify({')
  const summaryStart = agencySource.indexOf('const selectedLeadOfferSummary = useMemo', queryStart)
  assert.ok(queryStart > 0 && summaryStart > queryStart)
  const offerSource = agencySource.slice(queryStart, summaryStart)
  assert.match(offerSource, /const selectedLeadOfferQuery = useMemo\(/)
  assert.match(offerSource, /\[selectedLeadOfferQueryKey\]/)
  assert.match(offerSource, /listCanonicalOffersForLead\(\{/)
  assert.match(offerSource, /listOfferPortalSessions\(\{/)

  const dependencyStart = offerSource.lastIndexOf('  }, [')
  const dependencySource = offerSource.slice(dependencyStart)
  assert.match(dependencySource, /selectedLeadOfferQuery/)
  assert.match(dependencySource, /selectedLeadOffersRefreshTick/)
  assert.doesNotMatch(dependencySource, /selectedLeadAppointments|selectedLeadContact|selectedLead\?\./)
})

test('developer access uses canonical profile columns without failing legacy name probes', () => {
  const functionStart = apiSource.indexOf('export async function fetchDeveloperAccessOptions()')
  const functionEnd = apiSource.indexOf('\nexport async function ', functionStart + 1)
  assert.ok(functionStart > 0 && functionEnd > functionStart)
  const functionSource = apiSource.slice(functionStart, functionEnd)
  assert.match(functionSource, /select\('id, email, full_name, first_name, last_name, company_name, role'\)/)
  assert.match(functionSource, /row\?\.company_name/)
  assert.doesNotMatch(functionSource, /select\([^\n]*\bname\b/)
  assert.equal((functionSource.match(/\.from\('profiles'\)/g) || []).length, 1)
})

test('notification polling pauses in hidden tabs and does not rerun heavy automation', () => {
  assert.match(headerSource, /const NOTIFICATION_POLL_INTERVAL_MS = 120_000/)
  assert.match(headerSource, /document\.visibilityState === 'hidden'/)
  assert.match(headerSource, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/)
  assert.match(headerSource, /refreshNotifications\(\{ runReminderAutomation: true \}\)/)

  const notificationStart = apiSource.indexOf('export async function fetchMyNotifications')
  const notificationEnd = apiSource.indexOf('\nexport async function ', notificationStart + 1)
  const notificationSource = apiSource.slice(notificationStart, notificationEnd)
  assert.match(notificationSource, /runReminderAutomation = false/)
  assert.match(notificationSource, /runReminderAutomation && claimOverdueReminderAutomationRun/)
  assert.match(apiSource, /sessionStorage\.setItem\(key, 'claimed'\)/)
})
