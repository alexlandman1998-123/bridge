import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const launches = await readFile(new URL('../src/components/marketing/LaunchesAuctions.jsx', import.meta.url), 'utf8')
const repository = await readFile(new URL('../src/services/marketingEventRepository.js', import.meta.url), 'utf8')

for (const marker of [
  'function LaunchDetail',
  'getMarketingEventOperations',
  'listMarketingEventRsvps',
  'checkInMarketingEventRsvp',
  'processMarketingEventConversion',
  'retryMarketingEventOperation',
  'Copy RSVP link',
  'Open CRM lead',
]) assert.ok(launches.includes(marker), `missing launch workflow marker: ${marker}`)

assert.ok(repository.includes("const isDevelopmentLaunch = Boolean(values.development || values.subjectType === 'development')"), 'launch updates must preserve development subject type')
assert.ok(repository.includes("subject_type: isDevelopmentLaunch ? 'development'"), 'launch updates must remain development-linked')

console.log('marketing launch phase 4 checks passed')
