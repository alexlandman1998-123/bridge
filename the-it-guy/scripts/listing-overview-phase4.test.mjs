import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildSellerEmailDeliveryOverview,
  buildSellerFicaOverview,
  buildSellerPortalSecurityOverview,
  resolveSellerLastContact,
} from '../src/services/listings/listingSellerOverviewModel.js'

assert.deepEqual(
  buildSellerFicaOverview({ documents: [{ status: 'uploaded' }] }),
  { label: 'Awaiting review', status: 'under_review', complete: false, needsReview: true },
  'An uploaded document must not be reported as verified FICA.',
)
assert.equal(buildSellerFicaOverview({ documents: [{ status: 'approved' }, { status: 'verified' }] }).complete, true)
assert.equal(buildSellerFicaOverview({ documents: [{ status: 'approved' }, { status: 'missing' }] }).label, 'Outstanding')

const inactiveSecurity = buildSellerPortalSecurityOverview({ portalToken: '', portalStatus: 'not_activated' })
assert.equal(inactiveSecurity.label, 'Not active')
assert.equal(inactiveSecurity.failures24h, null, 'Missing diagnostics must not be displayed as zero failures.')

const unavailableSecurity = buildSellerPortalSecurityOverview({ portalToken: 'seller-token', portalStatus: 'invitation_sent' })
assert.equal(unavailableSecurity.label, 'Unavailable')
assert.equal(unavailableSecurity.status, 'attention')
assert.equal(buildSellerPortalSecurityOverview({ portalToken: 'seller-token', diagnostics: {} }).label, 'Unavailable')

const healthySecurity = buildSellerPortalSecurityOverview({
  portalToken: 'seller-token',
  portalStatus: 'activated',
  diagnostics: { health: 'healthy', authentication: { failedEvents24h: 0 }, openAlerts: [] },
})
assert.equal(healthySecurity.status, 'complete')

assert.deepEqual(
  buildSellerEmailDeliveryOverview({ rows: [] }),
  { label: 'No delivery recorded', status: 'pending', hasEvidence: false },
  'An empty delivery history must not be reported as healthy.',
)
assert.equal(buildSellerEmailDeliveryOverview({ rows: [{ status: 'failed' }] }).status, 'attention')
assert.equal(buildSellerEmailDeliveryOverview({ rows: [{ status: 'delivered' }, { status: 'failed' }] }).status, 'complete')

assert.equal(
  resolveSellerLastContact(['2026-09-20T10:00:00Z', '2026-09-23T12:00:00Z', 'invalid']),
  '2026-09-23T12:00:00Z',
)

const pageSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const activationSource = await readFile(new URL('../src/services/sellerPortalActivationService.js', import.meta.url), 'utf8')
const overviewStart = pageSource.indexOf("{sellerWorkspaceTab === 'overview'")
const leadsStart = pageSource.indexOf("{sellerWorkspaceTab === 'leads'")
const overview = pageSource.slice(overviewStart, leadsStart)

assert.match(pageSource, /buildSellerFicaOverview\(/)
assert.match(overview, /Activate Portal/)
assert.match(overview, /overviewSellerSnapshot\.ficaStatus/)
assert.doesNotMatch(overview, /Review FICA|Portal security|Communication|No recorded seller contact/)
assert.doesNotMatch(overview, /sellerPortalSecurityOverview|sellerEmailDeliveryOverview/)

const passwordCheck = activationSource.indexOf('accessState?.passwordSet || onboarding.activatedAt')
const staleStatusReturn = activationSource.indexOf('if (rawStatus && Object.values(SELLER_PORTAL_STATUSES).includes(rawStatus)) return rawStatus')
assert.ok(passwordCheck > -1 && staleStatusReturn > passwordCheck, 'Verified portal activation must override a stale stored invitation status.')

console.log('Listing Overview Phase 4 seller reliability contract passed')
