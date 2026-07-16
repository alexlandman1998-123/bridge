import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const FIXTURE_KEY = 'otp_phase2_launch_acceptance_v1'
const WRITE_FLAG = 'OTP_PHASE2_STAGING_WRITE'
const DEFAULT_TRANSACTION_ID = 'cc6d15bb-1a5b-44f3-8809-1e066b5cb85b'
const OUTPUT_DIR = resolve(process.cwd(), 'tmp/pdfs/otp-phase2')
const SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAAAjW/WRAAABsElEQVR4nO3UwVXrQBAFUYIgMIIlP0gA+xhLo6oe1eIu/3fN6yM+Pr++P5L8DQ9IzPCAxAwPSMzwgMQMD0jM8IDEDA9IzPCAxAwPSMzwgMQMD0jM8IDEDA9IzPCAxAwPSMzwgMQMD0jM8IDEDA8Q+HkT3b0D/e70QNOOozjacKN2p8eafJw+FM/2y7rp0XY4Th+KZ/vT++nxDMcx/t87WLXPpbvTI5IHmvpbdlvtTo959YF2/m0a+Udi2e/So141lKVj1w/F8t7TO+hhVw9TF/M++o2nNdEDq8a4eeOObzrcRz9g9wNN7t3lHbf8QKYdqXbeLT6QyQea/I5pvc/e8a9/QwcfPdDEI73yLrprWuMyeEAH0n78xqbL4QFvHGjXI1neerfdn8IDOpDm7Xfe/aEjY3agdZ5tcfYeV/7WOGeNuuo4dz/Qqn3a/UUrD3cUPo7EFVu3+wPGo+GjSPVhAEwHw8cYpN0vQh8MH2AD7b4QHpCY4QGJGR6QmOEBiRkekJjhAYkZHpCY4QGJGR6QmOEBiRkekJjhAYkZHpCY4QGJGR6QmOEBiRkekJjhAYnZL4N8AW9UQloFAAAAAElFTkSuQmCC'

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function parseArgs(argv = process.argv.slice(2)) {
  const scenario = argv.find((value) => value.startsWith('--scenario='))?.slice('--scenario='.length) || 'both'
  assert.ok(['cash', 'bond', 'both'].includes(scenario), '--scenario must be cash, bond, or both.')
  return {
    write: argv.includes('--write'),
    confirmed: argv.includes('--confirm-staging'),
    transactionId:
      argv.find((value) => value.startsWith('--transaction='))?.slice('--transaction='.length) ||
      DEFAULT_TRANSACTION_ID,
    finalizePacketId: argv.find((value) => value.startsWith('--finalize-existing='))?.slice('--finalize-existing='.length) || '',
    scenario,
    cleanupPartials: argv.includes('--cleanup-partials'),
  }
}

function normalize(value) {
  return String(value || '').trim()
}

function safeFileName(value) {
  return normalize(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
}

function assertStagingConfig(env, args) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  assert.ok(url.includes(STAGING_PROJECT_REF), 'Refusing to run outside the canonical staging project.')
  assert.ok(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY, 'Staging anon key is required.')
  assert.ok(env.CANONICAL_BROWSER_EMAIL || env.STAGING_INTERNAL_EMAIL, 'Staging actor email is required.')
  assert.ok(env.CANONICAL_BROWSER_PASSWORD || env.STAGING_INTERNAL_PASSWORD, 'Staging actor password is required.')
  if (args.write) {
    assert.ok(args.confirmed && process.env[WRITE_FLAG] === 'true', `Write mode requires --confirm-staging and ${WRITE_FLAG}=true.`)
  }
}

function scenarioContext({ scenario, transaction, unit, userId, organisationId }) {
  const isBond = scenario === 'bond'
  const purchasePrice = 2_450_000
  const buyer = {
    id: transaction.buyer_contact_id || null,
    first_name: isBond ? 'Bongi' : 'Catherine',
    last_name: 'Phase Two',
    full_name: isBond ? 'Bongi Phase Two' : 'Catherine Phase Two',
    email: `otp.phase2.${scenario}.buyer@example.com`,
    phone: '+27820000001',
    mobile_number: '+27820000001',
  }
  const sellerDetails = {
    entityType: 'company',
    legalName: 'Phase Two Property Holdings (Pty) Ltd',
    registrationNumber: '2026/123456/07',
    incomeTaxNumber: '9123456789',
    vatNumber: '4123456789',
    email: `otp.phase2.${scenario}.seller@example.com`,
    phone: '+27110000002',
    registeredAddress: '1 Launch Lane, Sandton, Johannesburg, 2196',
    defaultSignatory: {
      fullName: 'Sam Seller',
      firstName: 'Sam',
      lastName: 'Seller',
      email: `otp.phase2.${scenario}.seller@example.com`,
      idNumber: '8001015009087',
      capacity: 'Director',
      authorityConfirmed: true,
    },
    resolutionDate: '2026-07-16',
    authorityBasis: 'Board resolution authorising the named director to sign this Offer to Purchase',
    resolutionConfirmed: true,
    authorityConfirmed: true,
  }
  const onboardingFormData = {
    fullName: buyer.full_name,
    firstName: buyer.first_name,
    lastName: buyer.last_name,
    email: buyer.email,
    phone: buyer.phone,
    idNumber: '9001015009088',
    identityNumber: '9001015009088',
    maritalStatus: 'single',
    marriageRegime: 'not_applicable',
    residentialAddress: '2 Acceptance Avenue, Rosebank, Johannesburg, 2196',
    occupation: 'Product Manager',
  }
  const scenarioTransaction = {
    ...transaction,
    organisation_id: organisationId,
    assigned_user_id: userId,
    owner_user_id: userId,
    purchase_price: purchasePrice,
    sales_price: purchasePrice,
    offer_amount: purchasePrice,
    deposit_amount: 100_000,
    finance_type: isBond ? 'bond' : 'cash',
    finance_method: isBond ? 'bond' : 'cash',
    payment_method: isBond ? 'bond' : 'cash',
    cash_amount: isBond ? 500_000 : purchasePrice,
    bond_amount: isBond ? 1_950_000 : 0,
    loan_amount: isBond ? 1_950_000 : 0,
    bond_approval_days: isBond ? 21 : null,
    gross_commission_percentage: 5,
    commission_percentage: 5,
    gross_commission_amount: 122_500,
    agent_commission_amount: 61_250,
    agency_commission_amount: 61_250,
    purchaser_type: 'individual',
    transaction_reference: `OTP-PHASE2-${scenario.toUpperCase()}`,
    assigned_agent: 'Phase Two Test Agent',
    assigned_agent_email: 'otp.phase2.agent@example.com',
    property_address_line_1: '10 Launch Road',
    property_address: '10 Launch Road, Sandton, Johannesburg, 2196',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2196',
    property_suburb: 'Sandton',
    property_city: 'Johannesburg',
    property_province: 'Gauteng',
    property_postal_code: '2196',
    property_type: 'Apartment',
    expected_transfer_date: '2026-09-30',
    complexName: 'Phase Two Sectional Title Scheme',
    complex_name: 'Phase Two Sectional Title Scheme',
    schemeName: 'Phase Two Sectional Title Scheme',
  }
  const scenarioUnit = {
    ...(unit || {}),
    id: transaction.unit_id || unit?.id || null,
    unit_number: unit?.unit_number || (isBond ? 'P2-BOND' : 'P2-CASH'),
    price: purchasePrice,
    purchase_price: purchasePrice,
    address: '10 Launch Road, Sandton, Johannesburg, 2196',
    street_address: '10 Launch Road',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2196',
    property_type: 'Apartment',
  }
  return {
    organisationId,
    transaction: scenarioTransaction,
    transactionId: transaction.id,
    unit: scenarioUnit,
    buyer,
    sellerDetails,
    onboardingFormData,
    organisation: {
      id: organisationId,
      name: 'Phase Two Acceptance Agency',
      display_name: 'Phase Two Acceptance Agency',
      email: 'otp.phase2.agency@example.com',
      phone: '+27110000003',
      address: '3 Verification View, Sandton, Johannesburg, 2196',
    },
    agent: {
      id: userId,
      fullName: 'Phase Two Test Agent',
      email: 'otp.phase2.agent@example.com',
      phone: '+27820000004',
      ffcNumber: 'FFC-PHASE2-001',
    },
    generatedByRole: 'owner',
    generatedByUserId: userId,
    generatedByUserEmail: 'otp.phase2.agent@example.com',
    generatedByName: 'Phase Two Test Agent',
    specialConditions: `Controlled Phase 2 ${scenario} staging acceptance fixture. No external communication authorised.`,
    sourceContext: {
      fixture: FIXTURE_KEY,
      scenario,
      controlledStagingAcceptance: true,
      externalCommunicationAllowed: false,
      offer: {
        conditions: {
          occupationDate: '2026-10-01',
          suspensiveConditions: isBond
            ? 'Subject to the Purchaser obtaining written bond approval for R 1 950 000 within 21 days of acceptance.'
            : 'No finance suspensive condition applies; the purchase is funded in cash.',
        },
      },
    },
  }
}

function validationResult(validation) {
  const placeholders = validation?.placeholders || {}
  return {
    valid: Boolean(validation?.isValidForGeneration),
    critical: validation?.critical || [],
    warnings: validation?.warnings || [],
    missingPlaceholders: validation?.missingPlaceholders || [],
    scenarioKey: validation?.legalDocumentScenarioKey || null,
    scenarioComplete: Boolean(validation?.legalDocumentScenarioComplete),
    renderPreview: Object.fromEntries([
      'buyer_full_name',
      'seller_full_name',
      'property_address',
      'organisation_name',
      'agent_full_name',
      'agent_ffc_number',
      'finance_type',
      'bond_amount',
      'cash_amount',
      'suspensive_conditions',
    ].map((key) => [key, placeholders[key] ?? null])),
  }
}

async function downloadGeneratedDocument(version, scenario) {
  const url = version?.rendered_file_access_url || version?.rendered_file_url || ''
  assert.ok(url, `${scenario}: generated version must expose a readable document URL.`)
  const response = await fetch(url)
  assert.equal(response.ok, true, `${scenario}: generated document download failed (${response.status}).`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', `${scenario}: generated artifact is not a DOCX package.`)
  assert.ok(bytes.length > 10_000, `${scenario}: generated DOCX is unexpectedly small.`)
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const path = resolve(OUTPUT_DIR, `${safeFileName(scenario)}-otp.docx`)
  writeFileSync(path, bytes)
  return { path, bytes: bytes.length }
}

async function main() {
  const args = parseArgs()
  const env = {
    ...parseEnvFile(resolve(process.cwd(), '.env')),
    ...parseEnvFile(resolve(process.cwd(), '.env.staging.local')),
    ...process.env,
  }
  assertStagingConfig(env, args)
  const require = createRequire(resolve(process.cwd(), 'package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

  const server = await createServer({
    root: process.cwd(),
    mode: 'staging',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  let originalWorkspaceId = null
  let workspacePreferenceChanged = false
  let actorUserId = null

  try {
    const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    assert.ok(isSupabaseConfigured && supabase, 'The staging Supabase client is not configured.')
    const auth = await supabase.auth.signInWithPassword({
      email: env.CANONICAL_BROWSER_EMAIL || env.STAGING_INTERNAL_EMAIL,
      password: env.CANONICAL_BROWSER_PASSWORD || env.STAGING_INTERNAL_PASSWORD,
    })
    assert.ifError(auth.error)
    assert.ok(auth.data.user?.id, 'Staging actor sign-in failed.')
    const userId = auth.data.user.id
    actorUserId = userId

    const reader = admin || supabase
    const membershipResult = await reader
      .from('organisation_users')
      .select('organisation_id, workspace_role, organisation_role, role, status, membership_status')
      .eq('user_id', userId)
    assert.ifError(membershipResult.error)
    const agencyMembership = (membershipResult.data || []).find((row) => {
      const role = normalize(row.workspace_role || row.organisation_role || row.role).toLowerCase()
      const status = normalize(row.status || row.membership_status).toLowerCase()
      return ['owner', 'admin'].includes(role) && ['active', 'accepted'].includes(status)
    })
    assert.ok(agencyMembership?.organisation_id, 'Staging actor needs an active agency owner/admin membership.')
    const organisationId = agencyMembership.organisation_id

    const preferenceResult = await reader
      .from('user_workspace_preferences')
      .select('active_workspace_id')
      .eq('user_id', userId)
      .maybeSingle()
    assert.ifError(preferenceResult.error)
    originalWorkspaceId = preferenceResult.data?.active_workspace_id || null

    const transactionResult = await supabase.from('transactions').select('*').eq('id', args.transactionId).maybeSingle()
    assert.ifError(transactionResult.error)
    assert.ok(transactionResult.data?.id, 'The controlled staging transaction is not readable by the actor.')
    assert.equal(transactionResult.data.organisation_id, organisationId, 'Controlled transaction is outside the actor agency workspace.')
    const unitResult = transactionResult.data.unit_id
      ? await supabase.from('units').select('*').eq('id', transactionResult.data.unit_id).maybeSingle()
      : { data: null, error: null }
    assert.ifError(unitResult.error)

    const packetService = await server.ssrLoadModule('/src/core/documents/packetService.js')
    const packetApi = await server.ssrLoadModule('/src/lib/documentPacketsApi.js')
    const signingApi = await server.ssrLoadModule('/src/lib/externalSigningApi.js')
    const templates = await packetService.listPacketTemplates({
      packetType: 'otp',
      moduleType: 'agency',
      includeInactive: false,
      organisationId,
    })
    const template = templates.find((row) => row.status === 'published' && row.is_active !== false) || templates[0]
    assert.ok(template?.id, 'No published active OTP template is available.')

    if (args.cleanupPartials) {
      assert.ok(args.write, '--cleanup-partials requires guarded write mode.')
      if (originalWorkspaceId !== organisationId) {
        const workspaceUpdate = await supabase
          .from('user_workspace_preferences')
          .upsert({ user_id: userId, active_workspace_id: organisationId }, { onConflict: 'user_id' })
        assert.ifError(workspaceUpdate.error)
        workspacePreferenceChanged = true
      }
      const partials = await reader
        .from('document_packets')
        .select('id, status, source_context_json')
        .eq('transaction_id', transactionResult.data.id)
        .eq('packet_type', 'otp')
        .eq('status', 'sent')
        .contains('source_context_json', { fixture: FIXTURE_KEY })
      assert.ifError(partials.error)
      for (const packet of partials.data || []) {
        await packetApi.archiveDocumentPacket(packet.id, {
          reason: 'Controlled Phase 2 staging acceptance partial superseded by a completed fixture.',
        })
      }
      console.log(JSON.stringify({
        fixture: FIXTURE_KEY,
        mode: 'cleanup-partials',
        archivedPacketIds: (partials.data || []).map((packet) => packet.id),
      }, null, 2))
      return
    }

    if (args.finalizePacketId) {
      assert.ok(args.write, '--finalize-existing requires guarded write mode.')
      if (originalWorkspaceId !== organisationId) {
        const workspaceUpdate = await supabase
          .from('user_workspace_preferences')
          .upsert({ user_id: userId, active_workspace_id: organisationId }, { onConflict: 'user_id' })
        assert.ifError(workspaceUpdate.error)
        workspacePreferenceChanged = true
      }
      const functionResponse = await fetch(`${(env.VITE_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, '')}/functions/v1/generate-final-signed-otp`, {
        method: 'POST',
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY,
          Authorization: `Bearer ${auth.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packetId: args.finalizePacketId, finalisedBy: userId }),
      })
      const finalised = await functionResponse.json().catch(() => null)
      if (!functionResponse.ok || finalised?.success === false) {
        const details = finalised
        const finaliseError = new Error(details?.error || `Final signed generation failed (${functionResponse.status}).`)
        finaliseError.code = details?.errorCode || 'FINAL_SIGNED_GENERATION_FAILED'
        finaliseError.details = details
        throw finaliseError
      }
      const refreshed = await packetService.fetchPacket(args.finalizePacketId, { includeVersions: true, includeEvents: true })
      const finalVersion = refreshed?.versions?.find((version) => version.final_signed_file_path) || null
      assert.ok(finalVersion?.final_signed_file_path, 'Recovered packet final signed artifact did not persist.')
      const finalUrl = finalVersion.final_signed_file_access_url || finalVersion.final_signed_file_url
      assert.ok(finalUrl, 'Recovered packet final signed artifact is not readable.')
      const response = await fetch(finalUrl)
      assert.equal(response.ok, true, `Recovered final signed PDF download failed (${response.status}).`)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(bytes.subarray(0, 4).toString(), '%PDF', 'Recovered final signed artifact is not a PDF.')
      mkdirSync(OUTPUT_DIR, { recursive: true })
      const path = resolve(OUTPUT_DIR, 'bond-otp-final-signed.pdf')
      writeFileSync(path, bytes)
      console.log(JSON.stringify({
        fixture: FIXTURE_KEY,
        mode: 'finalize-existing',
        packetId: args.finalizePacketId,
        finalArtifact: { path, bytes: bytes.length, storagePath: finalVersion.final_signed_file_path },
        result: finalised?.finalArtifact || finalised?.result || null,
      }, null, 2))
      return
    }

    const selectedScenarios = args.scenario === 'both' ? ['cash', 'bond'] : [args.scenario]
    const contexts = Object.fromEntries(
      selectedScenarios.map((scenario) => [
        scenario,
        scenarioContext({
          scenario,
          transaction: transactionResult.data,
          unit: unitResult.data,
          userId,
          organisationId,
        }),
      ]),
    )
    const validations = {}
    for (const [scenario, context] of Object.entries(contexts)) {
      const validation = await packetService.validatePacket({ packetType: 'otp', context, template, validationAction: 'generate' })
      validations[scenario] = validationResult(validation)
    }

    const report = {
      fixture: FIXTURE_KEY,
      mode: args.write ? 'controlled-write' : 'dry-run',
      actor: { userId, organisationId, role: agencyMembership.workspace_role || agencyMembership.organisation_role || agencyMembership.role },
      transactionId: transactionResult.data.id,
      template: { id: template.id, key: template.template_key || template.templateKey, status: template.status },
      validations,
      scenarios: {},
      workspaceRestored: false,
    }

    if (!args.write) {
      if (admin) {
        const packetsResult = await admin
          .from('document_packets')
          .select('id, title, status, current_version_number, source_context_json, created_at, updated_at')
          .eq('transaction_id', transactionResult.data.id)
          .eq('packet_type', 'otp')
          .contains('source_context_json', { fixture: FIXTURE_KEY })
          .order('created_at', { ascending: false })
        assert.ifError(packetsResult.error)
        const packetIds = (packetsResult.data || []).map((row) => row.id)
        const versionsResult = packetIds.length
          ? await admin.from('document_packet_versions').select('id, packet_id, version_number, render_status, rendered_file_path, final_signed_file_path, placeholders_missing_json, created_at').in('packet_id', packetIds).order('created_at', { ascending: false })
          : { data: [], error: null }
        const signersResult = packetIds.length
          ? await admin.from('document_packet_signers').select('id, packet_id, packet_version_id, signer_role, status, signed_at').in('packet_id', packetIds)
          : { data: [], error: null }
        assert.ifError(versionsResult.error)
        assert.ifError(signersResult.error)
        report.stagingArtifacts = (packetsResult.data || []).map((packet) => ({
          packetId: packet.id,
          scenario: packet.source_context_json?.scenario || null,
          status: packet.status,
          currentVersionNumber: packet.current_version_number,
          versions: (versionsResult.data || []).filter((row) => row.packet_id === packet.id),
          signers: (signersResult.data || []).filter((row) => row.packet_id === packet.id),
        }))
      }
      console.log(JSON.stringify(report, null, 2))
      return
    }

    for (const [scenario, validation] of Object.entries(validations)) {
      assert.equal(validation.valid, true, `${scenario}: validation has critical blockers.`)
      assert.deepEqual(validation.critical, [], `${scenario}: validation has critical blockers.`)
      assert.deepEqual(validation.missingPlaceholders, [], `${scenario}: required placeholders are unresolved.`)
    }

    if (originalWorkspaceId !== organisationId) {
      const workspaceUpdate = await supabase
        .from('user_workspace_preferences')
        .upsert({ user_id: userId, active_workspace_id: organisationId }, { onConflict: 'user_id' })
      assert.ifError(workspaceUpdate.error)
      workspacePreferenceChanged = true
    }

    for (const [scenario, context] of Object.entries(contexts)) {
      const existingPackets = await packetService.listPackets({
        organisationId,
        packetType: 'otp',
        transactionId: transactionResult.data.id,
        limit: 50,
      })
      const reusablePacket = existingPackets.find((candidate) => {
        const source = candidate?.source_context_json || {}
        return source.fixture === FIXTURE_KEY && source.scenario === scenario && !['sent', 'completed', 'archived'].includes(normalize(candidate.status).toLowerCase())
      })
      const packet = reusablePacket || await packetApi.createDocumentPacket({
          organisationId,
          packetType: 'otp',
          title: `Phase 2 OTP ${scenario.toUpperCase()} Acceptance`,
          transactionId: transactionResult.data.id,
          unitId: transactionResult.data.unit_id || null,
          status: 'ready_for_generation',
          templateId: template.id,
          templateKeySnapshot: template.template_key || template.templateKey || 'otp_default_v1',
          templateLabelSnapshot: template.template_label || template.templateLabel || 'Offer to Purchase',
          assignedAgentId: userId,
          sourceContextJson: context.sourceContext,
        })
      const firstGeneration = await packetService.generatePacketVersion({
        packetId: packet.id,
        packetType: 'otp',
        context,
        template,
        allowWarnings: true,
        forceGenerate: false,
      })
      assert.equal(firstGeneration.version?.render_status, 'generated', `${scenario}: generation did not complete.`)
      assert.ok(firstGeneration.version?.rendered_file_path, `${scenario}: generated file path is missing.`)
      assert.deepEqual(firstGeneration.version?.placeholders_missing_json || [], [], `${scenario}: generated version retained missing placeholders.`)

      const reopened = await packetService.fetchPacket(packet.id, { includeVersions: true, includeEvents: true })
      assert.ok(reopened?.versions?.some((version) => version.id === firstGeneration.version.id), `${scenario}: version did not persist after reopen.`)
      const downloaded = await downloadGeneratedDocument(reopened.versions.find((version) => version.id === firstGeneration.version.id), scenario)

      const regenerated = await packetService.regeneratePacket({ packetId: packet.id, packetType: 'otp', context, template })
      assert.ok(regenerated.version.version_number > firstGeneration.version.version_number, `${scenario}: regeneration did not increment the version.`)
      assert.notEqual(regenerated.version.id, firstGeneration.version.id, `${scenario}: regeneration did not create a distinct version.`)

      const scenarioReport = {
        packetId: packet.id,
        firstVersionId: firstGeneration.version.id,
        regeneratedVersionId: regenerated.version.id,
        regeneratedVersionNumber: regenerated.version.version_number,
        generatedDocument: downloaded,
        signerAccess: null,
        finalSignedArtifact: null,
      }

      if (scenario === 'bond') {
        const signing = await packetService.prepareSigningFields({
          packetId: packet.id,
          packetType: 'otp',
          context,
          placeholders: regenerated.validation?.placeholders || {},
          organisationId,
        })
        assert.ok(signing.summary?.signerCount >= 2, 'bond: buyer and seller signers were not prepared.')
        assert.ok(signing.summary?.requiredFieldCount > 0, 'bond: required signing fields were not prepared.')
        const links = await packetService.generateSigningLinks({
          packetId: packet.id,
          packetVersionId: regenerated.version.id,
          expiresInHours: 1,
          baseUrl: 'https://app.staging.bridgenine.co.za',
          organisationId,
          regenerate: true,
        })
        const activeLinks = (links?.signers || links?.links || links || []).filter?.((row) => row.signing_link) || []
        assert.ok(activeLinks.length >= 2, 'bond: signer links were not generated for buyer and seller.')

        for (const signer of activeLinks) {
          const token = normalize(signer.signing_token || signer.signing_link?.split('/').pop())
          assert.ok(token, `bond: missing signing token for ${signer.signer_role}.`)
          const session = await signingApi.resolveExternalSignerSession({ token })
          assert.equal(session.success, true, `bond: signer session did not resolve for ${signer.signer_role}.`)
          const sessionFields = session?.session?.fields || session?.fields || []
          const fields = sessionFields.filter((field) => ['initial', 'signature'].includes(normalize(field.field_type || field.fieldType).toLowerCase()))
          const fieldTypes = [...new Set(fields.map((field) => normalize(field.field_type || field.fieldType).toLowerCase()))]
          assert.ok(fields.length > 0, `bond: signer session exposed no actionable fields for ${signer.signer_role}.`)
          for (const assetType of fieldTypes) {
            const saved = await signingApi.saveSignerAsset({ token, assetType, dataUrl: SIGNATURE_DATA_URL })
            assert.ok(saved?.asset?.path, `bond: ${assetType} asset did not persist for ${signer.signer_role}.`)
            for (const field of fields.filter((row) => normalize(row.field_type || row.fieldType).toLowerCase() === assetType)) {
              const applied = await signingApi.applySignerField({
                token,
                fieldId: field.id,
                assetType,
                assetPath: saved.asset.path,
                completedByEmail: signer.signer_email,
              })
              assert.equal(applied?.field?.status, 'completed', `bond: ${assetType} field did not persist as completed.`)
            }
          }
          const completed = await signingApi.completeSignerSigning({ token })
          assert.equal(completed.success, true, `bond: signer completion failed for ${signer.signer_role}.`)
        }

        const signedPacket = await packetService.fetchPacket(packet.id, { includeVersions: true, includeEvents: true })
        const signedVersion = signedPacket.versions.find((version) => version.id === regenerated.version.id)
        assert.equal(signedPacket.status, 'completed', 'bond: packet did not persist completed status.')
        assert.ok(signedVersion?.final_signed_file_path, 'bond: final signed artifact path did not persist.')
        const finalUrl = signedVersion.final_signed_file_access_url || signedVersion.final_signed_file_url
        assert.ok(finalUrl, 'bond: final signed artifact is not readable.')
        const finalResponse = await fetch(finalUrl)
        assert.equal(finalResponse.ok, true, `bond: final signed PDF download failed (${finalResponse.status}).`)
        const finalBytes = Buffer.from(await finalResponse.arrayBuffer())
        assert.equal(finalBytes.subarray(0, 4).toString(), '%PDF', 'bond: final signed artifact is not a PDF.')
        const finalPath = resolve(OUTPUT_DIR, 'bond-otp-final-signed.pdf')
        writeFileSync(finalPath, finalBytes)
        scenarioReport.signerAccess = { signerCount: activeLinks.length, allSessionsResolved: true }
        scenarioReport.finalSignedArtifact = { path: finalPath, bytes: finalBytes.length, storagePath: signedVersion.final_signed_file_path }
      }
      report.scenarios[scenario] = scenarioReport
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (workspacePreferenceChanged && originalWorkspaceId && actorUserId) {
      try {
        const supabaseModule = await server.ssrLoadModule('/src/lib/supabaseClient.js')
        const restore = await supabaseModule.supabase
          .from('user_workspace_preferences')
          .upsert({ user_id: actorUserId, active_workspace_id: originalWorkspaceId }, { onConflict: 'user_id' })
        if (restore.error) console.error(`Workspace restore failed: ${restore.error.message}`)
      } catch (error) {
        console.error(`Workspace restore failed: ${error.message}`)
      }
    }
    await server.close()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    fixture: FIXTURE_KEY,
    status: 'failed',
    code: error?.code || null,
    message: error?.message || String(error),
    details: error?.details || null,
    validation: error?.validation ? validationResult(error.validation) : null,
  }, null, 2))
  process.exitCode = 1
})
