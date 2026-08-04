import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migration = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/migrations/202608030009_notification_regression_release_hardening.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(appRoot, 'scripts/notification-regression-suite.mjs'),
  'utf8',
)
const phaseContracts = fs.readFileSync(
  path.join(appRoot, 'scripts/notification-regression-suite-phase-contracts.mjs'),
  'utf8',
)
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const rolloutDoc = fs.readFileSync(
  path.join(workspaceRoot, 'docs/email-notification-branding-rollout.md'),
  'utf8',
)

for (const expectedSql of [
  'bridge_notification_release_readiness_phase10',
  'recent_notification_failures',
  'stale_queued_notifications',
  'organisations_missing_email_branding',
  'requiresRegressionSuite',
  'requiresDenoCheck',
  'requiresBrandedTemplateTests',
  'requiresPhaseScripts',
  'requiresQueueControls',
  'requiresObservabilitySnapshot',
  'requiresPilotOrganisationCanary',
  'grant execute on function public.bridge_notification_release_readiness_phase10(uuid, timestamptz)',
]) {
  assert.ok(migration.includes(expectedSql), `phase 10 migration missing ${expectedSql}`)
}

for (const expectedRunnerToken of [
  'deno',
  'check',
  'brandedTemplates.test.ts',
  'emailBrandingHandlers.test.ts',
  'notificationReminderDispatch.test.ts',
  'notification-regression-suite-phase-contracts.mjs',
  'git',
  'diff',
  '--check',
]) {
  assert.ok(runner.includes(expectedRunnerToken), `notification regression runner missing ${expectedRunnerToken}`)
}

for (const script of [
  'notification-automation-phase3.test.mjs',
  'transaction-roleplayer-notifications-phase4.test.mjs',
  'client-seller-offer-portal-notifications-phase5.test.mjs',
  'bond-attorney-legal-notifications-phase6.test.mjs',
  'weekly-digest-notifications-phase7.test.mjs',
  'commercial-enterprise-notifications-phase8.test.mjs',
  'notification-controls-observability-phase9.test.mjs',
  'notification-regression-release-hardening-phase10.test.mjs',
]) {
  assert.ok(phaseContracts.includes(script), `phase contract runner missing ${script}`)
}

assert.equal(
  pkg.scripts?.['test:notification-regression-release-hardening-phase10'],
  'node scripts/notification-regression-release-hardening-phase10.test.mjs',
  'package script should expose the phase 10 hardening contract',
)
assert.equal(
  pkg.scripts?.['test:notification-phase-contracts'],
  'node scripts/notification-regression-suite-phase-contracts.mjs',
  'package script should expose notification phase contracts',
)
assert.equal(
  pkg.scripts?.['verify:notification-regression-suite'],
  'node scripts/notification-regression-suite.mjs',
  'package script should expose the notification regression suite',
)

for (const expectedDocToken of [
  'Phase 10 Regression Suite And Release Hardening',
  'verify:notification-regression-suite',
  'bridge_notification_release_readiness_phase10',
  'notification_controls_apply_queue',
  'notification_observability_snapshot',
]) {
  assert.ok(rolloutDoc.includes(expectedDocToken), `rollout doc missing ${expectedDocToken}`)
}

console.log('notification regression suite and release hardening phase 10 checks passed')
