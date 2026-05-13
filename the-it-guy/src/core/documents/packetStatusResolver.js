import {
  fetchDocumentPacket,
  getDocumentPacketSigningSummary,
  listDocumentPacketVersions,
  listDocumentPackets,
} from '../../lib/documentPacketsApi'

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
  const reviewState =
    normalizeKey(latestVersion?.validation_summary_json?.review_state) ||
    normalizeKey(latestVersion?.validation_summary_json?.editable_draft?.review_state)
  const lifecycleState =
    normalizeKey(packet?.source_context_json?.lifecycle_state) ||
    normalizeKey(packet?.source_context_json?.editableDraftReviewState)

  const hasFinalSignedVersion = versionRows.some(
    (version) =>
      normalizeText(version?.finalised_at) ||
      normalizeText(version?.final_signed_file_path) ||
      normalizeText(version?.final_signed_file_url),
  )
  const hasGeneratedVersion = versionRows.some((version) => normalizeKey(version?.render_status) === 'generated')
  const allSignersSigned = signingSummary?.allSignersSigned === true

  if (allSignersSigned || hasFinalSignedVersion || status === 'completed' || normalizeText(packet?.completed_at)) {
    return {
      state: 'SIGNED',
      reason: 'All signers completed and final signed artifact is available.',
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

  if (status === 'signing_prep') {
    if (lifecycleState === 'locked' || normalizeText(packet?.source_context_json?.lockedAt)) {
      return {
        state: 'LOCKED',
        reason: 'Document is locked and ready for signature sending.',
      }
    }
    return {
      state: 'APPROVED',
      reason: 'Packet draft is generated and ready to send.',
    }
  }

  if (status === 'generated' || hasGeneratedVersion) {
    if (lifecycleState === 'locked') {
      return {
        state: 'LOCKED',
        reason: 'Document is locked and cannot be edited.',
      }
    }
    if (lifecycleState === 'approved' || reviewState === 'approved') {
      return {
        state: 'APPROVED',
        reason: 'Document has been approved and is ready to lock/send.',
      }
    }
    if (reviewState === 'in_review') {
      return {
        state: 'IN_REVIEW',
        reason: 'Draft is in legal review and remains editable.',
      }
    }
    return {
      state: 'DRAFT',
      reason: 'Draft exists and can be reviewed or edited before sending.',
    }
  }

  if (status === 'archived') {
    return {
      state: 'ARCHIVED',
      reason: 'Packet is archived.',
    }
  }

  if (status === 'voided') {
    return {
      state: 'VOIDED',
      reason: 'Packet is voided.',
    }
  }

  if (['draft', 'ready_for_generation'].includes(status) || packet?.id) {
    if (lifecycleState === 'locked') {
      return {
        state: 'LOCKED',
        reason: 'Document is locked and cannot be edited.',
      }
    }
    if (lifecycleState === 'approved' || reviewState === 'approved') {
      return {
        state: 'APPROVED',
        reason: 'Document has been approved and is ready to lock/send.',
      }
    }
    if (reviewState === 'in_review') {
      return {
        state: 'IN_REVIEW',
        reason: 'Draft is in legal review and remains editable.',
      }
    }
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
  if (versionRows.some((version) => normalizeKey(version?.render_status) === 'failed')) return 'failed'
  if (versionRows.some((version) => normalizeKey(version?.render_status) === 'generated') || normalizeKey(packet?.status) === 'generated') return 'generated'
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
} = {}) {
  return [
    normalizeKey(packetType),
    normalizeText(packetId),
    normalizeText(transactionId),
    normalizeLeadUuid(leadId),
    normalizeNullableUuid(organisationId) || '',
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
  if (['sent_for_signature', 'viewed', 'signed', 'uploaded_signed', 'declined', 'failed'].includes(explicitSigningState)) {
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
  const generatedVersion = rows.find((version) => normalizeKey(version?.render_status) === 'generated')
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
} = {}) {
  const cacheKey = resolvePacketStatusCacheKey({
    packetType,
    packetId,
    transactionId,
    leadId,
    organisationId,
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
        packet = await fetchDocumentPacket(normalizedPacketId, { includeVersions: false, includeEvents: false })
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
    }

    const lifecycle = resolveLifecycleStateFromPacket({
      packet,
      versions,
      signingSummary,
    })
    const signingStatus = normalizedPacketType === 'mandate'
      ? normalizeMandateSigningStatus({ packet, versions, signingSummary })
      : null

    return {
      packetType: normalizedPacketType,
      state: lifecycle.state,
      signingStatus,
      packet,
      versions,
      signingSummary,
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
  if (normalizedState === 'in_review') {
    return { actionKey: 'edit', label: `Edit ${labelBase}` }
  }
  if (normalizedState === 'approved') {
    return { actionKey: 'send', label: `Send ${labelBase}` }
  }
  if (normalizedState === 'locked') {
    return { actionKey: 'send', label: `Send ${labelBase}` }
  }
  if (['sent', 'partially_signed'].includes(normalizedState)) {
    return { actionKey: 'view', label: `View ${labelBase}` }
  }
  if (normalizedState === 'signed') {
    return { actionKey: 'view_signed', label: `View Signed ${labelBase}` }
  }
  if (['archived', 'voided'].includes(normalizedState)) {
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
