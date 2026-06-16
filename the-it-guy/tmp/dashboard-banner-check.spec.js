import { expect, test } from '@playwright/test'

test('agent dashboard no longer shows the hero banner copy', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/dashboard', { waitUntil: 'networkidle' })

  await expect(page.getByText('My Active Transactions')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Good morning')
  await expect(page.locator('body')).not.toContainText('Agent Dashboard · My Performance')
  await expect(page.locator('body')).not.toContainText('Your personal residential sales performance.')
})

test('attorney dashboard no longer shows the hero banner copy', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/attorney/dashboard', { waitUntil: 'networkidle' })

  await expect(page.getByText('Active Matters')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Good morning')
  await expect(page.locator('body')).not.toContainText('Here\'s what is happening in your practice today.')
})
