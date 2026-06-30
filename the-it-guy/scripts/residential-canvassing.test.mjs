import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const canvassingPageSource = await fs.readFile(new URL('../src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8')

assert.match(canvassingPageSource, /createAgencyCrmLeadRecord/, 'residential canvassing should create CRM lead records when converting prospects')
assert.match(canvassingPageSource, /leadCategory: normalizedCategory/, 'converted canvassing prospects should preserve normalized buyer or seller lead category')
assert.match(canvassingPageSource, /leadSource: 'Canvassing'/, 'converted canvassing prospects should retain Canvassing as the lead source')
assert.match(canvassingPageSource, /sellerPropertyAddress: normalizedCategory === 'seller'/, 'seller prospects should carry the seller property address into the lead payload')
assert.match(canvassingPageSource, /navigate\(`\/pipeline\/leads\/\$\{targetLeadId\}`/, 'converted canvassing prospects should navigate to the created lead workspace')
assert.match(canvassingPageSource, /canAccessPrincipalExperience/, 'residential canvassing should allow principal users to see workspace-wide prospects')
assert.match(canvassingPageSource, /if \(isPrincipalAgentView\) return Array\.isArray\(prospects\) \? prospects : \[\]/, 'principal canvassing view should not hide prospects behind agent-only scoping')
assert.match(canvassingPageSource, /assignedAgentId: currentAgentIdentity/, 'new residential canvassing prospects should default to the current agent assignment')
assert.doesNotMatch(canvassingPageSource, /BRIDGE9_PRINCIPAL_DEMO_AGENT_EMAIL/, 'residential canvassing should not silently default prospect assignment to the demo principal agent')
assert.match(canvassingPageSource, /CanvassingImportModal/, 'residential canvassing should expose a standalone bulk upload module')
assert.match(canvassingPageSource, /audience=\{prospectView\}/, 'canvassing import should lock to the selected buyer or seller prospect view')
assert.match(canvassingPageSource, /buildCanvassingImportPayload/, 'canvassing import should map CSV rows into canvassing prospect payloads')
assert.match(canvassingPageSource, /createCanvassingProspect\(organisationId, payload\)/, 'canvassing import should create canvassing prospects directly')
assert.match(canvassingPageSource, /normalizedAudience === 'buyer' \? 'Buyer' : 'Seller'/, 'canvassing bulk upload should support buyer and seller-specific import copy')
assert.match(canvassingPageSource, /Import \$\{audienceLabel\} Prospects/, 'canvassing bulk upload should label the selected import mode')

console.log('residential canvassing checks passed')
