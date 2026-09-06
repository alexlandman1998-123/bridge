import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = String(process.env.AGENT_UAT_BASE_URL || '').replace(/\/$/, '')
if (!baseUrl) throw new Error('AGENT_UAT_BASE_URL is required.')
const useDevBypass = process.env.AGENT_UAT_DEV_BYPASS === 'true'
const storageState = process.env.AGENT_UAT_STORAGE_STATE || undefined
const email = String(process.env.AGENT_UAT_EMAIL || '')
const password = String(process.env.AGENT_UAT_PASSWORD || '')
if (!storageState && !useDevBypass && (!email || !password)) throw new Error('Provide storage state, credentials, or AGENT_UAT_DEV_BYPASS=true.')

const matrix = JSON.parse(await readFile('config/agent-scale-phase2-action-matrix.json', 'utf8'))
const outputDirectory = path.resolve(process.env.AGENT_PHASE2_FUNCTIONAL_OUTPUT_DIR || 'test-results/agent-scale-phase2')
await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch({ headless: process.env.AGENT_UAT_HEADED !== 'true' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState })
const page = await context.newPage()
const unexpectedErrors = []
const requestFailures = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (useDevBypass && /Failed to load resource: the server responded with a status of 401/i.test(message.text())) return
  if (useDevBypass && /^\[PrincipalDashboard\] load failed[\s\S]*(?:Failed to fetch|Auth session missing)/i.test(message.text())) return
  unexpectedErrors.push({ url: page.url(), text: message.text() })
})
page.on('pageerror', (error) => unexpectedErrors.push({ url: page.url(), text: error.message }))
page.on('requestfailed', (request) => {
  if (request.failure()?.errorText === 'net::ERR_ABORTED') return
  requestFailures.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText || '' })
})

if (!storageState) {
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded' })
  if (useDevBypass) {
    const enabled = await page.evaluate(async () => (await import('/src/lib/devAuth.js')).isDevAuthBypassEnabled())
    if (!enabled) throw new Error('Start the app with VITE_ENABLE_DEV_AUTH_BYPASS=true.')
    await page.evaluate(() => localStorage.setItem('itg:dev-auth-role', 'agent'))
  } else {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
  }
}

const results = []
for (const scenario of matrix.safeScenarios) {
  const errorStart = unexpectedErrors.length
  const requestStart = requestFailures.length
  const startedAt = performance.now()
  let status = 'PASS'
  let failure = null
  try {
    await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 })
    for (const step of scenario.steps) {
      if (step.action === 'clickTestId') await page.getByTestId(step.value).click({ timeout: 15_000 })
      else if (step.action === 'clickLink') await page.getByRole('link', { name: step.value, exact: true }).click({ timeout: 15_000 })
      else if (step.action === 'clickButton') await page.getByRole('button', { name: step.value, exact: true }).click({ timeout: 15_000 })
      else if (step.action === 'fillPlaceholder') await page.getByPlaceholder(step.value).fill(step.text)
      else throw new Error(`Unsupported action: ${step.action}`)
    }
    if (scenario.expect.roleVisible) await page.getByRole(scenario.expect.roleVisible).waitFor({ state: 'visible', timeout: 10_000 })
    if (scenario.expect.path) {
      await page.waitForURL((url) => url.pathname === scenario.expect.path, { timeout: 10_000 })
      if (scenario.expect.survivesReload) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        assert.equal(new URL(page.url()).pathname, scenario.expect.path)
      }
    }
    if (scenario.expect.inputValue) {
      const step = scenario.steps.find((item) => item.action === 'fillPlaceholder')
      await expectValue(page.getByPlaceholder(step.value), scenario.expect.inputValue)
    }
    assert.equal(unexpectedErrors.length, errorStart, 'Unexpected browser error')
    assert.equal(requestFailures.length, requestStart, 'Unexpected failed request')
  } catch (error) {
    status = 'FAIL'
    failure = error.message
    await page.screenshot({ path: path.join(outputDirectory, `${scenario.name}-failure.png`), fullPage: true })
  }
  results.push({ name: scenario.name, status, durationMs: Math.round(performance.now() - startedAt), failure })
}

const inventory = await collectInventory(page, matrix.mutationLabels)
const report = {
  contract: 'arch9-agent-scale-phase2-functional-acceptance-v1',
  capturedAt: new Date().toISOString(),
  baseUrl,
  authentication: useDevBypass ? 'local-dev-bypass' : 'authenticated',
  status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
  results,
  unexpectedErrors,
  requestFailures,
  finalScreenInventory: inventory,
}
await writeFile(path.join(outputDirectory, 'functional-acceptance.json'), `${JSON.stringify(report, null, 2)}\n`)
await browser.close()
console.table(results)
if (report.status !== 'PASS') throw new Error('Agent scale Phase 2 functional acceptance failed.')

async function expectValue(locator, expected) {
  await locator.waitFor({ state: 'visible' })
  assert.equal(await locator.inputValue(), expected)
}

async function collectInventory(activePage, mutationLabels) {
  return activePage.locator('button:visible,a[href]:visible,input:visible,select:visible,textarea:visible').evaluateAll((elements, labels) => {
    const mutationPattern = new RegExp(`\\b(${labels.join('|')})\\b`, 'i')
    return elements.map((element) => {
      const name = String(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || element.getAttribute('placeholder') || '').trim()
      let classification = 'safe_interaction'
      if (element.disabled) classification = 'deliberately_unavailable'
      else if (element.tagName === 'A') classification = 'safe_navigation'
      else if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) classification = 'form_control'
      else if (mutationPattern.test(name)) classification = 'mutation_or_external_effect'
      return { tag: element.tagName.toLowerCase(), name: name.slice(0, 160), classification }
    })
  }, mutationLabels)
}
