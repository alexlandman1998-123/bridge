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
assert.match(buyerIntroCopy, /title:\s*'Complete your bond application'/)
assert.match(buyerIntroCopy, /subject:\s*'Complete your bond application'/)
assert.match(buyerIntroCopy, /buyerSubject:\s*'Complete your bond application'/)
assert.match(buyerIntroCopy, /Complete the online application/)
assert.match(buyerIntroCopy, /assigned bond contact/)

assert.match(notificationSource, /bond_originator_buyer_intro/)
assert.match(notificationSource, /metadata\.applicationLink|applicationLink:/)

assert.match(emailHandlerSource, /"Complete your bond application"/)
assert.match(emailHandlerSource, /renderBridgeCta\("Complete Bond Application",\s*portalLink\)/)
assert.match(emailHandlerSource, /Complete your online bond application in the buyer portal/)
assert.match(emailHandlerSource, /Complete your bond application:/)
assert.doesNotMatch(emailHandlerSource, /renderBridgeCta\("View Application",\s*portalLink\)/)

assert.match(catalogSource, /automationKey:\s*'bond_originator_buyer_intro'/)
assert.match(catalogSource, /cta:\s*'Complete bond application'/)

assert.match(phase4Doc, /bond_originator_buyer_intro/)
assert.match(phase4Doc, /metadata\.applicationLink/)
assert.match(phase4Doc, /Complete Bond Application/)

console.log('Bond application email plumbing Phase 4 checks passed.')
