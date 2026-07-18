import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { assessDocumentBrowserExperience } from '../src/core/documents/documentBrowserExperienceAssessment.js'

const outputDirectory = path.resolve('test-results/document-generator-phase-n2')
const scenarios = [
  { id: 'attorney-mandate-desktop', surface: 'workspace', role: 'attorney', packetType: 'mandate', viewport: 'desktop', size: { width: 1440, height: 1000 } },
  { id: 'agent-otp-mobile', surface: 'workspace', role: 'agent', packetType: 'otp', viewport: 'mobile', size: { width: 390, height: 844 } },
  { id: 'seller-mandate-desktop', surface: 'signer_portal', role: 'seller', packetType: 'mandate', viewport: 'desktop', size: { width: 1280, height: 900 } },
  { id: 'purchaser-otp-mobile', surface: 'signer_portal', role: 'purchaser_1', packetType: 'otp', viewport: 'mobile', size: { width: 390, height: 844 } },
]

fs.mkdirSync(outputDirectory, { recursive: true })
const vite = await createServer({ root: process.cwd(), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } })
await vite.listen()
const address = vite.httpServer?.address()
assert.ok(address && typeof address === 'object', 'N2 Vite fixture server did not start.')
const baseUrl = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({ headless: true })
const telemetry = { pageErrors: [], consoleErrors: [] }
const journeys = []

async function visible(locator) {
  return locator.count().then(async (count) => count > 0 && locator.first().isVisible()).catch(() => false)
}

async function completeInteraction(page, scenario) {
  if (scenario.surface === 'workspace') {
    if (scenario.viewport === 'mobile') {
      await page.getByTestId('document-mobile-action').getByRole('button').click()
    } else {
      await page.getByRole('button', { name: 'Send for signature', exact: true }).click()
      await page.getByTestId('document-commit-confirmation').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Send to 2 signers', exact: true }).click()
    }
  } else {
    for (let index = 0; index < 2; index += 1) {
      const action = scenario.viewport === 'mobile'
        ? page.getByTestId('document-mobile-action').getByRole('button')
        : page.getByTestId('document-role-actions').getByRole('button', { name: 'Next required field', exact: true })
      await action.click()
    }
    const complete = scenario.viewport === 'mobile'
      ? page.getByTestId('document-mobile-action').getByRole('button', { name: 'Complete signing', exact: true })
      : page.getByTestId('document-role-actions').getByRole('button', { name: 'Complete signing', exact: true })
    await complete.click()
    await page.getByTestId('document-commit-confirmation').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Complete signing', exact: true }).last().click()
  }
  await page.getByTestId('document-outcome-notice').waitFor({ state: 'visible' })
  return true
}

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: scenario.size })
    const page = await context.newPage()
    page.on('pageerror', (error) => telemetry.pageErrors.push(`${scenario.id}: ${error.message}`))
    page.on('console', (entry) => { if (entry.type() === 'error') telemetry.consoleErrors.push(`${scenario.id}: ${entry.text()}`) })
    const url = `${baseUrl}/test-fixtures/document-experience-n2.html?surface=${scenario.surface}&role=${scenario.role}&packet=${scenario.packetType}`
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    await page.getByTestId('document-journey-progress').waitFor({ state: 'visible' })
    await page.keyboard.press('Tab')
    const keyboardSkip = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Skip to document')
    const mobileAction = scenario.viewport === 'mobile' ? await visible(page.getByTestId('document-mobile-action')) : false
    const initialUi = {
      journey: await visible(page.getByTestId('document-journey-progress')),
      guidance: await visible(page.getByTestId('document-role-guidance')),
      actions: await visible(page.getByTestId('document-role-actions')),
      responsibility: await visible(page.getByTestId('document-responsibility')),
      help: await visible(page.getByTestId('document-help-recovery')),
    }
    const interactionPassed = await completeInteraction(page, scenario).catch((error) => {
      telemetry.pageErrors.push(`${scenario.id} interaction: ${error.message}`)
      return false
    })
    const unnamedControls = await page.locator('button:visible,a:visible').evaluateAll((nodes) => nodes.filter((node) => !(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim()).length)
    const horizontalOverflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
    const screenshot = path.join(outputDirectory, `${scenario.id}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    journeys.push({
      ...scenario,
      loaded: (await page.locator('body').innerText()).trim().length > 0,
      ...initialUi,
      mobileAction,
      keyboardSkip,
      interactionPassed,
      outcome: await visible(page.getByTestId('document-outcome-notice')),
      horizontalOverflowPx,
      accessibleControls: unnamedControls === 0,
      screenshot,
    })
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}

const assessment = assessDocumentBrowserExperience({ journeys, telemetry })
assert.equal(assessment.status, 'READY_FOR_N3', JSON.stringify(assessment.blockers, null, 2))
assert.equal(assessment.coverage.scenarioCount, 4)
assert.equal(assessment.mutatedData, false)
console.log(JSON.stringify({ phase: 'N2', ...assessment, evidence: journeys, telemetry }, null, 2))
