import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
await page.goto('http://127.0.0.1:4173/auth', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /sign up/i }).click()
const email = `phase45${Date.now()}@demoqa.co`
await page.getByLabel('Email').fill(email)
await page.locator('input[type="password"]').first().fill('Phase45Pass!123')
await page.locator('input[type="password"]').nth(1).fill('Phase45Pass!123')
await page.getByRole('button', { name: /create account/i }).click()
await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
console.log('EMAIL', email)
console.log('URL', page.url())
console.log('HAS_SUCCESS', /account created|check your email|already registered|pending verification/i.test(body))
console.log('ERROR_LINE', (body.match(/Email address[^\n]+|redirect[^\n]+|verification[^\n]+|unable[^\n]+/i) || ['none'])[0])
await browser.close()
