import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913094220_website_workspace_sections.sql', import.meta.url), 'utf8')
const leadOperationsMigration = await readFile(new URL('../../supabase/migrations/20260913115029_website_workspace_lead_operations.sql', import.meta.url), 'utf8')

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
  'Website overview',
  'Website Studio sections',
  'Update {agencyName}',
]) assert.ok(component.includes(marker), `Website overview should include ${marker}.`)

assert.ok(component.includes("target=\"_blank\""), 'Preview must open separately from the Arch9 workspace.')
assert.ok(component.includes('organisationId'), 'Website overview must remain organisation-scoped.')
for (const marker of ['.website-overview', '.wlo-header', '.wlo-stats', '.wlo-main-card', '.wlo-quick']) assert.ok(styles.includes(marker), `Website overview styles should include ${marker}.`)
assert.ok(!styles.includes('margin-top: -22px'), 'Website overview must use the shared page-shell top spacing.')
assert.ok(styles.includes('Match the shared Marketing workspace rhythm'), 'Website overview should use the shared Marketing visual language.')
assert.ok(styles.includes('grid-template-columns: repeat(6, minmax(0, 1fr))'), 'Website navigation should use equally sized banner actions.')
assert.ok(styles.includes('.wlo-header { background: #fff; border: 1px solid var(--wa-border)'), 'Website identity and actions should share their own container.')
assert.ok(styles.includes('.wlo-section-card'), 'Website sections should use a dedicated workspace card.')
assert.ok(styles.includes('.website-studio'), 'Website Studio should retain the shared workspace visual language.')
assert.ok(styles.includes('.wst-nav'), 'Website Studio should expose focused editing navigation.')
assert.ok(styles.includes('content-first Studio'), 'Website Studio should not reuse the redundant landing treatment.')
assert.ok(service.includes("website_workspace_leads"), 'Website leads should use the scoped Website workspace read model.')
assert.ok(service.includes("website_blog_posts"), 'Blog management should use the dedicated blog-post model.')
assert.ok(component.includes('Create post'), 'Blog management should offer an explicit create-post action.')
assert.ok(component.includes('Drafts') && component.includes('Published'), 'Blog management should separate drafts from published posts.')
assert.ok(component.includes('Cover image alt text'), 'Blog management should collect cover-image alt text.')
assert.ok(component.includes('Save to website draft') && component.includes('Publish reviewed draft'), 'Blog changes should join the reviewed website revision rather than publish independently.')
assert.ok(component.includes('createWebsiteBlogPost') && component.includes('updateWebsiteBlogPost'), 'Blog management should save dedicated posts rather than temporary website pages.')
assert.ok(!component.includes('createWebsiteBlogPage'), 'The Blog tab must not use the retired temporary blog-page creator.')
assert.ok(component.includes('changesReadyCount') && component.includes('blogPostCount'), 'Studio should show a revision-wide publish count including articles.')
assert.ok(component.includes('DRAFT CONTENT PREVIEW'), 'Studio should identify the exact draft pages and articles awaiting publication.')
assert.ok(service.includes("website_save_draft_blog_post"), 'Blog edits must save through the draft-only database contract.')
assert.ok(component.includes('Last 7 days') && component.includes('Last 90 days'), 'Website lead operations should support focused date windows.')
assert.ok(component.includes('onOpenListing') && component.includes('mailto:'), 'Website leads should support property and contact actions.')
assert.ok(component.includes('Loading website leads') && component.includes('Loading submission delivery'), 'Lead operations should have clear loading states.')
assert.ok(component.includes('wlo-delivery-alert') && component.includes('Not created'), 'Submission operations should distinguish failed delivery from routed CRM leads.')
assert.ok(service.includes('leadWindowDays'), 'The Website workspace service should request the selected operational date window.')
assert.match(migration, /create or replace function public\.website_workspace_leads/i, 'Website leads should have a dedicated database read model.')
assert.match(migration, /bridge_has_organisation_membership/i, 'Website leads must enforce organisation membership.')
assert.match(migration, /revoke all on function public\.website_workspace_leads/i, 'Website leads must not inherit public function access.')
assert.match(leadOperationsMigration, /listing_id uuid/i, 'Website lead operations should expose a property identifier for safe internal linking.')
assert.match(leadOperationsMigration, /delivery_detail text/i, 'Website lead operations should surface delivery failures without returning raw payloads.')
assert.match(leadOperationsMigration, /bridge_has_organisation_membership/i, 'Website lead operations must remain organisation-scoped.')
assert.match(leadOperationsMigration, /revoke all on function public\.website_workspace_leads/i, 'The replacement operational read model must not be callable publicly.')
assert.ok(!styles.includes('kingdom-hero-v1'), 'The global website overview cannot depend on Kingdom-specific assets.')

console.log('website overview checks passed')
