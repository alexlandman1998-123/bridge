import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_APP_URL = 'https://app.arch9.co.za'
const DEFAULT_AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')
const DEFAULT_KINGSTON_LEAD_ID = 'c888816c-62a2-445f-bd1b-8267f2e96212'
const OUT_DIR = path.join('test-results', 'seller-process-production-smoke')

const KINGSTON_LABEL = 'KINGSTONS SELLER PROCESS'
const DEFAULT_LABEL = 'SELLER JOURNEY'

const KINGSTON_STAGE_LABELS = [
  'First Contact',
  'Schedule Valuation Appointment',
  'Formal Valuation',
  'Valuation Presentation',
  'Seller Pack',
  'List Property',
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeBaseUrl(value = '') {
  return normalizeText(value).replace(/\/+$/, '')
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    allowKingstonOnly: false,
  }

  for (const arg of argv) {
    if (arg === '--allow-kingston-only') {
      options.allowKingstonOnly = true
      continue
    }
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    options[key] = rest.join('=')
  }

  return options
}

function buildLeadPath(value, label) {
  const normalized = normalizeText(value)
  assert.ok(normalized, `${label} lead id or URL is required.`)

  if (/^https?:\/\//i.test(normalized)) {
    const url = new URL(normalized)
    assert.match(url.pathname, /^\/pipeline\/leads\/[^/]+$/, `${label} URL must point at /pipeline/leads/:id.`)
    return url.pathname
  }

  assert.match(
    normalized,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    `${label} lead id must be a UUID.`,
  )
  return `/pipeline/leads/${normalized}`
}

function loadConfig() {
  const args = parseArgs()
  const appUrl = normalizeBaseUrl(
    args.appUrl ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_APP_URL ||
      process.env.STAGING_APP_URL ||
      DEFAULT_APP_URL,
  )
  const authStatePath = normalizeText(
    args.authState ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_AUTH_STATE ||
      DEFAULT_AUTH_STATE_PATH,
  )
  const expectedReleaseId = normalizeText(
    args.expectedReleaseId ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_EXPECTED_RELEASE_ID,
  )
  const kingstonPath = buildLeadPath(
    args.kingstonLead ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_KINGSTON_LEAD_URL ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_KINGSTON_LEAD_ID ||
      DEFAULT_KINGSTON_LEAD_ID,
    'Kingston',
  )
  const controlLead = normalizeText(
    args.controlLead ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_CONTROL_LEAD_URL ||
      process.env.KINGSTON_SELLER_PROCESS_SMOKE_CONTROL_LEAD_ID,
  )

  if (!controlLead && !args.allowKingstonOnly) {
    throw new Error(
      'A non-Kingston control lead is required. Set KINGSTON_SELLER_PROCESS_SMOKE_CONTROL_LEAD_ID or pass --controlLead=<id>. Use --allow-kingston-only only for a temporary one-sided check.',
    )
  }

  if (!fs.existsSync(authStatePath)) {
    throw new Error(
      `Browser auth state is missing at ${authStatePath}. Run npm run auth:staging-internal or set KINGSTON_SELLER_PROCESS_SMOKE_AUTH_STATE.`,
    )
  }

  return {
    appUrl,
    authStatePath,
    expectedReleaseId,
    allowKingstonOnly: args.allowKingstonOnly,
    routes: [
      {
        key: 'kingston',
        label: 'Kingston seller lead',
        path: kingstonPath,
        expected: 'kingston',
      },
      ...(controlLead
        ? [
            {
              key: 'control',
              label: 'Non-Kingston control seller lead',
              path: buildLeadPath(controlLead, 'Control'),
              expected: 'default',
            },
          ]
        : []),
    ],
  }
}

async function readReleaseManifest(appUrl) {
  const response = await fetch(`${appUrl}/release-manifest.json?kingston_seller_process_smoke=${Date.now()}`, {
    cache: 'no-store',
  })
  assert.equal(response.ok, true, `release-manifest.json returned ${response.status}`)
  return response.json()
}

function releaseIdFromManifest(manifest = {}) {
  return normalizeText(manifest.releaseId || manifest.releaseIdentifier || manifest.commit || manifest.version)
}

function assertNoAuthBounce(page, route) {
  const url = new URL(page.url())
  assert.notEqual(url.pathname, '/auth', `${route.label} bounced to auth. Refresh the browser auth state.`)
  assert.equal(url.pathname, route.path, `${route.label} landed on ${url.pathname}, expected ${route.path}.`)
}

async function openRoute(page, appUrl, route) {
  const target = `${appUrl}${route.path}?arch9_release_refresh=${Date.now()}`
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 })
  assertNoAuthBounce(page, route)
  return page.locator('body').innerText({ timeout: 30_000 })
}

function assertKingstonRail(bodyText, route) {
  const upperText = bodyText.toUpperCase()
  assert.equal(upperText.includes(KINGSTON_LABEL), true, `${route.label} must show ${KINGSTON_LABEL}.`)
  assert.equal(upperText.includes(DEFAULT_LABEL), false, `${route.label} must not show the default Seller Journey rail.`)
  for (const label of KINGSTON_STAGE_LABELS) {
    assert.equal(bodyText.includes(label), true, `${route.label} must show stage "${label}".`)
  }
}

function assertDefaultRail(bodyText, route) {
  const upperText = bodyText.toUpperCase()
  assert.equal(upperText.includes(DEFAULT_LABEL), true, `${route.label} must show the default Seller Journey rail.`)
  assert.equal(upperText.includes(KINGSTON_LABEL), false, `${route.label} must not show the Kingston seller process rail.`)
}

async function verifyRoute(page, appUrl, route) {
  const bodyText = await openRoute(page, appUrl, route)
  if (route.expected === 'kingston') {
    assertKingstonRail(bodyText, route)
  } else {
    assertDefaultRail(bodyText, route)
  }
  return {
    key: route.key,
    label: route.label,
    path: route.path,
    expected: route.expected,
    passed: true,
    signals: {
      hasKingstonsRail: bodyText.toUpperCase().includes(KINGSTON_LABEL),
      hasDefaultSellerJourney: bodyText.toUpperCase().includes(DEFAULT_LABEL),
      stageLabelsSeen: KINGSTON_STAGE_LABELS.filter((label) => bodyText.includes(label)),
    },
  }
}

async function main() {
  const config = loadConfig()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const manifest = await readReleaseManifest(config.appUrl)
  const releaseId = releaseIdFromManifest(manifest)
  if (config.expectedReleaseId) {
    assert.equal(releaseId, config.expectedReleaseId, 'Production release manifest does not match expected release id.')
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    storageState: config.authStatePath,
    viewport: { width: 1440, height: 950 },
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  try {
    const routeResults = []
    for (const route of config.routes) {
      routeResults.push(await verifyRoute(page, config.appUrl, route))
      await page.screenshot({
        path: path.join(OUT_DIR, `${route.key}.png`),
        fullPage: false,
      }).catch(() => null)
    }

    const report = {
      ok: true,
      mode: 'read_only_production_browser_smoke',
      mutatedData: false,
      appUrl: config.appUrl,
      releaseId,
      expectedReleaseId: config.expectedReleaseId || null,
      controlCoverage: config.routes.some((route) => route.expected === 'default') ? 'kingston_and_default' : 'kingston_only',
      routeResults,
      consoleErrorCount: consoleErrors.length,
      consoleErrorPreview: consoleErrors.slice(0, 5),
      artifactDir: OUT_DIR,
    }
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    const failurePath = path.join(OUT_DIR, 'failure.png')
    await page.screenshot({ path: failurePath, fullPage: false }).catch(() => null)
    console.log(JSON.stringify({
      ok: false,
      mode: 'read_only_production_browser_smoke',
      mutatedData: false,
      appUrl: config.appUrl,
      releaseId,
      reason: error?.message || String(error),
      finalUrl: page.url(),
      consoleErrorCount: consoleErrors.length,
      consoleErrorPreview: consoleErrors.slice(0, 5),
      screenshotPath: failurePath,
    }, null, 2))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
