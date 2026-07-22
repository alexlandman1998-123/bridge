import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_APP_URL = 'https://app.arch9.co.za'
const OUT_DIR = path.join('test-results', 'legal-document-phase-g2')

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function projectRef(url) { return text(url).match(/^https:\/\/([^.]+)/)?.[1] || '' }
function parseJson(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  return start >= 0 && end > start ? JSON.parse(output.slice(start, end + 1)) : null
}
function runG1() {
  const run = spawnSync(process.execPath, ['scripts/legal-document-phase-g1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
  return parseJson(run.stdout)
}
function config() {
  const supabaseUrl = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  assert.equal(projectRef(supabaseUrl), STAGING_PROJECT_REF, `Refusing G2 browser smoke outside staging project ${STAGING_PROJECT_REF}.`)
  const email = text(process.env.LEGAL_DOCUMENT_G2_EMAIL || process.env.CANONICAL_BROWSER_EMAIL || process.env.STAGING_INTERNAL_EMAIL)
  const password = text(process.env.LEGAL_DOCUMENT_G2_PASSWORD || process.env.CANONICAL_BROWSER_PASSWORD || process.env.STAGING_INTERNAL_PASSWORD)
  assert.ok(email && password, 'A staging browser actor is required through LEGAL_DOCUMENT_G2_EMAIL/PASSWORD or the canonical staging credentials.')
  return { appUrl: text(process.env.LEGAL_DOCUMENT_G2_APP_URL || process.env.CANONICAL_BROWSER_APP_URL || process.env.STAGING_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, ''), email, password }
}
async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => null)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.waitForTimeout(750)
}
async function signIn(page, settings) {
  await page.goto(`${settings.appUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('textbox', { name: /email/i }).fill(settings.email)
  await page.getByRole('textbox', { name: /^password$/i }).fill(settings.password)
  await page.getByRole('button', { name: /sign in securely|launch workspace|sign in/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 })
}
async function openAuthenticated(page, settings, route) {
  await page.goto(`${settings.appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await settle(page)
  if (new URL(page.url()).pathname.startsWith('/auth')) {
    await signIn(page, settings)
    await page.goto(`${settings.appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await settle(page)
  }
}
async function assertNoUnlabelledControls(page) {
  const controls = await page.locator('button:visible, a:visible').evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName, label: (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim() })).filter((item) => !item.label))
  assert.deepEqual(controls, [], `Visible controls must have an accessible name: ${JSON.stringify(controls)}`)
}
async function inspectWorkspace(page, settings, target, viewportLabel) {
  await openAuthenticated(page, settings, `/legal-documents/${encodeURIComponent(target.packetId)}`)
  const type = target.packetType === 'otp' ? 'otp' : 'mandate'
  const documentName = type === 'otp' ? 'Offer to Purchase' : 'Mandate Agreement'
  const downloadName = type === 'otp' ? 'Download Signed OTP' : 'Download Signed Mandate'
  await page.getByRole('heading', { name: documentName }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByRole('status', { name: /finalized legal record/i }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByText('All required signers completed this document.', { exact: true }).waitFor({ state: 'visible' })
  await page.getByText(`Review and download the final signed ${type}. This legal record is locked and cannot be edited.`, { exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('link', { name: 'View Final Signed PDF' }).waitFor({ state: 'visible' })
  await page.getByRole('link', { name: downloadName }).waitFor({ state: 'visible' })
  assert.equal(await page.getByText(type === 'otp' ? 'Download Signed Mandate' : 'Download Signed OTP', { exact: true }).count(), 0, 'The completed workspace must not show the other document type label.')
  await assertNoUnlabelledControls(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(overflow <= 2, `${documentName} has ${overflow}px horizontal overflow at ${viewportLabel}.`)
  const screenshot = path.join(OUT_DIR, `${type}-${viewportLabel}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })
  return { packetType: type, packetId: target.packetId, viewport: viewportLabel, route: page.url(), screenshot, finalStateVisible: true, correctDownloadLabel: true, accessibleControls: true, horizontalOverflowPx: overflow }
}

const g1 = runG1()
if (g1?.status !== 'READY_FOR_G2') {
  console.log(JSON.stringify({ phase: 'G2', status: 'NO_GO', blockerCount: 1, blockers: [{ code: 'G2_G1_NOT_READY', solution: 'Complete G1 end-to-end lifecycle certification before browser usability testing.' }], g1Status: g1?.status || 'UNAVAILABLE', evidence: [], checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
  process.exitCode = 1
} else {
  let settings = null
  try {
    settings = config()
  } catch (error) {
    console.log(JSON.stringify({ phase: 'G2', status: 'NO_GO', blockerCount: 1, blockers: [{ code: 'G2_BROWSER_ACTOR_UNAVAILABLE', detail: error?.message || String(error), solution: 'Configure a canonical-staging browser actor with legal-document access, then rerun G2.' }], g1Status: g1.status, evidence: [], checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
    process.exitCode = 1
  }
  if (settings) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const browser = await chromium.launch({ headless: !['1', 'true'].includes(text(process.env.LEGAL_DOCUMENT_G2_HEADED).toLowerCase()) })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    const telemetry = { pageErrors: [], http5xx: [] }
    page.on('pageerror', (error) => telemetry.pageErrors.push(error.message))
    page.on('response', (response) => { if (response.status() >= 500 && response.url().startsWith(new URL(settings.appUrl).origin)) telemetry.http5xx.push({ status: response.status(), url: response.url() }) })
    const evidence = []
    try {
      for (const target of g1.evidence || []) evidence.push(await inspectWorkspace(page, settings, target, 'desktop'))
      await page.setViewportSize({ width: 390, height: 844 })
      for (const target of g1.evidence || []) evidence.push(await inspectWorkspace(page, settings, target, 'mobile'))
      assert.deepEqual(telemetry.pageErrors, [], `Browser page errors: ${JSON.stringify(telemetry.pageErrors)}`)
      assert.deepEqual(telemetry.http5xx, [], `Browser HTTP 5xx responses: ${JSON.stringify(telemetry.http5xx)}`)
      console.log(JSON.stringify({ phase: 'G2', status: 'READY_FOR_G3', blockerCount: 0, blockers: [], g1Status: g1.status, evidence, telemetry, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
    } catch (error) {
      console.log(JSON.stringify({ phase: 'G2', status: 'NO_GO', blockerCount: 1, blockers: [{ code: 'G2_BROWSER_USABILITY_INVALID', detail: error?.message || String(error), solution: 'Repair the reported completed-workspace label, accessibility, responsive-layout, crash, or availability failure and rerun G2.' }], g1Status: g1.status, evidence, telemetry, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
      process.exitCode = 1
    } finally {
      await browser.close()
    }
  }
}
