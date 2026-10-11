import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/Clients.jsx', import.meta.url), 'utf8')
const profile = await readFile(new URL('../src/pages/ClientProfile.jsx', import.meta.url), 'utf8')
const tags = await readFile(new URL('../src/components/clients/ClientMarketingTagsPanel.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/emailCampaignService.js', import.meta.url), 'utf8')

for (const marker of ['handleOpenClient', 'encodeURIComponent(client.id)', 'clientsReturnTo', 'ClientAudiences', 'Open workspace']) assert.ok(page.includes(marker), `Clients should include ${marker}.`)
assert.ok(!page.includes('ClientMarketingProfileModal') && !page.includes('setSelectedAgentClient'), 'Client selection opens its routed workspace instead of a profile popup.')
for (const marker of ['ClientIdentityPanel', 'ClientActivityPanel', 'ClientAttributionPanel', 'ClientCampaignPanel', 'ClientMarketingTagsPanel', 'Client Workspace', 'clientsReturnTo']) assert.ok(profile.includes(marker), `The workspace should retain ${marker}.`)
for (const marker of ['Bulk-email tags', 'Save tags', 'getClientMarketingWorkspace', 'saveClientMarketingTags', 'organisationId', 'consent, unsubscribe, suppression, or subscription checks']) assert.ok(tags.includes(marker), `Workspace marketing tags should retain ${marker}.`)
for (const marker of ['email_marketing_contacts', 'email_saved_audiences', 'organisation_id', 'tags: nextTags']) assert.ok(service.includes(marker), `Marketing service should safely persist ${marker}.`)
console.log('Client workspace and marketing directory checks passed.')
