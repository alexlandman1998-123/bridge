import {
  fetchDocumentPacket,
  getFinalDocumentCompletionStatus,
  getDocumentGeneratorLaunchChain,
  getDocumentPacketSigningSummary,
  listDocumentPacketVersions,
  listDocumentPackets,
} from '../../lib/documentPacketsApi'
import { normalizeDocumentLifecycleState } from './documentLifecycle'
import { resolveSigningOperationalStatus } from './signingOperationalStatus'
import { buildSigningActivityHistory } from './signingActivityHistory'
import { buildSigningCompletionCertificate } from './signingCompletionCertificate'
import { findLatestSignableGeneratedVersion, isPilotDocumentFallbackVersion } from './pilotDocumentFallback'

const PACKET_STATUS_CACHE_TTL_MS = 1500
const cachedPacketStatuses = new Map()
const pendingPacketStatuses = new Map()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeNullableUuid(value) {
  const text = normalizeText(value)
  return isUuidLike(text) ? text : null
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function collectPacketLeadReferences(packet = null) {
  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const generationPayload = sourceContext.generationPayload && typeof sourceContext.generationPayload === 'object'
    ? sourceContext.generationPayload
    : {}
  const mandateData = generationPayload.mandateData && typeof generationPayload.mandateData === 'object'
    ? generationPayload.mandateData
    : {}
  const generatedSnapshot = sourceContext.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === 'object'
    ? sourceContext.generatedDataSnapshot
    : {}
  const sourceSnapshot = mandateData.sourceSnapshot && typeof mandateData.sourceSnapshot === 'object'
    ? mandateData.sourceSnapshot
    : {}
  const sourceLead = sourceSnapshot.lead && typeof sourceSnapshot.lead === 'object'
    ? sourceSnapshot.lead
    : {}
  const sourcePrivateListing = sourceSnapshot.privateListing && typeof sourceSnapshot.privateListing === 'object'
    ? sourceSnapshot.privateListing
    : {}
  const snapshotLead = generatedSnapshot.sourceSnapshot?.lead && typeof generatedSnapshot.sourceSnapshot.lead === 'object'
    ? generatedSnapshot.sourceSnapshot.lead
    : {}
  const snapshotListing = generatedSnapshot.sourceSnapshot?.privateListing && typeof generatedSnapshot.sourceSnapshot.privateListing === 'object'
    ? generatedSnapshot.sourceSnapshot.privateListing
    : {}

  return [
    packet?.lead_id,
    packet?.leadId,
    sourceContext.leadId,
    sourceContext.lead_id,
    sourceContext.uiLeadId,
    sourceContext.ui_lead_id,
    sourceContext.originatingCrmLeadId,
    sourceContext.sellerLeadId,
    generationPayload.leadId,
    generationPayload.uiLeadId,
    mandateData.lead?.id,
    mandateData.lead?.leadId,
    mandateData.lead?.lead_id,
    generatedSnapshot.lead?.id,
    generatedSnapshot.lead?.leadId,
    generatedSnapshot.lead?.lead_id,
    sourceLead.id,
    sourceLead.leadId,
    sourceLead.lead_id,
    sourcePrivateListing.sellerLeadId,
    sourcePrivateListing.originatingCrmLeadId,
    snapshotLead.id,
    snapshotLead.leadId,
    snapshotLead.lead_id,
    snapshotListing.sellerLeadId,
    snapshotListing.originatingCrmLeadId,
  ]
}

export function documentPacketBelongsToLead(packet = null, leadId = '') {
  const expectedLeadId = normalizeLeadUuid(leadId)
  if (!expectedLeadId || !packet?.id) return true
  return collectPacketLeadReferences(packet).some((value) => normalizeLeadUuid(value) === expectedLeadId)
}

function isMissingSchemaOrTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return code === '42P01' || code === 'PGRST204' || code === 'PGRST205' || message.includes('schema cache')
}

function isPermissionDeniedError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  return status === 403 || code === '42501' || message.includes('permission denied') || details.includes('row-level security')
}

function resolvePacketLabel(packetType = 'mandate') {
  const normalized = normalizeKey(packetType)
  if (normalized === 'otp') return 'OTP'
  return 'Mandate'
}

function resolveLifecycleStateFromPacket({
  packet = null,
  versions = [],
  signingSummary = null,
  finalCompletion = null,
} = {}) {
  if (!packet?.id) {
    return {
      state: 'NO_PACKET',
      reason: 'No packet record was found for this context.',
    }
  }

  const status = normalizeKey(packet?.status)
  const versionRows = Array.isArray(versions) ? versions : []
  const latestVersion = versionRows[0] || null
  const signerRows = Array.isArray(signingSummary?.signers) ? signingSummary.signers : []
  const signerStatuses = signerRows.map((row) => normalizeKey(row?.status)).filter(Boolean)
  const signedCount = signerStatuses.filter((row) => row === 'signed').length
  const activeCount = signerStatuses.filter((row) => ['pending', 'ready_to_send', 'sent', 'viewed'].includes(row)).length
  const hasPartialSignerProgress = signedCount > 0 && activeCount > 0
  const explicitLifecycleState =
    normalizeKey(packet?.source_context_json?.lifecycle_state) ||
    normalizeKey(packet?.source_context_json?.editableDraftReviewState) ||
    normalizeKey(latestVersion?.validation_summary_json?.review_state) ||
    normalizeKey(latestVersion?.validation_summary_json?.editable_draft?.review_state)
  const lifecycleState = normalizeDocumentLifecycleState(explicitLifecycleState || status)

  const hasFinalSignedVersion = versionRows.some(
    (version) =>
      normalizeText(version?.finalised_at) ||
      normalizeText(version?.final_signed_file_path) ||
      normalizeText(version?.final_signed_file_url),
  )
  const hasGeneratedVersion = Boolean(findLatestSignableGeneratedVersion(versionRows))
  const latestIsPilotFallback = isPilotDocumentFallbackVersion(latestVersion)
  const allSignersSigned = signingSummary?.allSignersSigned === true

  if (status === 'archived' || status === 'voided' || lifecycleState === 'archived') {
    return {
      state: 'ARCHIVED',
      reason: 'Packet is archived.',
    }
  }

  if (finalCompletion?.ready === true) {
    return {
      state: 'COMPLETED',
      reason: 'The final signed artifact is verified across the transaction and portal surfaces.',
    }
  }

  if (hasFinalSignedVersion) {
    return {
      state: 'PUBLISHING',
      reason: 'The final signed artifact is safe while transaction, portal or recipient completion is pending.',
    }
  }

  if (allSignersSigned || status === 'completed' || normalizeText(packet?.completed_at)) {
    return {
      state: 'FINALISING',
      reason: 'All signers completed and the immutable final signed artifact is still being generated.',
    }
  }

  if (status === 'partially_signed' || hasPartialSignerProgress) {
    return {
      state: 'PARTIALLY_SIGNED',
      reason: 'Packet is in progress with partial signer completion.',
    }
  }

  if (status === 'sent' || signerStatuses.some((row) => ['sent', 'viewed', 'signed', 'declined', 'expired'].includes(row))) {
    return {
      state: 'SENT',
      reason: 'Packet has been sent for signature.',
    }
  }

  if (status === 'signing_prep' || lifecycleState === 'ready_to_send') {
    return {
      state: 'READY_TO_SEND',
      reason: 'PDF and signing preparation are ready to send.',
    }
  }

  if (latestIsPilotFallback && !hasGeneratedVersion) {
    return {
      state: 'PILOT_FALLBACK',
      reason: 'A pilot review draft is available, but it cannot be sent or signed until a verified document is generated.',
    }
  }

  if (status === 'generated' || hasGeneratedVersion || lifecycleState === 'pdf_generated') {
    return {
      state: 'PDF_GENERATED',
      reason: 'A generated PDF is available and the document remains editable.',
    }
  }

  if (['draft', 'ready_for_generation'].includes(status) || packet?.id) {
    return {
      state: 'DRAFT',
      reason: 'Packet draft exists.',
    }
  }

  return {
    state: 'UNKNOWN',
    reason: 'Packet status is not recognized by this client yet.',
  }
}

export function normalizeMandateSigningStatus({
  packet = null,
  versions = [],
  signingSummary = null,
} = {}) {
  const source = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const explicit =
    normalizeKey(source.signing_status) ||
    normalizeKey(source.signingStatus) ||
    normalizeKey(source.physical_signature_status) ||
    normalizeKey(source.mandateStatus)
  const known = new Set([
    'draft',
    'generated',
    'generated_for_physical_signature',
    'sent_for_signature',
    'sent_to_agent',
    'agent_signed',
    'sent_to_seller',
    'seller_signed',
    'completed',
    'viewed',
    'signed',
    'uploaded_signed',
    'declined',
    'cancelled',
    'failed',
  ])
  if (known.has(explicit)) return explicit
  if (['cancelled', 'voided'].includes(explicit) || normalizeKey(packet?.status) === 'voided') return 'cancelled'
  if (explicit === 'sent') return 'sent_for_signature'
  if (explicit === 'completed' && normalizeKey(source.signing_method || source.signingMethod) === 'physical') return 'uploaded_signed'
  if (explicit === 'completed') return 'signed'

  const signerStatuses = Array.isArray(signingSummary?.signers)
    ? signingSummary.signers.map((row) => normalizeKey(row?.status)).filter(Boolean)
    : []
  if (signerStatuses.some((status) => status === 'declined')) return 'declined'
  if (signerStatuses.some((status) => status === 'viewed')) return 'viewed'
  if (signerStatuses.some((status) => status === 'sent')) return 'sent_for_signature'
  if (signingSummary?.allSignersSigned === true) return 'signed'

  const versionRows = Array.isArray(versions) ? versions : []
  const hasFinalSignedVersion = versionRows.some(
    (version) => normalizeText(version?.finalised_at) || normalizeText(version?.final_signed_file_path) || normalizeText(version?.final_signed_file_url),
  )
  if (hasFinalSignedVersion) {
    return normalizeKey(source.signing_method || source.signingMethod) === 'physical' ? 'uploaded_signed' : 'signed'
  }
  const latestRenderStatus = normalizeKey(versionRows[0]?.render_status)
  if (latestRenderStatus === 'failed') return 'failed'
  if (findLatestSignableGeneratedVersion(versionRows) || (normalizeKey(packet?.status) === 'generated' && !isPilotDocumentFallbackVersion(versionRows[0]))) return 'generated'
  return 'draft'
}

function selectLatestPacket(rows = [], preferredPacketId = '') {
  const packetRows = Array.isArray(rows) ? rows : []
  const normalizedPreferred = normalizeText(preferredPacketId)
  if (normalizedPreferred) {
    const matched = packetRows.find((row) => normalizeText(row?.id) === normalizedPreferred)
    if (matched) return matched
  }
  return packetRows[0] || null
}

function resolvePacketStatusCacheKey({
  packetType,
  packetId = '',
  transactionId = '',
  leadId = '',
  organisationId = null,
  viewerRole = '',
} = {}) {
  return [
    normalizeKey(packetType),
    normalizeText(packetId),
    normalizeText(transactionId),
    normalizeLeadUuid(leadId),
    normalizeNullableUuid(organisationId) || '',
    normalizeKey(viewerRole),
  ].join(':')
}

function shouldLoadSigningSummary(packet = null, versions = []) {
  const packetStatus = normalizeKey(packet?.status)
  if (['signing_prep', 'sent', 'partially_signed', 'completed'].includes(packetStatus)) return true

  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  const explicitSigningState =
    normalizeKey(sourceContext.signing_status) ||
    normalizeKey(sourceContext.signingStatus) ||
    normalizeKey(sourceContext.physical_signature_status) ||
    normalizeKey(sourceContext.mandateStatus)
  if (['sent_for_signature', 'sent_to_agent', 'agent_signed', 'sent_to_seller', 'seller_signed', 'completed', 'viewed', 'signed', 'uploaded_signed', 'declined', 'failed'].includes(explicitSigningState)) {
    return true
  }

  return Array.isArray(versions) && versions.some(
    (version) =>
      normalizeText(version?.finalised_at) ||
      normalizeText(version?.final_signed_file_path) ||
      normalizeText(version?.final_signed_file_url),
  )
}

function selectSigningSummaryVersionId(packet = null, versions = []) {
  const rows = Array.isArray(versions) ? versions : []
  const generatedVersion = findLatestSignableGeneratedVersion(rows)
  if (generatedVersion?.id) return generatedVersion.id

  const finalSignedVersion = rows.find(
    (version) =>
      normalizeText(version?.finalised_at) ||
      normalizeText(version?.final_signed_file_path) ||
      normalizeText(version?.final_signed_file_url),
  )
  if (finalSignedVersion?.id) return finalSignedVersion.id

  const currentVersionNumber = Number(packet?.current_version_number || 0)
  if (currentVersionNumber > 0) {
    const currentVersion = rows.find((version) => Number(version?.version_number || 0) === currentVersionNumber)
    if (currentVersion?.id) return currentVersion.id
  }

  const usableVersion = rows.find((version) => {
    const renderStatus = normalizeKey(version?.render_status)
    return !renderStatus || renderStatus === 'draft'
  })
  return usableVersion?.id || null
}

export async function resolveDocumentPacketStatus({
  packetType,
  packetId = '',
  transactionId = '',
  leadId = '',
  organisationId = null,
  viewerRole = '',
} = {}) {
  const cacheKey = resolvePacketStatusCacheKey({
    packetType,
    packetId,
    transactionId,
    leadId,
    organisationId,
    viewerRole,
  })
  const cached = cachedPacketStatuses.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.cachedAt < PACKET_STATUS_CACHE_TTL_MS) {
    return cached.value
  }
  if (pendingPacketStatuses.has(cacheKey)) {
    return pendingPacketStatuses.get(cacheKey)
  }

  const resolutionPromise = (async () => {
    const normalizedPacketType = normalizeKey(packetType)
    const normalizedPacketId = normalizeText(packetId)
    const normalizedTransactionId = normalizeText(transactionId)
    const normalizedLeadId = normalizeLeadUuid(leadId)
    const scopedOrganisationId = normalizeNullableUuid(organisationId)
    const warnings = []
    let packet = null
    let versions = []
    let signingSummary = null
    let finalCompletion = null
    let launchChain = null
    let packetLookupFailed = false

    if (!['mandate', 'otp'].includes(normalizedPacketType)) {
      return {
        packetType: normalizedPacketType || 'mandate',
        state: 'UNKNOWN',
        packet: null,
        versions: [],
        signingSummary: null,
        warnings: ['Unsupported packet type.'],
        actionHint: 'Packet type is not supported by this resolver.',
      }
    }

    try {
      if (normalizedPacketId && isUuidLike(normalizedPacketId)) {
        packet = await fetchDocumentPacket(normalizedPacketId, { includeVersions: false, includeEvents: true })
        if (packet?.id && normalizedLeadId && !documentPacketBelongsToLead(packet, normalizedLeadId)) {
          warnings.push('The packet in the link belongs to another lead, so it was ignored.')
          packet = null
        }
      }
    } catch (error) {
      packetLookupFailed = true
      if (isPermissionDeniedError(error)) {
        warnings.push('Packet lookup was denied by RLS for this user context.')
      } else if (isMissingSchemaOrTableError(error)) {
        warnings.push('Packet tables are unavailable in this project.')
      } else {
        warnings.push(normalizeText(error?.message || 'Packet lookup failed.'))
      }
    }

    if (!packet && (!normalizedPacketId || !packetLookupFailed)) {
      try {
        const scoped = await listDocumentPackets({
          organisationId: scopedOrganisationId,
          packetType: normalizedPacketType,
          transactionId: normalizedTransactionId || null,
          leadId: normalizedLeadId || null,
          limit: 20,
        })
        packet = selectLatestPacket(scoped, normalizedPacketId)
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          warnings.push('Packet listing was denied by RLS for this user context.')
        } else if (isMissingSchemaOrTableError(error)) {
          warnings.push('Packet listing table is unavailable in this project.')
        } else {
          warnings.push(normalizeText(error?.message || 'Packet list query failed.'))
        }
      }
    }

    if (packet?.id) {
      if (!Array.isArray(packet.events)) {
        try {
          const packetWithEvents = await fetchDocumentPacket(packet.id, { includeVersions: false, includeEvents: true })
          packet = packetWithEvents || packet
        } catch (error) {
          if (isPermissionDeniedError(error)) warnings.push('Signing activity is restricted by RLS for this role.')
          else if (isMissingSchemaOrTableError(error)) warnings.push('Signing activity is unavailable in this project.')
          else warnings.push(normalizeText(error?.message || 'Unable to load signing activity.'))
        }
      }
      try {
        versions = await listDocumentPacketVersions(packet.id)
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          warnings.push('Packet versions are not accessible for this role.')
        } else if (isMissingSchemaOrTableError(error)) {
          warnings.push('Packet version table is unavailable in this project.')
        } else {
          warnings.push(normalizeText(error?.message || 'Unable to load packet versions.'))
        }
      }

      if (shouldLoadSigningSummary(packet, versions)) {
        try {
          signingSummary = await getDocumentPacketSigningSummary({
            packetId: packet.id,
            packetVersionId: selectSigningSummaryVersionId(packet, versions),
            organisationId: scopedOrganisationId,
          })
        } catch (error) {
          if (isPermissionDeniedError(error)) {
            warnings.push('Signer summary is restricted by RLS for this role.')
          } else if (isMissingSchemaOrTableError(error)) {
            warnings.push('Signing tables are unavailable in this project.')
          } else {
            warnings.push(normalizeText(error?.message || 'Unable to resolve signer summary.'))
          }
        }
      }

      const remindersByRole = packet?.source_context_json?.signingRemindersByRole
      if (signingSummary?.signers?.length && remindersByRole && typeof remindersByRole === 'object') {
        signingSummary = {
          ...signingSummary,
          signers: signingSummary.signers.map((signer) => {
            const reminder = remindersByRole[normalizeKey(signer?.signer_role)]
            return reminder && typeof reminder === 'object'
              ? { ...signer, reminder_sent_at: normalizeText(reminder.sentAt), reminder_count: Number(reminder.count || 0) }
              : signer
          }),
        }
      }

      const finalVersion = versions.find((version) => normalizeText(version?.final_signed_file_path || version?.final_signed_file_url))
      if (finalVersion?.id && isUuidLike(packet.id) && isUuidLike(finalVersion.id)) {
        try {
          finalCompletion = await getFinalDocumentCompletionStatus({ packetId: packet.id, versionId: finalVersion.id })
          launchChain = await getDocumentGeneratorLaunchChain({ packetId: packet.id, versionId: finalVersion.id })
        } catch (error) {
          if (isPermissionDeniedError(error)) warnings.push('Final publication status is restricted for this role.')
          else if (isMissingSchemaOrTableError(error)) warnings.push('Final publication status is unavailable in this project.')
          else warnings.push(normalizeText(error?.message || 'Unable to resolve final publication status.'))
        }
      }
    }

    const lifecycle = resolveLifecycleStateFromPacket({
      packet,
      versions,
      signingSummary,
      finalCompletion,
    })
    const signingStatus = normalizedPacketType === 'mandate'
      ? normalizeMandateSigningStatus({ packet, versions, signingSummary })
      : null
    const operationalStatus = resolveSigningOperationalStatus({
      packetType: normalizedPacketType,
      packet,
      versions,
      signingSummary,
      finalCompletion,
      viewerRole,
    })
    const signingActivity = buildSigningActivityHistory({
      signers: signingSummary?.signers || [],
      events: Array.isArray(packet?.events) ? packet.events : [],
      limit: 100,
    })
    const completionCertificate = buildSigningCompletionCertificate({
      packet,
      version: versions.find((version) => normalizeText(version?.final_signed_file_path || version?.final_signed_file_url)) || null,
      signers: signingSummary?.signers || [],
      finalCompletion,
      launchChain,
      signingActivity,
    })
    const safePacket = packet ? { ...packet } : null
    if (safePacket) delete safePacket.events

    return {
      packetType: normalizedPacketType,
      state: lifecycle.state,
      signingStatus,
      packet: safePacket,
      versions,
      signingSummary,
      signingActivity,
      completionCertificate,
      finalCompletion,
      operationalStatus,
      warnings,
      actionHint: lifecycle.reason,
    }
  })().then((value) => {
    cachedPacketStatuses.set(cacheKey, {
      value,
      cachedAt: Date.now(),
    })
    return value
  }).finally(() => {
    pendingPacketStatuses.delete(cacheKey)
  })

  pendingPacketStatuses.set(cacheKey, resolutionPromise)
  return resolutionPromise
}

export function resolveDocumentPacketActionState({
  packetType,
  state,
  isBusy = false,
  warningCount = 0,
} = {}) {
  const labelBase = resolvePacketLabel(packetType)
  const normalizedState = normalizeKey(state)
  const suffix = warningCount > 0 ? ' (Limited)' : ''

  if (normalizedState === 'no_packet') {
    return { actionKey: 'generate', label: `Generate ${labelBase}` }
  }
  if (normalizedState === 'draft') {
    return { actionKey: 'edit', label: `Edit ${labelBase}` }
  }
  if (normalizedState === 'pdf_generated') {
    return { actionKey: 'edit', label: `Edit ${labelBase}` }
  }
  if (normalizedState === 'ready_to_send') {
    return { actionKey: 'send', label: `Send ${labelBase}` }
  }
  if (['sent', 'partially_signed'].includes(normalizedState)) {
    return { actionKey: 'view', label: `View ${labelBase}` }
  }
  if (normalizedState === 'completed') {
    return { actionKey: 'view_signed', label: `View Signed ${labelBase}` }
  }
  if (normalizedState === 'finalising') {
    return { actionKey: 'view', label: `Finalising ${labelBase}` }
  }
  if (normalizedState === 'publishing') {
    return { actionKey: 'view_signed', label: `View Signed ${labelBase}` }
  }
  if (normalizedState === 'archived') {
    return { actionKey: 'open', label: `Open ${labelBase}` }
  }
  if (isBusy) {
    return { actionKey: 'open', label: 'Working…', disabled: true }
  }
  return { actionKey: 'open', label: `Open ${labelBase}${suffix}` }
}

export function formatPacketStatusMeta(statusResult = null) {
  const packet = statusResult?.packet || null
  const stamp =
    normalizeText(packet?.updated_at) ||
    normalizeText(packet?.sent_at) ||
    normalizeText(packet?.completed_at) ||
    ''
  if (!stamp) return ''
  const parsed = new Date(stamp)
  if (Number.isNaN(parsed.getTime())) return ''
  return `Updated ${parsed.toLocaleString('en-ZA')}`
}
