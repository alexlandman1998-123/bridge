import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  accountPage: await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8'),
  settingsUi: await readFile(new URL('../src/pages/settings/settingsUi.jsx', import.meta.url), 'utf8'),
  settingsApi: await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  "sectionTitle={showSecurity ? 'Security' : showNotifications ? 'Notifications' : 'Profile'}",
  "Manage how and when you'd like to hear from Arch9.",
  'NotificationSwitch',
  'role="switch"',
  'Email Notifications',
  'Receive important updates in your inbox.',
  'Workflow Updates',
  'Document Uploads',
  'In-App Notifications',
  'Transaction Updates',
  'Task Reminders',
  'Partner Activity',
  'SMS Notifications',
  'Critical Alerts',
  'OTP Verification',
  'Recommended',
  'Desktop Notifications',
  'Browser Notifications',
  'Notification Summary',
  'NOTIFICATION_DIGEST_OPTIONS',
  'Quiet Hours',
  'Africa/Johannesburg',
  'Notification Status',
  'Manage organisation-wide notifications',
  'You have unsaved notification changes.',
  'Notification preferences updated.',
  'NOTIFICATION_UNSAVED_PROMPT',
  'beforeunload',
  "document.addEventListener('click', handleDocumentClick, true)",
]) {
  assert(files.accountPage.includes(token), `notifications page should retain premium notification UI marker: ${token}`)
}

for (const removedToken of [
  '<SettingsToggleRow',
  'type="checkbox"',
  'Marketing updates',
  'SMS alerts',
  'Push, SMS and Critical Alerts',
]) {
  assert(!files.accountPage.includes(removedToken), `notifications page should not retain old checkbox/list marker: ${removedToken}`)
}

for (const token of [
  "message = 'You have unsaved changes'",
  "discardLabel = 'Discard changes'",
  "saveLabel = 'Save changes'",
  '{message}',
  '{discardLabel}',
  'saveLabel',
]) {
  assert(files.settingsUi.includes(token), `sticky save bar should expose notification-specific copy hook: ${token}`)
}

for (const token of [
  'emailEnabled: true',
  'inAppEnabled: true',
  'smsCriticalAlerts: true',
  'desktopNotificationsEnabled: false',
  "notificationDigest: 'weekly'",
  "quietHoursStart: '22:00'",
  "quietHoursEnd: '07:00'",
  "quietHoursTimezone: 'Africa/Johannesburg'",
  '...safeJson(row?.notification_preferences_json, DEFAULT_NOTIFICATION_PREFERENCES)',
]) {
  assert(files.settingsApi.includes(token), `settings API should support expanded notification preference defaults: ${token}`)
}

assert(files.layout.includes("label: 'Notifications'"), 'settings inner navigation should keep Notifications in the account group')
assert(!files.layout.includes('SettingsSearch'), 'settings layout should not reintroduce the large search bar')
assert.match(files.packageJson, /"test:settings-notifications-premium-refactor": "node scripts\/settings-notifications-premium-refactor\.test\.mjs"/)

console.log('Settings notifications premium refactor contract passed.')
