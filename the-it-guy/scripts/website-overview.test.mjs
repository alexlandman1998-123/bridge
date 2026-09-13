import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')

for (const marker of [
  'MARKETING · WEBSITES',
  'Manage your public property website, preview its current version and keep its release status visible.',
  'Primary domain',
  'Last published',
  'Preview site',
  'Manage website',
  'setShowStudio(true)',
  'No client domain or DNS record will be changed.',
]) assert.ok(component.includes(marker), `Website overview should include ${marker}.`)

assert.ok(component.includes("target=\"_blank\""), 'Preview must open separately from the Arch9 workspace.')
assert.ok(component.includes('organisationId'), 'Website overview must remain organisation-scoped.')
for (const marker of ['.website-overview', '.wwo-site-card', '.wwo-site-details', '.wwo-next']) assert.ok(styles.includes(marker), `Website overview styles should include ${marker}.`)
assert.ok(!styles.includes('kingdom-hero-v1'), 'The global website overview cannot depend on Kingdom-specific assets.')

console.log('website overview checks passed')
