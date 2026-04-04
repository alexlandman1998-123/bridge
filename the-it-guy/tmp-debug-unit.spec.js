const { test } = require('@playwright/test')

test('debug unit page', async ({ page }) => {
  const logs = []
  page.on('console', (msg) => logs.push(`console:${msg.type()}:${msg.text()}`))
  page.on('pageerror', (err) => logs.push(`pageerror:${err.stack || err.message}`))
  const res = await page.goto('http://localhost:5173/units/a0000000-0000-0000-0000-000000000013', { waitUntil: 'networkidle' })
  logs.push(`status:${res ? res.status() : 'no-response'}`)
  await page.screenshot({ path: '/Users/alexanderlandman/the-it-guy/the-it-guy/tmp-debug-unit.png', fullPage: true })
  console.log(logs.join('\n'))
})
