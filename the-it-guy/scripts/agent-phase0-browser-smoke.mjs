import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const baseUrl = String(process.env.AGENT_UAT_BASE_URL || '').replace(/\/$/, '')
if (!baseUrl) throw new Error('AGENT_UAT_BASE_URL is required. Use an isolated UAT environment.')

const matrix = JSON.parse(await readFile('config/agent-phase0-screen-matrix.json', 'utf8'))
const outputDirectory = path.resolve(process.env.AGENT_UAT_OUTPUT_DIR || 'test-results/agent-phase0')
const storageState = process.env.AGENT_UAT_STORAGE_STATE || undefined
const useDevBypass = process.env.AGENT_UAT_DEV_BYPASS === 'true'
const email = String(process.env.AGENT_UAT_EMAIL || '')
const password = String(process.env.AGENT_UAT_PASSWORD || '')
const expectedRole = String(process.env.AGENT_UAT_ROLE || 'agent')
const allowedRoles = new Set([expectedRole, expectedRole === 'principal' ? 'agent' : ''])

if (!storageState && !useDevBypass && (!email || !password)) {
  throw new Error('Provide AGENT_UAT_STORAGE_STATE, AGENT_UAT_EMAIL/AGENT_UAT_PASSWORD, or AGENT_UAT_DEV_BYPASS=true.')
}

await mkdir(outputDirectory, { recursive: true })
const roleOutputDirectory = path.join(outputDirectory, expectedRole)
await mkdir(roleOutputDirectory, { recursive: true })
const browser = await chromium.launch({ headless: process.env.AGENT_UAT_HEADED !== 'true' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState })
const page = await context.newPage()
const consoleErrors = []
const expectedBypassAuthNoise = []
const failedRequests = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const entry = { url: page.url(), text: message.text() }
  if (useDevBypass && /Failed to load resource: the server responded with a status of 401/i.test(entry.text)) {
    expectedBypassAuthNoise.push(entry)
    return
  }
  consoleErrors.push(entry)
})
page.on('pageerror', (error) => consoleErrors.push({ url: page.url(), text: error.message }))
page.on('requestfailed', (request) => {
  const error = request.failure()?.errorText || ''
  if (error === 'net::ERR_ABORTED') return
  failedRequests.push({ url: request.url(), method: request.method(), error })
})

if (!storageState) {
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded' })
  if (useDevBypass) {
    const devBypassButton = page.getByRole('button', { name: /^Agent$/ })
    if (await devBypassButton.count() === 0) {
      const runtimeBypassEnabled = await page.evaluate(async () => {
        try {
          const devAuth = await import('/src/lib/devAuth.js')
          return devAuth.isDevAuthBypassEnabled() === true
        } catch {
          return false
        }
      })
      if (!runtimeBypassEnabled) {
        await page.screenshot({ path: path.join(roleOutputDirectory, 'auth-bypass-unavailable.png'), fullPage: true })
        await browser.close()
        throw new Error('AGENT_UAT_DEV_BYPASS=true requires the app to start with VITE_ENABLE_DEV_AUTH_BYPASS=true. No Agent bypass control was rendered.')
      }
      await page.evaluate((role) => window.localStorage.setItem('itg:dev-auth-role', role), expectedRole)
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
    } else {
      await devBypassButton.click()
    }
  } else {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

const technicalErrorPattern = /could not embed|permission denied|auth session missing|failed to fetch|workspace context is required/i
const results = []
for (const screen of matrix.screens.filter((item) => item.roles.some((role) => allowedRoles.has(role)))) {
  const consoleStart = consoleErrors.length
  const requestStart = failedRequests.length
  const startedAt = performance.now()
  await page.goto(`${baseUrl}${screen.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const feedbackMs = Math.round(performance.now() - startedAt)
  let state = 'loading'
  try {
    await page.locator('main').getByText(screen.readyText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 })
    const busyRegion = page.locator('main [aria-busy="true"]').first()
    if (await busyRegion.count()) await busyRegion.waitFor({ state: 'hidden', timeout: 10_000 })
    state = 'ready'
  } catch {
    const text = await page.locator('body').innerText()
    state = /access restricted|permission|not authorised|not authorized/i.test(text)
      ? 'permission_denied'
      : /retry|couldn.t load|unable to load|storage unavailable/i.test(text)
        ? 'error'
        : 'loading'
  }
  const coreReadyMs = Math.round(performance.now() - startedAt)
  const bodyText = await page.locator('body').innerText()
  const uiAudit = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="link"]')]
      .filter(isVisible)
    const unnamedControls = interactive.filter((element) => {
      const labelledBy = String(element.getAttribute('aria-labelledby') || '').trim()
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim()
        : ''
      return !String(
        element.getAttribute('aria-label') ||
        labelledText ||
        element.getAttribute('title') ||
        element.getAttribute('placeholder') ||
        element.textContent ||
        '',
      ).trim()
    }).map((element) => element.outerHTML.slice(0, 240))
    return {
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      interactiveControlCount: interactive.length,
      unnamedControls,
    }
  })
  let focusReachedControl = false
  for (let attempt = 0; attempt < 8 && !focusReachedControl; attempt += 1) {
    await page.keyboard.press('Tab')
    focusReachedControl = await page.evaluate(() => {
      const active = document.activeElement
      return Boolean(active && active !== document.body && active !== document.documentElement)
    })
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  const slug = screen.route.replace(/^\//, '').replaceAll('/', '-') || 'root'
  await page.screenshot({ path: path.join(roleOutputDirectory, `${slug}.png`), fullPage: true })
  results.push({
    name: screen.name,
    route: screen.route,
    finalUrl: page.url(),
    state,
    feedbackMs,
    coreReadyMs,
    horizontalOverflowPx: uiAudit.horizontalOverflowPx,
    interactiveControlCount: uiAudit.interactiveControlCount,
    unnamedControls: uiAudit.unnamedControls,
    focusReachedControl,
    technicalErrorVisible: technicalErrorPattern.test(bodyText),
    consoleErrors: consoleErrors.slice(consoleStart),
    failedRequests: failedRequests.slice(requestStart),
    expectedBypassAuthNoiseCount: useDevBypass ? expectedBypassAuthNoise.filter((entry) => entry.url === page.url()).length : 0,
  })
}

const report = {
  contract: 'arch9-agent-phase0-browser-baseline-v1',
  capturedAt: new Date().toISOString(),
  baseUrl,
  role: expectedRole,
  results,
}
const reportPath = path.join(outputDirectory, `${expectedRole}-acceptance.json`)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
await browser.close()

const failures = results.filter((result) => result.state === 'loading' || result.technicalErrorVisible || result.consoleErrors.length || result.failedRequests.length || result.horizontalOverflowPx > 2 || result.unnamedControls.length || !result.focusReachedControl)
console.table(results.map(({ name, state, coreReadyMs, horizontalOverflowPx, unnamedControls, focusReachedControl, consoleErrors: errors, failedRequests: failed }) => ({ name, state, coreReadyMs, overflow: horizontalOverflowPx, unnamed: unnamedControls.length, focus: focusReachedControl, errors: errors.length, failed: failed.length })))
if (failures.length) {
  throw new Error(`${failures.length} Agent screens failed browser acceptance. See ${reportPath}.`)
}
