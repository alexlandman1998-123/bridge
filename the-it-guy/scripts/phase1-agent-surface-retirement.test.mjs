import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const app = read('src/App.jsx')
const header = read('src/components/HeaderBar.jsx')
const headerApi = read('src/lib/headerNotificationsApi.js')
const roles = read('src/lib/roles.js')
const cron = read('api/cron/document-request-canonical-automation.js')

assert.doesNotMatch(app, /CommandPalette/, 'The retired global command palette must not load in the application shell.')
assert.doesNotMatch(app, /AgentReportingPage/, 'The retired Agent reporting page must not load in the application shell.')
assert.match(app, /function ReportsRoute\(\)[\s\S]*role === 'agent'[\s\S]*Navigate to="\/dashboard" replace/, 'Agent /reports traffic must redirect to Dashboard.')
assert.match(app, /path="\/agents\/reporting"[\s\S]{0,260}Navigate to="\/dashboard" replace/, 'The legacy Agent reporting URL must redirect to Dashboard.')

assert.doesNotMatch(header, /Search transactions, clients, listings/, 'The no-op premium global search must remain removed.')
assert.doesNotMatch(header, /Search unit, buyer, stage/, 'The no-op generic global search must remain removed.')
assert.doesNotMatch(header, /to="\/mobile\/notifications"/, 'Desktop notifications must not link into the mobile module.')
assert.doesNotMatch(header, /runHeaderNotificationMaintenance/, 'Opening the notification drawer must not dispatch reminder maintenance.')
assert.doesNotMatch(headerApi, /runHeaderNotificationMaintenance/, 'The retired header-triggered reminder adapter must remain removed.')
assert.match(headerApi, /isPlaceholderDocumentNotification/, 'Placeholder document reminders must be filtered from the desktop drawer.')
assert.match(headerApi, /\^unit\\s\*-\?\\s\*\$\/i/, 'The Unit - placeholder title must remain suppressed.')
assert.match(header, /itg:agents-search/, 'The functional Agent directory filter must remain available.')
assert.match(header, /itg:attorney-matters-search/, 'The functional attorney matter filter must remain available.')

const sharedReportsItems = roles.match(/label: 'Reports', to: '\/reports'/g) || []
assert.equal(sharedReportsItems.length, 1, 'Only the non-Agent shared Reports navigation item should remain.')
assert.doesNotMatch(roles, /rental_reports/, 'Agent Rentals must not expose the retired shared Reports surface.')

assert.match(cron, /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_PAUSED \|\| 'true'/, 'Document reminder automation must default to paused.')
assert.match(cron, /request\.method === 'POST' && query\.get\('dry-run'\) === 'true'/, 'Only an explicit authenticated POST dry-run may bypass the pause for validation.')
assert.match(cron, /const commitEnabled = !automationPaused/, 'A paused automation must never commit during validation.')
assert.match(cron, /document_reminder_notifications_paused/, 'Paused scheduled runs must return a stable reason.')

console.log('Phase 1 Agent surface retirement checks passed.')
