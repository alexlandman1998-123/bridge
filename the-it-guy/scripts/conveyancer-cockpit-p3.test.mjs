import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const cockpit = readFileSync(new URL('../src/components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')

assert.match(page, /\{ id: 'cockpit', label: 'Work' \}/)
assert.match(page, /workspaceRole === 'attorney'[\s\S]*?<ConveyancerCockpit/)
assert.match(page, /ATTORNEY_WORKSPACE_TABS\.filter\(\(tab\) => tab\.id !== 'cockpit'\)/)
assert.match(cockpit, /aria-label="Conveyancer cockpit"/)
assert.match(cockpit, /aria-live="polite"/)
assert.match(cockpit, /Do this next/)
assert.match(cockpit, /normal matter workspace/)
assert.match(cockpit, /runConveyancerMatterEvent/)
assert.doesNotMatch(cockpit, /\.from\([^)]*\)\.(insert|update|delete|upsert)/)

console.log('P3 conveyancer cockpit UI wiring tests passed.')
