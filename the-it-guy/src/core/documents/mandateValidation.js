import { normalizeMergeFieldPayload } from './mergeFieldRegistry'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isPresent(value) {
  return value !== null && value !== undefined && normalizeText(value) !== ''
}

export const MAX_SIGNED_MANDATE_UPLOAD_BYTES = 20 * 1024 * 1024

function getPlaceholderValue(placeholders = {}, key = '') {
  if (!key) return ''
  if (Object.prototype.hasOwnProperty.call(placeholders, key)) return placeholders[key]
  const underscoreKey = normalizeText(key).replace(/\./g, '_')
  if (Object.prototype.hasOwnProperty.call(placeholders, underscoreKey)) return placeholders[underscoreKey]
  if (underscoreKey === 'agency') {
    return (
      placeholders.agency ||
      placeholders.agency_display_name ||
      placeholders.agency_name ||
      placeholders.agency_legal_name ||
      placeholders.organisation ||
      placeholders.organisation_display_name ||
      placeholders.organisation_name ||
      ''
    )
  }
  if (underscoreKey === 'organisation') {
    return (
      placeholders.organisation ||
      placeholders.organisation_display_name ||
      placeholders.organisation_name ||
      placeholders.agency ||
      placeholders.agency_display_name ||
      placeholders.agency_name ||
      placeholders.agency_legal_name ||
      ''
    )
  }
  return ''
}

function maskValidationValue(value) {
  return isPresent(value) ? 'present' : 'missing'
}

export const MANDATE_FIELD_LABELS = {
  seller_full_name: 'Seller full name',
  seller_id_number: 'Seller ID / registration number',
  seller_email: 'Seller email address',
  seller_phone: 'Seller phone number',
  seller_entity_type: 'Seller entity type',
  seller_onboarding: 'Seller onboarding completion',
  property_address: 'Property address',
  property_suburb_or_city: 'Property suburb or city',
  property_type: 'Property type',
  property_asking_price: 'Asking price',
  mandate_type: 'Mandate type',
  mandate_start_date: 'Mandate start date',
  mandate_expiry_date: 'Mandate expiry date',
  commission_percentage: 'Commission percentage',
  commission_amount: 'Commission amount',
  agency_legal_name: 'Agency legal name',
  agent_full_name: 'Agent full name',
  agent_email: 'Agent email address',
  signer_name: 'Signer name',
  signer_email: 'Signer email address',
  signing_fields: 'Signing fields',
  signing_link: 'Signing link',
  document_packet: 'Document packet',
  generated_version: 'Generated document version',
  uploaded_file: 'Uploaded PDF file',
  related_record: 'Related lead or transaction',
  permission: 'Permission',
}

export const MANDATE_FIELD_GROUP_LABELS = {
  seller: 'Seller Details',
  property: 'Property Details',
  mandate: 'Mandate Terms',
  agency: 'Agency Details',
  agent: 'Agent Details',
  signing: 'Signing Details',
  upload: 'Upload Details',
  template: 'Template Details',
}

function addGroupedIssue(collection, fieldGroups, groupKey, fieldKey, label, message = '') {
  const resolvedLabel = label || MANDATE_FIELD_LABELS[fieldKey] || fieldKey
  const issue = {
    group: MANDATE_FIELD_GROUP_LABELS[groupKey] || groupKey,
    groupKey,
    field: fieldKey,
    label: resolvedLabel,
    message: message || `${resolvedLabel} is missing.`,
  }
  collection.push(issue)
  if (!fieldGroups[groupKey]) {
    fieldGroups[groupKey] = {
      label: MANDATE_FIELD_GROUP_LABELS[groupKey] || groupKey,
      missingRequiredFields: [],
      warnings: [],
    }
  }
  return issue
}

function pushMissing(missingRequiredFields, blockingErrors, fieldGroups, groupKey, fieldKey, value, label = '') {
  if (isPresent(value)) return
  const issue = addGroupedIssue(missingRequiredFields, fieldGroups, groupKey, fieldKey, label)
  blockingErrors.push(issue)
  fieldGroups[groupKey].missingRequiredFields.push(issue)
}

function pushWarning(warnings, fieldGroups, groupKey, fieldKey, value, label = '') {
  if (isPresent(value)) return
  const issue = addGroupedIssue(warnings, fieldGroups, groupKey, fieldKey, label, `${label || MANDATE_FIELD_LABELS[fieldKey] || fieldKey} is not provided.`)
  fieldGroups[groupKey].warnings.push(issue)
}

function pushValidationRequirement({
  strict = false,
  missingRequiredFields,
  warnings,
  blockingErrors,
  fieldGroups,
  groupKey,
  fieldKey,
  value,
  label = '',
} = {}) {
  if (strict) {
    pushMissing(missingRequiredFields, blockingErrors, fieldGroups, groupKey, fieldKey, value, label)
    return
  }
  pushWarning(warnings, fieldGroups, groupKey, fieldKey, value, label)
}

function resolveMandateAction(action = 'generate') {
  const normalized = normalizeKey(action)
  if (['preview', 'generate', 'download', 'send_for_signing', 'upload_signed'].includes(normalized)) return normalized
  if (['download_pdf', 'download_physical', 'physical_download'].includes(normalized)) return 'download'
  if (['send', 'resend', 'resend_signing_link'].includes(normalized)) return 'send_for_signing'
  return 'generate'
}

function resolveTemplatePlaceholderRecords(options = {}) {
  if (Array.isArray(options.templatePlaceholders)) return options.templatePlaceholders
  if (Array.isArray(options.sectionManifest)) {
    return options.sectionManifest.flatMap((section) => (
      Array.isArray(section?.placeholders)
        ? section.placeholders.map(([key, label]) => ({
            key,
            label,
            required: Boolean(section.required),
            group: 'template',
          }))
        : []
    ))
  }
  return []
}

function validateTemplatePlaceholders({ action, mandateData, options, warnings, missingRequiredFields, blockingErrors, fieldGroups }) {
  const placeholders = mandateData?.placeholders && typeof mandateData.placeholders === 'object' ? mandateData.placeholders : {}
  const templateRows = resolveTemplatePlaceholderRecords(options)
  if (!templateRows.length) return
  const strictTemplateRequirements = action === 'upload_signed'

  for (const row of templateRows) {
    const key = normalizeText(row?.key || row?.placeholderKey)
    if (!key) continue
    const value = getPlaceholderValue(placeholders, key)
    if (isPresent(value)) continue
    const label = normalizeText(row?.label || row?.placeholderLabel || MANDATE_FIELD_LABELS[key] || key)
    if (row?.required && strictTemplateRequirements) {
      const issue = addGroupedIssue(missingRequiredFields, fieldGroups, 'template', key, label, `${label} cannot be resolved for the selected mandate template.`)
      blockingErrors.push(issue)
      fieldGroups.template.missingRequiredFields.push(issue)
    } else {
      const issue = addGroupedIssue(warnings, fieldGroups, 'template', key, label, `${label} is not provided and will show as Not provided where allowed.`)
      fieldGroups.template.warnings.push(issue)
    }
  }
}

function getSigningOption(options = {}, key = '') {
  if (options[key] !== undefined) return options[key]
  return options.signing?.[key]
}

export function validateMandateGenerationData(mandateData = {}, options = {}) {
  const action = resolveMandateAction(options.action)
  const data = mandateData && typeof mandateData === 'object' ? mandateData : {}
  const seller = data.seller || {}
  const property = data.property || {}
  const mandate = data.mandate || {}
  const agency = data.agency || {}
  const agent = data.agent || {}
  const placeholders = normalizeMergeFieldPayload(data.placeholders || {}, {
    packetType: 'mandate',
    includeAliasKeys: true,
  }).payload
  const sellerFullName = seller.fullName || placeholders.seller_full_name
  const sellerIdentity = seller.identityNumber || seller.idNumber || placeholders.seller_id_number
  const sellerEmail = seller.email || placeholders.seller_email
  const sellerPhone = seller.phone || placeholders.seller_phone
  const sellerEntityType = seller.entityType || placeholders['seller.entity_type_raw'] || placeholders.seller_entity_type
  const propertyAddress = property.fullAddress || property.address || placeholders.property_address
  const propertySuburb = property.suburb || placeholders.property_suburb
  const propertyCity = property.city || placeholders.property_city
  const askingPrice = mandate.askingPrice || property.askingPrice || placeholders.asking_price || placeholders.property_asking_price
  const mandateType = mandate.type || placeholders.mandate_type
  const mandateStartDate = mandate.startDate || placeholders.mandate_start_date
  const mandateExpiryDate = mandate.expiryDate || mandate.endDate || placeholders.mandate_expiry_date || placeholders.mandate_end_date
  const commissionPercent = mandate.commissionPercentage || mandate.commissionPercent || placeholders.commission_percentage || placeholders.mandate_commission_percent
  const commissionAmount = mandate.commissionAmount || placeholders.commission_amount || placeholders.mandate_commission_amount
  const agencyLegalName =
    agency.legalName ||
    agency.name ||
    placeholders.agency_legal_name ||
    placeholders.agency_name ||
    placeholders.agency ||
    placeholders.agency_display_name ||
    placeholders.organisation ||
    placeholders.organisation_display_name ||
    placeholders.organisation_name
  const agentFullName = agent.fullName || placeholders.agent_full_name
  const missingRequiredFields = []
  const warnings = []
  const blockingErrors = []
  const fieldGroups = {}
  const strictMandateRequirements = false
  const hardRequirementActions = strictMandateRequirements || action === 'upload_signed'

  const sellerHasIdentity = isPresent(sellerFullName) || isPresent(sellerIdentity)
  const propertyHasIdentity = isPresent(propertyAddress) || isPresent(property.erfNumber || placeholders.property_erf_number) || isPresent(property.unitNumber || placeholders.property_unit_number)

  if (action === 'preview') {
    pushWarning(warnings, fieldGroups, 'seller', 'seller_full_name', sellerHasIdentity ? 'present' : '')
    pushWarning(warnings, fieldGroups, 'property', 'property_address', propertyHasIdentity ? 'present' : '')
    if (options.hasTemplate === false) {
      pushWarning(warnings, fieldGroups, 'template', 'mandate_template', '')
    }
  } else if (action === 'upload_signed') {
    pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'upload', 'document_packet', options.packetId)
    pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'upload', 'related_record', options.relatedRecordId || options.leadId || options.transactionId)
    pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'upload', 'uploaded_file', options.file)
    if (options.file && normalizeText(options.file?.type || '').toLowerCase() !== 'application/pdf' && !normalizeText(options.file?.name).toLowerCase().endsWith('.pdf')) {
      const issue = addGroupedIssue(missingRequiredFields, fieldGroups, 'upload', 'uploaded_file', 'Uploaded PDF file', 'Uploaded signed mandate must be a PDF file.')
      blockingErrors.push(issue)
      fieldGroups.upload.missingRequiredFields.push(issue)
    }
    if (options.file && Number(options.file?.size || 0) > MAX_SIGNED_MANDATE_UPLOAD_BYTES) {
      const issue = addGroupedIssue(missingRequiredFields, fieldGroups, 'upload', 'uploaded_file', 'Uploaded PDF file', 'Signed mandate PDF must be 20 MB or smaller.')
      blockingErrors.push(issue)
      fieldGroups.upload.missingRequiredFields.push(issue)
    }
    if (options.hasPermission === false) {
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'upload', 'permission', '')
    }
  } else {
    if (data.onboardingComplete === false) {
      if (strictMandateRequirements) {
        pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'seller', 'seller_onboarding', '')
      } else {
        pushWarning(warnings, fieldGroups, 'seller', 'seller_onboarding', '')
      }
    }
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'seller', fieldKey: 'seller_full_name', value: sellerFullName })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'seller', fieldKey: 'seller_entity_type', value: sellerEntityType })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'property', fieldKey: 'property_address', value: propertyAddress })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'property', fieldKey: 'property_asking_price', value: askingPrice })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'mandate', fieldKey: 'mandate_type', value: mandateType })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'mandate', fieldKey: 'mandate_start_date', value: mandateStartDate })
    pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'mandate', fieldKey: 'mandate_expiry_date', value: mandateExpiryDate })

    if (normalizeKey(mandate.commissionStructure) === 'fixed') {
      pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'mandate', fieldKey: 'commission_amount', value: commissionAmount })
    } else {
      pushValidationRequirement({ strict: hardRequirementActions, missingRequiredFields, warnings, blockingErrors, fieldGroups, groupKey: 'mandate', fieldKey: 'commission_percentage', value: commissionPercent })
    }

    if (strictMandateRequirements) {
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'seller', 'seller_email', sellerEmail)
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'agency', 'agency_legal_name', agencyLegalName)
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'agent', 'agent_full_name', agentFullName)
    } else {
      pushWarning(warnings, fieldGroups, 'seller', 'seller_email', sellerEmail)
      pushWarning(warnings, fieldGroups, 'agency', 'agency_legal_name', agencyLegalName)
      pushWarning(warnings, fieldGroups, 'agent', 'agent_full_name', agentFullName)
    }

    pushWarning(warnings, fieldGroups, 'seller', 'seller_phone', sellerPhone)
    pushWarning(warnings, fieldGroups, 'property', 'property_suburb_or_city', propertySuburb || propertyCity)

    if (strictMandateRequirements) {
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'seller', 'seller_id_number', sellerIdentity)
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'document_packet', getSigningOption(options, 'packetId'))
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'generated_version', getSigningOption(options, 'versionId'))
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'signer_name', getSigningOption(options, 'hasSignerName') ? 'present' : '')
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'signer_email', getSigningOption(options, 'hasSignerEmail') ? 'present' : '')
      pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'signing_fields', Number(getSigningOption(options, 'signingFieldCount') || 0) > 0 ? 'present' : '')
      if (getSigningOption(options, 'signingLinkReady') === false) {
        pushMissing(missingRequiredFields, blockingErrors, fieldGroups, 'signing', 'signing_link', '')
      }
    } else {
      pushWarning(warnings, fieldGroups, 'seller', 'seller_id_number', sellerIdentity)
    }
  }

  for (const warning of Array.isArray(data.warnings) ? data.warnings : []) {
    const issue = addGroupedIssue(warnings, fieldGroups, 'template', 'optional_warning', normalizeText(warning) || 'Optional detail')
    fieldGroups.template.warnings.push(issue)
  }

  validateTemplatePlaceholders({ action, mandateData: data, options, warnings, missingRequiredFields, blockingErrors, fieldGroups })

  const debugSummary = {
    action,
    canProceed: blockingErrors.length === 0,
    missingRequiredFields: missingRequiredFields.map((row) => row.label),
    warnings: warnings.map((row) => row.label),
    sourceContext: data.sourceContext || {},
    sensitivePresence: {
      seller_id_number: maskValidationValue(sellerIdentity),
      seller_email: maskValidationValue(sellerEmail),
      seller_phone: maskValidationValue(sellerPhone),
    },
  }
  if (options.log === true) {
    console.info('[MANDATE_VALIDATION]', debugSummary)
  }

  return {
    canProceed: blockingErrors.length === 0,
    canGenerate: blockingErrors.length === 0,
    action,
    missingRequiredFields,
    warnings,
    blockingErrors,
    fieldGroups,
    summary: {
      requiredTotal: missingRequiredFields.length + Math.max(0, options.requiredPresentCount || 0),
      requiredMissing: missingRequiredFields.length,
      warningsTotal: warnings.length,
    },
    debugSummary,
  }
}

export function formatMandateValidationMessage(validation = {}) {
  const groups = validation?.fieldGroups && typeof validation.fieldGroups === 'object' ? validation.fieldGroups : {}
  const lines = ['Missing Required Information']
  for (const group of Object.values(groups)) {
    if (!Array.isArray(group.missingRequiredFields) || !group.missingRequiredFields.length) continue
    lines.push(group.label)
    for (const issue of group.missingRequiredFields) {
      lines.push(`- ${issue.label}`)
    }
  }
  if (Array.isArray(validation?.warnings) && validation.warnings.length) {
    lines.push('Optional details missing')
    for (const warning of validation.warnings.slice(0, 8)) {
      lines.push(`- ${warning.label}`)
    }
  }
  const actionCopy = validation.action === 'send_for_signing'
    ? 'sending the mandate for signature'
    : validation.action === 'download'
      ? 'downloading the mandate'
      : validation.action === 'upload_signed'
        ? 'uploading the signed mandate'
        : validation.action === 'preview'
          ? 'previewing the mandate'
          : 'generating the mandate'
  lines.push(`Complete the missing information before ${actionCopy}.`)
  return lines.join('\n')
}
