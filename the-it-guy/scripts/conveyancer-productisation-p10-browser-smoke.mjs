import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const baseUrl = process.env.P10_BASE_URL || 'http://127.0.0.1:5176/'
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ name: 'desktop', width: 1280, height: 720 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle' })
    assert.ok(response?.ok(), `${viewport.name} page returned ${response?.status()}`)
    assert.ok((await page.locator('body').innerText()).trim().length > 40, `${viewport.name} page is blank`)
    assert.equal(await page.locator('.vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay').count(), 0, `${viewport.name} error overlay present`)
    assert.equal(errors.length, 0, `${viewport.name} console errors: ${errors.join(' | ')}`)
    assert.equal(await page.getByLabel('Email').count(), 1, `${viewport.name} email field missing`)
    assert.equal(await page.getByRole('button', { name: /sign in/i }).count(), 1, `${viewport.name} sign-in action missing`)
    if (process.env.P10_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.P10_SCREENSHOT_DIR}/p10-${viewport.name}.png`, fullPage: true })
    await page.close()
  }
} finally { await browser.close() }

console.log('P10 browser smoke passed for desktop and mobile.')
