import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_APP_URL = 'https://app.arch9.co.za'
const DEFAULT_TRANSACTION_ID = '5db513ad-5736-46fe-bd8f-6b298d1d791d'
const AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')
const OUT_DIR = path.join('test-results', 'canonical-document-browser-staging')

const LEGAL_TEMPLATE_REQUIRED_SIGNALS = [
  'Legal Templates',
  'Edit Template',
  'Preview',
  'Save',
  'Publish',
  'Standard Conditions',
  'Legal Coverage',
]

const LEGAL_TEMPLATE_REMOVED_SIGNALS = [
  'Organisation / Legal Templates',
  'Create Editable Draft',
  'Clause Library',
]

const BLANK_TEMPLATE_REQUIRED_SIGNALS = [
  'Blank canvas',
  'Template name',
  'Template type',
  'Create Blank Template',
]

const TRANSACTION_DOCUMENT_REQUIRED_SIGNALS = [
  'Document Readiness',
  'Critical Documents',
  'Missing Documents',
  'Document Library',
]

function hasArg(name) {
  return process.argv.includes(name)
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeUrl(value = '') {
  return normalizeText(value).replace(/\/+$/, '')
}

function isTruthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function cleanEnvValue(value = '') {
  const trimmed = normalizeText(value)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        if (index === -1) return [line, '']
        return [line.slice(0, index), cleanEnvValue(line.slice(index + 1))]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.staging.local'),
    ...parseEnvFile('.env.production.local'),
    ...process.env,
  }
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function requireConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const appUrl = normalizeUrl(env.CANONICAL_BROWSER_APP_URL || env.STAGING_APP_URL || DEFAULT_APP_URL)
  const email = normalizeText(
    env.CANONICAL_BROWSER_EMAIL ||
    env.AGENCY_RUNTIME_AGENT_EMAIL ||
    env.STAGING_INTERNAL_EMAIL,
  )
  const password = normalizeText(
    env.CANONICAL_BROWSER_PASSWORD ||
    env.AGENCY_RUNTIME_AGENT_PASSWORD ||
    env.STAGING_INTERNAL_PASSWORD,
  )
  const transactionId = normalizeText(env.CANONICAL_BROWSER_TRANSACTION_ID || DEFAULT_TRANSACTION_ID)

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL or VITE_SUPABASE_URL is required for staging safety checks.')
  }
  if (projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing browser smoke outside staging project ${STAGING_PROJECT_REF}.`)
  }
  if (!email || !password) {
    throw new Error('CANONICAL_BROWSER_EMAIL/PASSWORD or STAGING_INTERNAL_EMAIL/PASSWORD are required for browser staging verification.')
  }
  if (!transactionId) {
    throw new Error('CANONICAL_BROWSER_TRANSACTION_ID is required when no default pilot transaction is available.')
  }

  return { appUrl, email, password, transactionId }
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse verifier JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

async function runNodeScript(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptPath} exited ${code}\n${stderr || stdout}`))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function runParityGate(env) {
  if (hasArg('--skip-parity') || isTruthy(env.CANONICAL_BROWSER_SKIP_PARITY)) {
    return { skipped: true }
  }

  const { stdout } = await runNodeScript('scripts/canonical-document-real-staging-dry-run.mjs', env)
  const report = extractJsonObject(stdout)
  const critical = report.criticalChecks || {}
  const requiredZeroChecks = [
    'unmappedLegacyKeyCount',
    'duplicateActiveCanonicalRequirementCount',
    'statusConflictCount',
    'invalidRoleIssueCount',
    'impossibleWorkflowBlockerCount',
  ]

  for (const key of requiredZeroChecks) {
    assert.equal(critical[key] || 0, 0, `Phase 4 browser smoke requires ${key}=0 before opening staging UI.`)
  }
  assert.equal(
    report.recommendation,
    'proceed_to_browser_level_staging_verification_after_manual_review_of_backfill_report',
    'Phase 3 verifier must recommend browser-level staging verification.',
  )

  return {
    skipped: false,
    recommendation: report.recommendation,
    paritySummary: report.paritySummary,
    criticalChecks: critical,
  }
}

function formatBlockingReasons(reasons = []) {
  return reasons
    .map((reason) => `${reason.code || 'blocked'}: ${reason.detail || 'No detail provided.'}`)
    .join('; ')
}

async function runActorReadinessGate(env) {
  if (hasArg('--skip-actor-readiness') || isTruthy(env.CANONICAL_BROWSER_SKIP_ACTOR_READINESS)) {
    return { skipped: true, ok: true }
  }

  const { stdout } = await runNodeScript('scripts/canonical-document-browser-actor-readiness.mjs', env)
  const report = extractJsonObject(stdout)
  const readiness = report.readiness || {}
  const blockingReasons = readiness.blockingReasons || []
  const warnings = readiness.warnings || []

  return {
    skipped: false,
    ok: Boolean(report.ok),
    status: readiness.status || 'UNKNOWN',
    selectedMembershipId: readiness.selectedMembershipId || null,
    selectedWorkspaceId: readiness.selectedWorkspaceId || null,
    blockingReasons,
    warningCount: warnings.length,
  }
}

function assertActorReadiness(actorReadiness) {
  if (actorReadiness?.skipped) return

  assert.ok(
    actorReadiness?.ok,
    `browser_actor_not_ready: ${actorReadiness?.status || 'UNKNOWN'}. ` +
      `${formatBlockingReasons(actorReadiness?.blockingReasons) || 'Readiness check did not return READY or READY_WITH_WARNINGS.'}`,
  )
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 20_000 })
}

async function assertBodyIncludes(page, text) {
  const body = await bodyText(page)
  assert.ok(
    body.includes(text),
    `Expected page body to include "${text}" at ${page.url()}.\nBody excerpt: ${body.replace(/\s+/g, ' ').slice(0, 800)}`,
  )
}

async function assertBodyExcludes(page, text) {
  const body = await bodyText(page)
  assert.equal(
    body.includes(text),
    false,
    `Expected page body not to include removed copy "${text}" at ${page.url()}.\nBody excerpt: ${body.replace(/\s+/g, ' ').slice(0, 800)}`,
  )
}

async function assertNoCrashPage(page, label) {
  const body = await bodyText(page)
  const blockedPatterns = [
    /something went wrong/i,
    /application error/i,
    /cannot read properties/i,
    /uncaught runtime error/i,
    /blank screen/i,
  ]
  for (const pattern of blockedPatterns) {
    assert.equal(pattern.test(body), false, `${label} rendered crash copy matching ${pattern}.`)
  }
}

function createTelemetry(page, appUrl) {
  const appOrigin = new URL(appUrl).origin
  const telemetry = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    http5xx: [],
  }

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/favicon|chrome-extension|failed to load resource/i.test(text)) return
    telemetry.consoleErrors.push(text)
  })
  page.on('pageerror', (error) => {
    telemetry.pageErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (!url.startsWith(appOrigin)) return
    telemetry.requestFailures.push({
      method: request.method(),
      url,
      failure: request.failure()?.errorText || 'requestfailed',
    })
  })
  page.on('response', (response) => {
    if (response.status() < 500) return
    const url = response.url()
    if (!url.startsWith(appOrigin)) return
    telemetry.http5xx.push({ status: response.status(), url })
  })

  return telemetry
}

async function waitForStablePage(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => null)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.waitForTimeout(1000)
}

async function signIn(page, config) {
  await page.goto(`${config.appUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByLabel(/email/i).fill(config.email)
  await page.getByLabel(/password/i).fill(config.password)
  await page.getByRole('button', { name: /sign in securely|launch workspace|sign in/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 })
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })
  await page.context().storageState({ path: AUTH_STATE_PATH })
}

async function continueFromSetupRecoveryIfReady(page, config, route) {
  const currentPath = new URL(page.url()).pathname
  if (!currentPath.startsWith('/setup/recovery')) return

  const body = await bodyText(page).catch(() => '')
  if (!/workspace membership active/i.test(body) || !/open dashboard/i.test(body)) return

  await page.getByRole('button', { name: /open dashboard/i }).first().click()
  await waitForStablePage(page)
  await page.goto(`${config.appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForStablePage(page)
}

async function assertNotBlockedByOnboardingGate(page) {
  const currentPath = new URL(page.url()).pathname
  if (!currentPath.startsWith('/setup/recovery') && !currentPath.startsWith('/onboarding/profile')) return

  const body = await bodyText(page).catch(() => '')
  throw new Error(
    `blocked_staging_actor_onboarding: the configured browser actor is still gated at ${currentPath}. ` +
    'Set CANONICAL_BROWSER_EMAIL and CANONICAL_BROWSER_PASSWORD to a staging user with completed profile, active workspace membership, and legal-template/transaction access. ' +
    `Body excerpt: ${body.replace(/\s+/g, ' ').slice(0, 800)}`,
  )
}

async function openAuthenticated(page, config, route) {
  await page.goto(`${config.appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForStablePage(page)
  const currentPath = new URL(page.url()).pathname
  const body = await bodyText(page).catch(() => '')
  if (currentPath.startsWith('/auth') || /sign in to|sign in securely|launch workspace/i.test(body)) {
    await signIn(page, config)
    await page.goto(`${config.appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForStablePage(page)
  }
  await continueFromSetupRecoveryIfReady(page, config, route)
  await assertNotBlockedByOnboardingGate(page)
}

async function runLegalTemplatesSmoke(page, config) {
  await openAuthenticated(page, config, '/settings/legal-templates')
  await assertNoCrashPage(page, 'Legal templates')

  for (const signal of LEGAL_TEMPLATE_REQUIRED_SIGNALS) {
    await assertBodyIncludes(page, signal)
  }
  for (const signal of LEGAL_TEMPLATE_REMOVED_SIGNALS) {
    await assertBodyExcludes(page, signal)
  }

  const blankTemplateButton = page
    .getByRole('button', { name: /blank template|\+ template/i })
    .first()
  await blankTemplateButton.waitFor({ state: 'visible', timeout: 20_000 })
  await blankTemplateButton.click()
  await waitForStablePage(page)

  for (const signal of BLANK_TEMPLATE_REQUIRED_SIGNALS) {
    await assertBodyIncludes(page, signal)
  }
  await assertBodyExcludes(page, 'Choose a starter')
  await assertBodyExcludes(page, 'Common addendums')

  const screenshot = path.join(OUT_DIR, 'legal-templates-blank-template.png')
  await page.screenshot({ path: screenshot, fullPage: true })

  return {
    route: page.url(),
    screenshot,
    requiredSignals: LEGAL_TEMPLATE_REQUIRED_SIGNALS,
    removedSignalsAbsent: LEGAL_TEMPLATE_REMOVED_SIGNALS,
    blankTemplateSignals: BLANK_TEMPLATE_REQUIRED_SIGNALS,
  }
}

async function runTransactionDocumentsSmoke(page, config) {
  const route = `/transactions/${config.transactionId}`
  await openAuthenticated(page, config, route)
  await assertNoCrashPage(page, 'Transaction detail')

  const tabs = page.locator('nav[aria-label="Transaction workspace tabs"]')
  await tabs.waitFor({ state: 'visible', timeout: 30_000 })
  await tabs.getByRole('button', { name: /^Documents$/ }).click()
  await waitForStablePage(page)
  await assertNoCrashPage(page, 'Transaction documents')

  for (const signal of TRANSACTION_DOCUMENT_REQUIRED_SIGNALS) {
    await assertBodyIncludes(page, signal)
  }

  const screenshot = path.join(OUT_DIR, 'transaction-documents.png')
  await page.screenshot({ path: screenshot, fullPage: true })

  return {
    route: page.url(),
    transactionId: config.transactionId,
    screenshot,
    requiredSignals: TRANSACTION_DOCUMENT_REQUIRED_SIGNALS,
  }
}

async function main() {
  const env = loadEnv()
  const config = requireConfig(env)
  let parity = null
  let actorReadiness = null

  try {
    parity = await runParityGate(env)
    actorReadiness = await runActorReadinessGate(env)
    assertActorReadiness(actorReadiness)
  } catch (error) {
    console.error(safeJson({
      ok: false,
      mode: 'real_staging_browser_smoke_preflight',
      mutatedData: false,
      appUrl: config.appUrl,
      parity,
      actorReadiness,
      error: error?.message || String(error),
    }))
    throw error
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const headless = !isTruthy(env.CANONICAL_BROWSER_HEADED)
  const storageState = isTruthy(env.CANONICAL_BROWSER_USE_AUTH_STATE) && fs.existsSync(AUTH_STATE_PATH)
    ? AUTH_STATE_PATH
    : undefined
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 1050 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const telemetry = createTelemetry(page, config.appUrl)

  try {
    const legalTemplates = await runLegalTemplatesSmoke(page, config)
    const transactionDocuments = await runTransactionDocumentsSmoke(page, config)

    assert.deepEqual(telemetry.pageErrors, [], `Page errors:\n${telemetry.pageErrors.join('\n')}`)
    assert.deepEqual(telemetry.http5xx, [], `HTTP 5xx responses:\n${safeJson(telemetry.http5xx)}`)

    const report = {
      ok: true,
      mode: 'real_staging_browser_smoke',
      mutatedData: false,
      appUrl: config.appUrl,
      parity,
      actorReadiness,
      browser: {
        legalTemplates,
        transactionDocuments,
        telemetry: {
          consoleErrorCount: telemetry.consoleErrors.length,
          pageErrorCount: telemetry.pageErrors.length,
          requestFailureCount: telemetry.requestFailures.length,
          http5xxCount: telemetry.http5xx.length,
          consoleErrorPreview: telemetry.consoleErrors.slice(0, 5),
          requestFailurePreview: telemetry.requestFailures.slice(0, 5),
        },
      },
    }

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), safeJson(report))
    console.log(safeJson(report))
  } catch (error) {
    const failureScreenshot = path.join(OUT_DIR, 'failure.png')
    await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => null)
    const failureBody = await bodyText(page).catch(() => '')
    console.error(safeJson({
      ok: false,
      mode: 'real_staging_browser_smoke',
      mutatedData: false,
      appUrl: config.appUrl,
      parity,
      actorReadiness,
      currentUrl: page.url(),
      failureScreenshot,
      bodyExcerpt: failureBody.replace(/\s+/g, ' ').slice(0, 1200),
      error: error?.message || String(error),
      telemetry: {
        consoleErrorCount: telemetry.consoleErrors.length,
        pageErrorCount: telemetry.pageErrors.length,
        requestFailureCount: telemetry.requestFailures.length,
        http5xxCount: telemetry.http5xx.length,
        consoleErrorPreview: telemetry.consoleErrors.slice(0, 5),
        requestFailurePreview: telemetry.requestFailures.slice(0, 5),
        http5xxPreview: telemetry.http5xx.slice(0, 5),
      },
    }))
    throw error
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
