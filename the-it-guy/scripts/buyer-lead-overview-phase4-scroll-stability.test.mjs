import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [appSource, pageSource, stylesSource] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
])

assert.match(appSource, /if \(pathname\.startsWith\('\/pipeline\/leads\/'\)\) return pathname/, 'lead tab search changes must keep a stable route content key')
assert.match(appSource, /const isLeadWorkspaceRoute = \/\^\\\/pipeline\\\/leads\\\/\[\^\/\]\+\//, 'lead detail routes must be identified independently of their query string')
assert.match(appSource, /isLeadWorkspaceRoute \? 'ui-page-scroll-stable' : ''/, 'scroll anchoring protection must only apply to lead workspaces')
assert.match(appSource, /data-scroll-stability=\{isLeadWorkspaceRoute \? 'hydrating-workspace' : undefined\}/, 'scroll stability state must remain inspectable')
assert.match(stylesSource, /\.ui-page-scroll-stable\s*\{\s*overflow-anchor: none;/, 'async lead hydration must not move the scroll container through browser anchoring')

const assignmentStart = pageSource.indexOf('function BuyerLeadAssignmentDropdown(')
const assignmentEnd = pageSource.indexOf('\nfunction AgencyPipelinePage(', assignmentStart)
const assignmentSource = pageSource.slice(assignmentStart, assignmentEnd)
assert.doesNotMatch(assignmentSource, /autoFocus/, 'assignment focus must not invoke native scroll restoration')
assert.match(assignmentSource, /searchInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/, 'assignment search should focus without moving the workspace')
assert.match(assignmentSource, /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/, 'Escape focus restoration should not move the workspace')
assert.doesNotMatch(pageSource, /captureRouteLeadWorkspaceScroll|restoreRouteLeadWorkspaceScroll/, 'tab changes must not fight the user with manual scroll snapshots')

console.log('buyer lead overview Phase 4 scroll stability contracts passed')
