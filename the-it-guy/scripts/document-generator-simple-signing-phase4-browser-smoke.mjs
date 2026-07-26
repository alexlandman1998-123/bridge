import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const FAKE_SUPABASE_URL = 'https://simple-signing-phase4.supabase.co'
const FAKE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.phase4'
const outputDirectory = path.resolve('test-results/document-generator-simple-signing-phase4')

const config = JSON.parse(fs.readFileSync('config/document-generator-simple-signing-phase4-browser-smoke.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-4.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(config.phase, 'document-generator-simple-signing-ui-phase-4')
assert.equal(config.status, 'browser_smoke_ready')
assert.equal(config.backendBoundaries.usesMockedEdgeFunctions, true)
assert.equal(config.backendBoundaries.sendsRealEmails, false)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function previewHtml(title, signerLabel) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; font-family: Arial, sans-serif; color: #152337; background: white; }
          main { width: 680px; max-width: calc(100vw - 32px); margin: 0 auto; padding: 36px 24px; }
          h1 { text-align: center; font-size: 22px; margin: 0 0 28px; }
          dl { display: grid; grid-template-columns: 190px 1fr; gap: 14px 24px; font-size: 14px; }
          dt { font-weight: 700; }
          .rule { margin: 30px 0; border-top: 1px solid #d8e1ea; }
          .signature { margin-top: 42px; border: 2px dashed #12385f; border-radius: 8px; padding: 18px; color: #12385f; font-weight: 700; }
        </style>
      </head>
      <body>
        <main>
          <h1>${title.toUpperCase()}</h1>
          <dl>
            <dt>Signer</dt><dd>${signerLabel}</dd>
            <dt>Property</dt><dd>12 Jacaranda Street, Lynnwood, Pretoria</dd>
            <dt>Email</dt><dd>phase4.signer@example.test</dd>
          </dl>
          <div class="rule"></div>
          <p>I/We appoint the agent and mandate the attorney to act on my/our behalf for this transaction.</p>
          <div class="signature">Signature required on page 4</div>
        </main>
      </body>
    </html>`
}

function buildSession({ token, packetType, signerRole, signerName, fieldStatus = 'pending', signerStatus = 'viewed', completion = null }) {
  const title = packetType === 'otp' ? 'Offer to Purchase' : 'Mandate'
  const fileName = packetType === 'otp' ? 'Offer_to_Purchase_Purchaser.pdf' : 'Mandate_Seller.pdf'
  return {
    packet: {
      id: `${token}-packet`,
      packet_type: packetType,
      title,
      transaction_id: `${token}-transaction`,
      transaction_reference: `PHASE4-${packetType.toUpperCase()}`,
      property_label: '12 Jacaranda Street, Lynnwood, Pretoria',
    },
    version: {
      id: `${token}-version`,
      version_number: 1,
      rendered_file_name: fileName,
      page_count: 6,
    },
    signer: {
      id: `${token}-signer`,
      signer_role: signerRole,
      signer_name: signerName,
      signer_email: 'phase4.signer@example.test',
      signing_order: 1,
      status: signerStatus,
      token_expires_at: '2026-12-31T23:59:59.000Z',
      signed_at: signerStatus === 'signed' ? '2026-07-26T10:00:00.000Z' : null,
    },
    fields: [
      {
        id: `${token}-signature`,
        signer_role: signerRole,
        signer_name: signerName,
        signer_email: 'phase4.signer@example.test',
        field_type: 'signature',
        page_number: 4,
        x_position: 120,
        y_position: 620,
        width: 180,
        height: 48,
        required: true,
        status: fieldStatus,
      },
    ],
    signingOrder: [{ signerId: `${token}-signer`, role: signerRole, order: 1, status: signerStatus }],
    previewData: {
      packetType,
      title,
      previewHtml: previewHtml(title, signerName),
    },
    sessionBinding: {
      exactVersionBound: true,
      certified: true,
      packetId: `${token}-packet`,
      versionId: `${token}-version`,
      documentId: `${token}-document`,
      pdfSha256: 'phase4-browser-smoke-only',
    },
    completion,
  }
}

const stateByToken = new Map([
  ['phase4-mandate-seller', {
    session: buildSession({
      token: 'phase4-mandate-seller',
      packetType: 'mandate',
      signerRole: 'seller',
      signerName: 'Marie van der Merwe',
    }),
    calls: [],
  }],
  ['phase4-otp-purchaser', {
    session: buildSession({
      token: 'phase4-otp-purchaser',
      packetType: 'otp',
      signerRole: 'purchaser_1',
      signerName: 'Sipho Dlamini',
    }),
    calls: [],
  }],
])

function jsonResponse(payload, status = 200) {
  return {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify(payload),
  }
}

async function readBody(route) {
  try {
    return route.request().postDataJSON()
  } catch {
    return {}
  }
}

async function handleEdgeFunction(route) {
  const url = new URL(route.request().url())
  const functionName = url.pathname.split('/').filter(Boolean).at(-1)
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill(jsonResponse({ ok: true }, 204))
    return
  }

  const body = await readBody(route)
  const token = String(body?.token || body?.signingToken || '').trim()
  const state = stateByToken.get(token)
  if (!state) {
    await route.fulfill(jsonResponse({ success: false, errorCode: 'INVALID_SIGNING_TOKEN', error: 'Unknown smoke token.' }, 404))
    return
  }

  state.calls.push({ functionName, action: body?.action || 'resolve' })

  if (functionName === 'resolve-signer-token') {
    await route.fulfill(jsonResponse({ success: true, session: clone(state.session), completion: state.session.completion || null }))
    return
  }

  if (functionName === 'signer-signing-action') {
    if (body?.action === 'upsert_asset') {
      await route.fulfill(jsonResponse({ success: true, asset: { path: `${token}/${body.assetType || 'signature'}.png`, url: `mock://${token}/signature.png` } }))
      return
    }
    if (body?.action === 'apply_field') {
      state.session.fields = state.session.fields.map((field) => field.id === body.fieldId ? {
        ...field,
        status: 'completed',
        completed_at: '2026-07-26T09:45:00.000Z',
        completed_by_email: state.session.signer.signer_email,
        signature_asset_path: body.assetPath || null,
      } : field)
      await route.fulfill(jsonResponse({ success: true, field: clone(state.session.fields.find((field) => field.id === body.fieldId)) }))
      return
    }
    if (body?.action === 'complete_signing') {
      state.session.signer = {
        ...state.session.signer,
        status: 'signed',
        signed_at: '2026-07-26T10:00:00.000Z',
      }
      state.session.signingOrder = state.session.signingOrder.map((item) => ({ ...item, status: 'signed' }))
      state.session.completion = {
        completedAt: '2026-07-26T10:00:00.000Z',
        transactionSaved: true,
        document: {
          id: state.session.packet.id,
          packetId: state.session.packet.id,
          type: state.session.packet.packet_type,
          title: state.session.packet.title,
          transactionId: state.session.packet.transaction_id,
        },
        version: {
          id: state.session.version.id,
          number: state.session.version.version_number,
        },
        signer: state.session.signer,
        finalArtifact: { ready: false },
      }
      await route.fulfill(jsonResponse({ success: true, completion: clone(state.session.completion) }))
      return
    }
  }

  await route.fulfill(jsonResponse({ success: false, errorCode: 'UNEXPECTED_SMOKE_CALL', error: `Unexpected smoke function ${functionName}` }, 400))
}

async function startServer() {
  const previousEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY,
  }
  process.env.VITE_SUPABASE_URL = FAKE_SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY = FAKE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_KEY = ''

  const vite = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  assert.ok(address && typeof address === 'object', 'Phase 4 Vite server did not start.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      await vite.close()
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
}

async function visible(locator) {
  return locator.count().then(async (count) => count > 0 && locator.first().isVisible()).catch(() => false)
}

async function assertShellReady(page, label) {
  await page.getByTestId('simple-signing-shell').waitFor({ state: 'visible', timeout: 20_000 })
  assert.equal(await visible(page.getByTestId('simple-signing-progress')), true, `${label} should show simple progress.`)
  assert.equal(await visible(page.getByTestId('simple-signing-document-card')), true, `${label} should show document card.`)
  assert.equal(await visible(page.getByTestId('simple-signing-action-card')), true, `${label} should show action card.`)
  assert.equal(await visible(page.getByTestId('simple-signing-help-card')), true, `${label} should show help card.`)
  assert.equal(await page.locator('[data-testid="document-role-actions"], [data-testid="document-mobile-action"], [data-testid="document-journey-progress"]').count(), 0, `${label} should not render the old signer surface.`)
}

async function pageAudit(page, label) {
  const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
  const overlayCount = await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count()
  const unnamedControls = await page.locator('button:visible,a:visible').evaluateAll((nodes) => nodes.filter((node) => !(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim()).length)
  const horizontalOverflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  assert.equal(overlayCount, 0, `${label} should not show a dev overlay.`)
  assert.equal(unnamedControls, 0, `${label} should not expose unnamed visible controls.`)
  assert.ok(bodyText.trim().length > 0, `${label} should render text.`)
  assert.ok(horizontalOverflowPx <= 2, `${label} should avoid horizontal overflow, saw ${horizontalOverflowPx}px.`)
  return { bodyText, horizontalOverflowPx, unnamedControls }
}

fs.mkdirSync(outputDirectory, { recursive: true })
const server = await startServer()
const browser = await chromium.launch({ headless: true })
const evidence = []
const telemetry = { pageErrors: [], consoleErrors: [], failedRequests: [] }

try {
  for (const scenario of [
    { token: 'phase4-mandate-seller', id: 'mandate-seller-mobile', viewport: { width: 390, height: 844 }, fullFlow: true },
    { token: 'phase4-otp-purchaser', id: 'otp-purchaser-desktop', viewport: { width: 1280, height: 900 }, fullFlow: false },
  ]) {
    const context = await browser.newContext({ viewport: scenario.viewport, ignoreHTTPSErrors: true })
    await context.route(`${FAKE_SUPABASE_URL}/functions/v1/**`, handleEdgeFunction)
    const page = await context.newPage()
    page.on('pageerror', (error) => telemetry.pageErrors.push(`${scenario.id}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') telemetry.consoleErrors.push(`${scenario.id}: ${message.text()}`)
    })
    page.on('requestfailed', (request) => {
      if (request.url().includes('/functions/v1/')) telemetry.failedRequests.push(`${scenario.id}: ${request.url()} ${request.failure()?.errorText || ''}`)
    })

    await page.goto(`${server.baseUrl}/sign/${scenario.token}`, { waitUntil: 'networkidle', timeout: 60_000 })
    await assertShellReady(page, scenario.id)
    const initialAudit = await pageAudit(page, `${scenario.id} initial`)
    assert.match(initialAudit.bodyText, /Your signing progress/)
    assert.match(initialAudit.bodyText, /Step 2 of 3/)
    assert.match(initialAudit.bodyText, /Secure document signing/)

    if (scenario.fullFlow) {
      await page.getByRole('button', { name: /Add my signature/i }).click()
      await page.getByRole('heading', { name: /Add your signature/i }).waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByRole('button', { name: 'Type', exact: true }).click()
      await page.locator('#typed-signature').fill('Marie van der Merwe')
      await page.getByRole('button', { name: /Save Signature/i }).click()
      await page.getByText(/Signature applied to page 4/i).waitFor({ state: 'visible', timeout: 15_000 })
      await page.getByRole('button', { name: /Finish signing/i }).click()
      await page.getByTestId('document-commit-confirmation').waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByRole('button', { name: 'Complete signing', exact: true }).last().click()
      await page.getByText(/You're all set/i).waitFor({ state: 'visible', timeout: 15_000 })
      await page.getByText(/Check again/i).waitFor({ state: 'visible', timeout: 10_000 })
    }

    const finalAudit = await pageAudit(page, `${scenario.id} final`)
    const screenshot = path.join(outputDirectory, `${scenario.id}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    evidence.push({
      ...scenario,
      url: page.url(),
      screenshot,
      horizontalOverflowPx: finalAudit.horizontalOverflowPx,
      callTrace: clone(stateByToken.get(scenario.token)?.calls || []),
    })
    await context.close()
  }
} finally {
  await browser.close()
  await server.stop()
}

assert.deepEqual(telemetry.pageErrors, [], `Browser page errors:\n${telemetry.pageErrors.join('\n')}`)
assert.deepEqual(telemetry.failedRequests, [], `Failed signing requests:\n${telemetry.failedRequests.join('\n')}`)
assert.deepEqual(
  telemetry.consoleErrors.filter((entry) => !entry.includes('Download the React DevTools')),
  [],
  `Browser console errors:\n${telemetry.consoleErrors.join('\n')}`,
)

const mandateCalls = stateByToken.get('phase4-mandate-seller')?.calls || []
assert.ok(mandateCalls.some((call) => call.functionName === 'resolve-signer-token'), 'Mandate smoke should resolve signer token.')
assert.ok(mandateCalls.some((call) => call.action === 'upsert_asset'), 'Mandate smoke should save signature asset through signing action.')
assert.ok(mandateCalls.some((call) => call.action === 'apply_field'), 'Mandate smoke should apply signing field through signing action.')
assert.ok(mandateCalls.some((call) => call.action === 'complete_signing'), 'Mandate smoke should complete signing through signing action.')
assert.ok((stateByToken.get('phase4-otp-purchaser')?.calls || []).some((call) => call.functionName === 'resolve-signer-token'), 'OTP smoke should resolve signer token.')

for (const reference of [
  'does not call production Supabase',
  'does not send real emails',
  'does not generate final artifacts',
  'does not change completion truth',
  'does not change token authority',
  'does not write storage',
]) {
  assert.ok(audit.includes(reference), `Phase 4 audit should keep ${reference}.`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase4'],
  'npm run test:document-generator-simple-signing-phase3 && node scripts/document-generator-simple-signing-phase4-browser-smoke.mjs',
)

const report = {
  phase: 'document-generator-simple-signing-ui-phase-4',
  status: 'browser_smoke_passed',
  mutatedData: false,
  sentRealEmails: false,
  evidence,
}

fs.writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
