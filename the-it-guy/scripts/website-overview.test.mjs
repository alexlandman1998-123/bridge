import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')

for (const marker of [
  'WEBSITE',
  'WebsiteStats',
  'WebsiteLandingPreview',
  'Website status',
  'Open Website Studio',
  'Performance',
  'Website activity',
  'Quick actions',
  'Manage domain',
  'View enquiries',
  'Primary domain',
  'Manage website',
  'setShowStudio(true)',
]) assert.ok(component.includes(marker), `Website overview should include ${marker}.`)

assert.ok(component.includes("target=\"_blank\""), 'Preview must open separately from the Arch9 workspace.')
assert.ok(component.includes('organisationId'), 'Website overview must remain organisation-scoped.')
for (const marker of ['.website-overview', '.wlo-header', '.wlo-stats', '.wlo-main-card', '.wlo-quick']) assert.ok(styles.includes(marker), `Website overview styles should include ${marker}.`)
assert.ok(!styles.includes('margin-top: -22px'), 'Website overview must use the shared page-shell top spacing.')
assert.ok(styles.includes('Match the shared Marketing workspace rhythm'), 'Website overview should use the shared Marketing visual language.')
assert.ok(!styles.includes('kingdom-hero-v1'), 'The global website overview cannot depend on Kingdom-specific assets.')

console.log('website overview checks passed')
