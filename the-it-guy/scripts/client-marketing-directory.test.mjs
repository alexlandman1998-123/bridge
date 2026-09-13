import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/Clients.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/emailCampaignService.js', import.meta.url), 'utf8')

for (const marker of [
  'ClientMarketingProfileModal',
  'ClientAudiencesTab',
  'setSelectedAgentClient(client)',
  'Bulk-email tags',
  'Save tags',
  'Audiences',
  'Save audience',
  'consent, subscriptions, suppression and deduplication',
]) assert.ok(page.includes(marker), `Clients should include ${marker}.`)

assert.ok(!page.includes('navigate(getAgentClientOpenPath'), 'Agent client clicks should remain in the Clients profile modal.')
for (const marker of ['getClientMarketingWorkspace', 'saveClientMarketingTags', 'saveEmailAudience']) assert.ok(page.includes(marker), `Clients should use ${marker}.`)
for (const marker of ['email_marketing_contacts', 'email_saved_audiences', 'organisation_id', 'tags: nextTags']) assert.ok(service.includes(marker), `Marketing service should safely persist ${marker}.`)

console.log('client marketing directory checks passed')
