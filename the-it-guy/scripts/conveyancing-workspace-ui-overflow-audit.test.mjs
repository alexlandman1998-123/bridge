import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const scriptSource = readFileSync(new URL('./conveyancing-workspace-ui-overflow-audit.mjs', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(scriptSource, /conveyancing_workspace_ui_overflow_phase1/)
assert.match(scriptSource, /VIEWPORTS = Object\.freeze/)
assert.match(scriptSource, /desktop/)
assert.match(scriptSource, /tablet/)
assert.match(scriptSource, /mobile/)
assert.match(scriptSource, /CONVEYANCING_WORKSPACE_AUTH_BLOCKED/)
assert.match(scriptSource, /CONVEYANCING_WORKSPACE_NAVIGATION_FAILED/)
assert.match(scriptSource, /CONVEYANCING_WORKSPACE_HORIZONTAL_OVERFLOW/)
assert.match(scriptSource, /textFitIssues/)
assert.match(scriptSource, /layoutIssues/)
assert.match(scriptSource, /sourceAudit/)
assert.match(scriptSource, /rankedComponents/)
assert.match(scriptSource, /--strict/)
assert.match(scriptSource, /--source-only/)
assert.match(scriptSource, /src\/pages\/AttorneyTransactionDetail\.jsx/)
assert.match(packageSource, /audit:conveyancing-workspace-overflow/)

console.log('conveyancing workspace UI overflow audit contract passed')
