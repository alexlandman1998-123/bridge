import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-workspace-phase7'],
  'node scripts/mandate-template-workspace-phase7.test.mjs',
  'package.json should expose the mandate template workspace Phase 7 contract.',
)

const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const workspacePageSource = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const statusResolverSource = await readFile(new URL('../src/core/documents/packetStatusResolver.js', import.meta.url), 'utf8')

for (const token of [
  'resolveMandateRoutingSnapshot',
  'MandateRoutePanel',
  'sourceContext.mandateTemplateFallbackWarning',
  'summary.mandateTemplateFallbackWarning',
  'generationPayload.mandateTemplateRouting',
  'templateResolution.mandateTemplateRouting',
  'Route-specific template missing',
  'Open Template Settings',
  '/settings/signing-templates',
]) {
  assert.ok(workspaceSource.includes(token), `Legal document workspace should include ${token}.`)
}

for (const token of [
  'const mandateRoutingSnapshot = isMandatePacket',
  "key: 'mandate_route'",
  "label: 'Mandate route'",
  'complete: mandateRoutingSnapshot?.hasSignal ? !mandateRoutingSnapshot.fallback : true',
  '<MandateRoutePanel routing={mandateRoutingSnapshot} />',
]) {
  assert.ok(workspaceSource.includes(token), `Mandate route workspace integration should include ${token}.`)
}

const panelIndex = workspaceSource.indexOf('<MandateRoutePanel routing={mandateRoutingSnapshot} />')
const signingIndex = workspaceSource.indexOf('<SigningMethodPanel')
assert.ok(panelIndex > -1 && signingIndex > panelIndex, 'Mandate route panel should appear before signing controls.')

assert.match(workspaceSource, /leadId = ''/)
assert.match(workspaceSource, /leadId,\n\s*organisationId,\n\s*includeActivity: false/)
assert.doesNotMatch(workspaceSource, /skippedInitialPageRefreshRef/)
assert.match(workspacePageSource, /leadId=\{routeLeadId\}/)
assert.match(statusResolverSource, /includeActivity = true/)
assert.match(statusResolverSource, /includeActivity \? 'activity' : 'status'/)

console.log('Mandate template workspace Phase 7 contract passed.')
