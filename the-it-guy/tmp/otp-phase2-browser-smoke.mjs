import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const PACKET_ID = 'f30555b0-104b-4eb4-a2a2-11f2ac8c156f'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
assert.ok(url?.includes('isdowlnollckzvltkasn'), 'Browser smoke is pinned to canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Service role key is required to locate the controlled signer token.')
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const signerQuery = await admin
  .from('document_packet_signers')
  .select('signer_role, status, signing_token, token_expires_at')
  .eq('packet_id', PACKET_ID)
  .order('signing_order', { ascending: true })
assert.ifError(signerQuery.error)
const signer = (signerQuery.data || []).find((row) => row.signing_token)
assert.ok(signer?.signing_token, `A controlled signer token is required for the public browser smoke. States: ${(signerQuery.data || []).map((row) => `${row.signer_role}:${row.status}:${Boolean(row.signing_token)}`).join(', ')}`)

const errors = []
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.goto(`http://127.0.0.1:5175/sign/${signer.signing_token}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForFunction(() => document.body.innerText.includes('Phase 2 OTP BOND Acceptance'), null, { timeout: 45_000 })
  await page.waitForTimeout(3500)
  const body = await page.locator('body').innerText()
  const bodyLower = body.toLowerCase()
  for (const signal of ['Phase 2 OTP BOND Acceptance', 'Secure', 'Signer']) {
    assert.ok(bodyLower.includes(signal.toLowerCase()), `Public signer surface is missing: ${signal}`)
  }
  assert.equal(body.includes('Signing Link Unavailable'), false, 'Controlled signer token did not resolve.')
  await page.screenshot({ path: 'tmp/pdfs/otp-phase2/browser-public-signer.png', fullPage: true })
  console.log(JSON.stringify({
    ok: true,
    route: '/sign/[redacted]',
    packetId: PACKET_ID,
    signerRole: signer.signer_role,
    signals: ['Phase 2 OTP BOND Acceptance', 'Secure', 'Signer'],
    pageErrorCount: errors.length,
    errors: errors.slice(0, 10),
    screenshot: path.resolve('tmp/pdfs/otp-phase2/browser-public-signer.png'),
  }, null, 2))
  await context.close()
} finally {
  await browser.close()
}
