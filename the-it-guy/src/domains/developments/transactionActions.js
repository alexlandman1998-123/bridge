// developments owns these operations and their existing recovery behavior.
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { getDetailedStageFromMainStage, getMainStageFromDetailedStage, getMainStageIndex } from '../../core/transactions/stageConfig'
import { isBondFinanceType } from '../../core/transactions/financeType'
import { SUBPROCESS_TYPES } from '../../core/transactions/roleConfig'
import { updateTransactionLifecycleStage } from '../transactions/lifecycleActions.js'
import { normalizeReservationStatus } from '../documents/uploadAutomation.js'
import { deleteTransactionEverywhere } from '../transactions/deletionApi.js'
import { prepareFirmFirstTransferRoleplayer, persistTransactionRolePlayersIfPossible, propagateTransactionRoleplayersIfPossible, resolveConfiguredDevelopmentRolePlayers, createTransactionFromWizard } from '../transactions/creationApi.js'
import { fetchTransactionRolePlayersIfPossible } from '../bond/financeRead.js'

export async function recordPublicDevelopmentVisualEvents({
  slug,
  sessionId,
  events = [],
} = {}) {
  const client = requireClient()
  if (!normalizeTextValue(slug) || !sessionId || !events.length) return 0
  const { data, error } = await client.rpc('record_public_development_visual_events', {
    requested_slug: normalizeTextValue(slug),
    requested_session_id: sessionId,
    requested_events: events.slice(0, 25),
  })
  if (error) {
    if (isMissingSchemaError(error)) return 0
    throw error
  }
  return Number(data) || 0
}

export async function deleteDevelopment(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const { data: units, error: unitsLookupError } = await client
    .from('units')
    .select('id')
    .eq('development_id', developmentId)

  if (unitsLookupError && !isMissingTableError(unitsLookupError, 'units')) {
    throw unitsLookupError
  }

  const unitIds = (units || []).map((item) => item.id).filter(Boolean)
  const transactionsById = new Map()

  let linkedTransactionsByDevelopment = await client
    .from('transactions')
    .select('id, unit_id')
    .eq('development_id', developmentId)

  if (
    linkedTransactionsByDevelopment.error &&
    isMissingColumnError(linkedTransactionsByDevelopment.error, 'development_id')
  ) {
    linkedTransactionsByDevelopment = { data: [], error: null }
  }

  if (
    linkedTransactionsByDevelopment.error &&
    !isMissingTableError(linkedTransactionsByDevelopment.error, 'transactions')
  ) {
    throw linkedTransactionsByDevelopment.error
  }

  for (const row of linkedTransactionsByDevelopment.data || []) {
    if (row?.id) {
      transactionsById.set(row.id, row)
    }
  }

  if (unitIds.length) {
    let linkedTransactionsByUnit = await client.from('transactions').select('id, unit_id').in('unit_id', unitIds)

    if (linkedTransactionsByUnit.error && isMissingColumnError(linkedTransactionsByUnit.error, 'unit_id')) {
      linkedTransactionsByUnit = { data: [], error: null }
    }

    if (linkedTransactionsByUnit.error && !isMissingTableError(linkedTransactionsByUnit.error, 'transactions')) {
      throw linkedTransactionsByUnit.error
    }

    for (const row of linkedTransactionsByUnit.data || []) {
      if (row?.id) {
        transactionsById.set(row.id, row)
      }
    }
  }

  const linkedTransactions = [...transactionsById.values()]
  for (const transaction of linkedTransactions) {
    // Sequential delete keeps cleanup deterministic for linked workflow/doc records.
    await deleteTransactionEverywhere({
      transactionId: transaction.id,
      unitId: transaction.unit_id || null,
    })
  }

  const lingeringByDevelopment = await client.from('transactions').delete().eq('development_id', developmentId)

  if (
    lingeringByDevelopment.error &&
    !isMissingTableError(lingeringByDevelopment.error, 'transactions') &&
    !isMissingColumnError(lingeringByDevelopment.error, 'development_id')
  ) {
    throw lingeringByDevelopment.error
  }

  if (unitIds.length) {
    const lingeringByUnit = await client.from('transactions').delete().in('unit_id', unitIds)

    if (
      lingeringByUnit.error &&
      !isMissingTableError(lingeringByUnit.error, 'transactions') &&
      !isMissingColumnError(lingeringByUnit.error, 'unit_id')
    ) {
      throw lingeringByUnit.error
    }
  }

  const deleteByDevelopmentId = async (table) => {
    const { error } = await client.from(table).delete().eq('development_id', developmentId)
    if (error && !isMissingTableError(error, table)) {
      throw error
    }
  }

  const { data: attorneyConfigs, error: attorneyConfigLookupError } = await client
    .from('development_attorney_configs')
    .select('id')
    .eq('development_id', developmentId)

  if (attorneyConfigLookupError && !isMissingTableError(attorneyConfigLookupError, 'development_attorney_configs')) {
    throw attorneyConfigLookupError
  }

  const attorneyConfigIds = (attorneyConfigs || []).map((item) => item.id).filter(Boolean)
  if (attorneyConfigIds.length) {
    const { error } = await client
      .from('development_attorney_required_closeout_docs')
      .delete()
      .in('development_attorney_config_id', attorneyConfigIds)
    if (error && !isMissingTableError(error, 'development_attorney_required_closeout_docs')) {
      throw error
    }
  }

  const { data: bondConfigs, error: bondConfigLookupError } = await client
    .from('development_bond_configs')
    .select('id')
    .eq('development_id', developmentId)

  if (bondConfigLookupError && !isMissingTableError(bondConfigLookupError, 'development_bond_configs')) {
    throw bondConfigLookupError
  }

  const bondConfigIds = (bondConfigs || []).map((item) => item.id).filter(Boolean)
  if (bondConfigIds.length) {
    const { error } = await client
      .from('development_bond_required_closeout_docs')
      .delete()
      .in('development_bond_config_id', bondConfigIds)
    if (error && !isMissingTableError(error, 'development_bond_required_closeout_docs')) {
      throw error
    }
  }

  await deleteByDevelopmentId('document_requirements')
  await deleteByDevelopmentId('development_documents')
  await deleteByDevelopmentId('development_financials')
  await deleteByDevelopmentId('development_profiles')
  await deleteByDevelopmentId('development_settings')
  await deleteByDevelopmentId('development_attorney_configs')
  await deleteByDevelopmentId('development_bond_configs')
  await deleteByDevelopmentId('units')

  const { error: developmentDeleteError } = await client.from('developments').delete().eq('id', developmentId)
  if (developmentDeleteError) {
    throw developmentDeleteError
  }

  return true
}

export async function updateDevelopmentTransactionSalesPrice(transactionId, salesPrice) {
  const client = requireClient()
  const normalizedTransactionId = normalizeTextValue(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const normalizedPrice = normalizeOptionalNumber(salesPrice)
  const payload = {
    sales_price: normalizedPrice,
    purchase_price: normalizedPrice,
    updated_at: new Date().toISOString(),
  }

  let result = await client.from('transactions').update(payload).eq('id', normalizedTransactionId)

  if (
    result.error &&
    (isMissingColumnError(result.error, 'sales_price') ||
      isMissingColumnError(result.error, 'purchase_price') ||
      isMissingColumnError(result.error, 'updated_at'))
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(result.error, 'sales_price')) {
      delete fallbackPayload.sales_price
    }
    if (isMissingColumnError(result.error, 'purchase_price')) {
      delete fallbackPayload.purchase_price
    }
    if (isMissingColumnError(result.error, 'updated_at')) {
      delete fallbackPayload.updated_at
    }
    result = await client.from('transactions').update(fallbackPayload).eq('id', normalizedTransactionId)
  }

  if (result.error) {
    throw result.error
  }

  return true
}

export async function bulkUpdateUnitLifecycle(entries = [], input = {}) {
  const client = requireClient()
  const targets = Array.isArray(entries) ? entries.filter((item) => item?.unitId) : []

  if (!targets.length) {
    throw new Error('Select at least one unit to update.')
  }

  const mode = String(input.mode || '')
    .trim()
    .toLowerCase()

  if (!['available', 'in_progress', 'registered'].includes(mode)) {
    throw new Error('Choose a valid bulk status.')
  }

  let resolvedMainStage = 'AVAIL'
  let resolvedDetailedStage = 'Available'

  if (mode === 'in_progress') {
    resolvedMainStage = normalizeMainStage(input.mainStage, 'Finance Pending')
    if (!['DEP', 'OTP', 'FIN', 'ATTY', 'XFER'].includes(resolvedMainStage)) {
      throw new Error('Choose where the selected matters currently are in the transaction journey.')
    }
    resolvedDetailedStage = getDetailedStageFromMainStage(resolvedMainStage)
  } else if (mode === 'registered') {
    resolvedMainStage = 'REG'
    resolvedDetailedStage = 'Registered'
  }

  const subprocessType =
    mode === 'in_progress' &&
    SUBPROCESS_TYPES.includes(
      String(input.subprocessType || '')
        .trim()
        .toLowerCase(),
    )
      ? String(input.subprocessType || '')
          .trim()
          .toLowerCase()
      : null

  if (mode === 'in_progress' && !subprocessType) {
    throw new Error('Select the subprocess currently carrying the matter.')
  }

  const progressNote = normalizeNullableText(input.progressNote)
  const listPrice = normalizeOptionalNumber(input.listPrice)
  const salesPrice = normalizeOptionalNumber(input.salesPrice)

  if (mode === 'registered' && (listPrice === null || salesPrice === null)) {
    throw new Error('List price and sales price are required when bulk-marking matters as registered.')
  }

  const subprocessLabel =
    subprocessType === 'finance'
      ? 'Finance workflow'
      : subprocessType === 'bond'
        ? 'Bond workflow'
        : subprocessType === 'transfer' || subprocessType === 'attorney'
          ? 'Transfer workflow'
          : null
  const now = new Date().toISOString()

  for (const entry of targets) {
    let unitPayload = {
      status: resolvedDetailedStage,
    }

    if (mode === 'registered') {
      unitPayload = {
        ...unitPayload,
        list_price: listPrice,
        current_price: salesPrice,
        price: listPrice,
      }
    }

    let unitUpdate = await client.from('units').update(unitPayload).eq('id', entry.unitId)

    if (
      unitUpdate.error &&
      (isMissingColumnError(unitUpdate.error, 'list_price') || isMissingColumnError(unitUpdate.error, 'current_price'))
    ) {
      const fallbackUnitPayload = {
        status: resolvedDetailedStage,
        ...(mode === 'registered' ? { price: listPrice } : {}),
      }
      unitUpdate = await client.from('units').update(fallbackUnitPayload).eq('id', entry.unitId)
    }

    if (unitUpdate.error) {
      throw unitUpdate.error
    }

    if (!entry.transactionId) {
      continue
    }

    if (mode !== 'available') {
      await assertReservationDepositGateForTransition(client, {
        transactionId: entry.transactionId,
        nextMainStage: resolvedMainStage,
        nextDetailedStage: resolvedDetailedStage,
      })
    }

    const transactionPayload = {
      stage: resolvedDetailedStage,
      current_main_stage: resolvedMainStage,
      is_active: mode !== 'available',
      updated_at: now,
    }

    if (mode === 'available') {
      transactionPayload.current_sub_stage_summary = null
      transactionPayload.next_action = 'Unit reset to available.'
      transactionPayload.comment = 'Unit reset to available.'
    }

    if (mode === 'in_progress') {
      const summary = progressNote ? `${subprocessLabel} • ${progressNote}` : subprocessLabel
      transactionPayload.current_sub_stage_summary = summary
      transactionPayload.next_action = progressNote || `Currently in ${subprocessLabel?.toLowerCase() || 'workflow'}.`
      transactionPayload.comment = transactionPayload.next_action
    }

    if (mode === 'registered') {
      transactionPayload.current_sub_stage_summary = 'Registered'
      transactionPayload.sales_price = salesPrice
      transactionPayload.next_action = 'Registered'
      transactionPayload.comment = 'Marked as registered in bulk update.'
    }

    let transactionUpdate = await client.from('transactions').update(transactionPayload).eq('id', entry.transactionId)

    if (
      transactionUpdate.error &&
      (isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary') ||
        isMissingColumnError(transactionUpdate.error, 'sales_price') ||
        isMissingColumnError(transactionUpdate.error, 'comment') ||
        isMissingColumnError(transactionUpdate.error, 'next_action') ||
        isMissingColumnError(transactionUpdate.error, 'current_main_stage') ||
        isMissingColumnError(transactionUpdate.error, 'is_active'))
    ) {
      const fallbackPayload = { ...transactionPayload }
      if (isMissingColumnError(transactionUpdate.error, 'current_sub_stage_summary')) {
        delete fallbackPayload.current_sub_stage_summary
      }
      if (isMissingColumnError(transactionUpdate.error, 'sales_price')) {
        delete fallbackPayload.sales_price
      }
      if (isMissingColumnError(transactionUpdate.error, 'comment')) {
        delete fallbackPayload.comment
      }
      if (isMissingColumnError(transactionUpdate.error, 'next_action')) {
        delete fallbackPayload.next_action
      }
      if (isMissingColumnError(transactionUpdate.error, 'current_main_stage')) {
        delete fallbackPayload.current_main_stage
      }
      if (isMissingColumnError(transactionUpdate.error, 'is_active')) {
        delete fallbackPayload.is_active
      }
      transactionUpdate = await client.from('transactions').update(fallbackPayload).eq('id', entry.transactionId)
    }

    if (transactionUpdate.error) {
      throw transactionUpdate.error
    }
  }

  return {
    success: true,
    count: targets.length,
    stage: resolvedDetailedStage,
  }
}

export async function assertReservationDepositGateForTransition(
  client,
  { transactionId, previousMainStage = null, nextMainStage = null, nextDetailedStage = null } = {},
) {
  if (!transactionId) {
    return
  }

  let transactionQuery = await client
    .from('transactions')
    .select('id, stage, current_main_stage, reservation_required, reservation_status')
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'current_main_stage') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status'))
  ) {
    transactionQuery = await client.from('transactions').select('id, stage').eq('id', transactionId).maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data || null
  if (!transaction || !transaction.reservation_required) {
    return
  }

  const currentMain =
    previousMainStage ||
    normalizeMainStage(transaction.current_main_stage, normalizeStage(transaction.stage, 'Available'))
  const targetMain = normalizeMainStage(
    nextMainStage || getMainStageFromDetailedStage(nextDetailedStage || transaction.stage || 'Available'),
    nextDetailedStage || transaction.stage || 'Available',
  )
  const depositStageIndex = getMainStageIndex('DEP')
  const currentStageIndex = getMainStageIndex(currentMain)
  const targetStageIndex = getMainStageIndex(targetMain)

  // Enforce only when trying to advance out of reservation/deposit stages.
  const isAdvancingPastDeposit = currentStageIndex <= depositStageIndex && targetStageIndex > depositStageIndex
  if (!isAdvancingPastDeposit) {
    return
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, {
    required: true,
  })
  if (reservationStatus === 'verified') {
    return
  }

  throw new Error('Reservation deposit must be verified before moving this transaction past the reservation stage.')
}

const DEVELOPMENT_UNIT_STATUS_TRANSACTION_PROFILE = {
  reserved: { stage: 'Reserved', lifecycleStage: null },
  otp_signed: { stage: 'OTP Signed', lifecycleStage: 'otp' },
  finance_pending: { stage: 'Finance Pending', lifecycleStage: 'finance' },
  proceed_to_attorneys: { stage: 'Proceed to Attorneys', lifecycleStage: 'transfer' },
  transfer_in_progress: { stage: 'Transfer in Progress', lifecycleStage: 'transfer' },
  sold: { stage: 'OTP Signed', lifecycleStage: 'otp' },
  registered: { stage: 'Registered', lifecycleStage: 'registration', completed: true },
  complete: { stage: 'Registered', lifecycleStage: 'registration', completed: true },
  completed: { stage: 'Registered', lifecycleStage: 'registration', completed: true },
}

function getDevelopmentUnitStatusTransactionProfile(unitStatus = '') {
  const key = String(unitStatus || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return DEVELOPMENT_UNIT_STATUS_TRANSACTION_PROFILE[key] || { stage: 'Reserved', lifecycleStage: null }
}

export async function createDevelopmentTransactionFromUnitStatus({
  developmentId,
  unitId,
  unitNumber = '',
  unitStatus = 'Reserved',
  salesPrice = null,
} = {}) {
  if (!developmentId || !unitId) {
    throw new Error('A development and unit are required to create the transaction.')
  }

  const client = requireClient()
  const profile = getDevelopmentUnitStatusTransactionProfile(unitStatus)
  const result = await createTransactionFromWizard({
    setup: {
      transactionType: 'developer_sale',
      developmentId,
      unitId,
      salesPrice: salesPrice === null || salesPrice === undefined ? '' : String(salesPrice),
      financeType: '',
      financeManagedBy: 'client',
      purchaserType: 'individual',
    },
    finance: {},
    status: {
      stage: profile.stage,
      stageDate: new Date().toISOString().slice(0, 10),
      riskStatus: 'On Track',
      nextAction: `Complete buyer, finance and partner capture for Unit ${unitNumber || ''}.`.trim(),
      notes: `Transaction created from unit status: ${unitStatus}.`,
    },
    options: {
      allowIncomplete: true,
      deferFinanceType: true,
      // A historical unit-status record deliberately has no buyer yet. Creating
      // its buyer portal at this point makes the otherwise valid transaction
      // lifecycle fail before it can be linked to the unit.
      skipClientPortalSetup: true,
      creationOrigin: 'development_unit_status',
      sourceContext: {
        originLabel: 'Development unit status update',
      },
    },
  })

  if (profile.lifecycleStage && result?.transactionId) {
    await updateTransactionLifecycleStage(result.transactionId, profile.lifecycleStage, {
      completed: Boolean(profile.completed),
      status: profile.completed ? 'completed' : 'active',
      source: 'development_unit_status_auto_create',
      note: `Created from Unit ${unitNumber || ''} marked ${unitStatus}.`.trim(),
    })
  }

  // `createTransactionFromWizard` writes its canonical stage back to units.
  // Preserve the operator's stock label (for example Sold) while the linked
  // transaction stores its precise workflow stage (OTP Signed).
  const unitResult = await client.from('units').update({ status: unitStatus }).eq('id', unitId)
  if (unitResult.error) throw unitResult.error

  return {
    ...result,
    stage: profile.stage,
    lifecycleStage: profile.lifecycleStage,
  }
}

function isRecoverableDevelopmentDefaultRoleplayer(existing = {}, selection = {}) {
  const source = normalizeTextValue(existing.selectionSource || existing.snapshot?.source).toLowerCase()
  const isDevelopmentDefault = [
    'development_default',
    'connected_partner',
    'preferred_partner',
    'invited_partner',
    'development_configuration_default',
  ].includes(source)
  if (!isDevelopmentDefault) return false

  const sameId = (left, right) => left && right && String(left) === String(right)
  if (sameId(existing.partnerRelationshipId, selection.partnerRelationshipId)) return true
  if (sameId(existing.organisationId, selection.partnerOrganisationId)) return true
  if (existing.emailAddress && selection.email && String(existing.emailAddress).toLowerCase() === String(selection.email).toLowerCase()) return true
  return Boolean(existing.partnerName && selection.partnerName && String(existing.partnerName).trim().toLowerCase() === String(selection.partnerName).trim().toLowerCase())
}

export async function applyDevelopmentConfigurationDefaults(developmentId, settings = {}) {
  const emptyResult = { updated: 0, skipped: 0, failed: 0, attorneysUpdated: 0, bondOriginatorsUpdated: 0, attorneyMattersUpdated: 0, lastError: '' }
  if (!developmentId) return emptyResult

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const configured = resolveConfiguredDevelopmentRolePlayers(settings, { includeBondOriginator: true })
  if (!configured.length) return emptyResult

  const transactionsResult = await client
    .from('transactions')
    .select('id, transaction_reference, matter_number, finance_type, attorney, bond_originator, buyer_id, finance_managed_by')
    .eq('development_id', developmentId)

  if (transactionsResult.error) throw transactionsResult.error

  let updated = 0
  let skipped = 0
  let failed = 0
  let attorneysUpdated = 0
  let bondOriginatorsUpdated = 0
  let attorneyMattersUpdated = 0
  let lastError = ''
  for (const transaction of transactionsResult.data || []) {
    try {
      const existingRolePlayers = await fetchTransactionRolePlayersIfPossible(client, transaction.id)
      const selections = configured.filter((selection) => {
        const existingRolePlayer = existingRolePlayers.find((item) => item.roleType === selection.roleType)
        const retryIncompleteDefault = existingRolePlayer && isRecoverableDevelopmentDefaultRoleplayer(existingRolePlayer, selection)
        // Do not replace a manually-selected attorney/originator. A matching
        // development default is different: it may have been stored before
        // the canonical attorney matter was created, so retry its propagation.
        if (existingRolePlayer && !retryIncompleteDefault) return false
        if (selection.roleType === 'transfer_attorney') return !normalizeTextValue(transaction.attorney) || retryIncompleteDefault
        // Historical unit-status transactions often predate finance capture.
        // Route those unknown finance records to the configured originator so
        // they can be worked; explicit cash deals remain excluded.
        const financeType = normalizeTextValue(transaction.finance_type).toLowerCase()
        const financeIsUnknown = !financeType || ['unknown', 'pending', 'tbc'].includes(financeType)
        return (financeIsUnknown || isBondFinanceType(financeType)) && (!normalizeTextValue(transaction.bond_originator) || retryIncompleteDefault)
      })
      if (!selections.length) {
        skipped += 1
        continue
      }

      await persistTransactionRolePlayersIfPossible(client, {
        transactionId: transaction.id,
        rolePlayers: selections.map(prepareFirmFirstTransferRoleplayer),
        actorProfile,
      })
      const attorney = selections.find((item) => item.roleType === 'transfer_attorney')
      const bondOriginator = selections.find((item) => item.roleType === 'bond_originator')
      const matterNumber = normalizeTextValue(transaction.matter_number) ||
        normalizeTextValue(transaction.transaction_reference) ||
        `MAT-${String(transaction.id).replaceAll('-', '').slice(0, 10).toUpperCase()}`
      await updateRecordByIdWithMissingColumnFallback(
        client,
        'transactions',
        transaction.id,
        {
          attorney: attorney?.partnerName || transaction.attorney || null,
          assigned_attorney_email: attorney?.email || null,
          matter_number: matterNumber,
          bond_originator: bondOriginator?.partnerName || transaction.bond_originator || null,
          assigned_bond_originator_email: bondOriginator?.email || null,
          updated_at: new Date().toISOString(),
        },
        'id',
      )
      const propagationResult = await propagateTransactionRoleplayersIfPossible(client, {
        transactionId: transaction.id,
        transaction: {
          ...transaction,
          attorney: attorney?.partnerName || transaction.attorney || null,
          assigned_attorney_email: attorney?.email || null,
          bond_originator: bondOriginator?.partnerName || transaction.bond_originator || null,
          assigned_bond_originator_email: bondOriginator?.email || null,
        },
        rolePlayers: selections.map(prepareFirmFirstTransferRoleplayer),
        actorProfile,
        actorRole: actorProfile.role,
        buyerId: transaction.buyer_id || null,
        financeType: transaction.finance_type || 'cash',
      })
      updated += 1
      if (attorney) attorneysUpdated += 1
      if (bondOriginator) bondOriginatorsUpdated += 1
      attorneyMattersUpdated += propagationResult?.attorneyAssignments?.length || 0
    } catch (error) {
      console.warn('[applyDevelopmentConfigurationDefaults] transaction skipped', transaction.id, error)
      failed += 1
      lastError = error?.message || 'An assignment could not be propagated to its partner workspace.'
    }
  }

  return { updated, skipped, failed, attorneysUpdated, bondOriginatorsUpdated, attorneyMattersUpdated, lastError }
}
