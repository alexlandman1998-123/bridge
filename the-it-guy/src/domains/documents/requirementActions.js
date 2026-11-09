// Extracted without changing validation, persistence order or recovery behaviour.
import { resolveTransactionDocumentRequirements, TRANSACTION_CANONICAL_PERSISTENCE_MODES, maybeResolveTransactionDocumentRequirements } from '../../services/documents/transactionCanonicalDocumentRequirementService'
import { syncCanonicalRequiredDocumentsForTransactionContext } from '../../services/documents/documentRequestCanonicalTransactionSyncService'
import { normalizePurchaserType, deriveOnboardingConfiguration, getRequiredDocumentsForPurchaserType } from '../../lib/purchaserPersonas'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { isMissingColumnError, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { FINANCE_PRE_COLLECTION_DOCUMENT_KEYS, normalizeRequiredDocumentRows } from './requirementReadModel.js'
import { getMainStageIndex } from '../../core/transactions/stageConfig'
import { buildTemplateMap, normalizeRequiredStatus, statusFromLegacyFlags } from '../../core/documents/documentVaultArchitecture'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'

export async function ensureTransactionRequiredDocuments(
  client,
  {
    transactionId,
    purchaserType = 'individual',
    financeType = 'cash',
    reservationRequired = false,
    cashAmount = null,
    bondAmount = null,
    formData = {},
    stage = null,
    currentMainStage = null,
  },
  { sync = true, canonicalSourceRequired = false, emitAudit = true } = {},
) {
  if (!transactionId) {
    return []
  }

  if (canonicalSourceRequired) {
    let canonicalResolution
    try {
      canonicalResolution = await resolveTransactionDocumentRequirements({
        transactionId,
        client,
        formData: {
          ...(formData || {}),
          purchaser_type: formData?.purchaser_type || purchaserType,
          purchase_finance_type: formData?.purchase_finance_type || financeType,
          reservation_required: formData?.reservation_required ?? reservationRequired,
          cash_amount: formData?.cash_amount ?? cashAmount,
          bond_amount: formData?.bond_amount ?? bondAmount,
        },
        // Client-facing required-document rows are owned by the canonical
        // matrix below. Do not let the compatibility engine write a second,
        // overlapping legacy projection during transaction creation.
        writeLegacyProjection: false,
        persistenceMode: TRANSACTION_CANONICAL_PERSISTENCE_MODES.creationRpc,
      })
    } catch (cause) {
      const error = new Error('Canonical transaction requirement setup failed during creation.')
      error.code = 'CANONICAL_REQUIREMENT_SETUP_INCOMPLETE'
      error.cause = cause
      throw error
    }

    const canonicalInstances = canonicalResolution?.canonicalSync?.instances || []
    const requirements = canonicalResolution?.requirements || []
    const hasUnlinkedRequirement = requirements.some((requirement) => !requirement?.canonicalRequirementInstanceId)
    if (!canonicalInstances.length || !requirements.length || hasUnlinkedRequirement) {
      const error = new Error('Canonical transaction requirements or their compatibility projection were not fully persisted.')
      error.code = 'CANONICAL_REQUIREMENT_SETUP_INCOMPLETE'
      error.detail = {
        canonicalInstanceCount: canonicalInstances.length,
        readModelCount: requirements.length,
        legacyProjectionCount: 0,
        hasUnlinkedRequirement,
        hasUnlinkedLegacyProjection: false,
      }
      throw error
    }
    const matrixSync = await syncCanonicalRequiredDocumentsForTransactionContext({
      client,
      transactionId,
      transaction: canonicalResolution.transaction || { id: transactionId, purchaser_type: purchaserType, finance_type: financeType },
      onboardingFormData: {
        ...(formData || {}),
        purchaser_type: formData?.purchaser_type || purchaserType,
        purchase_finance_type: formData?.purchase_finance_type || financeType,
      },
      audience: 'auto',
    })
    if (!matrixSync?.rows?.length) {
      const error = new Error('Canonical matrix document requirements were not fully persisted.')
      error.code = 'CANONICAL_REQUIREMENT_SETUP_INCOMPLETE'
      throw error
    }
    return matrixSync.rows
  }

  try {
    const canonicalResolution = await maybeResolveTransactionDocumentRequirements({
      transactionId,
      client,
      formData,
      readOnly: !sync,
      rolloutOptions: {
        transactionId,
      },
    })

    if (
      !canonicalResolution?.skipped && (
        canonicalResolution?.rolloutMode === 'canonical_primary' ||
        canonicalResolution?.rolloutMode === 'canonical_only'
      )
    ) {
      return canonicalResolution.requirements || []
    }
  } catch (canonicalError) {
    console.warn(
      '[canonical-documents] transaction canonical resolution failed; falling back to legacy generation.',
      canonicalError,
    )
  }

  const normalizedType = normalizePurchaserType(purchaserType)
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  let resolvedStage = normalizeStage(stage, 'Available')
  let resolvedMainStage = normalizeMainStage(currentMainStage, resolvedStage)

  if (!stage || !currentMainStage) {
    let transactionStageQuery = await client
      .from('transactions')
      .select('stage, current_main_stage')
      .eq('id', transactionId)
      .maybeSingle()

    if (transactionStageQuery.error && isMissingColumnError(transactionStageQuery.error, 'current_main_stage')) {
      transactionStageQuery = await client.from('transactions').select('stage').eq('id', transactionId).maybeSingle()
    }

    if (!transactionStageQuery.error && transactionStageQuery.data) {
      resolvedStage = normalizeStage(transactionStageQuery.data.stage, resolvedStage)
      resolvedMainStage = normalizeMainStage(transactionStageQuery.data.current_main_stage, resolvedStage)
    }
  }

  const derivedConfiguration = deriveOnboardingConfiguration(
    {
      ...(formData || {}),
      purchaser_type: formData?.purchaser_type || normalizedType,
      purchase_finance_type: formData?.purchase_finance_type || normalizedFinanceType,
      reservation_required: formData?.reservation_required ?? reservationRequired,
      cash_amount: formData?.cash_amount ?? cashAmount,
      bond_amount: formData?.bond_amount ?? bondAmount,
    },
    {
      purchaserType: normalizedType,
      financeType: normalizedFinanceType,
    },
  )
  const ruleDrivenTemplates = await resolveRuleDrivenDocumentTemplates(client, {
    purchaserType: normalizedType,
    financeType: normalizedFinanceType,
    reservationRequired,
  })
  const initialTemplates = ruleDrivenTemplates.length
    ? ruleDrivenTemplates
    : derivedConfiguration.requiredDocuments.length
      ? derivedConfiguration.requiredDocuments
      : getRequiredDocumentsForPurchaserType(normalizedType, {
          financeType: normalizedFinanceType,
          reservationRequired,
          cashAmount,
          bondAmount,
          formData,
        })
  const templates = initialTemplates.filter((template) => {
    const groupKey = String(template?.groupKey || '')
      .trim()
      .toLowerCase()
    const key = String(template?.key || '')
      .trim()
      .toLowerCase()
    if (groupKey !== 'finance') {
      return true
    }

    const preCollectionAllowed = FINANCE_PRE_COLLECTION_DOCUMENT_KEYS.has(key)
    if (preCollectionAllowed) {
      return true
    }

    return getMainStageIndex(resolvedMainStage) >= getMainStageIndex('FIN')
  })
  const metadataByKey = templates.reduce((accumulator, template) => {
    accumulator[template.key] = {
      label: template.label,
      group: template.group,
      groupKey: template.groupKey,
      groupLabel: template.groupLabel || template.group,
      description: template.description,
      requirementLevel: template.requirementLevel || 'required',
      expectedFromRole: template.expectedFromRole,
      defaultVisibility: template.defaultVisibility,
      allowMultiple: template.allowMultiple,
      sortOrder: template.sortOrder,
      keywords: template.keywords,
      owningWorkflow: template.groupKey === 'finance' ? 'Finance' : undefined,
      visibleSection: template.groupKey === 'finance' ? 'finance_documents' : undefined,
      blockingStage: template.groupKey === 'finance' ? 'FIN' : undefined,
      preCollectionAllowed: FINANCE_PRE_COLLECTION_DOCUMENT_KEYS.has(
        String(template?.key || '')
          .trim()
          .toLowerCase(),
      ),
    }
    return accumulator
  }, {})
  const templateMap = buildTemplateMap(templates)
  const fullRowSelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order, canonical_requirement_instance_id, created_at, updated_at'
  const legacyRowSelect =
    'id, transaction_id, document_key, document_label, is_required, is_uploaded, uploaded_document_id, sort_order, created_at, updated_at'

  let existingRowsQuery = await client
    .from('transaction_required_documents')
    .select(fullRowSelect)
    .eq('transaction_id', transactionId)

  if (existingRowsQuery.error) {
    if (
      isMissingColumnError(existingRowsQuery.error, 'status') ||
      isMissingColumnError(existingRowsQuery.error, 'group_key') ||
      isMissingColumnError(existingRowsQuery.error, 'group_label') ||
      isMissingColumnError(existingRowsQuery.error, 'required_from_role') ||
      isMissingColumnError(existingRowsQuery.error, 'visibility_scope') ||
      isMissingColumnError(existingRowsQuery.error, 'allow_multiple') ||
      isMissingColumnError(existingRowsQuery.error, 'canonical_requirement_instance_id') ||
      isMissingColumnError(existingRowsQuery.error, 'enabled')
    ) {
      existingRowsQuery = await client
        .from('transaction_required_documents')
        .select(legacyRowSelect)
        .eq('transaction_id', transactionId)
    }
  }

  if (existingRowsQuery.error) {
    if (
      isMissingTableError(existingRowsQuery.error, 'transaction_required_documents') ||
      isMissingColumnError(existingRowsQuery.error, 'document_key') ||
      isMissingColumnError(existingRowsQuery.error, 'document_label')
    ) {
      return []
    }

    throw existingRowsQuery.error
  }

  const existingRows = existingRowsQuery.data || []
  const existingByKey = new Map(existingRows.map((row) => [row.document_key, row]))

  const upsertRows = templates.map((template, index) => {
    const existing = existingByKey.get(template.key)
    const mappedTemplate = templateMap[template.key] || template
    const status = normalizeRequiredStatus(
      existing?.status,
      statusFromLegacyFlags({
        isRequired: true,
        isUploaded: Boolean(existing?.is_uploaded),
      }),
    )
    return {
      transaction_id: transactionId,
      document_key: template.key,
      document_label: template.label,
      is_required: true,
      is_uploaded: Boolean(existing?.is_uploaded),
      status,
      enabled: true,
      group_key: mappedTemplate.groupKey || metadataByKey[template.key]?.groupKey || 'buyer_fica',
      group_label: mappedTemplate.groupLabel || metadataByKey[template.key]?.groupLabel || 'Buyer & FICA',
      description: mappedTemplate.description || metadataByKey[template.key]?.description || '',
      required_from_role: mappedTemplate.expectedFromRole || metadataByKey[template.key]?.expectedFromRole || 'client',
      visibility_scope: mappedTemplate.defaultVisibility || metadataByKey[template.key]?.defaultVisibility || 'client',
      allow_multiple: Boolean(mappedTemplate.allowMultiple || metadataByKey[template.key]?.allowMultiple),
      uploaded_document_id: existing?.uploaded_document_id || null,
      uploaded_at: existing?.uploaded_at || null,
      verified_at: existing?.verified_at || null,
      rejected_at: existing?.rejected_at || null,
      notes: existing?.notes || null,
      sort_order: index + 1,
      canonical_requirement_instance_id: existing?.canonical_requirement_instance_id || null,
    }
  })

  if (!sync) {
    return normalizeRequiredDocumentRows(upsertRows, metadataByKey, {
      transaction: {
        id: transactionId,
        finance_type: normalizedFinanceType,
        purchaser_type: normalizedType,
        stage: resolvedStage,
        current_main_stage: resolvedMainStage,
      },
      financeType: normalizedFinanceType,
      currentMainStage: resolvedMainStage,
      stage: resolvedStage,
      formData,
    })
  }

  let { error: upsertError } = await client
    .from('transaction_required_documents')
    .upsert(upsertRows, { onConflict: 'transaction_id,document_key' })

  if (
    upsertError &&
    (isMissingColumnError(upsertError, 'status') ||
      isMissingColumnError(upsertError, 'group_key') ||
      isMissingColumnError(upsertError, 'group_label') ||
      isMissingColumnError(upsertError, 'required_from_role') ||
      isMissingColumnError(upsertError, 'visibility_scope') ||
      isMissingColumnError(upsertError, 'allow_multiple') ||
      isMissingColumnError(upsertError, 'canonical_requirement_instance_id') ||
      isMissingColumnError(upsertError, 'enabled'))
  ) {
    const legacyRows = upsertRows.map((row) => ({
      transaction_id: row.transaction_id,
      document_key: row.document_key,
      document_label: row.document_label,
      is_required: row.is_required,
      is_uploaded: row.is_uploaded,
      uploaded_document_id: row.uploaded_document_id,
      sort_order: row.sort_order,
    }))

    const legacyUpsert = await client
      .from('transaction_required_documents')
      .upsert(legacyRows, { onConflict: 'transaction_id,document_key' })

    upsertError = legacyUpsert.error
  }

  if (upsertError) {
    if (
      isMissingTableError(upsertError, 'transaction_required_documents') ||
      isMissingColumnError(upsertError, 'document_key') ||
      isMissingColumnError(upsertError, 'document_label')
    ) {
      return []
    }

    throw upsertError
  }

  const expectedKeys = new Set(templates.map((template) => template.key))
  const staleRows = existingRows.filter((row) => !expectedKeys.has(row.document_key))

  if (staleRows.length) {
    for (const staleRow of staleRows) {
      const uploaded = Boolean(staleRow?.is_uploaded)
      const staleStatus = uploaded
        ? normalizeRequiredStatus(staleRow?.status, statusFromLegacyFlags({ isRequired: true, isUploaded: true }))
        : 'not_required'

      let staleUpdateResult = await client
        .from('transaction_required_documents')
        .update({
          is_required: false,
          enabled: false,
          status: staleStatus,
        })
        .eq('id', staleRow.id)

      if (
        staleUpdateResult.error &&
        (isMissingColumnError(staleUpdateResult.error, 'status') ||
          isMissingColumnError(staleUpdateResult.error, 'enabled'))
      ) {
        staleUpdateResult = await client
          .from('transaction_required_documents')
          .update({
            is_required: false,
          })
          .eq('id', staleRow.id)
      }

      if (staleUpdateResult.error && !isMissingTableError(staleUpdateResult.error, 'transaction_required_documents')) {
        throw staleUpdateResult.error
      }
    }
  }

  let refreshedQuery = await client
    .from('transaction_required_documents')
    .select(fullRowSelect)
    .eq('transaction_id', transactionId)
    .order('sort_order', { ascending: true })

  if (refreshedQuery.error) {
    if (
      isMissingColumnError(refreshedQuery.error, 'status') ||
      isMissingColumnError(refreshedQuery.error, 'group_key') ||
      isMissingColumnError(refreshedQuery.error, 'group_label') ||
      isMissingColumnError(refreshedQuery.error, 'required_from_role') ||
      isMissingColumnError(refreshedQuery.error, 'visibility_scope') ||
      isMissingColumnError(refreshedQuery.error, 'allow_multiple') ||
      isMissingColumnError(refreshedQuery.error, 'canonical_requirement_instance_id') ||
      isMissingColumnError(refreshedQuery.error, 'enabled')
    ) {
      refreshedQuery = await client
        .from('transaction_required_documents')
        .select(legacyRowSelect)
        .eq('transaction_id', transactionId)
        .order('sort_order', { ascending: true })
    }
  }

  if (refreshedQuery.error) {
    if (
      isMissingTableError(refreshedQuery.error, 'transaction_required_documents') ||
      isMissingColumnError(refreshedQuery.error, 'document_key') ||
      isMissingColumnError(refreshedQuery.error, 'document_label')
    ) {
      return []
    }

    throw refreshedQuery.error
  }

  const normalizedRows = normalizeRequiredDocumentRows(refreshedQuery.data || [], metadataByKey, {
    transaction: {
      id: transactionId,
      finance_type: normalizedFinanceType,
      purchaser_type: normalizedType,
      stage: resolvedStage,
      current_main_stage: resolvedMainStage,
    },
    financeType: normalizedFinanceType,
    currentMainStage: resolvedMainStage,
    stage: resolvedStage,
    formData,
  })

  if (sync) {
    const existingKeys = new Set(existingRows.map((row) => row.document_key).filter(Boolean))
    const generatedKeys = new Set(templates.map((template) => template.key).filter(Boolean))
    const addedKeys = [...generatedKeys].filter((key) => !existingKeys.has(key))
    const removedKeys = staleRows.map((row) => row.document_key).filter(Boolean)

    if (emitAudit && (addedKeys.length || removedKeys.length)) {
      try {
        await logTransactionEventIfPossible(client, {
          transactionId,
          eventType: 'RequiredDocumentsRecalculated',
          createdByRole: 'system',
          eventData: {
            source: 'phase1_live_checklist',
            purchaserType: normalizedType,
            financeType: normalizedFinanceType,
            currentMainStage: resolvedMainStage,
            stage: resolvedStage,
            addedKeys,
            removedKeys,
            reason: removedKeys.length
              ? 'Transaction conditions changed or stage-gating removed stale requirements.'
              : 'Transaction conditions changed and new requirements were generated.',
          },
        })
      } catch (eventError) {
        console.warn('[required-documents] recalculation event failed', eventError)
      }
    }
  }

  return normalizedRows
}

export async function resolveRuleDrivenDocumentTemplates() {
  // Canonical operational rules are intentionally hidden from browser roles.
  // Browser reads rely on transaction_required_documents, with static templates
  // as the legacy fallback when no projection rows exist.
  return []
}
