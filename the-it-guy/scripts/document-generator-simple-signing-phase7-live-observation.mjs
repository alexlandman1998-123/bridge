import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PHASE = 'document-generator-simple-signing-ui-phase-7'
const CONFIG_PATH = 'config/document-generator-simple-signing-phase7-live-observation.json'
const DEFAULT_REPORT_PATH = 'test-results/document-generator-simple-signing-phase7/live-observation-report.json'
const PRODUCTION_APP_URL = 'https://app.arch9.co.za'
const CONTROLLED_TOKEN_ENV = 'SIMPLE_SIGNING_PHASE7_CONTROLLED_TOKEN'
const ALLOWED_FUNCTIONS = new Set(['resolve-signer-token'])
const FORBIDDEN_FUNCTIONS = new Set([
  'signer-signing-action',
  'dispatch-final-signed-document',
  'resolve-final-signed-document-access',
  'generate-final-signed-document',
  'send-email',
])

function argValue(name, fallback = '') {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function redactedSignerUrl() {
  return `${PRODUCTION_APP_URL}/sign/[redacted-token]`
}

function productionSignerUrl(token) {
  return `${PRODUCTION_APP_URL}/sign/${encodeURIComponent(token)}`
}

function edgeFunctionName(url) {
  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes('/functions/v1/')) return ''
    return parsed.pathname.split('/').filter(Boolean).at(-1) || ''
  } catch {
    return ''
  }
}

async function visible(locator) {
  return locator.count().then(async (count) => count > 0 && locator.first().isVisible()).catch(() => false)
}

async function observeLiveRoute({ token, reportPath, shouldWrite }) {
  const blockers = []
  const calls = []
  const telemetry = { pageErrors: [], consoleErrors: [], failedRequests: [] }
  const releaseManifest = await fetch(`${PRODUCTION_APP_URL}/release-manifest.json`, {
    signal: AbortSignal.timeout(30_000),
  })
    .then(async (response) => ({
      ok: response.ok,
      httpStatus: response.status,
      releaseId: response.ok ? (await response.json().catch(() => ({})))?.releaseId || null : null,
    }))
    .catch((error) => {
      blockers.push({ code: 'PHASE7_RELEASE_MANIFEST_UNAVAILABLE', detail: error.message })
      return { ok: false, httpStatus: null, releaseId: null }
    })
  if (!releaseManifest.ok) {
    blockers.push({ code: 'PHASE7_RELEASE_MANIFEST_HTTP_NOT_OK', detail: String(releaseManifest.httpStatus || 'unavailable') })
  }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  })

  try {
    const page = await context.newPage()
    page.on('pageerror', (error) => telemetry.pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') telemetry.consoleErrors.push(message.text())
    })
    page.on('request', (request) => {
      const functionName = edgeFunctionName(request.url())
      if (!functionName) return
      let action = 'resolve'
      try {
        const body = request.postDataJSON()
        action = body?.action || action
      } catch {
        action = 'resolve'
      }
      calls.push({ functionName, method: request.method(), action })
    })
    page.on('requestfailed', (request) => {
      const functionName = edgeFunctionName(request.url())
      telemetry.failedRequests.push(functionName || request.url().replace(token, '[redacted-token]'))
    })

    const response = await page.goto(productionSignerUrl(token), {
      waitUntil: 'networkidle',
      timeout: 60_000,
    }).catch((error) => {
      blockers.push({ code: 'PHASE7_ROUTE_LOAD_FAILED', detail: error.message })
      return null
    })

    if (response && !response.ok()) {
      blockers.push({ code: 'PHASE7_ROUTE_HTTP_NOT_OK', detail: `HTTP ${response.status()}` })
    }

    const shellVisible = await page.getByTestId('simple-signing-shell').waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (!shellVisible) blockers.push({ code: 'PHASE7_SIMPLE_SHELL_NOT_VISIBLE' })

    const requiredRegions = [
      ['simple-signing-progress', 'PHASE7_PROGRESS_REGION_MISSING'],
      ['simple-signing-document-card', 'PHASE7_DOCUMENT_REGION_MISSING'],
      ['simple-signing-action-card', 'PHASE7_ACTION_REGION_MISSING'],
      ['simple-signing-help-card', 'PHASE7_HELP_REGION_MISSING'],
      ['simple-signing-secure-footer', 'PHASE7_SECURE_FOOTER_MISSING'],
    ]
    for (const [testId, code] of requiredRegions) {
      if (!await visible(page.getByTestId(testId))) blockers.push({ code })
    }

    const oldSurfaceCount = await page
      .locator('[data-testid="document-role-actions"], [data-testid="document-mobile-action"], [data-testid="document-journey-progress"]')
      .count()
      .catch(() => 0)
    if (oldSurfaceCount > 0) blockers.push({ code: 'PHASE7_OLD_SIGNER_SURFACE_VISIBLE', detail: String(oldSurfaceCount) })

    const horizontalOverflowPx = await page
      .evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .catch(() => null)
    if (horizontalOverflowPx === null || horizontalOverflowPx > 2) {
      blockers.push({ code: 'PHASE7_HORIZONTAL_OVERFLOW', detail: String(horizontalOverflowPx) })
    }

    for (const call of calls) {
      if (FORBIDDEN_FUNCTIONS.has(call.functionName)) {
        blockers.push({ code: 'PHASE7_FORBIDDEN_PRODUCTION_CALL', detail: call.functionName })
      }
      if (!ALLOWED_FUNCTIONS.has(call.functionName)) {
        blockers.push({ code: 'PHASE7_UNEXPECTED_PRODUCTION_CALL', detail: call.functionName })
      }
      if (call.functionName === 'signer-signing-action' && call.action !== 'resolve') {
        blockers.push({ code: 'PHASE7_SIGNING_ACTION_ATTEMPTED', detail: call.action })
      }
    }

    for (const error of telemetry.pageErrors) blockers.push({ code: 'PHASE7_PAGE_ERROR', detail: error })
    for (const request of telemetry.failedRequests) blockers.push({ code: 'PHASE7_REQUEST_FAILED', detail: request })

    const screenshotPath = shouldWrite
      ? path.join(path.dirname(reportPath), 'live-observation-mobile.png')
      : null
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
      await page.screenshot({ path: screenshotPath, fullPage: true })
    }

    const report = {
      phase: PHASE,
      status: blockers.length ? 'blocked' : 'healthy',
      decision: blockers.length ? 'rollback_or_investigate_signer_route' : 'keep_live',
      observedAt: new Date().toISOString(),
      production: {
        appUrl: PRODUCTION_APP_URL,
        route: '/sign/:token',
        observedUrl: redactedSignerUrl(),
        releaseManifest: {
          reachable: releaseManifest.ok === true,
          httpStatus: releaseManifest.httpStatus,
          releaseId: releaseManifest.releaseId,
        },
      },
      controls: {
        readOnly: true,
        invokesSigningAction: false,
        sendsRealCustomerEmails: false,
        generatesFinalArtifacts: false,
        resolvesFinalArtifactAccess: false,
        controlledTokenRedacted: true,
      },
      evidence: {
        viewport: { width: 390, height: 844 },
        shellVisible,
        oldSurfaceCount,
        horizontalOverflowPx,
        allowedCalls: calls.filter((call) => ALLOWED_FUNCTIONS.has(call.functionName)),
        forbiddenCallCount: calls.filter((call) => FORBIDDEN_FUNCTIONS.has(call.functionName)).length,
        screenshot: screenshotPath,
      },
      blockers,
    }

    if (shouldWrite) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    }
    return report
  } finally {
    await context.close()
    await browser.close()
  }
}

const config = readJson(CONFIG_PATH)
assert.equal(config.phase, PHASE)
assert.equal(config.production.appUrl, PRODUCTION_APP_URL)
assert.equal(config.observation.controlledTokenEnvironmentVariable, CONTROLLED_TOKEN_ENV)

const shouldRunLive = process.argv.includes('--live')
const shouldWrite = process.argv.includes('--write')
const reportPath = argValue('--report', DEFAULT_REPORT_PATH)
const token = String(argValue('--token', process.env[CONTROLLED_TOKEN_ENV] || '')).trim()

if (!shouldRunLive) {
  const report = {
    phase: PHASE,
    status: 'live_observation_not_run',
    decision: 'run_with_controlled_token_after_promotion',
    production: {
      appUrl: PRODUCTION_APP_URL,
      route: '/sign/:token',
      observedUrl: redactedSignerUrl(),
    },
    controls: {
      readOnly: true,
      invokesSigningAction: false,
      sendsRealCustomerEmails: false,
      generatesFinalArtifacts: false,
      resolvesFinalArtifactAccess: false,
      controlledTokenRedacted: true,
    },
    requiredCommand: config.observation.liveCommand,
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

if (!token) {
  console.error(`Phase 7 live observation requires ${CONTROLLED_TOKEN_ENV} or --token=<controlled-token>.`)
  process.exit(2)
}

const report = await observeLiveRoute({ token, reportPath, shouldWrite })
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'healthy') process.exit(1)
