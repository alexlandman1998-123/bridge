import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4173/auth', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /developer/i }).click()
await page.waitForTimeout(2200)
console.log('URL_AFTER_LOGIN', page.url())
const avatarCount = await page.locator('.ui-shell-avatar-trigger').count()
console.log('AVATAR_COUNT', avatarCount)
if (avatarCount > 0) {
  await page.locator('.ui-shell-avatar-trigger').first().click()
  const logoutBtn = page.getByRole('button', { name: /logout/i }).first()
  console.log('LOGOUT_BTN_COUNT', await logoutBtn.count())
  await logoutBtn.click()
  await page.waitForTimeout(1500)
}
const body = await page.locator('body').innerText()
console.log('URL_FINAL', page.url())
console.log('HAS_SIGNIN', /sign in to bridge/i.test(body))
await page.screenshot({ path: 'test-results/phase45/logout-avatar-focused.png', fullPage: true })
await browser.close()
