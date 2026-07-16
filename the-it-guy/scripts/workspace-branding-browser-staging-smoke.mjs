import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_APP_URL = 'https://app.arch9.co.za'
const AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')
const OUT_DIR = path.join('test-results', 'workspace-branding-phase8')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeUrl(value = '') {
  return normalizeText(value).replace(/\/+$/, '')
}

function projectRefFromUrl(value = '') {
  return normalizeText(value).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function requireConfiguration() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const appUrl = normalizeUrl(process.env.WORKSPACE_BRANDING_APP_URL || process.env.STAGING_APP_URL || DEFAULT_APP_URL)
  if (projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing browser certification outside staging project ${STAGING_PROJECT_REF}.`)
  }
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    throw new Error(`Staging browser auth state is missing at ${AUTH_STATE_PATH}.`)
  }
  return { appUrl }
}

async function readBrandState(page) {
  return page.evaluate(() => {
    const image = document.querySelector('.ui-sidebar-brand-logo')
    const fallback = document.querySelector('.ui-sidebar-brand-mark')
    const placeholder = document.querySelector('.ui-sidebar-brand-logo-placeholder')
    const styles = image ? window.getComputedStyle(image) : null
    return {
      sidebarPresent: Boolean(document.querySelector('.ui-sidebar')),
      imagePresent: Boolean(image),
      imageLoaded: Boolean(image?.complete && image?.naturalWidth > 0),
      imageVisible: Boolean(styles && styles.display !== 'none' && styles.visibility !== 'hidden' && Number(styles.opacity) > 0),
      fallbackPresent: Boolean(fallback),
      placeholderPresent: Boolean(placeholder),
      naturalWidth: image?.naturalWidth || 0,
      naturalHeight: image?.naturalHeight || 0,
    }
  })
}

async function waitForStableLogo(page) {
  await page.waitForSelector('.ui-sidebar', { timeout: 45_000 })
  await page.waitForFunction(() => {
    const image = document.querySelector('.ui-sidebar-brand-logo')
    return Boolean(image?.complete && image?.naturalWidth > 0 && Number(window.getComputedStyle(image).opacity) > 0)
  }, null, { timeout: 30_000 })
  const state = await readBrandState(page)
  if (!state.imagePresent || !state.imageLoaded || !state.imageVisible || state.fallbackPresent || state.placeholderPresent) {
    throw new Error(`Sidebar logo did not settle into a stable branded state: ${JSON.stringify(state)}`)
  }
  return state
}

async function main() {
  const { appUrl } = requireConfiguration()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport: { width: 1440, height: 950 } })
  await context.addInitScript(() => {
    window.__workspaceBrandingTimeline = []
    const sample = () => {
      const sidebar = document.querySelector('.ui-sidebar')
      if (!sidebar) return
      const image = sidebar.querySelector('.ui-sidebar-brand-logo')
      const styles = image ? window.getComputedStyle(image) : null
      window.__workspaceBrandingTimeline.push({
        at: Date.now(),
        loaded: Boolean(image?.complete && image?.naturalWidth > 0 && styles && Number(styles.opacity) > 0),
        fallback: Boolean(sidebar.querySelector('.ui-sidebar-brand-mark')),
        placeholder: Boolean(sidebar.querySelector('.ui-sidebar-brand-logo-placeholder')),
      })
    }
    new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src', 'style'] })
    window.addEventListener('DOMContentLoaded', sample)
  })

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  const cycles = []
  try {
    await page.goto(`${appUrl}/attorney/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (new URL(page.url()).pathname.startsWith('/auth')) {
      throw new Error('Staging auth state is expired or is not authorized for the attorney workspace.')
    }
    if (!new URL(page.url()).pathname.startsWith('/attorney')) {
      throw new Error(`Configured staging browser actor is not in the attorney module: ${new URL(page.url()).pathname}`)
    }

    cycles.push({ name: 'initial-load', state: await waitForStableLogo(page) })

    const navigationTarget = await page.locator('a.ui-sidebar-link[href^="/attorney/"]').evaluateAll((links, currentPath) => {
      const hrefs = links.map((link) => link.getAttribute('href')).filter(Boolean)
      return hrefs.find((href) => href !== currentPath) || ''
    }, new URL(page.url()).pathname)
    if (!navigationTarget) throw new Error('No secondary attorney navigation target was available for the stability check.')
    await page.locator(`a.ui-sidebar-link[href="${navigationTarget}"]`).first().click()
    await page.waitForURL((url) => url.pathname === navigationTarget, { timeout: 30_000 })
    cycles.push({ name: 'spa-navigation', state: await waitForStableLogo(page) })

    for (let index = 1; index <= 2; index += 1) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      cycles.push({ name: `reload-${index}`, state: await waitForStableLogo(page) })
    }

    const timeline = await page.evaluate(() => window.__workspaceBrandingTimeline || [])
    const firstLoadedIndex = timeline.findIndex((entry) => entry.loaded)
    const fallbackAfterLoaded = firstLoadedIndex >= 0 && timeline.slice(firstLoadedIndex).some((entry) => entry.fallback)
    const screenshotPath = path.join(OUT_DIR, 'workspace-branding-stable.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })

    const report = {
      ok: cycles.every((cycle) => cycle.state.imageLoaded && cycle.state.imageVisible && !cycle.state.fallbackPresent),
      mode: 'read_only_staging_browser_certification',
      mutatedData: false,
      cycleCount: cycles.length,
      cycles,
      fallbackAfterLoaded,
      consoleErrorCount: consoleErrors.length,
      consoleErrorPreview: consoleErrors.slice(0, 5),
      screenshotPath,
    }
    if (fallbackAfterLoaded || consoleErrors.length) report.ok = false
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    const failureScreenshotPath = path.join(OUT_DIR, 'workspace-branding-blocked.png')
    await page.screenshot({ path: failureScreenshotPath, fullPage: false }).catch(() => null)
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    console.log(JSON.stringify({
      ok: false,
      mode: 'read_only_staging_browser_certification',
      mutatedData: false,
      reason: error?.message || String(error),
      finalPath: (() => {
        try { return new URL(page.url()).pathname } catch { return '' }
      })(),
      bodySignals: bodyText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12),
      consoleErrorCount: consoleErrors.length,
      consoleErrorPreview: consoleErrors.slice(0, 5),
      screenshotPath: failureScreenshotPath,
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
