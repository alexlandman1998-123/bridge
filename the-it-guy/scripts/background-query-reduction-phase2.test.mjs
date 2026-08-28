import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  BACKGROUND_REFRESH_INTERVALS,
  shouldRunBackgroundRefresh,
} from '../src/hooks/backgroundRefreshPolicy.js'
import {
  DEFAULT_FALLBACK_POLLING_MS,
  resolveTransactionPollReason,
} from '../src/hooks/transactionLiveRefreshPolicy.js'

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')

test('background refresh policy pauses hidden tabs and throttles foreground events', () => {
  const base = { now: 100_000, lastRunAt: 80_000, minIntervalMs: 30_000 }
  assert.equal(shouldRunBackgroundRefresh({ ...base, visibilityState: 'hidden', force: true }), false)
  assert.equal(shouldRunBackgroundRefresh({ ...base, visibilityState: 'visible' }), false)
  assert.equal(shouldRunBackgroundRefresh({ ...base, visibilityState: 'visible', now: 110_000 }), true)
  assert.equal(shouldRunBackgroundRefresh({ ...base, visibilityState: 'visible', force: true }), true)
})

test('high-volume pollers use bounded intervals', () => {
  assert.equal(BACKGROUND_REFRESH_INTERVALS.externalPortal, 60_000)
  assert.equal(BACKGROUND_REFRESH_INTERVALS.agencyCalendar, 180_000)
  assert.equal(BACKGROUND_REFRESH_INTERVALS.notifications, 300_000)
  assert.equal(BACKGROUND_REFRESH_INTERVALS.commandCenter, 300_000)
})

test('transaction fallback is Realtime-first and never polls hidden tabs', () => {
  const base = {
    visibilityState: 'visible',
    realtimeState: 'polling',
    lastReconciliationAt: 100_000,
    fallbackPollingIntervalMs: DEFAULT_FALLBACK_POLLING_MS,
  }
  assert.equal(resolveTransactionPollReason({ ...base, now: 159_999 }), null)
  assert.equal(resolveTransactionPollReason({ ...base, now: 160_000 }), 'poll_fallback')
  assert.equal(resolveTransactionPollReason({ ...base, now: 200_000, visibilityState: 'hidden' }), null)
})

test('page-level background loops share the visibility-aware controller', async () => {
  const [header, portal, commandCenter, pipeline, pollingHook] = await Promise.all([
    read('src/components/HeaderBar.jsx'),
    read('src/pages/ExternalTransactionPortal.jsx'),
    read('src/pages/CommandCenterPage.jsx'),
    read('src/pages/agency/AgencyPipelinePage.jsx'),
    read('src/hooks/useVisibilityAwarePolling.js'),
  ])

  for (const source of [header, portal, commandCenter, pipeline]) {
    assert.match(source, /useVisibilityAwarePolling/)
  }
  assert.doesNotMatch(header, /runReminderAutomation: true/)
  assert.doesNotMatch(portal, /setInterval\(/)
  assert.doesNotMatch(commandCenter, /setInterval\(/)
  assert.doesNotMatch(pipeline.slice(pipeline.indexOf('useVisibilityAwarePolling')), /45000/)
  assert.match(pollingHook, /if \(!active \|\| inFlight\) return false/)
  assert.match(pollingHook, /document\.visibilityState/)
})
