import {
  fetchDocumentPacket,
  getDocumentPacketSigningSummary,
  listDocumentPacketVersions,
  listDocumentPackets,
} from '../../lib/documentPacketsApi'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
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

function selectLatestPacket(rows = [], preferredPacketId = '') {
  const packetRows = Array.isArray(rows) ? rows : []
  const normalizedPreferred = normalizeText(preferredPacketId)
  if (normalizedPreferred) {
    const matched = packetRows.find((row) => normalizeText(row?.id) === normalizedPreferred)
    if (matched) return matched
  }
  return packetRows[0] || null
}

export async function resolveDocumentPacketStatus({
  packetType,
  packetId = '',
  transactionId = '',
  leadId = '',
  organisationId = null,
} = {}) {
  const normalizedPacketType = normalizeKey(packetType)
  const normalizedPacketId = normalizeText(packetId)
  const normalizedTransactionId = normalizeText(transactionId)
  const normalizedLeadId = normalizeLeadUuid(leadId)
  const warnings = []
  let packet = null
  let versions = []
  let signingSummary = null

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
    if (isPermissionDeniedError(error)) {
      warnings.push('Packet lookup was denied by RLS for this user context.')
    } else if (isMissingSchemaOrTableError(error)) {
      warnings.push('Packet tables are unavailable in this project.')
    } else {
      warnings.push(normalizeText(error?.message || 'Packet lookup failed.'))
    }
  }

  if (!packet) {
    try {
      const scoped = await listDocumentPackets({
        organisationId: normalizeText(organisationId) || null,
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

    try {
      signingSummary = await getDocumentPacketSigningSummary({
        packetId: packet.id,
        organisationId: normalizeText(organisationId) || null,
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

  const lifecycle = resolveLifecycleStateFromPacket({
    packet,
    versions,
    signingSummary,
  })

  return {
    packetType: normalizedPacketType,
    state: lifecycle.state,
    packet,
    versions,
    signingSummary,
    warnings,
    actionHint: lifecycle.reason,
  }
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
