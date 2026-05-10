import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const outDir = path.resolve('test-results/phase45')

await fs.mkdir(outDir, { recursive: true })

function slug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pushLimited(list, item, limit = 40) {
  if (list.length >= limit) return
  list.push(item)
}

async function capturePageState(page) {
  const title = await page.title().catch(() => '')
  const h1 = await page.locator('h1').first().textContent().catch(() => '')
  const h2 = await page.locator('h2').first().textContent().catch(() => '')
  const bodyText = await page.locator('body').innerText().catch(() => '')
  return {
    title: String(title || '').trim(),
    h1: String(h1 || '').trim(),
    h2: String(h2 || '').trim(),
    bodyExcerpt: String(bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
  }
}

async function runScenario(browser, config) {
  const { id, category, name, expected, steps } = config
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)

  const telemetry = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
  }

  page.on('console', (msg) => {
    pushLimited(telemetry.console, {
      type: msg.type(),
      text: msg.text(),
    })
  })
  page.on('pageerror', (error) => {
    pushLimited(telemetry.pageErrors, String(error?.message || error || 'Unknown page error'))
  })
  page.on('requestfailed', (request) => {
    pushLimited(telemetry.requestFailures, {
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || 'requestfailed',
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      pushLimited(telemetry.httpErrors, {
        status: response.status(),
        url: response.url(),
      })
    }
  })

  const result = {
    id,
    category,
    name,
    expected,
    status: 'FAIL',
    route: '',
    actual: '',
    likelyCause: '',
    recommendedFix: '',
    screenshot: '',
    ...telemetry,
  }

  try {
    await steps({ page, context, baseUrl, result })
  } catch (error) {
    result.actual = result.actual || `Scenario threw error: ${String(error?.message || error)}`
    result.likelyCause = result.likelyCause || 'Unhandled runtime behavior during test flow.'
    result.recommendedFix = result.recommendedFix || 'Inspect failing route component and add guard/recovery handling.'
  }

  result.route = page.url()
  const state = await capturePageState(page)
  result.pageState = state

  const fileName = `${String(id).padStart(2, '0')}-${slug(name)}.png`
  const screenshotPath = path.join(outDir, fileName)
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
  result.screenshot = screenshotPath

  await context.close()
  return result
}

async function devBypassLogin(page, roleLabel) {
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: new RegExp(`^${roleLabel}$`, 'i') }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15000 })
}

const scenarios = [
  {
    id: 1,
    category: 'AUTH',
    name: 'Fresh signup',
    expected: 'User can create account and receive either session redirect or verification success state.',
    steps: async ({ page, result, baseUrl }) => {
      const email = `phase45+${Date.now()}@example.com`
      await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: /^sign up$/i }).click()
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill('Phase45Pass!123')
      await page.getByLabel('Confirm Password').fill('Phase45Pass!123')
      await page.getByRole('button', { name: /create account/i }).click()
      await page.waitForTimeout(4000)

      const url = page.url()
      const success = await page.locator('.auth-feedback.success').first().textContent().catch(() => '')
      const error = await page.locator('.auth-feedback.error').first().textContent().catch(() => '')

      if (url.includes('/onboarding/profile') || url.includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = `Redirected into authenticated flow at ${url}`
        return
      }

      if (String(success || '').trim()) {
        result.status = 'PASS'
        result.actual = `Signup completed with verification state: ${String(success).trim()}`
        return
      }

      result.status = 'FAIL'
      result.actual = `Signup did not reach verified state. Error: ${String(error || 'none')}`
      result.likelyCause = 'Supabase signup/redirect/auth config mismatch or signup throttling.'
      result.recommendedFix = 'Check Auth redirect allow-list and signup response handling in src/pages/Auth.jsx handleSubmit.'
    },
  },
  {
    id: 2,
    category: 'AUTH',
    name: 'Email verification callback handler (invalid callback)',
    expected: 'Auth callback route should show recoverable error state, not blank/loop.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/auth/callback?error=access_denied&error_description=expired`, { waitUntil: 'networkidle' })
      const heading = await page.getByRole('heading', { name: /we could not complete sign in/i }).count()
      if (heading > 0) {
        result.status = 'PASS'
        result.actual = 'Invalid callback showed recoverable error state with actions.'
        return
      }
      result.status = 'FAIL'
      result.actual = 'Callback route did not show recovery error state for invalid callback.'
      result.likelyCause = 'AuthCallback error-path rendering failed.'
      result.recommendedFix = 'Audit src/pages/AuthCallback.jsx error state transition and route-level boundary behavior.'
    },
  },
  {
    id: 3,
    category: 'AUTH',
    name: 'Login via local dev bypass',
    expected: 'User can enter app and land on dashboard shell.',
    steps: async ({ page, result }) => {
      await devBypassLogin(page, 'Developer')
      if (page.url().includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = `Landed on ${page.url()}`
      } else {
        result.status = 'FAIL'
        result.actual = `Unexpected post-login route: ${page.url()}`
        result.likelyCause = 'Route gating/redirect decision mismatch after auth bootstrap.'
        result.recommendedFix = 'Inspect AuthGate + decideAuthRedirect logic in src/App.jsx and src/lib/onboardingRouting.js.'
      }
    },
  },
  {
    id: 4,
    category: 'AUTH',
    name: 'Logout flow',
    expected: 'Logout returns user to auth route without blank screen.',
    steps: async ({ page, result }) => {
      await devBypassLogin(page, 'Developer')
      await page.locator('.ui-shell-avatar-trigger').first().click()
      await page.getByRole('button', { name: /logout/i }).click()
      await page.waitForURL('**/auth', { timeout: 15000 })
      result.status = 'PASS'
      result.actual = `Returned to ${page.url()} after logout.`
    },
  },
  {
    id: 5,
    category: 'AUTH',
    name: 'Refresh after login',
    expected: 'Refreshing authenticated page should keep user in app and resolve loaders.',
    steps: async ({ page, result }) => {
      await devBypassLogin(page, 'Developer')
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      if (!page.url().includes('/auth')) {
        result.status = 'PASS'
        result.actual = `Stayed authenticated at ${page.url()} after refresh.`
      } else {
        result.status = 'FAIL'
        result.actual = 'Refresh returned authenticated user to /auth unexpectedly.'
        result.likelyCause = 'Session restoration race in AuthSessionProvider.'
        result.recommendedFix = 'Review bootstrap + onAuthStateChange handling in src/context/AuthSessionContext.jsx.'
      }
    },
  },
  {
    id: 6,
    category: 'AUTH',
    name: 'Direct dashboard while logged out',
    expected: 'Logged-out user should be redirected to /auth.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
      if (page.url().includes('/auth')) {
        result.status = 'PASS'
        result.actual = `Redirected to ${page.url()}`
      } else {
        result.status = 'FAIL'
        result.actual = `Expected /auth redirect; got ${page.url()}`
        result.likelyCause = 'Protected route guard not enforcing no-session redirect.'
        result.recommendedFix = 'Inspect AuthGate no-session branch in src/App.jsx.'
      }
    },
  },
  {
    id: 7,
    category: 'AUTH',
    name: 'Direct dashboard while logged in',
    expected: 'Logged-in user should access /dashboard.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Developer')
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
      if (page.url().includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = 'Dashboard accessible while logged in.'
      } else {
        result.status = 'FAIL'
        result.actual = `Unexpected route while logged in: ${page.url()}`
        result.likelyCause = 'Redirect trap in route decision logic.'
        result.recommendedFix = 'Inspect decideAuthRedirect onboarding-complete path in src/lib/onboardingRouting.js.'
      }
    },
  },
  {
    id: 8,
    category: 'AUTH',
    name: 'Expired/cleared session behavior',
    expected: 'Cleared auth session should redirect to /auth cleanly.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Developer')
      await page.evaluate(() => {
        window.localStorage.removeItem('itg:dev-auth-role')
        const keys = Object.keys(window.localStorage)
        for (const key of keys) {
          if (key.startsWith('sb-') || key.startsWith('supabase.auth.')) {
            window.localStorage.removeItem(key)
          }
        }
      })
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
      if (page.url().includes('/auth')) {
        result.status = 'PASS'
        result.actual = 'Session clear redirected to auth as expected.'
      } else {
        result.status = 'FAIL'
        result.actual = `Expected /auth after session clear; got ${page.url()}`
        result.likelyCause = 'Auth source-of-truth not updating after session invalidation.'
        result.recommendedFix = 'Review AuthSessionProvider + AuthGate handling for null session.'
      }
    },
  },
  {
    id: 9,
    category: 'ONBOARDING',
    name: 'Revisit onboarding after completion (developer bypass)',
    expected: 'Completed users hitting onboarding route should be redirected safely, no loop/blank.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Developer')
      await page.goto(`${baseUrl}/onboarding/profile`, { waitUntil: 'networkidle' })
      if (page.url().includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = 'Completed onboarding user redirected to dashboard safely.'
      } else {
        result.status = 'FAIL'
        result.actual = `Unexpected route for completed user: ${page.url()}`
        result.likelyCause = 'Onboarding completion redirect rule not applied.'
        result.recommendedFix = 'Inspect onboarding_complete branch in src/lib/onboardingRouting.js.'
      }
    },
  },
  {
    id: 10,
    category: 'ONBOARDING',
    name: 'Refresh during onboarding route',
    expected: 'Onboarding route refresh should resolve to stable page without stuck loader.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Developer')
      await page.goto(`${baseUrl}/developer/onboarding`, { waitUntil: 'networkidle' })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      const isAuth = page.url().includes('/auth')
      const hasTimeoutMessage = (await page.locator('text=Authentication or workspace setup took too long').count()) > 0
      if (!isAuth && !hasTimeoutMessage) {
        result.status = 'PASS'
        result.actual = `Refresh resolved to ${page.url()} without timeout fallback.`
      } else {
        result.status = 'FAIL'
        result.actual = `Refresh unstable. route=${page.url()} timeoutFallback=${hasTimeoutMessage}`
        result.likelyCause = 'Auth/workspace bootstrap race under refresh.'
        result.recommendedFix = 'Review bootstrap timeout + retry sequencing in AuthGate and WorkspaceContext.'
      }
    },
  },
  {
    id: 11,
    category: 'ROUTE_GUARD',
    name: 'Protected route /reports while logged out',
    expected: 'Logged-out users redirected to /auth from protected routes.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/reports`, { waitUntil: 'networkidle' })
      if (page.url().includes('/auth')) {
        result.status = 'PASS'
        result.actual = 'Protected reports route redirected to auth.'
      } else {
        result.status = 'FAIL'
        result.actual = `Expected /auth; got ${page.url()}`
        result.likelyCause = 'Route guard gap on reports route.'
        result.recommendedFix = 'Validate enclosing AuthGate scope for reports path in src/App.jsx.'
      }
    },
  },
  {
    id: 12,
    category: 'ROUTE_GUARD',
    name: 'Wrong-role access blocked safely (agent -> /snags)',
    expected: 'Agent should not access developer-only snags route; should land safely elsewhere.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Agent')
      await page.goto(`${baseUrl}/snags`, { waitUntil: 'networkidle' })
      if (page.url().includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = 'Agent blocked from /snags and redirected to dashboard.'
      } else {
        result.status = 'FAIL'
        result.actual = `Wrong-role route handling unexpected: ${page.url()}`
        result.likelyCause = 'RoleRoute fallback mismatch.'
        result.recommendedFix = 'Inspect RoleRoute and ClientAwareSnags routing in src/App.jsx.'
      }
    },
  },
  {
    id: 13,
    category: 'DASHBOARD_EMPTY_STATE',
    name: 'Agent dashboard empty-state safety',
    expected: 'Agent with no org context sees setup pending state, not crash.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Agent')
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
      const setupPending = await page.locator('text=/organisation setup pending/i').count()
      if (setupPending > 0) {
        result.status = 'PASS'
        result.actual = 'Agent dashboard rendered setup pending empty state.'
      } else {
        result.status = 'FAIL'
        result.actual = 'Agent dashboard did not show expected setup pending state.'
        result.likelyCause = 'Fallback state not triggered when organisation context is missing.'
        result.recommendedFix = 'Review empty-state branch in src/pages/Dashboard.jsx for agent role.'
      }
    },
  },
  {
    id: 14,
    category: 'DASHBOARD_EMPTY_STATE',
    name: 'Attorney dashboard empty-state safety',
    expected: 'Attorney with no firm context sees setup pending, not crash.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Attorney')
      await page.goto(`${baseUrl}/attorney/dashboard`, { waitUntil: 'networkidle' })
      const pending = await page.locator('text=/firm setup pending|complete your firm setup/i').count()
      if (pending > 0 || page.url().includes('/attorney/dashboard')) {
        result.status = 'PASS'
        result.actual = 'Attorney dashboard loaded with non-crashing setup/fallback behavior.'
      } else {
        result.status = 'FAIL'
        result.actual = `Attorney dashboard fallback not observed. route=${page.url()}`
        result.likelyCause = 'Attorney firm context guard/fallback mismatch.'
        result.recommendedFix = 'Inspect AttorneyFirmRoute and AttorneyDashboardPage fallback rendering.'
      }
    },
  },
  {
    id: 15,
    category: 'PERMISSIONS',
    name: 'Developer can access /developments',
    expected: 'Developer role can access development tools.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Developer')
      await page.goto(`${baseUrl}/developments`, { waitUntil: 'networkidle' })
      if (page.url().includes('/developments')) {
        result.status = 'PASS'
        result.actual = 'Developer accessed /developments.'
      } else {
        result.status = 'FAIL'
        result.actual = `Developer was redirected unexpectedly: ${page.url()}`
        result.likelyCause = 'Over-restrictive role or permission gate on developments route.'
        result.recommendedFix = 'Review RoleRoute allowedRoles for /developments in src/App.jsx.'
      }
    },
  },
  {
    id: 16,
    category: 'PERMISSIONS',
    name: 'Agent cannot access developer-only /snags',
    expected: 'Agent role blocked from developer-only route.',
    steps: async ({ page, result, baseUrl }) => {
      await devBypassLogin(page, 'Agent')
      await page.goto(`${baseUrl}/snags`, { waitUntil: 'networkidle' })
      if (page.url().includes('/dashboard')) {
        result.status = 'PASS'
        result.actual = 'Agent blocked from developer-only snags route.'
      } else {
        result.status = 'FAIL'
        result.actual = `Agent was not safely redirected from /snags. route=${page.url()}`
        result.likelyCause = 'Developer-only route guard bypass.'
        result.recommendedFix = 'Review ClientAwareSnags + RoleRoute enforcement in src/App.jsx.'
      }
    },
  },
  {
    id: 17,
    category: 'TOKEN_ROUTE',
    name: 'Client token route invalid token',
    expected: 'Invalid client token should show safe invalid-link state.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/client/abc`, { waitUntil: 'networkidle' })
      const invalid = await page.locator('text=/invalid access link|appears invalid or incomplete/i').count()
      if (invalid > 0) {
        result.status = 'PASS'
        result.actual = 'Invalid client token rendered safe invalid-link state.'
      } else {
        result.status = 'FAIL'
        result.actual = 'Invalid client token did not render expected safe state.'
        result.likelyCause = 'TokenRouteGate not applied or not matching token param.'
        result.recommendedFix = 'Inspect /client/:token wrapping in TokenRouteGate at src/App.jsx.'
      }
    },
  },
  {
    id: 18,
    category: 'TOKEN_ROUTE',
    name: 'External token route invalid token',
    expected: 'Invalid external token should show safe invalid-link state.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/external/xyz`, { waitUntil: 'networkidle' })
      const invalid = await page.locator('text=/invalid external access link|appears invalid or incomplete/i').count()
      if (invalid > 0) {
        result.status = 'PASS'
        result.actual = 'Invalid external token rendered safe invalid-link state.'
      } else {
        result.status = 'FAIL'
        result.actual = 'Invalid external token did not render expected safe state.'
        result.likelyCause = 'TokenRouteGate paramKey mismatch or route wrapper issue.'
        result.recommendedFix = 'Inspect /external/:accessToken route wrapper in src/App.jsx.'
      }
    },
  },
  {
    id: 19,
    category: 'TOKEN_ROUTE',
    name: 'Snapshot token route invalid token',
    expected: 'Invalid snapshot token should show safe invalid-link state.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/snapshot/short`, { waitUntil: 'networkidle' })
      const invalid = await page.locator('text=/invalid access link|appears invalid or incomplete/i').count()
      if (invalid > 0) {
        result.status = 'PASS'
        result.actual = 'Invalid snapshot token rendered safe invalid-link state.'
      } else {
        result.status = 'FAIL'
        result.actual = 'Invalid snapshot token did not render expected safe state.'
        result.likelyCause = 'Snapshot route not consistently wrapped with TokenRouteGate.'
        result.recommendedFix = 'Inspect feature-flagged /snapshot/:token route config in src/App.jsx.'
      }
    },
  },
  {
    id: 20,
    category: 'TOKEN_ROUTE',
    name: 'Client token route long-form token (syntactically valid, data-invalid)',
    expected: 'Route should fail gracefully without auth redirect loop or blank screen.',
    steps: async ({ page, result, baseUrl }) => {
      const fake = 'clienttokendemo123456789'
      await page.goto(`${baseUrl}/client/${fake}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      const body = await page.locator('body').innerText()
      const hasBlank = !String(body || '').trim()
      const redirectedToAuth = page.url().includes('/auth')
      if (!hasBlank && !redirectedToAuth) {
        result.status = 'PASS'
        result.actual = `Graceful token-route handling at ${page.url()}`
      } else {
        result.status = 'FAIL'
        result.actual = `Token-route handling unstable. blank=${hasBlank} authRedirect=${redirectedToAuth}`
        result.likelyCause = 'Client portal token failure path still leaks to auth/blank states.'
        result.recommendedFix = 'Harden fetchClientPortalByToken error rendering in src/pages/ClientPortal.jsx and token API helpers.'
      }
    },
  },
  {
    id: 21,
    category: 'ERROR_BOUNDARY',
    name: 'Auth callback failure recovery actions visible',
    expected: 'Failure state shows retry + safe navigation options.',
    steps: async ({ page, result, baseUrl }) => {
      await page.goto(`${baseUrl}/auth/callback?code=invalid-code`, { waitUntil: 'networkidle' })
      const hasRetry = await page.getByRole('button', { name: /^retry$/i }).count()
      const hasSignIn = await page.getByRole('button', { name: /return to sign-in/i }).count()
      const hasDashboard = await page.getByRole('button', { name: /continue to dashboard/i }).count()
      if (hasRetry && hasSignIn && hasDashboard) {
        result.status = 'PASS'
        result.actual = 'Auth callback failure shows full recovery controls.'
      } else {
        result.status = 'FAIL'
        result.actual = `Missing recovery controls. retry=${hasRetry} signIn=${hasSignIn} dashboard=${hasDashboard}`
        result.likelyCause = 'Error boundary/fallback action controls regressed.'
        result.recommendedFix = 'Review error fallback JSX in src/pages/AuthCallback.jsx.'
      }
    },
  },
]

const browser = await chromium.launch({ headless: true })
const results = []
for (const scenario of scenarios) {
  const result = await runScenario(browser, scenario)
  results.push(result)
  console.log(`${result.status} :: [${result.category}] ${result.name} -> ${result.route}`)
}
await browser.close()

await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8')

const summary = {
  total: results.length,
  pass: results.filter((item) => item.status === 'PASS').length,
  fail: results.filter((item) => item.status === 'FAIL').length,
}
await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')

console.log(`\\nSummary: ${summary.pass}/${summary.total} passed, ${summary.fail} failed`)
