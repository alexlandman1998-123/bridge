import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { File } from 'node:buffer'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const STAGING_REF = 'vaszuxjeoajeuhlcnzzf'
const PRODUCTION_REF = 'isdowlnollckzvltkasn'
const SAMLIN_ORGANISATION_ID = '84b6e57a-9b12-4bfd-991c-0f5f820d28f4'
const SAMLIN_DEVELOPMENT_ID = '74d85095-1c99-4e04-a826-a67401691e4d'
const TUCKERS_ORGANISATION_ID = 'cbbd85b9-dbf8-44db-9d2a-e025600a940f'
const TUCKERS_FIRM_ID = '417e5aa8-4c61-4821-838e-8dd4a479cc19'
const CONTROLLED_BOND_ORIGINATOR_EMAIL = 'qa.bond.consultant@example.test'
const FIXTURE = 'full_transaction_portal_staging_acceptance_v1'

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

function stagingGuard(env) {
  const url = value(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  assert.ok(url, 'Staging Supabase URL is required.')
  assert.ok(!url.includes(PRODUCTION_REF), 'Refusing to run the staging acceptance test against production.')
  assert.equal(new URL(url).hostname, `${STAGING_REF}.supabase.co`, 'Refusing to run outside canonical staging.')
  assert.equal(value(env.SUPABASE_STAGING_PROJECT_REF), STAGING_REF, 'Staging project reference mismatch.')
  assert.ok(value(env.SUPABASE_SERVICE_ROLE_KEY), 'Staging service-role key is required.')
  assert.ok(value(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY), 'Staging anon key is required.')
  assert.equal(process.env.RUN_FULL_PORTAL_STAGING_ACCEPTANCE, 'true', 'Set RUN_FULL_PORTAL_STAGING_ACCEPTANCE=true.')
  assert.ok(process.argv.includes('--write') && process.argv.includes('--confirm-staging'), 'Pass --write --confirm-staging.')
}

function evidence(label) {
  return new File([`${FIXTURE}:${label}`], `${label.replace(/[^a-z0-9_-]/gi, '-')}.txt`, { type: 'text/plain' })
}

async function signInAs(admin, appClient, email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: value(email).toLowerCase() })
  if (link.error) throw link.error
  const tokenHash = link.data?.properties?.hashed_token
  assert.ok(tokenHash, `No controlled sign-in token was generated for ${email}.`)
  await appClient.auth.signOut().catch(() => {})
  const result = await appClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (result.error) throw result.error
  return result.data.user
}

async function removeStoredObjects(admin, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  for (let offset = 0; offset < unique.length; offset += 100) {
    const result = await admin.storage.from(bucket).remove(unique.slice(offset, offset + 100))
    if (result.error && !/not found/i.test(value(result.error.message))) throw result.error
  }
}

async function cleanup(admin, state) {
  if (state.transactionIds.length) {
    const linkedListings = await admin
      .from('transactions')
      .select('listing_id')
      .in('id', state.transactionIds)
    if (linkedListings.error) throw linkedListings.error
    for (const row of linkedListings.data || []) {
      if (row.listing_id && !state.privateListingIds.includes(row.listing_id)) {
        state.privateListingIds.push(row.listing_id)
      }
    }
    const docs = await admin.from('documents').select('file_path, file_bucket').in('transaction_id', state.transactionIds)
    if (docs.error) throw docs.error
    const byBucket = new Map()
    for (const row of docs.data || []) {
      const bucket = value(row.file_bucket) || 'documents'
      byBucket.set(bucket, [...(byBucket.get(bucket) || []), row.file_path])
    }
    for (const [bucket, paths] of byBucket) await removeStoredObjects(admin, bucket, paths)
    const removedRequirements = await admin
      .from('document_requirement_instances')
      .delete()
      .in('transaction_id', state.transactionIds)
    if (removedRequirements.error) throw removedRequirements.error
    const removed = await admin.from('transactions').delete().in('id', state.transactionIds)
    if (removed.error) throw removed.error
  }
  if (state.privateListingIds.length) {
    const sellerDocs = await admin.from('private_listing_documents').select('storage_path').in('private_listing_id', state.privateListingIds)
    if (sellerDocs.error) throw sellerDocs.error
    await removeStoredObjects(admin, 'documents', (sellerDocs.data || []).map((row) => row.storage_path))
    const removed = await admin.from('private_listings').delete().in('id', state.privateListingIds)
    if (removed.error) throw removed.error
  }
  if (state.unitIds.length) {
    const removed = await admin.from('units').delete().in('id', state.unitIds)
    if (removed.error) throw removed.error
  }
  if (state.buyerEmails.length) {
    const removed = await admin.from('buyers').delete().in('email', state.buyerEmails)
    if (removed.error) throw removed.error
  }

  for (const [table, column, ids] of [
    ['transactions', 'id', state.transactionIds],
    ['documents', 'transaction_id', state.transactionIds],
    ['document_requirement_instances', 'transaction_id', state.transactionIds],
    ['client_portal_links', 'transaction_id', state.transactionIds],
    ['client_portal_contexts', 'transaction_id', state.transactionIds],
    ['transaction_attorney_assignments', 'transaction_id', state.transactionIds],
    ['transaction_bond_applications', 'transaction_id', state.transactionIds],
    ['transaction_finance_workflows', 'transaction_id', state.transactionIds],
    ['transaction_role_players', 'transaction_id', state.transactionIds],
    ['private_listings', 'id', state.privateListingIds],
    ['private_listing_documents', 'private_listing_id', state.privateListingIds],
    ['private_listing_seller_onboarding', 'private_listing_id', state.privateListingIds],
    ['units', 'id', state.unitIds],
  ]) {
    if (!ids.length) continue
    const residue = await admin.from(table).select(column, { count: 'exact', head: true }).in(column, ids)
    if (residue.error) throw residue.error
    assert.equal(Number(residue.count || 0), 0, `${table} fixture residue remains.`)
  }
}

async function createMatter({ api, transactionType, actor, organisationId, unitId, runId, firm, bondOriginator, buyerEmail }) {
  const isDeveloper = transactionType === 'developer_sale'
  return api.createTransactionFromWizard({
    setup: {
      transactionType,
      developmentId: isDeveloper ? SAMLIN_DEVELOPMENT_ID : null,
      unitId: isDeveloper ? unitId : null,
      buyerName: `${isDeveloper ? 'Developer' : 'Agent'} portal fixture buyer`,
      buyerEmail,
      buyerPhone: '+27820000001',
      purchaserType: 'individual',
      financeType: 'bond',
      financeManagedBy: 'bond_originator',
      salesPrice: 2_190_000,
      propertyType: isDeveloper ? null : 'residential',
      propertyAddressLine1: isDeveloper ? null : `1 Acceptance Lane ${runId}`,
      city: isDeveloper ? null : 'Johannesburg',
      province: isDeveloper ? null : 'Gauteng',
      sellerName: isDeveloper ? null : 'Controlled Seller',
      sellerEmail: isDeveloper ? null : `seller.${runId}@example.test`,
      sellerPhone: isDeveloper ? null : '+27820000002',
      assignedAgent: actor.email,
      assignedAgentEmail: actor.email,
    },
    finance: {
      cashAmount: 500_000,
      bondAmount: 1_690_000,
      depositAmount: 100_000,
      reservationRequired: isDeveloper,
      reservationAmount: isDeveloper ? 100_000 : null,
      attorney: firm.name,
      attorneyEmail: firm.email,
      bondOriginator: bondOriginator.email,
      bondOriginatorEmail: bondOriginator.email,
    },
    status: { stage: 'Reserved', mainStage: 'reserved', nextAction: `${FIXTURE}:${runId}` },
    options: {
      disableAutoPartnerRouting: true,
      creationOrigin: FIXTURE,
      sourceContext: { organisationId, workspaceId: organisationId, fixture: FIXTURE, runId },
      rolePlayers: [
        {
          roleType: 'transfer_attorney',
          partnerOrganisationId: TUCKERS_ORGANISATION_ID,
          attorneyFirmId: TUCKERS_FIRM_ID,
          partnerName: firm.name,
          contactPerson: firm.name,
          email: firm.email,
          selectionSource: 'controlled_staging',
          firmFirstAllocation: true,
        },
        {
          roleType: 'bond_originator',
          partnerOrganisationId: bondOriginator.organisation_id,
          partnerName: 'Controlled staging bond originator',
          contactPerson: bondOriginator.email,
          email: bondOriginator.email,
          userId: bondOriginator.user_id,
          regionId: bondOriginator.region_id,
          workspaceUnitId: bondOriginator.workspace_unit_id,
          branchId: bondOriginator.branch_id,
          teamId: bondOriginator.team_id,
          selectionSource: 'controlled_staging',
          assignmentStatus: 'active',
        },
      ],
    },
  })
}

async function uploadBuyerRequirements({ admin, api, created, label }) {
  const requirements = await admin.from('document_requirement_instances')
    .select('id, document_definition_key, requested_from_role, uploadable_by_roles, status')
    .eq('transaction_id', created.transactionId).neq('status', 'not_applicable')
  if (requirements.error) throw requirements.error
  const applicable = (requirements.data || []).filter((row) =>
    (row.uploadable_by_roles || []).map((role) => value(role).toLowerCase()).includes('buyer'))
  assert.ok(applicable.length, `${label}: no buyer upload requirements were generated.`)
  for (const requirement of applicable) {
    const uploaded = await api.uploadClientPortalDocument({
      token: created.buyerPortalToken,
      file: evidence(`${label}-buyer-${requirement.document_definition_key}`),
      category: 'Buyer Documents',
      requiredDocumentKey: requirement.document_definition_key,
      canonicalRequirementInstanceId: requirement.id,
      documentType: requirement.document_definition_key,
    })
    assert.equal(uploaded.canonical_requirement_instance_id, requirement.id)
  }
  return applicable.length
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.staging.local'), ...process.env }
  stagingGuard(env)
  const require = createRequire(import.meta.url)
  const { createClient } = require('@supabase/supabase-js')
  const url = value(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const state = { transactionIds: [], privateListingIds: [], unitIds: [], buyerEmails: [] }
  const handoverOnly = process.env.RUN_HANDOVER_ONLY === 'true'
  let vite = null
  let appClient = null

  try {
    const actors = await admin.from('organisation_users')
      .select('user_id, email, app_role, organisation_id')
      .in('app_role', ['developer', 'agent']).eq('status', 'active')
    if (actors.error) throw actors.error
    const developer = (actors.data || []).find((row) => row.app_role === 'developer' && row.organisation_id === SAMLIN_ORGANISATION_ID)
    const agent = (actors.data || []).find((row) => row.app_role === 'agent' && row.organisation_id !== TUCKERS_ORGANISATION_ID)
    assert.ok(developer?.email && agent?.email, 'Controlled developer and agent actors are required in staging.')

    const firmResult = await admin.from('attorney_firms').select('id, name, email, organisation_id')
      .eq('id', TUCKERS_FIRM_ID).eq('organisation_id', TUCKERS_ORGANISATION_ID).single()
    if (firmResult.error) throw firmResult.error

    const bondOriginatorResult = await admin.from('organisation_users')
      .select('user_id, email, organisation_id, region_id, workspace_unit_id, branch_id, team_id, scope_level, workspace_role')
      .eq('email', CONTROLLED_BOND_ORIGINATOR_EMAIL)
      .eq('app_role', 'bond_originator')
      .eq('status', 'active')
      .single()
    if (bondOriginatorResult.error) throw bondOriginatorResult.error
    assert.ok(bondOriginatorResult.data.user_id && bondOriginatorResult.data.organisation_id, 'Controlled bond-originator actor is required in staging.')

    const unitResult = await admin.from('units').insert({
      development_id: SAMLIN_DEVELOPMENT_ID,
      unit_number: `FULL-E2E-${runId}`,
      unit_label: 'Full portal acceptance fixture',
      price: 2_190_000,
      status: 'Available',
      notes: `${FIXTURE}:${runId}`,
    }).select('id').single()
    if (unitResult.error) throw unitResult.error
    state.unitIds.push(unitResult.data.id)

    vite = await createServer({ root: process.cwd(), mode: 'staging', logLevel: 'silent', server: { middlewareMode: true } })
    const supabaseModule = await vite.ssrLoadModule('/src/lib/supabaseClient.js')
    const api = await vite.ssrLoadModule('/src/lib/api.js')
    const portalWorkspace = await vite.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
    const sellerService = await vite.ssrLoadModule('/src/services/privateListingService.js')
    const developerPortal = await vite.ssrLoadModule('/src/services/developerDocumentPortalService.js')
    appClient = supabaseModule.supabase

    await signInAs(admin, appClient, developer.email)
    const developerBuyerEmail = `developer.buyer.${runId}@example.test`
    state.buyerEmails.push(developerBuyerEmail)
    const developerMatter = await createMatter({
      api, transactionType: 'developer_sale', actor: developer,
      organisationId: SAMLIN_ORGANISATION_ID, unitId: unitResult.data.id,
      runId, firm: firmResult.data, bondOriginator: bondOriginatorResult.data, buyerEmail: developerBuyerEmail,
    })
    state.transactionIds.push(developerMatter.transactionId)
    assert.ok(developerMatter.buyerPortalToken)
    let developerBuyerUploads = 0
    let developerSellerUploads = 0
    if (!handoverOnly) {
      const developerBuyerWorkspace = await portalWorkspace.getClientPortalWorkspaceData(developerMatter.buyerPortalToken, 'buying')
      assert.equal(developerBuyerWorkspace.transaction.id, developerMatter.transactionId)
      assert.doesNotMatch(JSON.stringify(developerBuyerWorkspace), /Sarah Williams|Demo Agency/)
      developerBuyerUploads = await uploadBuyerRequirements({ admin, api, created: developerMatter, label: 'developer' })

      const developerLink = await developerPortal.createDeveloperDocumentPortalLink({
        transactionId: developerMatter.transactionId,
        recipientEmail: developer.email,
        expiresDays: 1,
      })
      const developerPayload = await developerPortal.fetchDeveloperDocumentPortal(developerLink.accessToken)
      assert.equal(developerPayload.transaction.id, developerMatter.transactionId)
      developerSellerUploads = developerPayload.requirements?.length || 0
      for (const requirement of developerPayload.requirements || []) {
        await developerPortal.uploadDeveloperDocumentPortalFile({
          token: developerLink.accessToken,
          portalId: developerPayload.portal.id,
          transactionId: developerMatter.transactionId,
          requirementId: requirement.id,
          category: requirement.category || 'Developer Documents',
          file: evidence(`developer-seller-${requirement.key || requirement.id}`),
        })
      }
    }

    await signInAs(admin, appClient, agent.email)
    const agentBuyerEmail = `agent.buyer.${runId}@example.test`
    state.buyerEmails.push(agentBuyerEmail)
    const agentMatter = await createMatter({
      api, transactionType: 'private_property', actor: agent,
      organisationId: agent.organisation_id, unitId: null,
      runId, firm: firmResult.data, bondOriginator: bondOriginatorResult.data, buyerEmail: agentBuyerEmail,
    })
    state.transactionIds.push(agentMatter.transactionId)
    state.privateListingIds.push(agentMatter.privateListingId)
    assert.ok(agentMatter.buyerPortalToken && agentMatter.sellerOnboardingToken)
    let agentBuyerUploads = 0
    let agentSellerUploads = 0
    let sellerPortalToken = ''
    let sellerSession = null
    if (!handoverOnly) {
      const sellerPassword = `Acceptance!${crypto.randomBytes(9).toString('base64url')}`
      sellerSession = await sellerService.setSellerPortalPassword({
        token: agentMatter.sellerOnboardingToken,
        password: sellerPassword,
      })
      assert.ok(sellerSession.accessToken, 'Seller portal activation did not issue an access token.')
      sellerPortalToken = sellerSession.stablePortalToken || agentMatter.sellerOnboardingToken
      const agentBuyerWorkspace = await portalWorkspace.getClientPortalWorkspaceData(agentMatter.buyerPortalToken, 'buying')
      const agentSellerWorkspace = await portalWorkspace.getClientPortalWorkspaceData(sellerPortalToken, 'selling', {
        sellerPortalAccessToken: sellerSession.accessToken,
      })
      assert.equal(agentBuyerWorkspace.transaction.id, agentMatter.transactionId)
      assert.equal(agentSellerWorkspace.transaction.id, agentMatter.transactionId)
      assert.doesNotMatch(JSON.stringify([agentBuyerWorkspace, agentSellerWorkspace]), /Sarah Williams|Demo Agency/)
      agentBuyerUploads = await uploadBuyerRequirements({ admin, api, created: agentMatter, label: 'agent' })

      const sellerPayload = await sellerService.getSellerOnboardingByToken(sellerPortalToken, {
        includeRequirementsAndDocuments: true,
        requirePortalAccess: true,
        sellerPortalAccessToken: sellerSession.accessToken,
      })
      const sellerRequirements = sellerPayload?.listing?.documentRequirements || []
      assert.ok(sellerRequirements.length, 'Agent seller portal has no projected requirements.')
      agentSellerUploads = sellerRequirements.length
      for (const requirement of sellerRequirements) {
        await sellerService.uploadSellerClientPortalDocument({
          token: sellerPortalToken,
          accessToken: sellerSession.accessToken,
          file: evidence(`agent-seller-${requirement.requirement_key || requirement.key}`),
          requirementKey: requirement.requirement_key || requirement.key,
          documentType: requirement.requirement_key || requirement.key,
          category: 'Seller Document',
        })
      }

      const promoted = await admin.from('private_listing_documents')
        .select('id, promoted_document_id, promoted_transaction_id, promotion_status')
        .eq('private_listing_id', agentMatter.privateListingId)
      if (promoted.error) throw promoted.error
      assert.equal(promoted.data.length, sellerRequirements.length)
      for (const row of promoted.data) {
        assert.ok(row.promoted_document_id)
        assert.equal(row.promoted_transaction_id, agentMatter.transactionId)
        assert.equal(row.promotion_status, 'promoted')
      }
    }

    const attorneyClient = createClient(url, value(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    assert.ok(env.STAGING_INTERNAL_EMAIL && env.STAGING_INTERNAL_PASSWORD, 'Controlled Tuckers login is required.')
    const attorneyAuth = await attorneyClient.auth.signInWithPassword({
      email: env.STAGING_INTERNAL_EMAIL,
      password: env.STAGING_INTERNAL_PASSWORD,
    })
    if (attorneyAuth.error) throw attorneyAuth.error
    const matters = await attorneyClient.rpc('bridge_attorney_matter_list_snapshot', {
      p_attorney_firm_id: TUCKERS_FIRM_ID, p_view: 'all', p_page: 1, p_page_size: 100, p_search: '', p_filters: {},
    })
    if (matters.error) throw matters.error
    const visible = new Set((matters.data?.rows || []).map((row) => row.transactionId || row.transaction_id || row.id))
    for (const transactionId of state.transactionIds) assert.ok(visible.has(transactionId), `Tuckers Matters omitted ${transactionId}.`)

    const canonicalBondApplications = await admin.from('transaction_bond_applications')
      .select('id, transaction_id, assigned_organisation_id, assigned_user_id, assignment_status')
      .in('transaction_id', state.transactionIds)
    if (canonicalBondApplications.error) throw canonicalBondApplications.error
    assert.equal(canonicalBondApplications.data.length, state.transactionIds.length, 'Each transaction must create one canonical bond application.')
    for (const application of canonicalBondApplications.data) {
      assert.equal(application.assigned_organisation_id, bondOriginatorResult.data.organisation_id)
      assert.equal(application.assigned_user_id, bondOriginatorResult.data.user_id)
    }

    await signInAs(admin, appClient, bondOriginatorResult.data.email)
    const bondApplications = await appClient.from('transaction_bond_applications')
      .select('id, transaction_id')
      .in('transaction_id', state.transactionIds)
    if (bondApplications.error) throw bondApplications.error
    assert.equal(bondApplications.data.length, state.transactionIds.length, 'The assigned bond originator cannot read every application.')
    const bondDashboardRows = await api.fetchTransactionsByParticipantSummary({
      userId: bondOriginatorResult.data.user_id,
      roleType: 'bond_originator',
      organisationId: '',
    })
    const bondDashboardIds = new Set(
      (bondDashboardRows || []).map((row) => row?.transaction?.id || row?.id || row?.transaction_id).filter(Boolean),
    )
    for (const transactionId of state.transactionIds) {
      assert.ok(bondDashboardIds.has(transactionId), `Bond Applications omitted ${transactionId}.`)
    }

    if (!handoverOnly) {
      await assert.rejects(
        () => portalWorkspace.getClientPortalWorkspaceData(`invalid-${runId}`, 'buying'),
        /invalid|inactive|not found|unavailable/i,
      )
      const expired = await admin.from('private_listing_seller_onboarding')
        .update({ seller_portal_access_token_expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('private_listing_id', agentMatter.privateListingId)
      if (expired.error) throw expired.error
      await assert.rejects(
        () => portalWorkspace.getClientPortalWorkspaceData(sellerPortalToken, 'selling', {
          sellerPortalAccessToken: sellerSession.accessToken,
        }),
        (error) => error?.code === 'seller_portal_auth_required' && error?.portalAuth?.sessionExpired === true,
      )
    }

    const report = {
      fixture: FIXTURE,
      environment: 'staging',
      status: 'passed',
      mode: handoverOnly ? 'handover_only' : 'full_portal',
      developer: { transactionId: developerMatter.transactionId, buyerUploads: developerBuyerUploads, sellerUploads: developerSellerUploads },
      agent: { transactionId: agentMatter.transactionId, buyerUploads: agentBuyerUploads, sellerUploads: agentSellerUploads },
      tuckersMattersVisible: state.transactionIds.length,
      bondOriginatorApplicationsVisible: state.transactionIds.length,
      invalidAndExpiredTokensRejected: handoverOnly ? null : true,
    }
    await cleanup(admin, state)
    console.log(JSON.stringify({ ...report, fixtureResidue: 0 }, null, 2))
  } catch (error) {
    if (error?.transactionId && !state.transactionIds.includes(error.transactionId)) {
      state.transactionIds.push(error.transactionId)
    }
    await cleanup(admin, state).catch((cleanupError) => { error.cleanupError = cleanupError })
    throw error
  } finally {
    if (appClient) await appClient.auth.signOut().catch(() => {})
    if (vite) await vite.close()
  }
}

function runContractChecks() {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), '../supabase/migrations/20260831132003_complete_agent_seller_handoff.sql'),
    'utf8',
  )
  const api = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/api.js'), 'utf8')
  const lifecycle = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/transactions/transactionCreationLifecycle.js'),
    'utf8',
  )
  const workspaceService = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/clientPortalWorkspaceService.js'),
    'utf8',
  )
  const liveLoader = workspaceService.slice(
    workspaceService.indexOf('export async function getClientPortalWorkspaceData'),
    workspaceService.length,
  )

  assert.match(migration, /bridge_verify_private_transaction_seller_handoff/)
  assert.match(migration, /security definer\s+set search_path = ''/i)
  assert.match(migration, /bridge_sync_seller_portal_transaction_context/)
  assert.match(migration, /bridge_promote_pending_private_listing_documents/)
  assert.match(migration, /promoted_document\.canonical_requirement_instance_id/)
  assert.match(migration, /canonical\.satisfied_by_document_id = promoted_document\.id/)
  assert.match(migration, /transaction_requirement_projection/)
  assert.match(migration, /revoke all on function[\s\S]+from public, anon/i)

  assert.match(api, /sellerHandoffRequired:\s*transactionType === 'private_property'/)
  assert.match(api, /bondOriginatorAssignmentRequired:\s*expectedBondOriginatorAssignments > 0/)
  assert.match(api, /BOND_ORIGINATOR_ASSIGNMENT_SETUP_INCOMPLETE/)
  assert.match(api, /client\.rpc\('bridge_verify_private_transaction_seller_handoff'/)
  assert.match(api, /sellerPortalPath:/)
  assert.match(lifecycle, /'seller_handoff'/)
  assert.match(lifecycle, /'bond_originator_assignment'/)
  assert.doesNotMatch(liveLoader.slice(0, liveLoader.indexOf('const { mode')), /buildDemoClientPortalWorkspaceData/)
}

runContractChecks()

if (process.env.RUN_FULL_PORTAL_STAGING_ACCEPTANCE !== 'true') {
  console.log('Full transaction portal contract passed; staging writes remain guarded.')
} else {
  await main()
}
