import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const portalSource = readFileSync(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')

function sourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start + startNeedle.length)
  assert.notEqual(end, -1, `Missing end marker after ${startNeedle}: ${endNeedle}`)
  return source.slice(start, end)
}

test('token actions resolve the canonical client portal profile before enforcing development-only modules', () => {
  assert.match(apiSource, /import \{ resolveClientPortalProfile \} from '\.\.\/core\/clientPortal\/clientPortalProfile\.js'/)
  assert.match(apiSource, /async function resolveClientPortalProfileForTokenAction/)
  assert.match(apiSource, /async function assertClientPortalTokenSectionEnabled/)
  assert.match(apiSource, /CLIENT_PORTAL_PROFILE_ACTION_TRANSACTION_SELECT/)
  assert.match(apiSource, /transaction_type, sale_route, sale_channel, seller_party_type, lead_owner, ownership_model, source_agency_org_id/)
})

test('handover token saves are blocked when the portal profile disables handover', () => {
  const block = sourceBetween(
    apiSource,
    'async function upsertTransactionHandoverByToken',
    'export async function saveClientHandoverDraft',
  )

  assert.match(block, /assertClientPortalTokenSectionEnabled\(\{[\s\S]*sectionKey: 'handover'/)
  assert.match(block, /Handover is not available for this portal\./)
})

test('snag, alteration, and review token submissions are blocked by section profile gates', () => {
  const issueBlock = sourceBetween(apiSource, 'export async function submitClientIssue', 'export async function submitAlterationRequest')
  const alterationBlock = sourceBetween(apiSource, 'export async function submitAlterationRequest', 'async function uploadAlterationAsset')
  const reviewBlock = sourceBetween(apiSource, 'export async function submitServiceReview', 'export async function fetchExternalTransactionPortal')

  assert.match(issueBlock, /assertClientPortalTokenSectionEnabled\(\{[\s\S]*sectionKey: 'snags'/)
  assert.match(issueBlock, /Issue reporting is not available for this portal\./)
  assert.match(alterationBlock, /assertClientPortalTokenSectionEnabled\(\{[\s\S]*sectionKey: 'alterations'/)
  assert.match(alterationBlock, /Alteration requests are not available for this portal\./)
  assert.match(reviewBlock, /assertClientPortalTokenSectionEnabled\(\{[\s\S]*sectionKey: 'review'/)
  assert.match(reviewBlock, /Service reviews are not available for this portal\./)
})

test('portal form handlers refuse disabled sections before saving or submitting', () => {
  const issueBlock = sourceBetween(portalSource, 'async function handleSubmitIssue', 'async function handleSubmitAlteration')
  const alterationBlock = sourceBetween(portalSource, 'async function handleSubmitAlteration', 'async function handleSubmitReview')
  const reviewBlock = sourceBetween(portalSource, 'async function handleSubmitReview', 'async function handleSubmitPortalComment')

  assert.match(portalSource, /const ensurePortalSectionEnabled = \(sectionKey\) =>/)
  assert.match(issueBlock, /if \(!ensurePortalSectionEnabled\('snags'\)\) return/)
  assert.match(alterationBlock, /if \(!ensurePortalSectionEnabled\('alterations'\)\) return/)
  assert.match(reviewBlock, /if \(!ensurePortalSectionEnabled\('review'\)\) return/)
})

test('activity shortcuts cannot navigate into profile-disabled portal sections', () => {
  const block = sourceBetween(portalSource, 'function handleActivityAction', 'async function handleRespondToAppointment')

  assert.match(block, /normalizePortalWorkspaceSection\(route\)/)
  assert.match(block, /if \(!ensurePortalSectionEnabled\(sectionKey\)\) return/)
  assert.match(block, /navigate\(getPortalWorkspacePath\(token, workspaceNavigationScope, route\)\)/)
})
