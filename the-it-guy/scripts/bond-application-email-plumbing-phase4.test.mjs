import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()

const [notificationSource, emailHandlerSource, catalogSource, phase4Doc] = await Promise.all([
  readFile(resolve(root, 'src/services/bondIntakeNotificationService.js'), 'utf8'),
  readFile(resolve(root, '../supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts'), 'utf8'),
  readFile(resolve(root, 'src/services/clientCommunicationJourneyCatalog.js'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-4-buyer-email-contract.md'), 'utf8'),
])

const copyStart = notificationSource.indexOf(
  '[BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO]',
  notificationSource.indexOf('function buildEventCopy'),
)
const buyerIntroCopy = notificationSource.slice(
  copyStart,
  notificationSource.indexOf('},', copyStart) + 2,
)
assert.match(buyerIntroCopy, /title:\s*'View your bond progress'/)
assert.match(buyerIntroCopy, /subject:\s*'View your bond progress'/)
assert.match(buyerIntroCopy, /buyerSubject:\s*'View your bond progress'/)
assert.match(buyerIntroCopy, /can view bond progress/)
assert.match(buyerIntroCopy, /assigned bond contact/)
assert.doesNotMatch(buyerIntroCopy, /Complete the online application/)
assert.doesNotMatch(emailHandlerSource, /Complete your online bond application/)

assert.match(notificationSource, /bond_originator_buyer_intro/)
assert.match(notificationSource, /metadata\.applicationLink|applicationLink:/)

assert.match(emailHandlerSource, /"View your bond progress"/)
assert.match(emailHandlerSource, /renderBridgeCta\("View bond progress",\s*portalLink\)/)
assert.match(emailHandlerSource, /Open the buyer portal to view bond progress/)
assert.match(emailHandlerSource, /Open the buyer portal to view bond progress/)
assert.doesNotMatch(emailHandlerSource, /renderBridgeCta\("View Application",\s*portalLink\)/)

assert.match(catalogSource, /automationKey:\s*'bond_originator_buyer_intro'/)
assert.match(catalogSource, /cta:\s*'View bond progress'/)

assert.match(phase4Doc, /bond_originator_buyer_intro/)
assert.match(phase4Doc, /metadata\.applicationLink/)
assert.match(phase4Doc, /View bond progress/)

console.log('Bond application email plumbing Phase 4 checks passed.')
