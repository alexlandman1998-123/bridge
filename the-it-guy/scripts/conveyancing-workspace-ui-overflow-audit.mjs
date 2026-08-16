import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const APP_ROOT = new URL('../', import.meta.url)
const DEFAULT_PORT = 5197
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const FAKE_SUPABASE_URL = 'https://conveyancing-workspace-ui-audit.supabase.co'
const FAKE_ANON_KEY = 'conveyancing-workspace-ui-audit-anon-key'
const DEV_AUTH_STORAGE_KEY = 'itg:dev-auth-role'
const DEFAULT_TRANSACTION_ID = 'demo-conveyancing-overflow-audit'
const OUT_DIR = path.join('test-results', 'conveyancing-workspace-ui-overflow')
const SOURCE_FILE = 'src/pages/AttorneyTransactionDetail.jsx'
const NAVIGATION_TIMEOUT_MS = 60_000

const VIEWPORTS = Object.freeze([
  Object.freeze({ key: 'desktop', width: 1440, height: 1050 }),
  Object.freeze({ key: 'laptop', width: 1024, height: 900 }),
  Object.freeze({ key: 'tablet', width: 768, height: 1000 }),
  Object.freeze({ key: 'mobile', width: 390, height: 844 }),
])

function arg(name, fallback = '') {
  const prefix = `--${name}=`
  const found = process.argv.find((item) => item.startsWith(prefix))
  return found ? found.slice(prefix.length).trim() : fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function safeSegment(value = '') {
  return compactText(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'route'
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(baseUrl, outputRef) {
  const deadline = Date.now() + 45_000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || 'no response'}\nVite output:\n${outputRef.value}`)
}

async function startViteServer() {
  const providedUrl = compactText(arg('app-url', process.env.CONVEYANCING_WORKSPACE_AUDIT_BASE_URL || '')).replace(/\/+$/, '')
  if (providedUrl) {
    await waitForServer(providedUrl, { value: 'Provided app URL did not respond.' })
    return { baseUrl: providedUrl, stop: async () => {}, started: false }
  }

  const outputRef = { value: '' }
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '--strictPort'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      VITE_APP_ENV: 'development',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || FAKE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || FAKE_ANON_KEY,
      VITE_SUPABASE_KEY: '',
      VITE_ENABLE_DEV_AUTH_BYPASS: 'true',
      VITE_ENABLE_LOCAL_FALLBACKS: 'true',
      VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: 'true',
      VITE_ENABLE_MOCK_DATA: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })

  try {
    await waitForServer(DEFAULT_BASE_URL, outputRef)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  return {
    baseUrl: DEFAULT_BASE_URL,
    started: true,
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(3000),
      ])
      if (child.exitCode === null) child.kill('SIGKILL')
    },
  }
}

async function stubSupabaseTraffic(context) {
  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method().toUpperCase()

    if (url.pathname.toLowerCase().includes('/auth/v1')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null, session: null }),
      })
      return
    }

    if (method === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'content-range': '0-0/0',
      },
      body: JSON.stringify(method === 'GET' ? [] : {}),
    })
  })
}

function isIgnorableConsoleMessage(message) {
  const text = `${message.type()} ${message.text()}`.toLowerCase()
  return [
    'dev auth bypass is enabled',
    'download the react devtools',
    'failed to load resource',
    'networkerror',
    '404',
    'supabase',
  ].some((token) => text.includes(token))
}

async function signInIfConfigured(page, baseUrl) {
  const email = compactText(process.env.CONVEYANCING_WORKSPACE_AUDIT_EMAIL || process.env.STAGING_INTERNAL_EMAIL)
  const password = compactText(process.env.CONVEYANCING_WORKSPACE_AUDIT_PASSWORD || process.env.STAGING_INTERNAL_PASSWORD)
  if (!email || !password) return false

  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
  await page.getByLabel(/email/i).fill(email)
  await page.getByRole('textbox', { name: /^password$/i }).fill(password)
  await page.getByRole('button', { name: /sign in securely|launch workspace|sign in/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 })
  return true
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: NAVIGATION_TIMEOUT_MS })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.waitForTimeout(750)
}

async function openRoute(page, baseUrl, routePath) {
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
  await settle(page)
  if (new URL(page.url()).pathname.startsWith('/auth') && await signInIfConfigured(page, baseUrl)) {
    await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
    await settle(page)
  }
}

async function inspectViewport(page, baseUrl, routePath, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  let navigationError = null
  try {
    await openRoute(page, baseUrl, routePath)
  } catch (error) {
    navigationError = `${error.name || 'Error'}: ${error.message || error}`
    await page.waitForTimeout(500).catch(() => null)
  }

  const screenshot = path.join(OUT_DIR, `${viewport.key}-${safeSegment(routePath)}.png`)
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => null)

  return page.evaluate(({ screenshotPath, routePathValue }) => {
    function text(value) {
      return String(value || '').replace(/\s+/g, ' ').trim()
    }

    function selectorFor(node) {
      const testId = node.getAttribute?.('data-testid')
      if (testId) return `[data-testid="${testId}"]`
      const id = node.getAttribute?.('id')
      if (id) return `#${id}`
      const className = typeof node.className === 'string' ? node.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : ''
      return `${node.tagName.toLowerCase()}${className ? `.${className}` : ''}`
    }

    const documentElement = document.documentElement
    const bodyText = text(document.body.innerText)
    const authBlocked = location.pathname.startsWith('/auth') || /welcome back\s+sign in/i.test(bodyText)
    const frameworkOverlay = Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'))
    const visibleNodes = Array.from(document.querySelectorAll('body *')).filter((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    })
    const textFitIssues = []
    const layoutIssues = []

    for (const node of visibleNodes) {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const nodeText = text(node.innerText || node.textContent)
      const parent = node.parentElement?.getBoundingClientRect?.()
      const ownOverflowX = Math.ceil(node.scrollWidth - node.clientWidth)
      const ownOverflowY = Math.ceil(node.scrollHeight - node.clientHeight)
      const viewportOverflowLeft = Math.ceil(Math.max(0, -rect.left))
      const viewportOverflowRight = Math.ceil(Math.max(0, rect.right - documentElement.clientWidth))
      const parentOverflowLeft = parent ? Math.ceil(Math.max(0, parent.left - rect.left)) : 0
      const parentOverflowRight = parent ? Math.ceil(Math.max(0, rect.right - parent.right)) : 0
      const clipsText = nodeText.length > 0 && (
        ownOverflowX > 1 ||
        (ownOverflowY > 2 && ['hidden', 'clip'].includes(style.overflowY))
      )
      const spillsLayout = viewportOverflowLeft > 1 || viewportOverflowRight > 1 || parentOverflowLeft > 1 || parentOverflowRight > 1

      if (clipsText) {
        textFitIssues.push({
          selector: selectorFor(node),
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className.slice(0, 220) : '',
          text: nodeText.slice(0, 220),
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          ownOverflowX,
          ownOverflowY,
          overflow: `${style.overflow}/${style.overflowX}/${style.overflowY}`,
          whiteSpace: style.whiteSpace,
        })
      }

      if (spillsLayout) {
        layoutIssues.push({
          selector: selectorFor(node),
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className.slice(0, 220) : '',
          text: nodeText.slice(0, 140),
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          viewportOverflowLeft,
          viewportOverflowRight,
          parentOverflowLeft,
          parentOverflowRight,
        })
      }
    }

    return {
      route: routePathValue,
      finalUrl: location.href,
      authBlocked,
      frameworkOverlay,
      bodyTextSample: bodyText.slice(0, 500),
      horizontalOverflowPx: Math.max(0, documentElement.scrollWidth - documentElement.clientWidth),
      workspaceDetected: !authBlocked && /matter|workflow|documents|transfer|registration|conveyancing/i.test(bodyText),
      screenshot: screenshotPath,
      textFitIssueCount: textFitIssues.length,
      layoutIssueCount: layoutIssues.length,
      textFitIssues: textFitIssues.slice(0, 60),
      layoutIssues: layoutIssues.slice(0, 40),
    }
  }, { screenshotPath: screenshot, routePathValue: routePath }).then((inspection) => ({
    ...inspection,
    navigationError,
  })).catch((error) => ({
    route: routePath,
    finalUrl: page.url(),
    authBlocked: false,
    frameworkOverlay: false,
    navigationError: navigationError || `${error.name || 'Error'}: ${error.message || error}`,
    bodyTextSample: '',
    horizontalOverflowPx: 0,
    workspaceDetected: false,
    screenshot,
    textFitIssueCount: 0,
    layoutIssueCount: 0,
    textFitIssues: [],
    layoutIssues: [],
  }))
}

function sourceAudit() {
  const source = fs.readFileSync(new URL(`../${SOURCE_FILE}`, import.meta.url), 'utf8')
  const lines = source.split('\n')
  const functions = []
  const issues = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^function\s+([A-Za-z0-9_]+)\s*\(/)
    if (match) functions.push({ name: match[1], line: index + 1 })
  }

  function currentFunction(lineNo) {
    let current = { name: 'module', line: 1 }
    for (const fn of functions) {
      if (fn.line <= lineNo) current = fn
      else break
    }
    return current
  }

  function add(lineNo, severity, type, why, line) {
    const component = currentFunction(lineNo).name
    issues.push({
      lineNo,
      component,
      severity,
      type,
      why,
      line: line.trim().slice(0, 220),
    })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.includes('className')) continue
    const classMatch = line.match(/className=\{?`?"?([^`"}]*)/)
    const className = classMatch?.[1] || line

    if (/(^|\s)grid-cols-[2-6](\s|$)/.test(className) && !/(^|\s)(sm|md|lg|xl|2xl):grid-cols-/.test(className)) {
      add(index + 1, 'high', 'fixed-grid-mobile-risk', 'Fixed base grid columns can crush legal labels, buttons, and status pills on mobile.', line)
    }
    if (/flex .*justify-between/.test(className) && !/flex-wrap|flex-col/.test(className)) {
      add(index + 1, 'medium', 'non-wrapping-flex-row', 'A justify-between row without wrap or a column fallback can force text outside its card.', line)
    }
    if (/\b(h-8|h-9|h-10|h-11|h-12|h-16)\b/.test(className) && /(button|Button|Link|a href|summary|input)/.test(lines.slice(Math.max(0, index - 2), index + 4).join(' ')) && !/whitespace-nowrap|truncate|min-w-0|flex-wrap/.test(className)) {
      add(index + 1, 'medium', 'fixed-height-action-text', 'Fixed-height action controls need wrapping, icon-only treatment, or explicit clipping policy.', line)
    }
    if (/\btruncate\b/.test(className) && /(strong|span|p|h\d|dd|li)/.test(line)) {
      add(index + 1, 'low', 'content-clipped-by-truncate', 'Intentional truncation can hide conveyancing values unless a full-value affordance exists.', line)
    }
    if (/\bwhitespace-nowrap\b/.test(className) && !/overflow-x-auto|truncate/.test(className)) {
      add(index + 1, 'medium', 'nowrap-no-overflow-policy', 'No-wrap text can overflow unless its parent scrolls or clips intentionally.', line)
    }
  }

  const rankedComponents = [...issues.reduce((map, issue) => {
    const score = issue.severity === 'high' ? 5 : issue.severity === 'medium' ? 2 : 1
    const row = map.get(issue.component) || { component: issue.component, high: 0, medium: 0, low: 0, score: 0, examples: [] }
    row[issue.severity] += 1
    row.score += score
    if (row.examples.length < 5 && issue.severity !== 'low') row.examples.push(issue)
    map.set(issue.component, row)
    return map
  }, new Map()).values()].sort((left, right) => right.score - left.score)

  return {
    sourceFile: SOURCE_FILE,
    totalIssues: issues.length,
    byType: issues.reduce((accumulator, issue) => {
      accumulator[issue.type] = (accumulator[issue.type] || 0) + 1
      return accumulator
    }, {}),
    rankedComponents,
    issues: issues.slice(0, 200),
  }
}

function routesForAudit() {
  const transactionId = encodeURIComponent(compactText(arg('transaction-id', process.env.CONVEYANCING_WORKSPACE_AUDIT_TRANSACTION_ID || DEFAULT_TRANSACTION_ID)))
  const routeText = compactText(arg('routes', process.env.CONVEYANCING_WORKSPACE_AUDIT_ROUTES || ''))
  if (routeText) return routeText.split(',').map((item) => item.trim()).filter(Boolean)
  return [
    `/transactions/${transactionId}`,
    `/transactions/${transactionId}/transfer/transfer`,
  ]
}

async function browserAudit() {
  ensureDirectory(OUT_DIR)
  const server = await startViteServer()
  const browser = await chromium.launch({ headless: !hasFlag('headed') })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    ignoreHTTPSErrors: true,
  })
  const consoleErrors = []
  const pageErrors = []

  await context.addInitScript((storageKey, role) => {
    window.localStorage.setItem(storageKey, role)
    window.localStorage.setItem('bridge:active-workspace', 'attorney')
  }, DEV_AUTH_STORAGE_KEY, compactText(process.env.CONVEYANCING_WORKSPACE_AUDIT_ROLE || 'developer'))

  if ((process.env.VITE_SUPABASE_URL || FAKE_SUPABASE_URL) === FAKE_SUPABASE_URL) {
    await stubSupabaseTraffic(context)
  }

  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error' && !isIgnorableConsoleMessage(message)) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  const inspections = []
  try {
    for (const routePath of routesForAudit()) {
      for (const viewport of VIEWPORTS) {
        inspections.push({
          viewport,
          ...(await inspectViewport(page, server.baseUrl, routePath, viewport)),
        })
      }
    }
  } finally {
    await browser.close()
    await server.stop()
  }

  const authBlocked = inspections.filter((item) => item.authBlocked)
  const navigationFailures = inspections.filter((item) => item.navigationError)
  const workspaceNotDetected = inspections.filter((item) => !item.authBlocked && !item.workspaceDetected)
  const horizontalOverflow = inspections.filter((item) => item.horizontalOverflowPx > 2)
  const frameworkOverlays = inspections.filter((item) => item.frameworkOverlay)
  const textFitFindings = inspections.reduce((total, item) => total + item.textFitIssueCount, 0)
  const layoutFindings = inspections.reduce((total, item) => total + item.layoutIssueCount, 0)

  return {
    appUrl: server.baseUrl,
    serverStarted: server.started,
    routes: routesForAudit(),
    viewports: VIEWPORTS,
    inspections,
    telemetry: {
      consoleErrors: [...new Set(consoleErrors)],
      pageErrors: [...new Set(pageErrors)],
    },
    blockers: [
      ...navigationFailures.map((item) => ({
        code: 'CONVEYANCING_WORKSPACE_NAVIGATION_FAILED',
        viewport: item.viewport.key,
        route: item.route,
        finalUrl: item.finalUrl,
        message: item.navigationError,
        solution: 'Fix route loading, point --app-url at a responsive running app, or use --source-only until a stable fixture route exists.',
      })),
      ...authBlocked.map((item) => ({
        code: 'CONVEYANCING_WORKSPACE_AUTH_BLOCKED',
        viewport: item.viewport.key,
        route: item.route,
        finalUrl: item.finalUrl,
        solution: 'Provide CONVEYANCING_WORKSPACE_AUDIT_EMAIL/PASSWORD, a signed-in app URL, or keep local dev auth bypass enabled.',
      })),
      ...workspaceNotDetected.map((item) => ({
        code: 'CONVEYANCING_WORKSPACE_NOT_DETECTED',
        viewport: item.viewport.key,
        route: item.route,
        finalUrl: item.finalUrl,
        solution: 'Use a transaction route that renders the conveyancing workspace or add a fixture route for UI audit.',
      })),
      ...horizontalOverflow.map((item) => ({
        code: 'CONVEYANCING_WORKSPACE_HORIZONTAL_OVERFLOW',
        viewport: item.viewport.key,
        route: item.route,
        horizontalOverflowPx: item.horizontalOverflowPx,
        solution: 'Remove page-level horizontal overflow from the conveyancing workspace.',
      })),
      ...frameworkOverlays.map((item) => ({
        code: 'CONVEYANCING_WORKSPACE_ERROR_OVERLAY',
        viewport: item.viewport.key,
        route: item.route,
        finalUrl: item.finalUrl,
        solution: 'Fix the Vite/runtime error overlay before using visual audit results.',
      })),
      ...consoleErrors.map((message) => ({
        code: 'CONVEYANCING_WORKSPACE_CONSOLE_ERROR',
        message,
        solution: 'Fix browser console errors before treating text-fit results as stable.',
      })),
      ...pageErrors.map((message) => ({
        code: 'CONVEYANCING_WORKSPACE_PAGE_ERROR',
        message,
        solution: 'Fix browser page errors before treating text-fit results as stable.',
      })),
    ],
    totals: {
      inspectedRoutes: inspections.length,
      navigationFailures: navigationFailures.length,
      authBlocked: authBlocked.length,
      workspaceNotDetected: workspaceNotDetected.length,
      horizontalOverflow: horizontalOverflow.length,
      textFitFindings,
      layoutFindings,
    },
  }
}

async function main() {
  ensureDirectory(OUT_DIR)
  const checkedAt = new Date().toISOString()
  const source = sourceAudit()
  const browser = hasFlag('source-only') ? null : await browserAudit()
  const blockers = browser?.blockers || []
  const strict = hasFlag('strict')
  const report = {
    phase: 'conveyancing_workspace_ui_overflow_phase1',
    status: blockers.length ? 'REPORT_WITH_BLOCKERS' : 'READY_FOR_REFINEMENT',
    strict,
    checkedAt,
    browserAudit: browser,
    sourceAudit: source,
    nextActions: [
      'Use sourceAudit.rankedComponents to prioritize the component refinement pass.',
      'Use browserAudit.inspections screenshots and textFitIssues once a real workspace route renders.',
      'Run with --source-only when browser fixtures are unavailable.',
      'Run with --strict in CI after auth/fixture routing is stable.',
    ],
  }
  const outputPath = path.join(OUT_DIR, 'report.json')
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.status,
    outputPath,
    browserBlockerCount: blockers.length,
    sourceIssueCount: source.totalIssues,
    topComponents: source.rankedComponents.slice(0, 8).map((item) => ({
      component: item.component,
      score: item.score,
      high: item.high,
      medium: item.medium,
      low: item.low,
    })),
  }, null, 2))
  if (strict && blockers.length) process.exitCode = 1
}

await main()
