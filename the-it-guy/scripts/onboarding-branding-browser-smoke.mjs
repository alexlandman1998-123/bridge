import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

function getArgValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

const baseUrl = String(
  getArgValue('--base-url') ||
    process.env.ONBOARDING_BRANDING_BASE_URL ||
    process.env.VITE_DEV_SERVER_URL ||
    'http://127.0.0.1:5175',
).replace(/\/+$/, '')
const outDir = path.resolve(
  getArgValue('--out-dir') ||
    process.env.ONBOARDING_BRANDING_SCREENSHOT_DIR ||
    'tmp/onboarding-screenshots',
)

const targets = [
  {
    name: 'buyer-desktop',
    path: '/client/onboarding/demo-buyer-onboarding',
    viewport: { width: 1440, height: 950 },
    expected: 'Start buyer onboarding',
  },
  {
    name: 'buyer-mobile',
    path: '/client/onboarding/demo-buyer-onboarding',
    viewport: { width: 390, height: 844 },
    expected: 'Start buyer onboarding',
  },
  {
    name: 'seller-desktop',
    path: '/seller/onboarding/demo-seller-onboarding',
    viewport: { width: 1440, height: 950 },
    expected: 'Start seller onboarding',
  },
  {
    name: 'seller-mobile',
    path: '/seller/onboarding/demo-seller-onboarding',
    viewport: { width: 390, height: 844 },
    expected: 'Start seller onboarding',
  },
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: target.viewport })
    const errors = []

    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    const url = `${baseUrl}${target.path}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('body', { timeout: 10000 })
    await page.getByText(target.expected, { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText({ timeout: 10000 })
    const overlayCount = await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count()
    const expectedMatches = await page.getByText(target.expected, { exact: true }).count()
    const sectionStyle = await page.locator('section').first().evaluate((node) => {
      const styles = window.getComputedStyle(node)
      return {
        primary: styles.getPropertyValue('--landing-primary').trim(),
        secondary: styles.getPropertyValue('--landing-secondary').trim(),
        accent: styles.getPropertyValue('--landing-accent').trim(),
        backgroundColor: styles.backgroundColor,
      }
    })
    const screenshotPath = path.join(outDir, `onboarding-branding-${target.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: false })

    const styleValuesPresent = Boolean(sectionStyle.primary && sectionStyle.secondary && sectionStyle.accent)
    const status = expectedMatches > 0 &&
      overlayCount === 0 &&
      bodyText.trim().length > 0 &&
      errors.length === 0 &&
      styleValuesPresent
      ? 'pass'
      : 'check'

    results.push({
      name: target.name,
      status,
      url,
      textLength: bodyText.trim().length,
      expectedMatches,
      overlayCount,
      errors,
      sectionStyle,
      screenshotPath,
    })

    await page.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((result) => result.status !== 'pass')
console.log(JSON.stringify(results, null, 2))

if (failed.length) {
  process.exitCode = 1
}
