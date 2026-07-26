import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const PHASE = 'document-generator-final-mile-phase-7'
const DEFAULT_REPORT_PATH = 'docs/audits/document-generator-final-mile-phase-7-observation.json'
const EXPECTED_RELEASE_ID = '05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77'
const PRODUCTION_APP_URL = 'https://app.arch9.co.za'
const EXPECTED_PROJECT_REF = 'isdowlnollckzvltkasn'
const ORGANISATION_ID = 'ec19d0a6-bcba-4eef-aa72-9972de88204d'
const FINAL_MILE_PACKETS = [
  {
    label: 'otp',
    packetId: '9ea0cf58-0e0f-47f4-b120-c4cde8d70c7c',
    packetVersionId: '5f3dc0d7-7e6d-428e-8404-90bdc9bc3051',
    expectedFileName: 'otp-v2-final-signed.pdf',
  },
  {
    label: 'mandate',
    packetId: '92d1a77a-26a6-4373-87d4-ec1871851f39',
    packetVersionId: 'e06150db-596c-476d-a99d-d3f1cac442c9',
    expectedFileName: 'mandate-v2-final-signed.pdf',
  },
]

function argValue(name, fallback = '') {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

const shouldWrite = process.argv.includes('--write')
const reportPath = argValue('--report', DEFAULT_REPORT_PATH)
const allowLocalReleaseDrift = process.argv.includes('--allow-local-release-drift')

function envText(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value) return value.replace(/\/+$/, '')
  }
  return ''
}

function projectRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : ''
  } catch {
    return ''
  }
}

function localReleaseId() {
  const run = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: '..',
    encoding: 'utf8',
    timeout: 10_000,
  })
  return run.status === 0 ? run.stdout.trim() : ''
}

function addBlocker(blockers, code, detail) {
  blockers.push(detail ? { code, detail } : { code })
}

function requireNoError(result, blockers, code, label) {
  if (result.error) {
    addBlocker(blockers, code, `${label}: ${result.error.message}`)
    return false
  }
  return true
}

function latestBySigner(deliveries) {
  const latest = new Map()
  for (const delivery of deliveries || []) {
    const signerId = delivery.signer_id || 'unknown'
    const current = latest.get(signerId)
    if (!current || Number(delivery.attempt_number || 0) >= Number(current.attempt_number || 0)) {
      latest.set(signerId, delivery)
    }
  }
  return [...latest.values()]
}

function summarizeDeliveries(deliveries) {
  const latest = latestBySigner(deliveries)
  const summary = {
    signerCount: latest.length,
    sentCount: latest.filter((row) => row.status === 'sent').length,
    suppressedCount: 0,
    providerAcceptedCount: 0,
    missingProviderEvidenceCount: 0,
    latestAttemptAt: null,
  }
  for (const row of latest) {
    const providerMessageId = String(row.provider_message_id || '')
    if (providerMessageId.startsWith('suppressed:')) summary.suppressedCount += 1
    else if (providerMessageId) summary.providerAcceptedCount += 1
    else summary.missingProviderEvidenceCount += 1
    if (!summary.latestAttemptAt || String(row.attempted_at || '') > summary.latestAttemptAt) {
      summary.latestAttemptAt = row.attempted_at || null
    }
  }
  return summary
}

function redactedAccess(body) {
  const finalArtifact = body?.finalArtifact || {}
  return {
    success: body?.success === true,
    state: body?.state || null,
    available: body?.available === true,
    hasDownloadUrl: Boolean(finalArtifact.downloadUrl),
    fileName: finalArtifact.fileName || null,
    errorCode: body?.errorCode || null,
  }
}

async function invokeFinalAccess({ supabaseUrl, serviceRoleKey, packet }) {
  const response = await fetch(`${supabaseUrl}/functions/v1/resolve-final-signed-document-access`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context: 'workspace',
      action: 'download',
      packetId: packet.packetId,
      packetVersionId: packet.packetVersionId,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({}))
  return { httpStatus: response.status, ...redactedAccess(body) }
}

async function fetchReleaseManifest(blockers) {
  const response = await fetch(`${PRODUCTION_APP_URL}/release-manifest.json`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    addBlocker(blockers, 'PHASE7_RELEASE_MANIFEST_UNAVAILABLE', `HTTP ${response.status}`)
    return null
  }
  return response.json()
}

async function observePacket(client, supabaseUrl, serviceRoleKey, packet) {
  const blockers = []
  const [
    completionResult,
    launchChainResult,
    deliveryResult,
    traceResult,
    accessResult,
  ] = await Promise.all([
    client.rpc('bridge_get_final_completion_status_f5', {
      p_packet_id: packet.packetId,
      p_packet_version_id: packet.packetVersionId,
    }),
    client.rpc('bridge_get_document_generator_launch_chain_g1', {
      p_packet_id: packet.packetId,
      p_packet_version_id: packet.packetVersionId,
    }),
    client
      .from('legal_final_artifact_deliveries')
      .select('signer_id, status, provider_message_id, attempted_at, attempt_number')
      .eq('packet_version_id', packet.packetVersionId),
    client
      .from('legal_document_pilot_lifecycle_traces_phase5')
      .select('id, stage, access_context, artifact_sha256, observed_at')
      .eq('packet_id', packet.packetId)
      .eq('packet_version_id', packet.packetVersionId)
      .in('stage', ['final_delivery_completed', 'final_access_authorized'])
      .order('observed_at', { ascending: false }),
    invokeFinalAccess({ supabaseUrl, serviceRoleKey, packet }),
  ])

  requireNoError(completionResult, blockers, 'PHASE7_COMPLETION_STATUS_UNAVAILABLE', packet.label)
  requireNoError(launchChainResult, blockers, 'PHASE7_G1_CHAIN_UNAVAILABLE', packet.label)
  requireNoError(deliveryResult, blockers, 'PHASE7_DELIVERY_EVIDENCE_UNAVAILABLE', packet.label)
  requireNoError(traceResult, blockers, 'PHASE7_LIFECYCLE_TRACE_UNAVAILABLE', packet.label)

  const completion = completionResult.data || {}
  const chain = launchChainResult.data || {}
  const deliverySummary = summarizeDeliveries(deliveryResult.data || [])
  const lifecycleStages = [...new Set((traceResult.data || []).map((row) => row.stage).filter(Boolean))]
  const access = accessResult

  if (completion.ready !== true) addBlocker(blockers, 'PHASE7_COMPLETION_NOT_READY', `${packet.label}: ${completion.stage || 'unknown'}`)
  if (completion.stage !== 'completed_everywhere') addBlocker(blockers, 'PHASE7_COMPLETION_STAGE_NOT_FINAL', `${packet.label}: ${completion.stage || 'unknown'}`)
  if (completion.deliveryReady !== true) addBlocker(blockers, 'PHASE7_RECIPIENT_DELIVERY_INCOMPLETE', packet.label)
  if (Number(completion.deliveredRecipientCount || 0) !== Number(completion.recipientCount || 0)) addBlocker(blockers, 'PHASE7_RECIPIENT_COUNT_MISMATCH', packet.label)
  if (Number(deliverySummary.sentCount || 0) !== Number(completion.recipientCount || 0)) addBlocker(blockers, 'PHASE7_DELIVERY_EVIDENCE_INCOMPLETE', packet.label)
  if (!lifecycleStages.includes('final_delivery_completed')) addBlocker(blockers, 'PHASE7_FINAL_DELIVERY_TRACE_MISSING', packet.label)
  if (access.httpStatus !== 200 || access.success !== true || access.available !== true || access.hasDownloadUrl !== true) addBlocker(blockers, 'PHASE7_FINAL_ACCESS_UNAVAILABLE', packet.label)
  if (access.fileName !== packet.expectedFileName) addBlocker(blockers, 'PHASE7_FINAL_ACCESS_FILENAME_MISMATCH', `${packet.label}: ${access.fileName || 'missing'}`)
  const chainDelivery = chain.delivery || {}
  if (chainDelivery.deliveredRecipientCount !== chainDelivery.recipientCount) addBlocker(blockers, 'PHASE7_G1_DELIVERY_CHAIN_INCOMPLETE', packet.label)

  return {
    label: packet.label,
    packetId: packet.packetId,
    packetVersionId: packet.packetVersionId,
    status: blockers.length ? 'blocked' : 'healthy',
    completion: {
      ready: completion.ready === true,
      stage: completion.stage || null,
      deliveryReady: completion.deliveryReady === true,
      recipientCount: completion.recipientCount ?? null,
      deliveredRecipientCount: completion.deliveredRecipientCount ?? null,
      outstandingRecipientCount: completion.outstandingRecipientCount ?? null,
      artifactReady: completion.artifactReady === true,
      transactionReady: completion.transactionReady === true,
      surfaceReady: completion.surfaceReady === true,
    },
    launchChain: {
      packetStatus: chain.packetStatus || null,
      currentVersion: chain.currentVersion === true,
      delivery: {
        recipientCount: chainDelivery.recipientCount ?? null,
        deliveredRecipientCount: chainDelivery.deliveredRecipientCount ?? null,
      },
      finalArtifactPresent: Boolean(chain.finalArtifact?.path && chain.finalArtifact?.sha256),
      transactionPublished: Boolean(chain.transactionPublication?.id),
      surfaceCompleted: Boolean(chain.surfaceCompletion?.canonicalSatisfied),
    },
    access,
    deliveryEvidence: deliverySummary,
    lifecycleTrace: {
      hasFinalDeliveryCompleted: lifecycleStages.includes('final_delivery_completed'),
      hasFinalAccessAuthorized: lifecycleStages.includes('final_access_authorized'),
      stages: lifecycleStages,
      latestObservedAt: traceResult.data?.[0]?.observed_at || null,
    },
    blockers,
  }
}

const blockers = []
const supabaseUrl = envText('SUPABASE_URL', 'VITE_SUPABASE_URL')
const serviceRoleKey = envText('SUPABASE_SERVICE_ROLE_KEY')
const projectRef = projectRefFromUrl(supabaseUrl)
if (!supabaseUrl || !serviceRoleKey) addBlocker(blockers, 'PHASE7_SUPABASE_CONFIGURATION_MISSING', 'SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (projectRef !== EXPECTED_PROJECT_REF) addBlocker(blockers, 'PHASE7_PROJECT_REF_MISMATCH', projectRef || 'missing')

const releaseManifest = blockers.length ? null : await fetchReleaseManifest(blockers)
const liveReleaseId = releaseManifest?.releaseId || null
const expectedReleaseId = EXPECTED_RELEASE_ID
const gitReleaseId = localReleaseId()
if (liveReleaseId && liveReleaseId !== expectedReleaseId) addBlocker(blockers, 'PHASE7_LIVE_RELEASE_MISMATCH', liveReleaseId)
if (!allowLocalReleaseDrift && gitReleaseId && gitReleaseId !== expectedReleaseId) addBlocker(blockers, 'PHASE7_LOCAL_RELEASE_MISMATCH', gitReleaseId)

let packets = []
if (!blockers.length) {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  packets = await Promise.all(
    FINAL_MILE_PACKETS.map((packet) => observePacket(client, supabaseUrl, serviceRoleKey, packet)),
  )
  for (const packet of packets) {
    for (const packetBlocker of packet.blockers) blockers.push({ ...packetBlocker, packet: packet.label })
  }
}

const uniqueBlockers = [...new Map(blockers.map((blocker) => [`${blocker.code}:${blocker.detail || ''}:${blocker.packet || ''}`, blocker])).values()]
const report = {
  phase: PHASE,
  status: uniqueBlockers.length ? 'blocked' : 'healthy',
  observedAt: new Date().toISOString(),
  mutatedData: false,
  production: {
    appUrl: PRODUCTION_APP_URL,
    projectRef,
    supabaseUrl,
    organisationId: ORGANISATION_ID,
  },
  release: {
    expectedReleaseId,
    liveReleaseId,
    localReleaseId: gitReleaseId || null,
    localReleaseDriftAllowed: allowLocalReleaseDrift,
    manifestAssetCount: releaseManifest?.criticalAssets?.length ?? null,
    manifestSupabaseOrigin: releaseManifest?.supabaseOrigin || null,
  },
  controls: {
    invokesDispatcher: false,
    sendsEmail: false,
    mutatesCustomerData: false,
    mayRecordFinalAccessTrace: true,
    signedDownloadUrlsRedacted: true,
    recipientEmailsRedacted: true,
  },
  packets,
  blockers: uniqueBlockers,
}

const output = `${JSON.stringify(report, null, 2)}\n`
if (shouldWrite) {
  fs.writeFileSync(reportPath, output)
}
process.stdout.write(output)
if (uniqueBlockers.length) process.exitCode = 1
