import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [transactionPage, clientPortal, liveRefresh] = await Promise.all([
  readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8'),
  readFile('src/pages/ClientPortal.jsx', 'utf8'),
  readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8'),
])

assert.equal(
  transactionPage.includes("['today', 'overview', 'tasks', 'transfer'].includes(activeWorkspaceMenu)"),
  false,
  'Overview must not eagerly hydrate the workflow dataset alongside the journey shell.',
)
assert.match(
  transactionPage,
  /\['today', 'tasks', 'transfer'\]\.includes\(activeWorkspaceMenu\)/,
  'Work-specific tabs must continue to hydrate their workflow dataset.',
)
assert.match(
  transactionPage,
  /refreshActiveWorkspaceDataset\(\{\s*reason: `live:\$\{reason\}`,\s*\}\)/,
  'A live signal must refresh only the visible workspace dataset.',
)
assert.match(
  clientPortal,
  /mode: 'core',[\s\S]*?sellerPortalAccessToken/,
  'Portal background refreshes must use the lean core/journey payload.',
)
assert.match(
  clientPortal,
  /\['', 'overview', 'progress'\]\.includes\(String\(requestedSection \|\| ''\)\.toLowerCase\(\)\)/,
  'Buyer and seller overview/progress routes must defer optional full hydration.',
)
assert.match(clientPortal, /refreshOnMount: false/)
assert.match(liveRefresh, /refreshOnMount = true/)
assert.match(liveRefresh, /jitterSeed/)
assert.match(liveRefresh, /state === 'SUBSCRIBED' && refreshOnMount/)

console.log('Journey background-loader isolation checks passed.')
