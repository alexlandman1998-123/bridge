import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const marketingPage = await readFile(new URL('../src/pages/MarketingComingSoonPage.jsx', import.meta.url), 'utf8')
const brandEditor = await readFile(new URL('../src/components/marketing/WebsiteBrandEditor.jsx', import.meta.url), 'utf8')
const pageEditor = await readFile(new URL('../src/components/marketing/WebsitePageEditor.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913094220_website_workspace_sections.sql', import.meta.url), 'utf8')
const leadOperationsMigration = await readFile(new URL('../../supabase/migrations/20260913115029_website_workspace_lead_operations.sql', import.meta.url), 'utf8')
const leadWindowRepairMigration = await readFile(new URL('../../supabase/migrations/20260916183940_fix_website_workspace_leads_window.sql', import.meta.url), 'utf8')
const recoveryMigration = await readFile(new URL('../../supabase/migrations/20260913113900_website_blog_revision_workflow.sql', import.meta.url), 'utf8')
const blogDraftCloneMigration = await readFile(new URL('../../supabase/migrations/20260916113000_website_blog_draft_clone_integrity.sql', import.meta.url), 'utf8')

for (const marker of [
  'WebsiteStats',
  'WebsiteLandingPreview',
  'Website status',
  'Edit website',
  'Performance',
  'Website activity',
  'Quick actions',
  'Manage domain',
  'View enquiries',
  'Primary domain',
  'setShowEditor(true)',
  'WebsiteLeads',
  'WebsiteFormSubmissions',
  'WebsiteBlog',
  'Website overview',
  'Edit {agencyName}',
]) assert.ok(component.includes(marker), `Website overview should include ${marker}.`)

assert.ok(component.includes("target=\"_blank\""), 'Preview must open separately from the Arch9 workspace.')
assert.ok(component.includes('organisationId'), 'Website overview must remain organisation-scoped.')
for (const marker of ['.website-overview', '.wlo-header', '.wlo-stats', '.wlo-main-card', '.wlo-quick']) assert.ok(styles.includes(marker), `Website overview styles should include ${marker}.`)
assert.ok(!styles.includes('margin-top: -22px'), 'Website overview must use the shared page-shell top spacing.')
assert.ok(styles.includes('Match the shared Marketing workspace rhythm'), 'Website overview should use the shared Marketing visual language.')
assert.ok(styles.includes('grid-template-columns: repeat(6, minmax(0, 1fr))'), 'Website navigation should use equally sized banner actions.')
assert.ok(styles.includes('.wlo-header { background: #fff; border: 1px solid var(--wa-border)'), 'Website identity and actions should share their own container.')
assert.ok(styles.includes('.wlo-section-card'), 'Website sections should use a dedicated workspace card.')
assert.ok(styles.includes('.website-editor'), 'Website editing should retain the shared workspace visual language.')
assert.ok(styles.includes('.ww-editing-entry'), 'Website editing should provide one clear draft entry point.')
assert.ok(component.includes('What would you like to update?') && component.includes('Website identity') && component.includes('Core page content'), 'Website editing should present the focused MVP choices before detailed controls.')
assert.ok(styles.includes('.website-editor-shell'), 'Website editing choices should use the same contained workspace treatment as the rest of the app.')
assert.ok(component.includes('READY TO PUBLISH') && component.includes('ACTION NEEDED'), 'Website publishing should clearly distinguish a ready draft from one that needs attention.')
assert.ok(component.includes('Finish these items before publishing') && component.includes('View current live site'), 'Website publishing should explain blockers and distinguish the current live site from private changes.')
assert.ok(component.includes('Publish these website changes?'), 'Publishing confirmation should use plain website language rather than revision jargon.')
assert.ok(styles.includes('.ww-publishing-summary'), 'Website publishing should have its own clear status treatment.')
assert.ok(!component.includes('rollbackWebsiteRevision'), 'Website editing must not expose an in-product recovery action.')
assert.ok(!component.includes('Review recovery points'), 'Website editing must not expose recovery controls.')
assert.match(recoveryMigration, /create or replace function public\.website_rollback_revision/i, 'The protected recovery path must remain available in the database.')
assert.match(recoveryMigration, /grant execute on function public\.website_rollback_revision\(uuid, uuid\) to authenticated/i, 'The recovery path must retain its guarded authenticated access contract.')
assert.ok(brandEditor.includes('Standard logo') && brandEditor.includes('Dark-background logo'), 'Website identity should explain the practical logo choices.')
assert.ok(brandEditor.includes('Contact details') && brandEditor.includes('WhatsApp number'), 'Website identity should include the public contact channels.')
assert.ok(brandEditor.includes('Primary colour') && brandEditor.includes('Accent colour'), 'Website identity should expose the public website colour palette.')
assert.ok(!brandEditor.includes('ww-live-preview'), 'Website identity should not bury the practical controls beneath a decorative mock preview.')
assert.ok(styles.includes('.ww-identity-layout'), 'Website identity should group its practical controls into focused sections.')
assert.ok(pageEditor.includes('Core page content') && pageEditor.includes('Main message') && pageEditor.includes('Supporting text'), 'Core page editing should focus on the visitor-facing copy.')
assert.ok(pageEditor.includes('property search and enquiry routing stay in place'), 'Core page editing should preserve the fixed property and lead flow.')
assert.ok(!pageEditor.includes('Add section') && !pageEditor.includes('Move section up') && !pageEditor.includes('Delete campaign'), 'Core page editing should not expose the retired block-builder controls.')
assert.ok(styles.includes('.ww-focused-page-tabs'), 'Core pages should use a focused page switcher.')
assert.ok(!component.includes('Website Studio'), 'The retired Website Studio label should not be shown anywhere in the workspace.')
assert.ok(!component.includes('wst-nav'), 'The retired Studio navigation should not remain in the workspace.')
assert.ok(service.includes("website_workspace_leads"), 'Website leads should use the scoped Website workspace read model.')
assert.ok(service.includes("website_blog_posts"), 'Blog management should use the dedicated blog-post model.')
assert.ok(component.includes('Create post'), 'Blog management should offer an explicit create-post action.')
assert.ok(component.includes('Drafts') && component.includes('Published'), 'Blog management should separate drafts from published posts.')
assert.ok(component.includes('Alt text'), 'Blog management should collect cover-image alt text.')
assert.ok(component.includes('Image from media library') && component.includes('>Remove</button>'), 'Blog management should let authors select or clear a featured image without a large media grid.')
assert.ok(component.includes('Save image description'), 'Blog management should keep the shared media-description update available.')
assert.ok(component.includes('Write the article') && component.includes('Add text') && component.includes('Add heading'), 'Blog management should present a focused writing canvas instead of a permanent block toolbar.')
assert.ok(component.includes('Move block up') && component.includes('Move block down') && component.includes('const move ='), 'Blog authors should be able to reorder article blocks without rebuilding the article.')
assert.ok(component.includes('words ·') && component.includes('min read'), 'The writing canvas should provide a compact editorial reading estimate.')
assert.ok(component.includes('Changes remain private until the website revision is published.') && component.includes('Article saved to the website draft.'), 'Blog changes should join the reviewed website revision rather than publish independently.')
assert.ok(component.includes('wlo-blog-card-grid') && component.includes('All posts'), 'Blog management should open from a visual card library.')
assert.ok(marketingPage.includes('blog-edit') && component.includes('onOpenEditor') && component.includes('Saved just now'), 'A selected post should open a focused editor route with an autosave state.')
assert.ok(component.includes('blogValidationMessage') && component.includes('Complete required fields'), 'The editor should reject invalid local article content before attempting an autosave request.')
assert.ok(component.includes("Add a featured image before saving this article."), 'The editor should require a featured image before a public article can be saved.')
assert.ok(component.includes('Publication date and time') && component.includes('Schedule post') && !component.includes('Schedule date and time (for example'), 'Scheduling should use a validated date control rather than a browser prompt.')
assert.ok(component.includes('BlogRenderedPreview') && component.includes('wlo-rendered-preview'), 'Preview mode should render the article blocks rather than only showing editor metadata.')
assert.ok(component.includes('blogSlugFromTitle') && component.includes("field === 'title' && !current.slug"), 'A new article URL should be generated from its title without overwriting an edited slug.')
assert.ok(component.includes('wlo-blog-editor-loading') && component.includes('Loading article editor…'), 'The routed editor must tolerate the initial load before an article is available.')
assert.ok(component.includes('BlogSidebarPanel') && component.includes('aria-expanded={open}'), 'Publish and SEO panels should be controlled, accessible collapsible sections rather than stretched native details elements.')
assert.ok(component.includes('BlogSidebarPanel label="Publish"') && component.includes('<label>Article excerpt'), 'The article excerpt should live with the publishing settings, leaving the central canvas for writing.')
assert.ok(component.includes('createWebsiteBlogPost') && component.includes('updateWebsiteBlogPost'), 'Blog management should save dedicated posts rather than temporary website pages.')
assert.ok(!component.includes('createWebsiteBlogPage'), 'The Blog tab must not use the retired temporary blog-page creator.')
assert.ok(component.includes('changesReadyCount'), 'Website editing should retain a revision-wide change count.')
assert.ok(!component.includes('DRAFT CONTENT PREVIEW'), 'Internal draft inventory should not be shown in the simplified editor.')
assert.ok(service.includes("website_save_draft_blog_post"), 'Blog edits must save through the draft-only database contract.')
assert.ok(service.includes('updateWebsiteBlogMedia') && service.includes(".eq('website_site_id', siteId)"), 'Media descriptions must update through the organisation-scoped website media contract.')
assert.match(blogDraftCloneMigration, /source_revision_id/i, 'A new website draft must retain its published source revision for blog cloning.')
assert.match(blogDraftCloneMigration, /content_blocks/i, 'A cloned blog draft must retain structured article blocks.')
assert.match(blogDraftCloneMigration, /website_blog_listing_links/i, 'A cloned blog draft must rebuild listing-card links.')
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
assert.match(leadWindowRepairMigration, /greatest\(1, least\(coalesce\(p_days, 30\), 90\)\)/i, 'The lead read model must calculate its bounded date window with valid PostgreSQL expressions.')
assert.doesNotMatch(leadWindowRepairMigration, /pg_catalog\.least|pg_catalog\.greatest/i, 'The lead read model must not schema-qualify PostgreSQL least/greatest expressions.')
assert.ok(!styles.includes('kingdom-hero-v1'), 'The global website overview cannot depend on Kingdom-specific assets.')

console.log('website overview checks passed')
