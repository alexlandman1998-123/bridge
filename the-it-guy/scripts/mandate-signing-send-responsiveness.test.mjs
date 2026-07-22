import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:mandate-signing-send-responsiveness'],
  'node scripts/mandate-signing-send-responsiveness.test.mjs',
)

assert.match(workspace, /const persistedRoster = resolveSignerRoster\(/)
assert.match(workspace, /const latestRoster = persistedRoster\.map\(/)
assert.match(workspace, /const hasDraftOverrides = persistedRoster\.some\(/)
assert.match(workspace, /await saveSignerDetails\(\{ includeOptional: true \}\)/)
assert.match(workspace, /PILOT_FALLBACK_REVIEW_REQUIRED/)
assert.match(workspace, /SIGNING_PREPARATION_TIMEOUT_MS = 15000/)
assert.match(workspace, /SIGNING_DELIVERY_TIMEOUT_MS = 12000/)
assert.match(workspace, /Secure signing links could not be confirmed within 15 seconds/)
assert.match(workspace, /email delivery was not confirmed within 12 seconds/)

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
assert.doesNotMatch(packetService, /continuing with a generated preview-only draft/)
assert.match(packetService, /A failed render is never a generated legal document/)

const handleSendStart = page.indexOf('const handleSend = useCallback')
const mandateSendStart = page.indexOf("if (packetType === 'mandate' && leadContext.lead?.leadId)", handleSendStart)
const mandateSendEnd = page.indexOf("window.dispatchEvent(new Event('itg:transaction-updated'))", mandateSendStart)
const mandateSendSource = page.slice(mandateSendStart, mandateSendEnd)
assert.match(mandateSendSource, /void \(async \(\) => \{/)
assert.match(mandateSendSource, /Linked listing mandate status update is taking too long\./)
assert.match(mandateSendSource, /Linked listing mandate activity update is taking too long\./)
assert.match(mandateSendSource, /withLegalWorkspaceTimeout\(/)

console.log('Mandate signing send responsiveness contract passed.')
