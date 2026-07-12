function buildBaseHeaderConfig({
  title = 'Transaction Workspace',
  unitLabel = '',
  subtitle = '',
  contextLabel = 'TRANSACTION WORKSPACE',
  pills = [],
  stats = [],
} = {}) {
  return {
    contextLabel,
    title,
    unitLabel,
    subtitle,
    pills,
    stats,
  }
}

function buildReferenceStats(referenceSummary = null, { includePartnerReferences = true } = {}) {
  const primary = referenceSummary?.primary
  const partnerItems = includePartnerReferences
    ? (referenceSummary?.partnerItems || []).slice(0, 2)
    : []
  return [
    primary
      ? {
          label: primary.label,
          value: primary.displayValue || primary.value,
          helperText: primary.isFallback ? `Fallback from ${primary.fallbackStorageTarget}` : 'Shared transaction reference',
          icon: 'reference',
        }
      : null,
    ...partnerItems.map((item) => ({
      label: item.label,
      value: item.displayValue || item.value,
      helperText: item.sourceLabel ? `${item.sourceLabel} reference` : '',
      icon: 'reference',
    })),
  ].filter(Boolean)
}

export function buildDeveloperTransactionHeaderConfig({
  title,
  unitLabel,
  subtitle,
  buyerLabel,
  currentStageLabel,
  mainStageLabel,
  onboardingLabel,
  purchasePriceLabel,
  timeInStageValue,
  timeInStageMeta = '',
  unitStatusLabel = '',
  referenceSummary = null,
} = {}) {
  return buildBaseHeaderConfig({
    title,
    unitLabel,
    subtitle,
    contextLabel: null,
    pills: [],
    stats: [
      ...buildReferenceStats(referenceSummary, { includePartnerReferences: false }),
      { label: 'Current Stage', value: currentStageLabel || 'Available', helperText: '', icon: 'stage' },
      { label: 'Purchase Price', value: purchasePriceLabel || '—', helperText: '', icon: 'price' },
      { label: 'Main Stage', value: mainStageLabel || 'Available', helperText: '', icon: 'stage' },
      { label: 'Transaction Age', value: timeInStageValue || '—', helperText: timeInStageMeta || '', icon: 'time' },
    ],
  })
}

export function buildAttorneyTransactionHeaderConfig({
  title,
  unitLabel,
  subtitle,
  buyerLabel,
  currentStageLabel,
  mainStageLabel,
  operationalStateLabel,
  financeTypeLabel,
  purchasePriceLabel,
  timeInStageValue,
  timeInStageMeta = '',
  referenceSummary = null,
} = {}) {
  return buildBaseHeaderConfig({
    title,
    unitLabel,
    subtitle,
    contextLabel: 'TRANSACTION WORKSPACE',
    pills: [
      { label: buyerLabel || 'Buyer pending', icon: 'user', tone: buyerLabel ? 'blue' : 'amber' },
      { label: currentStageLabel || 'Instruction Received', icon: 'stage', tone: 'indigo' },
      { label: mainStageLabel || 'Available', icon: 'status', tone: 'slate' },
      { label: operationalStateLabel || 'On Track', icon: 'onboarding', tone: 'blue' },
      { label: financeTypeLabel || 'Cash', icon: 'finance', tone: 'blue' },
    ],
    stats: [
      ...buildReferenceStats(referenceSummary),
      { label: 'Current Stage', value: currentStageLabel || 'Instruction Received', icon: 'stage' },
      { label: 'Purchase Price', value: purchasePriceLabel || '—', icon: 'price' },
      { label: 'Main Stage', value: mainStageLabel || 'Available', icon: 'stage' },
      { label: 'Time In Stage', value: timeInStageValue || '—', helperText: timeInStageMeta || '', icon: 'time' },
    ],
  })
}

export function buildAgentTransactionHeaderConfig(input = {}) {
  return buildAttorneyTransactionHeaderConfig(input)
}

export function buildBondOriginatorTransactionHeaderConfig(input = {}) {
  return buildAttorneyTransactionHeaderConfig(input)
}

export function buildWorkspaceHeaderConfigForRole({ role = 'developer', ...input } = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (normalizedRole === 'attorney' || normalizedRole === 'conveyancer') {
    return buildAttorneyTransactionHeaderConfig(input)
  }
  if (normalizedRole === 'agent') {
    return buildAgentTransactionHeaderConfig(input)
  }
  if (normalizedRole === 'bond_originator' || normalizedRole === 'bond') {
    return buildBondOriginatorTransactionHeaderConfig(input)
  }
  return buildDeveloperTransactionHeaderConfig(input)
}
