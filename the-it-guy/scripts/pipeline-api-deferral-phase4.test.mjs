import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const pipelinePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const pipelineWrapperPath = path.resolve('src/pages/Pipeline.jsx')
const packetServicePath = path.resolve('src/core/documents/packetService.js')
const mandateClientPath = path.resolve('src/lib/generateMandateDocument.js')
const onboardingLinksPath = path.resolve('src/lib/onboardingLinks.js')
const privateListingServicePath = path.resolve('src/services/privateListingService.js')
const appointmentNotificationServicePath = path.resolve('src/services/appointmentNotificationService.js')
const apiPath = path.resolve('src/lib/api.js')

const pipelineSource = fs.readFileSync(pipelinePath, 'utf8')
const pipelineWrapperSource = fs.readFileSync(pipelineWrapperPath, 'utf8')
const packetServiceSource = fs.readFileSync(packetServicePath, 'utf8')
const mandateClientSource = fs.readFileSync(mandateClientPath, 'utf8')
const onboardingLinksSource = fs.readFileSync(onboardingLinksPath, 'utf8')
const privateListingServiceSource = fs.readFileSync(privateListingServicePath, 'utf8')
const appointmentNotificationServiceSource = fs.readFileSync(appointmentNotificationServicePath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')

assert.doesNotMatch(
  pipelineSource,
  /from\s+['"]\.\.\/\.\.\/lib\/api['"]/,
  'AgencyPipelinePage should not statically import the large API module',
)

assert.match(
  pipelineSource,
  /let transactionApiActionsPromise = null/,
  'AgencyPipelinePage should cache the deferred transaction API import',
)

assert.match(
  pipelineSource,
  /import\(['"]\.\.\/\.\.\/lib\/api['"]\)/,
  'AgencyPipelinePage should load transaction API actions through a dynamic import',
)

assert.match(
  pipelineSource,
  /createDeferredAction\(loadTransactionApiActions,\s*['"]addTransactionDiscussionComment['"]\)/,
  'AgencyPipelinePage transaction API call sites should use cached deferred actions',
)

assert.doesNotMatch(
  pipelineWrapperSource,
  /from\s+['"]\.\.\/lib\/api['"]/,
  'Pipeline wrapper should not statically import the large API module',
)

assert.match(
  pipelineWrapperSource,
  /let pipelineApiActionsPromise = null/,
  'Pipeline wrapper should cache deferred legacy API imports',
)

assert.match(
  pipelineWrapperSource,
  /import\(['"]\.\.\/lib\/api['"]\)/,
  'Pipeline wrapper should dynamically import legacy API actions',
)

assert.doesNotMatch(
  onboardingLinksSource,
  /from\s+['"]\.\/api['"]/,
  'onboardingLinks should not statically import the large API module',
)

assert.match(
  onboardingLinksSource,
  /import\(['"]\.\/api['"]\)/,
  'onboardingLinks should dynamically import onboarding API actions',
)

assert.doesNotMatch(
  privateListingServiceSource,
  /from\s+['"]\.\/clientPortalNotificationsService\.js['"]/,
  'privateListingService should not statically import client portal notifications',
)

assert.match(
  privateListingServiceSource,
  /import\(['"]\.\/clientPortalNotificationsService\.js['"]\)/,
  'privateListingService should dynamically import client portal notifications',
)

assert.doesNotMatch(
  appointmentNotificationServiceSource,
  /from\s+['"]\.\/clientPortalNotificationsService['"]/,
  'appointmentNotificationService should not statically import client portal notifications',
)

assert.match(
  appointmentNotificationServiceSource,
  /import\(['"]\.\/clientPortalNotificationsService['"]\)/,
  'appointmentNotificationService should dynamically import client portal notifications',
)

assert.doesNotMatch(
  packetServiceSource,
  /from\s+['"]\.\.\/\.\.\/lib\/api['"]/,
  'packetService should not pull the large API module into legal document generation paths',
)

assert.match(
  packetServiceSource,
  /from\s+['"]\.\.\/\.\.\/lib\/generateMandateDocument['"]/,
  'packetService should import mandate rendering through the slim edge-function client',
)

assert.doesNotMatch(
  mandateClientSource,
  /from\s+['"].*\/api['"]/,
  'The slim mandate generation client must not import the large API module',
)

assert.match(
  mandateClientSource,
  /invokeEdgeFunction\(['"]generate-mandate['"]/,
  'The slim mandate generation client should preserve the generate-mandate edge function call',
)

assert.match(
  apiSource,
  /export\s+\{\s*generateMandateDocumentFromTemplate\s*\}\s+from\s+['"]\.\/generateMandateDocument['"]/,
  'api.js should preserve the existing generateMandateDocumentFromTemplate export',
)

console.log('pipeline api deferral phase 4 checks passed')
