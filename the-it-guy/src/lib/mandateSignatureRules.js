function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s.-]+/g, '_')
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toTitleCase(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeBooleanSignal(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'n_a', 'na'].includes(normalized)) return false
  return null
}

function normalizeMandateMaritalRegime(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (/(^|_)(single|unmarried|divorced|widowed|not_married|never_married)(_|$)/.test(normalized)) {
    return 'single'
  }
  if (
    normalized === 'married_cop' ||
    normalized.includes('in_community') ||
    normalized.includes('community_of_property') ||
    normalized.includes('community_property') ||
    normalized === 'cop'
  ) {
    return 'in_community'
  }
  if (
    normalized === 'married_anc' ||
    normalized === 'anc' ||
    normalized.includes('antenuptial')
  ) {
    return 'anc'
  }
  if (normalized.includes('out_of_community')) return 'out_of_community'
  if (normalized.includes('married')) return 'married'
  return normalized
}

function collectCanonicalSellerFacts(sourceContext = {}, generatedSnapshot = {}, nestedSource = {}, sellerOnboarding = {}, onboardingFormData = {}) {
  return [
    sourceContext?.canonicalFacts?.seller,
    generatedSnapshot?.canonicalFacts?.seller,
    nestedSource?.canonicalFacts?.seller,
    sellerOnboarding?.canonicalFacts?.seller,
    onboardingFormData?.canonicalFacts?.seller,
  ].filter((value) => value && typeof value === 'object')
}

function collectOwnerRows(sourceContext = {}, generatedSnapshot = {}, nestedSource = {}, sellerOnboarding = {}, onboardingFormData = {}, canonicalSellerFacts = []) {
  return [
    ...toArray(sourceContext?.multipleOwners),
    ...toArray(sourceContext?.owners),
    ...toArray(generatedSnapshot?.multipleOwners),
    ...toArray(generatedSnapshot?.owners),
    ...toArray(nestedSource?.multipleOwners),
    ...toArray(nestedSource?.owners),
    ...toArray(sellerOnboarding?.multipleOwners),
    ...toArray(sellerOnboarding?.owners),
    ...toArray(sellerOnboarding?.formData?.multipleOwners),
    ...toArray(sellerOnboarding?.formData?.owners),
    ...toArray(onboardingFormData?.multipleOwners),
    ...toArray(onboardingFormData?.owners),
    ...canonicalSellerFacts.flatMap((facts) => toArray(facts?.owners)),
  ]
}

function normalizeOwnerRecord(owner = {}, index = 0) {
  const fullName = firstText(
    owner?.name,
    owner?.full_name,
    owner?.fullName,
    [owner?.first_name, owner?.firstName, owner?.name].map(normalizeText).filter(Boolean).join(' '),
    [owner?.surname, owner?.last_name, owner?.lastName].map(normalizeText).filter(Boolean).length
      ? [owner?.first_name || owner?.firstName || owner?.name, owner?.surname || owner?.last_name || owner?.lastName].map(normalizeText).filter(Boolean).join(' ')
      : '',
  )
  return {
    id: normalizeText(owner?.id || `owner_${index + 1}`),
    signerName: fullName,
    signerEmail: firstText(owner?.email, owner?.owner_email, owner?.signer_email).toLowerCase(),
  }
}

function resolveMandateSourceParts({ packet = null, sourceContext = {}, latestVersion = null, placeholders: placeholderOverrides = null } = {}) {
  const resolvedSourceContext = sourceContext && typeof sourceContext === 'object'
    ? sourceContext
    : packet?.source_context_json && typeof packet.source_context_json === 'object'
      ? packet.source_context_json
      : {}
  const generatedSnapshot = resolvedSourceContext?.generatedDataSnapshot && typeof resolvedSourceContext.generatedDataSnapshot === 'object'
    ? resolvedSourceContext.generatedDataSnapshot
    : latestVersion?.validation_summary_json?.generatedDataSnapshot && typeof latestVersion.validation_summary_json.generatedDataSnapshot === 'object'
      ? latestVersion.validation_summary_json.generatedDataSnapshot
      : {}
  const placeholders = {
    ...(generatedSnapshot?.placeholders && typeof generatedSnapshot.placeholders === 'object' ? generatedSnapshot.placeholders : {}),
    ...(latestVersion?.placeholders_resolved_json && typeof latestVersion.placeholders_resolved_json === 'object' ? latestVersion.placeholders_resolved_json : {}),
    ...(placeholderOverrides && typeof placeholderOverrides === 'object' ? placeholderOverrides : {}),
  }
  const nestedSource = generatedSnapshot?.sourceContext && typeof generatedSnapshot.sourceContext === 'object'
    ? generatedSnapshot.sourceContext
    : latestVersion?.validation_summary_json?.sourceContext && typeof latestVersion.validation_summary_json.sourceContext === 'object'
      ? latestVersion.validation_summary_json.sourceContext
      : {}
  const sellerOnboarding = resolvedSourceContext?.sellerOnboarding && typeof resolvedSourceContext.sellerOnboarding === 'object'
    ? resolvedSourceContext.sellerOnboarding
    : {}
  const onboardingFormData = {
    ...(sellerOnboarding?.formData && typeof sellerOnboarding.formData === 'object' ? sellerOnboarding.formData : {}),
    ...(resolvedSourceContext?.onboardingFormData && typeof resolvedSourceContext.onboardingFormData === 'object' ? resolvedSourceContext.onboardingFormData : {}),
  }
  const canonicalSellerFacts = collectCanonicalSellerFacts(
    resolvedSourceContext,
    generatedSnapshot,
    nestedSource,
    sellerOnboarding,
    onboardingFormData,
  )
  return {
    resolvedSourceContext,
    generatedSnapshot,
    placeholders,
    nestedSource,
    sellerOnboarding,
    onboardingFormData,
    canonicalSellerFacts,
  }
}

export function resolveMandateSpouseRequirementFromFields(fields = []) {
  const spouseFields = (Array.isArray(fields) ? fields : []).filter(
    (field) => normalizeKey(field?.signer_role || field?.signerRole) === 'purchaser_2',
  )
  if (!spouseFields.length) return null
  return spouseFields.some((field) => Boolean(field?.required))
}

export function mandateRequiresSpouseSignature({ packet = null, sourceContext = {}, latestVersion = null, placeholders: placeholderOverrides = null } = {}) {
  const {
    resolvedSourceContext,
    placeholders,
    nestedSource,
    sellerOnboarding,
    onboardingFormData,
    canonicalSellerFacts,
  } = resolveMandateSourceParts({ packet, sourceContext, latestVersion, placeholders: placeholderOverrides })

  const explicitSignals = [
    placeholders.seller_spouse_consent_required,
    placeholders.spouse_consent_required,
    resolvedSourceContext.spouseConsentRequired,
    resolvedSourceContext.spouse_consent_required,
    resolvedSourceContext?.seller?.spouseConsentRequired,
    resolvedSourceContext?.seller?.spouse_consent_required,
    nestedSource.spouseConsentRequired,
    nestedSource.spouse_consent_required,
    nestedSource?.seller?.spouseConsentRequired,
    nestedSource?.seller?.spouse_consent_required,
    sellerOnboarding.spouseConsentRequired,
    sellerOnboarding.spouse_consent_required,
    onboardingFormData.spouseConsentRequired,
    onboardingFormData.spouse_consent_required,
    ...canonicalSellerFacts.map((facts) => facts.spouse_consent_required),
  ]

  if (explicitSignals.some((value) => normalizeBooleanSignal(value) === true)) {
    return true
  }

  const maritalSignals = [
    placeholders.seller_marital_status,
    placeholders.seller_marital_regime,
    placeholders.seller_ownership_type,
    placeholders.seller_ownership_structure,
    resolvedSourceContext.sellerMaritalStatus,
    resolvedSourceContext.seller_marital_status,
    resolvedSourceContext.sellerMaritalRegime,
    resolvedSourceContext.seller_marital_regime,
    resolvedSourceContext.maritalRegime,
    resolvedSourceContext.marriageRegime,
    resolvedSourceContext.ownershipType,
    resolvedSourceContext.ownership_structure,
    resolvedSourceContext?.seller?.marital_status,
    resolvedSourceContext?.seller?.marital_regime,
    resolvedSourceContext?.seller?.ownership_type,
    resolvedSourceContext?.seller?.ownership_structure,
    nestedSource.sellerMaritalStatus,
    nestedSource.seller_marital_status,
    nestedSource.sellerMaritalRegime,
    nestedSource.seller_marital_regime,
    nestedSource.maritalRegime,
    nestedSource.marriageRegime,
    nestedSource.ownershipType,
    nestedSource.ownership_structure,
    nestedSource?.seller?.marital_status,
    nestedSource?.seller?.marital_regime,
    nestedSource?.seller?.ownership_type,
    nestedSource?.seller?.ownership_structure,
    sellerOnboarding.ownershipType,
    sellerOnboarding.ownership_structure,
    sellerOnboarding.maritalRegime,
    sellerOnboarding.marriageRegime,
    onboardingFormData.ownershipType,
    onboardingFormData.ownership_structure,
    onboardingFormData.maritalStatus,
    onboardingFormData.marital_status,
    onboardingFormData.marriageRegime,
    onboardingFormData.maritalRegime,
    ...canonicalSellerFacts.flatMap((facts) => [
      facts.marital_regime,
      facts.marital_status,
      facts.ownership_type,
      facts.ownership_structure,
    ]),
  ]

  return maritalSignals.some((value) => normalizeMandateMaritalRegime(value) === 'in_community')
}

export function resolveMandateSecondarySignerConfig({ packet = null, sourceContext = {}, latestVersion = null, placeholders: placeholderOverrides = null } = {}) {
  const sourceParts = resolveMandateSourceParts({ packet, sourceContext, latestVersion, placeholders: placeholderOverrides })
  const {
    resolvedSourceContext,
    generatedSnapshot,
    placeholders,
    nestedSource,
    sellerOnboarding,
    onboardingFormData,
    canonicalSellerFacts,
  } = sourceParts

  const spouseRequired = mandateRequiresSpouseSignature({ packet, sourceContext, latestVersion, placeholders: placeholderOverrides })
  if (spouseRequired) {
    return {
      role: 'purchaser_2',
      kind: 'spouse',
      label: 'Spouse',
      required: true,
      signerName: firstText(
        placeholders.seller_spouse_name,
        resolvedSourceContext?.spouseName,
        nestedSource?.spouseName,
        onboardingFormData?.spouseName,
        onboardingFormData?.spouseFullName,
        onboardingFormData?.spouse_full_name,
        ...canonicalSellerFacts.map((facts) => facts?.spouse?.name),
      ),
      signerEmail: firstText(
        placeholders.seller_spouse_email,
        resolvedSourceContext?.spouseEmail,
        nestedSource?.spouseEmail,
        onboardingFormData?.spouseEmail,
        onboardingFormData?.spouse_email,
        ...canonicalSellerFacts.map((facts) => facts?.spouse?.email),
      ).toLowerCase(),
    }
  }

  const ownerRows = collectOwnerRows(
    resolvedSourceContext,
    generatedSnapshot,
    nestedSource,
    sellerOnboarding,
    onboardingFormData,
    canonicalSellerFacts,
  )
    .map(normalizeOwnerRecord)
    .filter((owner) => owner.signerName || owner.signerEmail)

  const multipleOwnerSignals = [
    resolvedSourceContext?.sellerBranch,
    resolvedSourceContext?.seller_branch,
    resolvedSourceContext?.ownershipType,
    resolvedSourceContext?.ownership_type,
    sellerOnboarding?.sellerBranch,
    sellerOnboarding?.seller_branch,
    onboardingFormData?.sellerBranch,
    onboardingFormData?.ownershipType,
    onboardingFormData?.ownership_type,
    ...canonicalSellerFacts.flatMap((facts) => [facts?.branch, facts?.ownership_type]),
  ]
  const multipleOwnerRequired = ownerRows.length >= 2 || multipleOwnerSignals.some((value) => {
    const normalized = normalizeKey(value)
    return normalized.includes('multiple') || normalized.includes('joint')
  })

  if (!multipleOwnerRequired) {
    return {
      role: 'purchaser_2',
      kind: '',
      label: 'Co-signer',
      required: false,
      signerName: '',
      signerEmail: '',
    }
  }

  const primarySellerName = firstText(
    placeholders.seller_full_name,
    resolvedSourceContext?.sellerName,
    resolvedSourceContext?.seller?.name,
    onboardingFormData?.sellerFullName,
    onboardingFormData?.fullName,
    ...canonicalSellerFacts.map((facts) => facts?.name),
  )
  const primarySellerEmail = firstText(
    placeholders.seller_email,
    resolvedSourceContext?.sellerEmail,
    resolvedSourceContext?.seller?.email,
    onboardingFormData?.sellerEmail,
    onboardingFormData?.email,
    ...canonicalSellerFacts.map((facts) => facts?.email),
  ).toLowerCase()
  const secondaryOwner =
    ownerRows.find((owner) => owner.signerEmail && owner.signerEmail !== primarySellerEmail) ||
    ownerRows.find((owner) => owner.signerName && normalizeKey(owner.signerName) !== normalizeKey(primarySellerName)) ||
    ownerRows[1] ||
    ownerRows[0] ||
    null

  return {
    role: 'purchaser_2',
    kind: 'co_owner',
    label: 'Co-owner',
    required: true,
    signerName: normalizeText(secondaryOwner?.signerName),
    signerEmail: normalizeText(secondaryOwner?.signerEmail).toLowerCase(),
  }
}

export function getMandateSignerRoleLabel(role = '', { secondarySignerLabel = 'Co-signer', roleLabels = {} } = {}) {
  const normalized = normalizeKey(role)
  if (roleLabels && typeof roleLabels === 'object' && normalizeText(roleLabels[normalized])) return normalizeText(roleLabels[normalized])
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'purchaser_2') return normalizeText(secondarySignerLabel) || 'Co-signer'
  return toTitleCase(normalized || 'signer')
}

export function filterMandateSigningRows(rows = [], { requiresSpouse = false } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const role = normalizeKey(row?.signer_role || row?.signerRole)
    if (role === 'agent' || role === 'seller') return true
    if (role === 'purchaser_2') return Boolean(requiresSpouse)
    return false
  })
}
