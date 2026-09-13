import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913094220_website_workspace_sections.sql', import.meta.url), 'utf8')

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
  'WebsiteLeads',
  'WebsiteFormSubmissions',
  'WebsiteBlog',
]) assert.ok(component.includes(marker), `Website overview should include ${marker}.`)

assert.ok(component.includes("target=\"_blank\""), 'Preview must open separately from the Arch9 workspace.')
assert.ok(component.includes('organisationId'), 'Website overview must remain organisation-scoped.')
for (const marker of ['.website-overview', '.wlo-header', '.wlo-stats', '.wlo-main-card', '.wlo-quick']) assert.ok(styles.includes(marker), `Website overview styles should include ${marker}.`)
assert.ok(!styles.includes('margin-top: -22px'), 'Website overview must use the shared page-shell top spacing.')
assert.ok(styles.includes('Match the shared Marketing workspace rhythm'), 'Website overview should use the shared Marketing visual language.')
assert.ok(styles.includes('grid-template-columns: repeat(6, minmax(0, 1fr))'), 'Website navigation should use equally sized banner actions.')
assert.ok(styles.includes('.wlo-header { background: #fff; border: 1px solid var(--wa-border)'), 'Website identity and actions should share their own container.')
assert.ok(styles.includes('.wlo-section-card'), 'Website sections should use a dedicated workspace card.')
assert.ok(service.includes("website_workspace_leads"), 'Website leads should use the scoped Website workspace read model.')
assert.match(migration, /create or replace function public\.website_workspace_leads/i, 'Website leads should have a dedicated database read model.')
assert.match(migration, /bridge_has_organisation_membership/i, 'Website leads must enforce organisation membership.')
assert.match(migration, /revoke all on function public\.website_workspace_leads/i, 'Website leads must not inherit public function access.')
assert.ok(!styles.includes('kingdom-hero-v1'), 'The global website overview cannot depend on Kingdom-specific assets.')

console.log('website overview checks passed')
