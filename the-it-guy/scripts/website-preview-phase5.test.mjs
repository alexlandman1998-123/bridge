import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')

for (const marker of ['WebsiteReleasePreview', 'PREVIEW & PUBLISHING', 'Current public website preview', 'Desktop', 'Mobile', 'Open public preview', 'Release blockers', 'Review draft in Website Studio']) assert.ok(component.includes(marker), `Phase 5 preview should include ${marker}.`)
assert.ok(component.includes('embedded preview always shows the current public revision'), 'Preview must distinguish the public revision from isolated drafts.')
for (const marker of ['.wwo-release-preview', '.wwo-preview-frame.mobile', '.wwo-blockers.blocked']) assert.ok(styles.includes(marker), `Preview styles should include ${marker}.`)

console.log('website preview phase 5 checks passed')
