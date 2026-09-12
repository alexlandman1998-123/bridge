import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('=')
    return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
  }))
assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const origin = process.env.DOCUMENT_ACCEPTANCE_ORIGIN || 'http://localhost:4177'
assert.ok(['http://localhost:4177', 'http://localhost:4180'].includes(origin))
const { data, error } = await client.auth.signInWithPassword({ email: 'attorney.demo@arch9.co.za', password: env.ATTORNEY_DEMO_PASSWORD })
if (error) throw error
const browser = await chromium.launch({ headless: true })
try {
  const attempts = process.env.DOCUMENT_REFRESH_FAILURE_TEST === '1' ? 1 : 5
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const context = await browser.newContext()
    await context.route('**/*', route => {
      const host = new URL(route.request().url()).hostname
      return host.endsWith('.supabase.co') && host !== 'vaszuxjeoajeuhlcnzzf.supabase.co'
        ? route.abort('blockedbyclient') : route.continue()
    })
    await context.addInitScript(({ session, origin }) => {
      if (location.origin === origin) localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token', JSON.stringify(session))
    }, { session: data.session, origin })
    const page = await context.newPage()
    const failures = []
    const telemetryFailures = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('response', async response => {
      if (response.status() >= 400 && response.url().includes('/rest/v1/')) {
        const body = await response.json().catch(() => ({}))
        const path = new URL(response.url()).pathname
        const target = path === '/rest/v1/error_events' ? telemetryFailures : failures
        target.push(`${path}: ${response.status()} ${body.code || ''}`)
      }
    })
    await page.goto(`${origin}/transactions/b27fc192-b5ff-471b-9da5-902409f78116`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Documents', exact: true }).click({ timeout: 60000 })
    await page.getByRole('button', { name: /^Sale Documents/ }).first().click({ timeout: 45000 })
    const requirement = page.locator('article').filter({ hasText: 'Offer to Purchase (OTP)' }).first()
    await requirement.waitFor({ timeout: 45000 })
    const savedText = await requirement.innerText()
    // Observe a full live-refresh interval without mutating the fixture.
    await page.waitForTimeout(17000)
    const savedRequirement = page.locator('article').filter({ hasText: 'Offer to Purchase (OTP)' }).first()
    if (!(await savedRequirement.count())) {
      await page.screenshot({ path: 'test-results/document-cold-load-failure.png' })
      console.log('Missing requirement after refresh', JSON.stringify({ attempt, failures, telemetryFailures, body: (await page.locator('body').innerText()).slice(-6000) }))
    }
    assert.equal(await savedRequirement.innerText(), savedText, 'Saved document state must survive refresh')
    assert.deepEqual(failures, [], 'Cold load must not rely on failed API calls/retries')
    console.log(JSON.stringify({ attempt, documentReload: 'PASS', persistedDocumentState: true,
      journeyUnavailable: (await page.locator('body').innerText()).includes('Legal journey unavailable'), telemetryFailures }))
    if (process.env.DOCUMENT_REFRESH_FAILURE_TEST === '1') {
      const rpc = '**/rest/v1/rpc/bridge_read_professional_matter_journey'
      await page.route(rpc, route => route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'TEST: simulated statement timeout' }) }))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.getByText('Showing the last loaded journey. Updates will retry automatically.', { exact: true }).waitFor({ timeout: 45000 })
      assert.equal(await savedRequirement.innerText(), savedText)
      assert.equal(await page.getByText('Legal journey unavailable. Refresh to try again.', { exact: true }).count(), 0)
      await page.screenshot({ path: 'test-results/loading-refresh-retained.png' })
      await page.unroute(rpc)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.getByText('Showing the last loaded journey. Updates will retry automatically.', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 })
      assert.equal(await savedRequirement.innerText(), savedText)
      console.log('Injected journey timeout: retained data, visible stale notice, successful recovery PASS')
    }
    await context.close()
  }
} finally { await browser.close() }
