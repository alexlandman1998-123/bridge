import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()

const [apiSource, notificationSource, phase2Doc, phase3Doc] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/services/bondIntakeNotificationService.js'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-2-email-link-builder.md'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-3-email-token-enrichment.md'), 'utf8'),
])

const resolver = apiSource.slice(
  apiSource.indexOf('function buildClientPortalAccessMetadata'),
  apiSource.indexOf('export async function revokeClientPortalLink'),
)
assert.match(resolver, /getOrCreateClientPortalLinkRecord/)
assert.match(resolver, /clientPortalPath/)
assert.match(resolver, /clientPortalToken/)
assert.match(resolver, /buyerPortalPath/)
assert.match(resolver, /buyerPortalToken/)
assert.match(resolver, /portalLinkSource/)

const signedOtpHandoff = apiSource.slice(
  apiSource.indexOf('activation = await activateSelectedBondOriginatorForOnboarding'),
  apiSource.indexOf(
    'await sendRoleplayerHandoffEmailForOnboarding',
    apiSource.indexOf('activation = await activateSelectedBondOriginatorForOnboarding'),
  ),
)
assert.match(signedOtpHandoff, /resolveBuyerBondApplicationPortalMetadata/)
assert.match(signedOtpHandoff, /buyerBondApplicationPortalMetadata/)
assert.match(signedOtpHandoff, /portalLinkSource:\s*'resolution_failed'/)
assert.match(signedOtpHandoff, /notifyBondIntakeStartedForOnboarding/)
assert.match(signedOtpHandoff, /\.\.\.buyerBondApplicationPortalMetadata/)

const buyerIntro = notificationSource.slice(
  notificationSource.indexOf('eventType: BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO'),
  notificationSource.indexOf('return {', notificationSource.indexOf('eventType: BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO')),
)
assert.match(buyerIntro, /clientPortalPath/)
assert.match(buyerIntro, /clientPortalToken/)
assert.match(buyerIntro, /buyerPortalPath/)
assert.match(buyerIntro, /buyerPortalToken/)
assert.match(buyerIntro, /buildBuyerBondApplicationLink/)

assert.match(phase2Doc, /signed OTP handoff call still does not pass the real buyer portal token\/path/)
assert.match(phase3Doc, /getOrCreateClientPortalLinkRecord/)
assert.match(phase3Doc, /\/client\/:token\/bond-application/)
assert.match(phase3Doc, /portalLinkSource/)

console.log('Bond application email plumbing Phase 3 checks passed.')
