import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const repository = await readFile(new URL('../src/services/marketingEventRepository.js', import.meta.url), 'utf8')
const store = await readFile(new URL('../src/lib/marketingEventStore.js', import.meta.url), 'utf8')
const showDays = await readFile(new URL('../src/components/marketing/ShowDays.jsx', import.meta.url), 'utf8')

assert.ok(repository.includes('export async function updateMarketingEventChecklist'), 'checklist repository update is missing')
assert.ok(repository.includes('metadata: { ...(current?.metadata || {}), checklist:'), 'checklist update must preserve event metadata')
assert.ok(store.includes('updateEventChecklist'), 'checklist state action is missing')
assert.ok(showDays.includes('onChecklistChange'), 'show day checklist is not connected to persistence')
assert.ok(showDays.includes("entry.status === 'Completed' ? 'Pending' : 'Completed'"), 'checklist completion toggle is missing')

console.log('marketing event checklist phase 6 checks passed')
