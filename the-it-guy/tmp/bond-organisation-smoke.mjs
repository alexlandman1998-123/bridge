import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173'
const outputFile = process.env.OUTPUT_FILE || ''
const targets = [
  '/bond/organisation?view=regions',
  '/bond/organisation?view=branches',
  '/bond/organisation?view=consultants',
  '/bond/organisation?view=random',
]

function normalize(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1280 } })
  const page = await context.newPage()
  const results = []

  async function capture(path) {
    const bodyText = normalize(await page.locator('body').innerText())
    return {
      path,
      url: page.url(),
      title: normalize(await page.title()),
      bodySnippet: bodyText.slice(0, 1800),
      markers: {
        hasOrganisationOverview: bodyText.includes('Manage your national structure, branch performance, and operational activity.'),
        hasRegionsCopy: bodyText.includes('Manage regional coverage, branch grouping, and regional application performance.'),
        hasBranchesCopy: bodyText.includes('Manage branch capacity, consultant allocation, and branch application performance.'),
        hasConsultantsCopy: bodyText.includes('Manage consultant workload, application ownership, and performance.'),
        hasInvalidOverviewShell: bodyText.includes('Operational Health'),
        hasRegionDetail: bodyText.includes('Back to all regions') || bodyText.includes('Region Workspace'),
        hasBranchDetail: bodyText.includes('Back to all branches') || bodyText.includes('Branch Workspace'),
        hasConsultantDetail: bodyText.includes('Back to all consultants') || bodyText.includes('Consultant Workspace'),
        hasUnavailable: bodyText.toLowerCase().includes('unavailable'),
        hasDerivedRegionLabel: bodyText.includes('No configured regions found. Showing regions inferred from current applications.'),
        hasDerivedBranchLabel: bodyText.includes('No configured branches found. Showing branches inferred from current applications.'),
        hasDerivedConsultantLabel: bodyText.includes('No configured consultants found. Showing consultants inferred from current applications.'),
        hasPartialInferenceMessage: bodyText.includes('Application ownership is partially inferred from current assignment data.'),
      },
    }
  }

  async function waitForOrganisationWorkspace() {
    await page.waitForTimeout(5000)
  }

  await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' })
  const bypassButton = page.getByRole('button', { name: /bond originator/i }).first()
  if (await bypassButton.isVisible().catch(() => false)) {
    await bypassButton.click()
    await page.waitForLoadState('networkidle')
  }

  for (const path of targets) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    results.push(await capture(path))
  }

  const regionsPage = results.find((item) => item.path.includes('view=regions'))
  if (regionsPage && page.url()) {
    await page.goto(`${baseUrl}/bond/organisation?view=regions`, { waitUntil: 'networkidle' })
    const openRegion = page.getByRole('button', { name: /open region/i }).first()
    if (await openRegion.isVisible().catch(() => false)) {
      await openRegion.click()
      await waitForOrganisationWorkspace()
      results.push(await capture('drilldown:region'))
    }
  }

  await page.goto(`${baseUrl}/bond/organisation?view=branches`, { waitUntil: 'networkidle' })
  const openBranch = page.getByRole('button', { name: /open branch/i }).first()
  if (await openBranch.isVisible().catch(() => false)) {
    await openBranch.click()
    await waitForOrganisationWorkspace()
    results.push(await capture('drilldown:branch'))
  }

  await page.goto(`${baseUrl}/bond/organisation?view=consultants`, { waitUntil: 'networkidle' })
  const openConsultant = page.getByRole('button', { name: /open consultant/i }).first()
  if (await openConsultant.isVisible().catch(() => false)) {
    await openConsultant.click()
    await waitForOrganisationWorkspace()
    results.push(await capture('drilldown:consultant'))
  }

  const serialized = `${JSON.stringify(results, null, 2)}\n`
  if (outputFile) {
    await writeFile(outputFile, serialized, 'utf8')
  } else {
    process.stdout.write(serialized)
  }
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
