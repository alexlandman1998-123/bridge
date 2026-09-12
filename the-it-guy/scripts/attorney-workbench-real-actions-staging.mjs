// Browser-level attorney action acceptance against the explicitly approved
// sixth staging fixture. It never targets production and restores the original
// task outcome when finished. The audit history created by the test is retained.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const MATTER_ID = '80b452c8-3d5f-4597-9da7-0cdef47540e1'
const ORIGIN = 'http://127.0.0.1:4180'
const UAT_EMAIL = 'transfer.attorney.uat@arch9.co.za'
const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8')
  .split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => {
    const divider = line.indexOf('=')
    return [line.slice(0, divider), line.slice(divider + 1).trim().replace(/^['"]|['"]$/g, '')]
  }))

assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co', 'staging only')
assert.ok(process.argv.includes('--apply'), 'This browser test mutates an approved staging fixture; pass --apply')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const anon = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, options)
const requireData = async (request) => {
  const response = await request
  if (response.error) throw Object.assign(new Error(response.error.message), { code: response.error.code })
  return response.data
}
const tx = await requireData(admin.from('transactions').select('id,is_demo_data').eq('id', MATTER_ID).single())
assert.equal(tx.is_demo_data, true, 'Only the approved demo fixture may be exercised')
const profile = await requireData(admin.from('profiles').select('id').eq('email', UAT_EMAIL).single())
const user = await admin.auth.admin.getUserById(profile.id)
if (user.error) throw user.error
assert.equal(user.data.user?.app_metadata?.arch9_uat_actor, true, 'Only the labelled staging UAT actor may be used')
const magicLink = await admin.auth.admin.generateLink({ type: 'magiclink', email: UAT_EMAIL })
if (magicLink.error) throw magicLink.error
const attorney = anon()
const login = await attorney.auth.verifyOtp({ type: 'magiclink', token_hash: magicLink.data.properties.hashed_token })
if (login.error) throw login.error
const session = login.data.session
assert.ok(session?.access_token, 'Attorney staging session was not created')

const lane = await requireData(admin.from('transaction_subprocesses').select('id').eq('transaction_id', MATTER_ID).eq('process_type', 'transfer').single())
const step = await requireData(admin.from('transaction_subprocess_steps')
  .select('id,step_key,status,updated_at,comment,visibility_scope')
  .eq('subprocess_id', lane.id)
  .order('sort_order', { ascending: true })
  .limit(1)
  .single())
const original = { ...step }
const updateStep = async (status, { restore = false } = {}) => {
  const current = await requireData(admin.from('transaction_subprocess_steps')
    .select('id,updated_at')
    .eq('id', step.id)
    .single())
  const response = await attorney.rpc('bridge_update_attorney_workflow_step_v4', {
    p_transaction_id: MATTER_ID,
    p_lane_key: 'transfer',
    p_step_id: step.id,
    p_status: status,
    p_command_id: randomUUID(),
    p_expected_step_updated_at: current.updated_at,
    p_note: restore ? (original.comment || '') : 'STAGING REAL BUTTON ACCEPTANCE: original state restored after test.',
    p_visibility: restore ? (original.visibility_scope || 'internal') : 'internal',
    p_work_packet: null,
  })
  if (response.error) throw response.error
  return response.data
}
const currentStatus = async () => (await requireData(admin.from('transaction_subprocess_steps').select('status').eq('id', step.id).single())).status
const waitForStatus = async (expected) => {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (await currentStatus() === expected) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.equal(await currentStatus(), expected, `Expected saved status ${expected}`)
}
const clickModalSubmit = async (page, name) => {
  const dialog = page.getByRole('dialog').last()
  await dialog.waitFor({ state: 'visible', timeout: 60000 })
  const field = dialog.locator('textarea, input:not([type="checkbox"])')
  if (await field.count()) await field.first().fill('Staging acceptance outcome reason')
  console.log(`Submitting modal action ${String(name)}`)
  await dialog.getByRole('button', { name, exact: typeof name === 'string' }).click()
  console.log(`Waiting for modal action ${String(name)} to finish`)
  await dialog.waitFor({ state: 'detached', timeout: 60000 })
}
const selectTask = async (page) => {
  await page.evaluate(({ matterId, stepKey }) => {
    sessionStorage.setItem(`arch9:attorney-workflow-selection:${matterId}:transfer`, stepKey)
  }, { matterId: MATTER_ID, stepKey: step.step_key })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Work', exact: true }).click({ timeout: 60000 })
  await page.getByRole('navigation', { name: /stages$/i }).waitFor({ timeout: 60000 })
  await page.getByRole('heading', { name: 'Instruction Received', exact: true }).waitFor({ timeout: 60000 })
}

let browser
let acceptanceResult = { environment: 'staging', matter: MATTER_ID, result: 'RUNNING' }
try {
  console.log('Preparing approved staging action fixture')
  await updateStep('not_started')
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return host.endsWith('.supabase.co') && host !== 'vaszuxjeoajeuhlcnzzf.supabase.co' ? route.abort() : route.continue()
  })
  await context.addInitScript(({ origin, session, matterId, stepKey }) => {
    if (location.origin !== origin) return
    localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token', JSON.stringify(session))
    sessionStorage.setItem(`arch9:attorney-workflow-selection:${matterId}:transfer`, stepKey)
  }, { origin: ORIGIN, session, matterId: MATTER_ID, stepKey: step.step_key })
  const page = await context.newPage()
  const applicationErrors = []
  page.on('pageerror', (error) => applicationErrors.push(error.message))
  console.log('Opening attorney Work tab')
  await page.goto(`${ORIGIN}/transactions/${MATTER_ID}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Work', exact: true }).click({ timeout: 60000 })
  await page.getByRole('navigation', { name: /stages$/i }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Complete task', exact: true }).waitFor({ timeout: 60000 })

  // Actual UI control: complete, persisted by the RPC invoked from the browser.
  console.log('Clicking Complete task')
  await page.getByRole('button', { name: 'Complete task', exact: true }).click()
  await page.waitForTimeout(750)
  await clickModalSubmit(page, /Mark Complete|Complete task/i)
  await waitForStatus('completed')

  // Actual UI control: reopen the same task after a real browser reload.
  console.log('Clicking Reopen task after reload')
  await selectTask(page)
  await page.getByText('Task outcome options', { exact: true }).click()
  await page.getByRole('button', { name: 'Reopen task', exact: true }).click()
  await clickModalSubmit(page, /Reopen task/i)
  await waitForStatus('not_started')

  // Actual UI control: mark not applicable, then prove it survives another reload.
  console.log('Clicking Not applicable after reload')
  await selectTask(page)
  await page.getByText('Task outcome options', { exact: true }).click()
  await page.getByRole('button', { name: 'Not applicable', exact: true }).click()
  await clickModalSubmit(page, /not applicable/i)
  await waitForStatus('not_applicable')
  await selectTask(page)
  await page.getByText('Task outcome options', { exact: true }).click()
  await page.getByRole('button', { name: 'Reopen task', exact: true }).click()
  await clickModalSubmit(page, /Reopen task/i)
  await waitForStatus('not_started')
  assert.deepEqual(applicationErrors, [], `Browser errors: ${applicationErrors.join('; ')}`)
  await page.screenshot({ path: 'test-results/attorney-real-actions-staging.png', fullPage: true })
  acceptanceResult = { environment: 'staging', matter: MATTER_ID, lane: 'transfer', step: step.step_key, controls: ['complete', 'reopen', 'not_applicable', 'reload'], result: 'PASS', productionChanges: 0 }
  console.log(JSON.stringify(acceptanceResult))
} catch (error) {
  acceptanceResult = { ...acceptanceResult, result: 'FAIL', error: error?.message || String(error) }
  throw error
} finally {
  if (browser) await browser.close()
  try {
    await updateStep(original.status, { restore: true })
    assert.equal(await currentStatus(), original.status, 'Original fixture status must be restored')
    acceptanceResult = { ...acceptanceResult, originalOutcomeRestored: true, historyPreserved: true }
  } finally {
    writeFileSync('test-results/attorney-real-actions-staging.json', `${JSON.stringify(acceptanceResult, null, 2)}\n`)
  }
  console.log(JSON.stringify({ matter: MATTER_ID, originalOutcomeRestored: true, historyPreserved: true }))
}
