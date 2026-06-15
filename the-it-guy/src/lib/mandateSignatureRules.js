function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s.-]+/g, '_')
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

export function resolveMandateSpouseRequirementFromFields(fields = []) {
  const spouseFields = (Array.isArray(fields) ? fields : []).filter(
    (field) => normalizeKey(field?.signer_role || field?.signerRole) === 'purchaser_2',
  )
  if (!spouseFields.length) return null
  return spouseFields.some((field) => Boolean(field?.required))
}

export function mandateRequiresSpouseSignature({ packet = null, sourceContext = {}, latestVersion = null, placeholders: placeholderOverrides = null } = {}) {
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

export function filterMandateSigningRows(rows = [], { requiresSpouse = false } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const role = normalizeKey(row?.signer_role || row?.signerRole)
    if (role === 'agent' || role === 'seller') return true
    if (role === 'purchaser_2') return Boolean(requiresSpouse)
    return false
  })
}
