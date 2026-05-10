import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
await page.goto('http://127.0.0.1:4173/auth/callback?error=access_denied&error_description=expired', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const body = await page.locator('body').innerText()
console.log('URL', page.url())
console.log('BODY_LEN', body.length)
console.log('BODY', body.slice(0, 500).replace(/\n/g, ' | '))
console.log('LOGS', logs.slice(0, 20).join('\n'))
await page.screenshot({ path: 'test-results/phase45/callback-invalid-focused.png', fullPage: true })
await browser.close()
