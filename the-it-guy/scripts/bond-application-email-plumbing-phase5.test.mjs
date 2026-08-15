import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()

const [
  notificationSource,
  activityFeedSource,
  nextActionsSource,
  clientPortalSource,
  phase5Doc,
] = await Promise.all([
  readFile(resolve(root, 'src/services/clientPortalNotificationsService.js'), 'utf8'),
  readFile(resolve(root, 'src/services/clientPortalActivityFeedService.js'), 'utf8'),
  readFile(resolve(root, 'src/lib/clientPortalNextActionsEngine.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
  readFile(resolve(root, 'docs/bond-application/phase-5-portal-action-alignment.md'), 'utf8'),
])

const notificationLabelStart = notificationSource.indexOf('function deriveActionLabel')
const notificationLabelBlock = notificationSource.slice(
  notificationLabelStart,
  notificationSource.indexOf('function normalizeClientPortalNotification', notificationLabelStart),
)
assert.match(notificationLabelBlock, /bond_application_required'\)\s*return 'Complete Bond Application'/)
assert.doesNotMatch(notificationLabelBlock, /bond_application_required'\)\s*return 'Open Bond Application'/)

const notificationRouteStart = notificationSource.indexOf('function deriveActionRoute')
const notificationRouteBlock = notificationSource.slice(
  notificationRouteStart,
  notificationSource.indexOf('function deriveActionLabel', notificationRouteStart),
)
assert.match(notificationRouteBlock, /type === 'bond_application_required'[\s\S]{0,80}return 'bond_application'/)

const activityActionStart = activityFeedSource.indexOf('function getActionForEvent')
const activityActionBlock = activityFeedSource.slice(
  activityActionStart,
  activityFeedSource.indexOf('export function getActivityFeedDisplayType', activityActionStart),
)
assert.match(activityActionBlock, /bond_application_required'[\s\S]*bond_application_attention_required'[\s\S]*'Complete Bond Application'[\s\S]*'bond_application'/)
assert.doesNotMatch(activityActionBlock, /Open Bond Application/)

const requiredActivityStart = activityFeedSource.indexOf("id: `bond_application_required_")
const requiredActivityBlock = activityFeedSource.slice(
  requiredActivityStart,
  activityFeedSource.indexOf('} else if (bondStatus ===', requiredActivityStart),
)
assert.match(requiredActivityBlock, /actionLabel:\s*'Complete Bond Application'/)
assert.match(requiredActivityBlock, /actionRoute:\s*'bond_application'/)

const attentionActivityStart = activityFeedSource.indexOf("id: `bond_application_attention_")
const attentionActivityBlock = activityFeedSource.slice(
  attentionActivityStart,
  activityFeedSource.indexOf('} else {', attentionActivityStart),
)
assert.match(attentionActivityBlock, /actionLabel:\s*'Complete Bond Application'/)
assert.match(attentionActivityBlock, /actionRoute:\s*'bond_application'/)

for (const actionId of [
  'bond_application_required',
  'bond_application_in_progress',
  'bond_application_declined',
]) {
  const actionStart = nextActionsSource.indexOf(`id: '${actionId}'`)
  assert.notEqual(actionStart, -1, `missing ${actionId}`)
  const actionBlock = nextActionsSource.slice(actionStart, nextActionsSource.indexOf('metadata:', actionStart))
  assert.match(actionBlock, /actionLabel:\s*'Complete Bond Application'/, `${actionId} label mismatch`)
  assert.match(actionBlock, /actionRoute:\s*'bond_application'/, `${actionId} route mismatch`)
}

assert.match(clientPortalSource, /if \(sectionKey === 'bond_application'\) return `?\/client\/\$\{token\}\/bond-application`?/)
assert.match(clientPortalSource, /if \(normalizedSection === 'bond-application'\) return 'bond_application'/)

assert.match(phase5Doc, /Route key: `bond_application`/)
assert.match(phase5Doc, /Portal path: `\/client\/:token\/bond-application`/)
assert.match(phase5Doc, /CTA: `Complete Bond Application`/)

console.log('Bond application email plumbing Phase 5 checks passed.')
