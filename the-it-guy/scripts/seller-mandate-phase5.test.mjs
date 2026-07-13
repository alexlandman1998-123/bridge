import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')

const legalWorkspacePage = readFileSync(
  resolve(appRoot, 'src/pages/LegalDocumentWorkspacePage.jsx'),
  'utf8',
)
const clientPortalWorkspaceService = readFileSync(
  resolve(appRoot, 'src/services/clientPortalWorkspaceService.js'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('signed mandate finalization sends the seller notification email', () => {
  assert.match(legalWorkspacePage, /getSignedMandateNotificationContext/)
  assert.match(legalWorkspacePage, /type:\s*'seller_mandate_signed'/)
  assert.match(legalWorkspacePage, /signedDocumentName:\s*sellerNotification\.signedDocumentName/)
  assert.match(legalWorkspacePage, /downloadLink:\s*sellerNotification\.downloadLink/)
  assert.match(legalWorkspacePage, /seller signed mandate notification skipped/)
})

test('signed mandate listing activity is seller-visible and document-routed', () => {
  const activityBlock = legalWorkspacePage.match(
    /await createPrivateListingActivity\(\{[\s\S]*?activityType:\s*'mandate_signed'[\s\S]*?\n\s*\}\)\n/,
  )?.[0] || ''
  assert.match(activityBlock, /activityType:\s*'mandate_signed'/)
  assert.match(activityBlock, /visibility:\s*'client_visible'/)
  assert.match(activityBlock, /actionLabel:\s*'View documents'/)
  assert.match(activityBlock, /actionRoute:\s*'documents'/)
  assert.doesNotMatch(activityBlock, /finalFilePath:/)
  assert.doesNotMatch(activityBlock, /finalFileUrl:/)
})

test('seller portal hydrates listing activity into the standard activity feed', () => {
  assert.match(clientPortalWorkspaceService, /getPrivateListingActivity/)
  assert.match(clientPortalWorkspaceService, /function mapSellerListingActivityEvent/)
  assert.match(clientPortalWorkspaceService, /\.filter\(\(item\) => normalizeValue\(item\?\.visibility \|\| item\?\.metadata\?\.visibility\) === 'client_visible'\)/)
  assert.match(clientPortalWorkspaceService, /visibility\s*=\s*normalizeValue\(activity\?\.visibility \|\| metadata\.visibility\) === 'client_visible'/)
  assert.match(clientPortalWorkspaceService, /events:\s*sellerActivityEvents/)
  assert.match(clientPortalWorkspaceService, /actionLabel:\s*metadata\.actionLabel/)
  assert.match(clientPortalWorkspaceService, /actionRoute:\s*metadata\.actionRoute/)
})

test('package exposes the phase 5 mandate continuity guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase5'],
    'node scripts/seller-mandate-phase5.test.mjs',
  )
})

console.log('seller mandate phase 5 tests passed')
