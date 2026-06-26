function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function toTitleLabel(value) {
  return normalizeText(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function isCompleteStatus(value) {
  const normalized = normalizeKey(value)
  return ['complete', 'completed', 'submitted', 'verified', 'approved'].includes(normalized)
}

function isRegisteredStage(transaction = {}) {
  const mainStage = normalizeText(transaction.current_main_stage || transaction.currentMainStage).toUpperCase()
  const lifecycle = normalizeKey(transaction.lifecycle_state || transaction.lifecycleState)
  const stage = normalizeKey(transaction.stage || transaction.detailed_stage || transaction.detailedStage)
  return ['REG', 'COMPLETE', 'REGISTERED'].includes(mainStage) || ['registered', 'completed'].includes(lifecycle) || stage.includes('registration')
}

function action({
  id,
  title,
  description,
  targetMenu = 'overview',
  priority = 'Normal',
  statusLabel = 'On Track',
  tone = 'success',
  primaryButtonLabel = 'Open',
} = {}) {
  return {
    id,
    title,
    description,
    targetMenu,
    priority,
    statusLabel,
    tone,
    primaryButtonLabel,
  }
}

function inferActionQueue({
  transaction = {},
  relationshipSummary = null,
  operationsSummary = null,
  mandateProfile = null,
  onboardingStatus = '',
} = {}) {
  const queue = []
  const missingRequiredRows = Array.isArray(relationshipSummary?.missingRequiredRows)
    ? relationshipSummary.missingRequiredRows
    : []
  const missingSignerRoles = Array.isArray(mandateProfile?.missingSignerRoles)
    ? mandateProfile.missingSignerRoles
    : []
  const reservation = operationsSummary?.reservation || null
  const handover = operationsSummary?.handover || null
  const reservationStatus = normalizeKey(reservation?.status || transaction.reservation_status || transaction.reservationStatus)
  const reservationRequired = Boolean(reservation?.required || transaction.reservation_required || transaction.reservationRequired)
  const onboardingComplete = isCompleteStatus(onboardingStatus || operationsSummary?.onboarding?.status)
  const shouldReviewReservationProof = reservationRequired && ['paid', 'uploaded', 'pending_review'].includes(reservationStatus)
  const shouldRequestReservationProof = reservationRequired && !['verified', 'not_required', 'paid', 'uploaded', 'pending_review'].includes(reservationStatus)

  if (missingRequiredRows.length) {
    queue.push(action({
      id: 'developer_relationship_setup',
      title: 'Complete developer transaction setup',
      description: `Capture ${missingRequiredRows.map((row) => row.label).join(', ')} before this development file moves forward.`,
      targetMenu: 'onboarding',
      priority: 'High',
      statusLabel: 'Attention',
      tone: 'danger',
      primaryButtonLabel: 'Open Setup',
    }))
  }

  if (mandateProfile?.developerAgentMandateRequired && missingSignerRoles.length) {
    queue.push(action({
      id: 'developer_agent_mandate_signers',
      title: 'Complete developer-agent mandate signers',
      description: `Add ${missingSignerRoles.map((signer) => signer.label).join(', ')} so the mandate can be prepared without using the private seller flow.`,
      targetMenu: 'onboarding',
      priority: 'High',
      statusLabel: 'Attention',
      tone: 'danger',
      primaryButtonLabel: 'Open Parties',
    }))
  } else if (mandateProfile?.developerAgentMandateRequired && mandateProfile?.readyForMandate) {
    queue.push(action({
      id: 'developer_agent_mandate_prepare',
      title: 'Prepare developer-agent mandate',
      description: 'The developer and selling agent are signer-ready. Prepare or review the mandate packet before progressing the file.',
      targetMenu: 'documents',
      priority: 'Medium',
      statusLabel: 'Waiting',
      tone: 'warning',
      primaryButtonLabel: 'Open Mandate',
    }))
  }

  if (shouldReviewReservationProof) {
    queue.push(action({
      id: 'reservation_proof_review',
      title: 'Review reservation proof of payment',
      description: 'The buyer has supplied or indicated payment. Verify the reservation deposit before the sale progresses.',
      targetMenu: 'financials',
      priority: 'High',
      statusLabel: 'Waiting',
      tone: 'warning',
      primaryButtonLabel: 'Open Reservation',
    }))
  } else if (shouldRequestReservationProof) {
    queue.push(action({
      id: 'reservation_deposit_request',
      title: 'Send reservation deposit instructions',
      description: 'Reservation is required for this development sale. Send the payment instructions and collect proof of payment.',
      targetMenu: 'financials',
      priority: 'Medium',
      statusLabel: 'Waiting',
      tone: 'warning',
      primaryButtonLabel: 'Open Reservation',
    }))
  }

  if (!onboardingComplete) {
    queue.push(action({
      id: 'buyer_onboarding',
      title: 'Complete buyer onboarding',
      description: 'Capture buyer details, purchase structure, and required documents before finance and transfer handoff.',
      targetMenu: 'onboarding',
      priority: queue.length ? 'Medium' : 'High',
      statusLabel: queue.length ? 'Waiting' : 'Attention',
      tone: queue.length ? 'warning' : 'danger',
      primaryButtonLabel: 'Open Onboarding',
    }))
  }

  if (isRegisteredStage(transaction) && handover?.enabled && !handover?.ready) {
    const blockers = Array.isArray(handover.blockers) ? handover.blockers : []
    queue.push(action({
      id: 'handover_blockers',
      title: 'Clear handover blockers',
      description: blockers[0] || 'Complete inspection, meter readings, documents, and snag follow-through before practical handover.',
      targetMenu: 'handover',
      priority: 'High',
      statusLabel: 'Attention',
      tone: 'danger',
      primaryButtonLabel: 'Open Handover',
    }))
  }

  return queue
}

export function buildDeveloperTransactionReadinessProfile({
  transaction = {},
  relationshipSummary = null,
  operationsSummary = null,
  mandateProfile = null,
  onboardingStatus = '',
} = {}) {
  if (!relationshipSummary?.relationshipProfile?.isDeveloperSale && !operationsSummary?.isDeveloperSale) {
    return null
  }

  const actionQueue = inferActionQueue({
    transaction,
    relationshipSummary,
    operationsSummary,
    mandateProfile,
    onboardingStatus,
  })
  const nextAction = actionQueue[0] || action({
    id: 'developer_transaction_review',
    title: 'Progress developer transaction workflow',
    description: 'Core developer-sale gates are clear. Keep finance, transfer, handover, and roleplayer updates aligned.',
    targetMenu: 'transfer',
    priority: 'Normal',
    statusLabel: 'On Track',
    tone: 'success',
    primaryButtonLabel: 'Open Workflow',
  })
  const hasDanger = actionQueue.some((item) => item.tone === 'danger')
  const hasWarning = actionQueue.some((item) => item.tone === 'warning')
  const healthTone = hasDanger ? 'danger' : hasWarning ? 'warning' : 'success'
  const healthLabel = hasDanger ? 'Attention' : hasWarning ? 'Waiting' : 'On Track'
  const reservationStatusLabel = operationsSummary?.reservation?.statusLabel || toTitleLabel(transaction.reservation_status || 'not_required')

  return {
    isDeveloperSale: true,
    healthLabel,
    healthTone,
    priority: nextAction.priority,
    nextAction: {
      ...nextAction,
      statusLabel: nextAction.statusLabel || healthLabel,
    },
    actionQueue,
    blockers: actionQueue.filter((item) => item.tone === 'danger'),
    warnings: actionQueue.filter((item) => item.tone === 'warning'),
    summary: {
      reservationStatusLabel,
      mandateLabel: mandateProfile?.mandateLabel || '',
      relationshipLabel: relationshipSummary?.summaryLabel || '',
      handoverStatusLabel: operationsSummary?.handover?.statusLabel || '',
    },
  }
}

function isDeveloperSaleRow(row = {}) {
  const transaction = row?.transaction || row || {}
  const normalizedType = normalizeKey(transaction.transaction_type || transaction.transactionType || transaction.type)
  if (['private', 'private_property', 'second_hand'].includes(normalizedType)) return false
  if (['developer_sale', 'development', 'developer'].includes(normalizedType)) return true
  return Boolean(
    row?.development?.id ||
      row?.unit?.development_id ||
      row?.unit?.developmentId ||
      transaction.development_id ||
      transaction.developmentId,
  )
}

function buildRelationshipSummaryFromRow({ row = {}, transaction = {}, unit = {}, buyer = {} } = {}) {
  const developmentName = normalizeText(row?.development?.name || unit?.development?.name || transaction.developer_name || transaction.developer)
  const buyerName = normalizeText(buyer?.name || row?.buyerName || transaction.buyer_name)
  const assignedAgent = normalizeText(transaction.assigned_agent || row?.assignedAgent || row?.agent)
  const assignedAgentEmail = normalizeText(transaction.assigned_agent_email || row?.assignedAgentEmail || row?.agentEmail)
  const missingRequiredRows = []

  if (!developmentName) {
    missingRequiredRows.push({
      id: 'developer_contact',
      label: 'Developer',
      status: 'Missing',
    })
  }
  if (!buyerName) {
    missingRequiredRows.push({
      id: 'buyer',
      label: 'Buyer / Purchaser',
      status: 'Pending assignment',
    })
  }

  return {
    relationshipProfile: {
      isDeveloperSale: true,
      privateSellerMandateRequired: false,
      developerAgentMandateRequired: Boolean(assignedAgent || assignedAgentEmail),
    },
    summaryLabel: assignedAgent || assignedAgentEmail ? 'Developer sale with selling agent' : 'Developer direct sale',
    missingRequiredRows,
  }
}

function buildMandateProfileFromRow({ relationshipSummary = null, transaction = {}, row = {} } = {}) {
  const developerAgentMandateRequired = Boolean(relationshipSummary?.relationshipProfile?.developerAgentMandateRequired)
  const developerName = normalizeText(row?.development?.name || row?.unit?.development?.name || transaction.developer_name || transaction.developer)
  const agentName = normalizeText(transaction.assigned_agent || row?.assignedAgent || row?.agent)
  const agentEmail = normalizeText(transaction.assigned_agent_email || row?.assignedAgentEmail || row?.agentEmail)
  const requiredSigners = developerAgentMandateRequired
    ? [
        {
          role: 'developer_contact',
          label: 'Developer',
          signerName: developerName,
          signerEmail: normalizeText(transaction.developer_email || row?.development?.email),
          configured: Boolean(developerName),
          required: true,
        },
        {
          role: 'agent',
          label: 'Selling Agent',
          signerName: agentName,
          signerEmail: agentEmail,
          configured: Boolean(agentName && agentEmail),
          required: true,
        },
      ]
    : []
  const missingSignerRoles = requiredSigners.filter((signer) => !signer.configured)

  return {
    developerAgentMandateRequired,
    mandateLabel: developerAgentMandateRequired ? 'Developer-agent mandate' : 'No selling-agent mandate',
    readyForMandate: developerAgentMandateRequired ? missingSignerRoles.length === 0 : true,
    missingSignerRoles,
  }
}

function buildOperationsSummaryFromRow({ row = {}, transaction = {} } = {}) {
  const handover = row?.handover || {}
  const snagSummary = row?.snagSummary || row?.snags || {}
  const openSnagCount = Number(snagSummary.openCount || snagSummary.open_count || 0)
  const handoverEnabled = Boolean(row?.developmentSettings?.handover_enabled ?? row?.developmentSettings?.handoverEnabled ?? true)
  const snagEnabled = Boolean(row?.developmentSettings?.snag_reporting_enabled ?? row?.developmentSettings?.snagTrackingEnabled ?? true)
  const clientIssues = Array.from({ length: Math.max(0, openSnagCount) }, () => ({ status: 'open' }))
  const checklist = [
    Boolean(handover.inspectionCompleted || handover.inspection_completed),
    Boolean(handover.keysHandedOver || handover.keys_handed_over),
    Boolean(handover.manualsHandedOver || handover.manuals_handed_over),
    Boolean((handover.electricityMeterReading || handover.electricity_meter_reading) && (handover.waterMeterReading || handover.water_meter_reading)),
  ]
  const completedChecklistCount = checklist.filter(Boolean).length
  const blockers = []
  const reservationRequired = Boolean(transaction.reservation_required || transaction.reservationRequired)
  const reservationStatus = normalizeKey(transaction.reservation_status || transaction.reservationStatus)

  if (reservationRequired && reservationStatus !== 'verified') {
    blockers.push('Reservation deposit is not verified.')
  }
  if (snagEnabled && openSnagCount > 0) {
    blockers.push(`${openSnagCount} open snag${openSnagCount === 1 ? ' still needs' : 's still need'} attention.`)
  }
  if (handoverEnabled && completedChecklistCount < checklist.length) {
    blockers.push('Handover checklist is not complete.')
  }

  return {
    isDeveloperSale: true,
    reservation: {
      required: reservationRequired,
      status: reservationRequired ? reservationStatus || 'pending' : 'not_required',
      statusLabel: reservationRequired ? toTitleLabel(reservationStatus || 'pending') : 'Not Required',
    },
    onboarding: {
      status: transaction.onboarding_status || row?.onboarding?.status || '',
    },
    handover: {
      enabled: handoverEnabled,
      ready: handoverEnabled && blockers.length === 0,
      statusLabel: toTitleLabel(handover.status || 'not_started'),
      blockers,
    },
    snags: {
      enabled: snagEnabled,
      openCount: openSnagCount,
    },
    clientIssues,
  }
}

export function buildDeveloperTransactionReadinessProfileFromRow(row = {}) {
  if (!isDeveloperSaleRow(row)) return null

  const transaction = row?.transaction || row || {}
  const unit = {
    ...(row?.unit || {}),
    development: row?.unit?.development || row?.development || null,
  }
  const buyer = row?.buyer || {
    name: row?.buyerName || row?.clientName || transaction.buyer_name || '',
    email: row?.buyerEmail || row?.clientEmail || transaction.buyer_email || '',
  }
  const relationshipSummary = buildRelationshipSummaryFromRow({ row, transaction, unit, buyer })
  const operationsSummary = buildOperationsSummaryFromRow({ row, transaction })
  const mandateProfile = buildMandateProfileFromRow({ relationshipSummary, transaction, row })

  return buildDeveloperTransactionReadinessProfile({
    transaction,
    relationshipSummary,
    operationsSummary,
    mandateProfile,
    onboardingStatus: transaction.onboarding_status || row?.onboarding?.status || '',
  })
}
