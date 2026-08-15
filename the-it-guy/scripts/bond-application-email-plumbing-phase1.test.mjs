import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()

const [
  apiSource,
  notificationSource,
  emailIndexSource,
  buyerIntroHandlerSource,
  communicationCatalogSource,
  auditDoc,
] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/services/bondIntakeNotificationService.js'), 'utf8'),
  readFile(resolve(root, '../supabase/functions/send-email/index.ts'), 'utf8'),
  readFile(resolve(root, '../supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts'), 'utf8'),
  readFile(resolve(root, 'src/services/clientCommunicationJourneyCatalog.js'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-1-email-plumbing-audit.md'), 'utf8'),
])

const signedOtpHandoff = apiSource.slice(
  apiSource.indexOf('activation = await activateSelectedBondOriginatorForOnboarding'),
  apiSource.indexOf(
    'await sendRoleplayerHandoffEmailForOnboarding',
    apiSource.indexOf('activation = await activateSelectedBondOriginatorForOnboarding'),
  ),
)
assert.match(signedOtpHandoff, /notifyBondIntakeStartedForOnboarding/)
assert.match(signedOtpHandoff, /metadata:\s*{\s*source:\s*'signed_otp_received'/)

const onboardingNotifier = notificationSource.slice(
  notificationSource.indexOf('export async function notifyBondIntakeStartedForOnboarding'),
  notificationSource.indexOf('export async function checkAndNotifyBondOtpReady'),
)
assert.match(onboardingNotifier, /BOND_NOTIFICATION_EVENTS\.BOND_INTAKE_RECEIVED/)
assert.match(onboardingNotifier, /BOND_NOTIFICATION_EVENTS\.BUYER_BOND_ORIGINATOR_INTRO/)
assert.match(onboardingNotifier, /applicationLink:\s*buildBuyerBondApplicationLink\(/)
assert.doesNotMatch(onboardingNotifier, /buildBuyerBondApplicationPath/)

const emailDelivery = notificationSource.slice(
  notificationSource.indexOf('async function sendEmailIfAllowed'),
  notificationSource.indexOf('function shouldIncludeFinanceReadinessInEmail'),
)
assert.match(emailDelivery, /bond_originator_buyer_intro/)
assert.match(emailDelivery, /metadata/)
assert.match(notificationSource, /applicationLink:\s*buildApplicationLink\(transaction\.id \|\| transaction\.transaction_id,\s*metadata\)/)

assert.match(emailIndexSource, /bond_originator_buyer_intro/)
assert.match(emailIndexSource, /handleBondOriginatorBuyerIntroEmail/)

assert.match(buyerIntroHandlerSource, /metadata\.applicationLink/)
assert.match(buyerIntroHandlerSource, /renderBridgeCta\("Complete Bond Application",\s*portalLink\)/)
assert.match(buyerIntroHandlerSource, /Complete your bond application:/)

assert.match(communicationCatalogSource, /automationKey:\s*'bond_originator_buyer_intro'/)
assert.match(communicationCatalogSource, /cta:\s*'Complete bond application'/)

assert.match(auditDoc, /Current Flow Map/)
assert.match(auditDoc, /metadata\.applicationLink/)
assert.match(auditDoc, /does not yet enrich the notification call with a real buyer portal token or portal path/)
assert.match(auditDoc, /temporary safety net/)

console.log('Bond application email plumbing Phase 1 checks passed.')
