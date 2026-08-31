import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { File } from 'node:buffer'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const STAGING_REF = 'vaszuxjeoajeuhlcnzzf'
const SAMLIN_ORGANISATION_ID = '84b6e57a-9b12-4bfd-991c-0f5f820d28f4'
const SAMLIN_DEVELOPMENT_ID = '74d85095-1c99-4e04-a826-a67401691e4d'
const TUCKERS_ORGANISATION_ID = 'cbbd85b9-dbf8-44db-9d2a-e025600a940f'
const TUCKERS_FIRM_ID = '417e5aa8-4c61-4821-838e-8dd4a479cc19'
const FIXTURE = 'developer_transaction_persistence_staging_v2'
const APP_ORIGIN = 'http://127.0.0.1:4175'

function readEnv(fileName) {
  const target = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(target)) return {}
  return Object.fromEntries(fs.readFileSync(target, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
    }))
}

function value(input) {
  return String(input ?? '').trim()
}

function serialiseError(error, depth = 0) {
  if (!error || depth > 4) return null
  return {
    message: error.message || value(error),
    code: error.code || null,
    details: error.details || null,
    detail: error.detail || null,
    hint: error.hint || null,
    cause: error.cause ? serialiseError(error.cause, depth + 1) : null,
  }
}

function assertControlledStaging(env) {
  const url = value(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  assert.equal(new URL(url).origin, `https://${STAGING_REF}.supabase.co`, 'Refusing to run outside canonical staging.')
  assert.equal(value(env.SUPABASE_STAGING_PROJECT_REF), STAGING_REF, 'Staging project reference mismatch.')
  assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Staging service role key is required.')
  assert.ok(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, 'Staging anon key is required.')
  assert.ok(env.STAGING_INTERNAL_EMAIL && env.STAGING_INTERNAL_PASSWORD, 'Controlled attorney actor is required.')
  assert.ok(process.argv.includes('--write') && process.argv.includes('--confirm-staging'), 'Pass --write --confirm-staging.')
  assert.equal(process.env.DEVELOPER_TRANSACTION_STAGING_WRITE, 'true', 'Set DEVELOPER_TRANSACTION_STAGING_WRITE=true.')
  if (process.argv.includes('--send-portal-email')) {
    assert.equal(process.env.DEVELOPER_TRANSACTION_STAGING_EMAIL, 'true', 'Set DEVELOPER_TRANSACTION_STAGING_EMAIL=true.')
  }
}

function evidenceFile(scenario, key) {
  return new File([`Controlled staging evidence for ${scenario}/${key}. Fixture ${FIXTURE}.`], `${scenario}-${key}.txt`, {
    type: 'text/plain',
  })
}

async function removeStorage(admin, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  for (let offset = 0; offset < unique.length; offset += 100) {
    const result = await admin.storage.from(bucket).remove(unique.slice(offset, offset + 100))
    if (result.error && !/not found/i.test(value(result.error.message))) throw result.error
  }
}

async function cleanup(admin, state, defaultBucket) {
  const transactionIds = new Set(state.transactionIds)
  if (state.unitIds.length) {
    const recovered = await admin.from('transactions').select('id').in('unit_id', state.unitIds)
    if (recovered.error) throw recovered.error
    for (const row of recovered.data || []) transactionIds.add(row.id)
  }
  const ids = [...transactionIds]
  if (ids.length) {
    const documents = await admin.from('documents').select('file_path, file_bucket').in('transaction_id', ids)
    if (documents.error) throw documents.error
    const pathsByBucket = new Map()
    for (const document of documents.data || []) {
      const bucket = value(document.file_bucket) || defaultBucket
      pathsByBucket.set(bucket, [...(pathsByBucket.get(bucket) || []), document.file_path])
    }
    for (const [bucket, paths] of pathsByBucket) await removeStorage(admin, bucket, paths)
    const deleted = await admin.from('transactions').delete().in('id', ids)
    if (deleted.error) throw deleted.error
  }
  if (state.unitIds.length) {
    const deleted = await admin.from('units').delete().in('id', state.unitIds)
    if (deleted.error) throw deleted.error
  }
  if (state.buyerEmails.length) {
    const deleted = await admin.from('buyers').delete().in('email', state.buyerEmails)
    if (deleted.error) throw deleted.error
  }
  const remainingTransactions = ids.length
    ? await admin.from('transactions').select('id', { count: 'exact', head: true }).in('id', ids)
    : { count: 0, error: null }
  if (remainingTransactions.error) throw remainingTransactions.error
  assert.equal(Number(remainingTransactions.count || 0), 0, 'Fixture transactions remain after cleanup.')
  return { transactionsRemoved: ids.length, unitsRemoved: state.unitIds.length, buyersRemoved: state.buyerEmails.length }
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.staging.local'), ...process.env }
  assertControlledStaging(env)
  const require = createRequire(import.meta.url)
  const { createClient } = require('@supabase/supabase-js')
  const url = value(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const anon = value(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY)
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const documentsBucket = value(env.VITE_SUPABASE_DOCUMENT_BUCKET) || 'documents'
  const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const state = { runId, transactionIds: [], unitIds: [], buyerEmails: [] }
  const sendEmail = process.argv.includes('--send-portal-email')
  const retainOnFailure = process.argv.includes('--retain-on-failure')
  const recipient = value(env.DEVELOPER_TRANSACTION_STAGING_RECIPIENT || env.STAGING_INTERNAL_EMAIL).toLowerCase()
  let vite = null
  let developerClient = null
  let attorneyClient = null

  try {
    const owner = await admin.from('organisation_users').select('user_id, email')
      .eq('organisation_id', SAMLIN_ORGANISATION_ID)
      .eq('app_role', 'developer')
      .eq('status', 'active')
      .eq('is_primary_owner', true)
      .limit(1)
      .maybeSingle()
    if (owner.error) throw owner.error
    assert.ok(owner.data?.user_id && owner.data?.email, 'Samlin staging primary owner is unavailable.')

    const scenarios = ['cash', 'bond']
    const units = await admin.from('units').insert(scenarios.map((scenario) => ({
      development_id: SAMLIN_DEVELOPMENT_ID,
      unit_number: `E2E-${scenario.toUpperCase()}-${runId}`,
      unit_label: `Controlled ${scenario} persistence fixture`,
      price: 2_450_000,
      list_price: 2_450_000,
      current_price: 2_450_000,
      status: 'Available',
      phase: 'Controlled staging',
      notes: `${FIXTURE}:${runId}`,
    }))).select('id, unit_number')
    if (units.error) throw units.error
    state.unitIds.push(...units.data.map((unit) => unit.id))

    vite = await createServer({ root: process.cwd(), mode: 'staging', logLevel: 'silent', server: { middlewareMode: true } })
    const supabaseModule = await vite.ssrLoadModule('/src/lib/supabaseClient.js')
    const api = await vite.ssrLoadModule('/src/lib/api.js')
    const portalService = await vite.ssrLoadModule('/src/services/developerDocumentPortalService.js')
    developerClient = supabaseModule.supabase
    assert.ok(supabaseModule.isSupabaseConfigured && developerClient, 'Staging application client is unavailable.')
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: value(owner.data.email).toLowerCase() })
    if (link.error) throw link.error
    const tokenHash = link.data?.properties?.hashed_token
    assert.ok(tokenHash, 'Controlled sign-in token was not generated.')
    const developerAuth = await developerClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    if (developerAuth.error) throw developerAuth.error
    assert.equal(developerAuth.data.user?.id, owner.data.user_id)

    const firm = await admin.from('attorney_firms').select('id, organisation_id, name, email, is_active')
      .eq('id', TUCKERS_FIRM_ID).eq('organisation_id', TUCKERS_ORGANISATION_ID).eq('is_active', true).single()
    if (firm.error) throw firm.error
    attorneyClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const attorneyAuth = await attorneyClient.auth.signInWithPassword({ email: env.STAGING_INTERNAL_EMAIL, password: env.STAGING_INTERNAL_PASSWORD })
    if (attorneyAuth.error) throw attorneyAuth.error

    const results = []
    for (const [index, scenario] of scenarios.entries()) {
      const isBond = scenario === 'bond'
      const buyerEmail = `developer.persistence.${scenario}.${runId}@example.test`
      state.buyerEmails.push(buyerEmail)
      const created = await api.createTransactionFromWizard({
        setup: {
          transactionType: 'developer_sale', developmentId: SAMLIN_DEVELOPMENT_ID, unitId: units.data[index].id,
          buyerName: `Controlled ${scenario} Buyer`, buyerEmail, buyerPhone: '+27820000001', purchaserType: 'individual',
          financeType: scenario, financeManagedBy: isBond ? 'bond_originator' : 'client', salesPrice: 2_450_000,
          saleDate: new Date().toISOString().slice(0, 10), accessLevel: 'shared',
        },
        finance: {
          cashAmount: isBond ? 500_000 : 2_450_000, bondAmount: isBond ? 1_950_000 : 0, depositAmount: 100_000,
          reservationRequired: true, reservationAmount: 100_000, reservationStatus: 'pending',
          attorney: firm.data.name, attorneyEmail: firm.data.email, expectedTransferDate: '2026-12-15',
        },
        status: { stage: 'Reserved', mainStage: 'reserved', riskStatus: 'On Track', nextAction: 'Controlled staging check', notes: `${FIXTURE}:${runId}:${scenario}` },
        options: {
          disableAutoPartnerRouting: true, creationOrigin: 'controlled_staging_developer_persistence',
          sourceContext: { fixture: FIXTURE, runId, scenario, organisationId: SAMLIN_ORGANISATION_ID, workspaceId: SAMLIN_ORGANISATION_ID },
          rolePlayers: [{
            roleType: 'transfer_attorney', partnerOrganisationId: TUCKERS_ORGANISATION_ID, attorneyFirmId: TUCKERS_FIRM_ID,
            partnerName: firm.data.name, contactPerson: firm.data.name, email: firm.data.email,
            selectionSource: 'transaction_direct', firmFirstAllocation: true,
          }],
        },
      })
      assert.ok(created.transactionId, `${scenario}: transaction ID was not returned.`)
      state.transactionIds.push(created.transactionId)
      assert.deepEqual(created.setupWarnings || [], [], `${scenario}: transaction creation completed with setup warnings.`)

      const transaction = await admin.from('transactions')
        .select('id, organisation_id, transaction_type, purchaser_type, finance_type, purchase_price, sales_price, cash_amount, bond_amount, deposit_amount, is_active, creation_status, creation_completed_at, creation_steps')
        .eq('id', created.transactionId).single()
      if (transaction.error) throw transaction.error
      const expectedCash = isBond ? 500_000 : 2_450_000
      const expectedBond = isBond ? 1_950_000 : 0
      assert.equal(transaction.data.organisation_id, SAMLIN_ORGANISATION_ID)
      assert.equal(transaction.data.transaction_type, 'developer_sale')
      assert.equal(transaction.data.purchaser_type, 'individual')
      assert.equal(transaction.data.finance_type, scenario)
      assert.equal(Number(transaction.data.purchase_price), 2_450_000)
      assert.equal(Number(transaction.data.sales_price), 2_450_000)
      assert.equal(Number(transaction.data.cash_amount), expectedCash)
      assert.equal(Number(transaction.data.bond_amount), expectedBond)
      assert.equal(Number(transaction.data.deposit_amount), 100_000)
      assert.equal(transaction.data.is_active, true)
      assert.equal(transaction.data.creation_status, 'complete')
      assert.ok(transaction.data.creation_completed_at)
      for (const step of ['attorney_assignment', 'onboarding_snapshot', 'requirement_generation', 'portal_setup']) {
        assert.equal(transaction.data.creation_steps?.[step]?.status, 'complete', `${scenario}: ${step} did not complete atomically.`)
      }

      const assignment = await admin.from('transaction_attorney_assignments')
        .select('id, attorney_firm_id, attorney_role, assignment_status, visibility_scope')
        .eq('transaction_id', created.transactionId).eq('attorney_firm_id', TUCKERS_FIRM_ID)
        .eq('attorney_role', 'transfer_attorney').maybeSingle()
      if (assignment.error) throw assignment.error
      assert.ok(assignment.data?.id, `${scenario}: Tuckers assignment is missing.`)

      const initialMatters = await attorneyClient.rpc('bridge_attorney_matter_list_snapshot', {
        p_attorney_firm_id: TUCKERS_FIRM_ID, p_view: 'all', p_page: 1, p_page_size: 100, p_search: '', p_filters: {},
      })
      if (initialMatters.error) throw initialMatters.error
      const initialMatterIds = new Set((initialMatters.data?.rows || []).map((row) => row.transactionId || row.transaction_id || row.id))
      assert.ok(
        initialMatterIds.has(created.transactionId),
        `${scenario}: Tuckers Matters omitted the new assignment (${assignment.data.assignment_status || 'unknown status'}).`,
      )

      const requirements = await admin.from('document_requirement_instances')
        .select('id, document_definition_key, status').eq('transaction_id', created.transactionId)
        .neq('status', 'not_applicable').order('document_definition_key')
      if (requirements.error) throw requirements.error
      assert.ok(requirements.data.length, `${scenario}: canonical requirements are missing.`)

      const portal = await portalService.createDeveloperDocumentPortalLink({ transactionId: created.transactionId, recipientEmail: recipient, expiresDays: 1 })
      assert.ok(portal.id && portal.accessToken, `${scenario}: developer portal was not created.`)
      const portalUrl = portalService.buildDeveloperDocumentPortalUrl(portal.accessToken, value(env.DEVELOPER_TRANSACTION_STAGING_APP_ORIGIN) || APP_ORIGIN)
      let invitation = { sent: false }
      if (sendEmail) {
        const delivery = await supabaseModule.invokeEdgeFunction('send-email', { body: {
          type: 'transaction_document_request', to: recipient, recipientName: 'Controlled staging recipient',
          transactionId: created.transactionId, organisationId: SAMLIN_ORGANISATION_ID,
          subject: `Controlled ${scenario} developer document portal`, title: 'Developer document portal',
          message: `Controlled staging ${scenario} portal invitation. The fixture will be removed after verification.`,
          actionLink: portalUrl, metadata: { portalLink: portalUrl, fixture: FIXTURE, scenario },
        } })
        const deliveryError = delivery?.error || delivery?.data?.error
        if (deliveryError) throw deliveryError instanceof Error ? deliveryError : new Error(value(deliveryError?.message || deliveryError))
        assert.notEqual(delivery?.data?.success, false, `${scenario}: portal invitation failed.`)
        invitation = { sent: true, status: delivery?.data?.delivery || delivery?.data?.status || 'accepted' }
      }

      const portalPayload = await portalService.fetchDeveloperDocumentPortal(portal.accessToken)
      assert.equal(portalPayload.transaction.id, created.transactionId)
      assert.equal(Object.hasOwn(portalPayload, 'buyer'), false, 'Developer portal exposed buyer data.')
      const handled = new Set()
      for (const requirement of portalPayload.requirements) {
        const uploaded = await portalService.uploadDeveloperDocumentPortalFile({
          token: portal.accessToken, portalId: portalPayload.portal.id, transactionId: created.transactionId,
          requirementId: requirement.id, category: requirement.category || 'Developer Documents',
          file: evidenceFile(scenario, requirement.key || requirement.id),
        })
        assert.ok(uploaded?.id || uploaded?.documentId, `${scenario}/${requirement.key}: portal upload failed.`)
        handled.add(requirement.canonicalRequirementInstanceId)
      }
      for (const requirement of requirements.data) {
        if (handled.has(requirement.id)) continue
        const uploaded = await api.uploadDocument({
          transactionId: created.transactionId, file: evidenceFile(scenario, requirement.document_definition_key),
          category: 'Controlled Requirement Evidence', documentType: requirement.document_definition_key,
          requiredDocumentKey: requirement.document_definition_key, canonicalRequirementInstanceId: requirement.id,
          source: 'controlled_staging_acceptance', uploadedByParty: 'developer',
        })
        assert.equal(uploaded.canonicalRequirementInstanceId, requirement.id, `${scenario}: canonical upload link failed.`)
      }

      const satisfied = await admin.from('document_requirement_instances')
        .select('id, status, satisfied_by_document_id').eq('transaction_id', created.transactionId).neq('status', 'not_applicable')
      if (satisfied.error) throw satisfied.error
      assert.equal(satisfied.data.length, requirements.data.length)
      for (const requirement of satisfied.data) {
        assert.ok(requirement.satisfied_by_document_id, `${scenario}/${requirement.id}: requirement was not satisfied.`)
      }

      results.push({
        scenario, transactionId: created.transactionId, attorneyAssignmentId: assignment.data.id,
        finance: { purchasePrice: 2_450_000, cashAmount: expectedCash, bondAmount: expectedBond, depositAmount: 100_000 },
        canonicalRequirementCount: requirements.data.length, developerPortalRequirementCount: portalPayload.requirements.length,
        uploadedRequirementCount: satisfied.data.length, invitation,
      })
    }

    const matters = await attorneyClient.rpc('bridge_attorney_matter_list_snapshot', {
      p_attorney_firm_id: TUCKERS_FIRM_ID, p_view: 'all', p_page: 1, p_page_size: 100, p_search: '', p_filters: {},
    })
    if (matters.error) throw matters.error
    const rows = Array.isArray(matters.data?.rows) ? matters.data.rows : []
    const visibleIds = new Set(rows.map((row) => row.transactionId || row.transaction_id || row.id))
    for (const id of state.transactionIds) assert.ok(visibleIds.has(id), `Tuckers Matters did not include ${id}.`)

    const report = {
      fixture: FIXTURE, environment: 'staging', projectRef: STAGING_REF, status: 'passed',
      attorneyFirm: { organisationId: TUCKERS_ORGANISATION_ID, firmId: TUCKERS_FIRM_ID, mattersVisible: state.transactionIds.length },
      portalInvitationsSent: results.filter((result) => result.invitation.sent).length, scenarios: results,
    }
    const removed = await cleanup(admin, state, documentsBucket)
    console.log(JSON.stringify({ ...report, fixtureRetained: false, cleanup: removed }, null, 2))
  } catch (error) {
    let cleanupResult = null
    let cleanupError = null
    if (!retainOnFailure) {
      try {
        cleanupResult = await cleanup(admin, state, documentsBucket)
      } catch (failure) {
        cleanupError = serialiseError(failure)
      }
    }
    error.cleanupResult = cleanupResult
    error.cleanupError = cleanupError
    error.fixtureState = retainOnFailure ? state : null
    throw error
  } finally {
    if (developerClient) await developerClient.auth.signOut().catch(() => {})
    if (attorneyClient) await attorneyClient.auth.signOut().catch(() => {})
    if (vite) await vite.close()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    fixture: FIXTURE, environment: 'staging', status: 'failed', error: serialiseError(error),
    cleanup: error.cleanupResult || null, cleanupError: error.cleanupError || null, fixtureState: error.fixtureState || null,
  }, null, 2))
  process.exitCode = 1
})
