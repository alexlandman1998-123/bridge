import {
  buildSouthAfricanLegalDealFactPlaceholders,
  buildSouthAfricanLegalDealFacts,
} from './southAfricanLegalDealFacts.js'
import {
  buildSouthAfricanLegalClausePackPlaceholders,
  resolveSouthAfricanLegalClausePacks,
} from './southAfricanLegalClausePacks.js'
import {
  buildLegalClausePackCoverage,
  listPublishableLegalClausePackKeys,
  resolveSectionClauseApproval,
  resolveSectionClausePackKeys,
} from './legalClausePackCoverage.js'
import { buildOtpRuntimeAssembly } from './otpRuntimeAssembly.js'
import { evaluateVisibilityRules } from './sectionVisibilityRules.js'
import {
  LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
  buildLegalClausePackTemplateFingerprint,
} from './legalClausePackScenarioMatrixGovernance.js'

export { LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION } from './legalClausePackScenarioMatrixGovernance.js'

const BASE_SCENARIO_DRAFT = Object.freeze({
  legalInstrumentFamily: 'residential_resale',
  sellerEntityType: 'company',
  buyerEntityType: 'company',
  propertyTitleType: 'full_title',
  propertyInEstateOrHoa: 'no',
  propertyEstateOrHoaName: '',
  propertyExclusiveUseAreas: 'no',
  financeType: 'cash',
  purchasePrice: '3250000',
  cashAmount: '3250000',
  bondAmount: '',
  bondApprovalDeadline: '',
  depositAmount: '0',
  depositHolder: 'unknown',
  saleOfExistingPropertyCondition: 'no',
  linkedSaleDeadline: '',
  occupationBeforeTransfer: 'no',
  occupationalRent: '',
  existingLease: 'no',
  leaseExpiryDate: '',
  sellerVatStatus: 'not_vendor',
  vatTreatment: 'transfer_duty',
})

function scenario(key, label, description, overrides) {
  return Object.freeze({
    key,
    label,
    description,
    draft: Object.freeze({ ...BASE_SCENARIO_DRAFT, ...overrides }),
  })
}

export const SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS = Object.freeze([
  scenario(
    'individual_cash_full_title',
    'Individuals · cash · full title',
    'A straightforward transfer-duty sale between unmarried individuals.',
    {
      sellerEntityType: 'individual',
      sellerMaritalRegime: 'single',
      buyerEntityType: 'individual',
      buyerMaritalRegime: 'single',
    },
  ),
  scenario(
    'married_bond_sectional_estate',
    'Married individuals · bond · sectional estate',
    'Exercises spouse consent, sectional title, HOA, exclusive-use, bond and deposit wording.',
    {
      sellerEntityType: 'individual',
      sellerMaritalRegime: 'in_community',
      sellerForeignMarriage: 'no',
      buyerEntityType: 'individual',
      buyerMaritalRegime: 'in_community',
      buyerForeignMarriage: 'no',
      propertyTitleType: 'sectional_title',
      propertyInEstateOrHoa: 'yes',
      propertyEstateOrHoaName: 'Sample Estate',
      propertyExclusiveUseAreas: 'yes',
      financeType: 'bond',
      cashAmount: '',
      bondAmount: '2900000',
      bondApprovalDeadline: '2026-08-31',
      depositAmount: '100000',
      depositHolder: 'transfer_attorney',
    },
  ),
  scenario(
    'company_bond_vat_inclusive',
    'Companies · bond · VAT inclusive',
    'Exercises company authority, bond and VAT-inclusive wording.',
    {
      financeType: 'bond',
      cashAmount: '',
      bondAmount: '3250000',
      bondApprovalDeadline: '2026-08-31',
      sellerVatStatus: 'vendor',
      vatTreatment: 'vat_inclusive',
    },
  ),
  scenario(
    'trust_cash_sectional_vat_exclusive',
    'Trusts · cash · sectional · VAT exclusive',
    'Exercises trust authority, sectional-title and VAT-exclusive wording.',
    {
      sellerEntityType: 'trust',
      buyerEntityType: 'trust',
      propertyTitleType: 'sectional_title',
      propertyExclusiveUseAreas: 'no',
      sellerVatStatus: 'vendor',
      vatTreatment: 'vat_exclusive',
    },
  ),
  scenario(
    'combination_linked_sale_early_occupation',
    'Company to trust · combination finance',
    'Exercises cash contribution, linked-sale and occupation-before-transfer wording.',
    {
      sellerEntityType: 'company',
      buyerEntityType: 'trust',
      propertyTitleType: 'sectional_title',
      propertyExclusiveUseAreas: 'no',
      financeType: 'combination',
      cashAmount: '350000',
      bondAmount: '2900000',
      bondApprovalDeadline: '2026-08-31',
      saleOfExistingPropertyCondition: 'yes',
      linkedSaleDeadline: '2026-09-15',
      occupationBeforeTransfer: 'yes',
      occupationalRent: '15000',
    },
  ),
  scenario(
    'existing_lease_zero_rated',
    'Trust to company · existing lease · zero rated',
    'Exercises existing-lease and specialist zero-rated VAT wording.',
    {
      sellerEntityType: 'trust',
      buyerEntityType: 'company',
      existingLease: 'yes',
      leaseExpiryDate: '2027-06-30',
      sellerVatStatus: 'vendor',
      vatTreatment: 'zero_rated',
    },
  ),
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getSections(template = {}, sections = null) {
  if (Array.isArray(sections)) return sections
  if (Array.isArray(template.sections)) return template.sections
  return []
}

function getScenarioRows(templateSections = [], placeholders = {}, legacyCompatible = false) {
  return templateSections.map((section, index) => ({
    section,
    index,
    sectionKey: normalizeText(section.section_key || section.sectionKey),
    packKeys: resolveSectionClausePackKeys(section),
    wordingPresent: Boolean(normalizeText(section.legal_text || section.legalText)),
    visible: evaluateVisibilityRules(section.condition_json || section.conditionJson || null, placeholders),
    approval: resolveSectionClauseApproval(section, { legacyCompatible }),
  }))
}

function packIssue(code, packKey, message, sectionIndexes = []) {
  return { code, packKey, message, sectionIndexes, blocking: true }
}

export function getSouthAfricanOtpReferenceScenario(key = '') {
  const normalized = normalizeText(key)
  return SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS.find((item) => item.key === normalized)
    || SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS[0]
}

export function buildSouthAfricanOtpScenarioPreviewContext(key = '') {
  const selected = getSouthAfricanOtpReferenceScenario(key)
  return {
    otpDraft: { ...selected.draft },
    transaction: {
      purchase_price: selected.draft.purchasePrice,
      sale_price: selected.draft.purchasePrice,
      finance_type: selected.draft.financeType,
      bond_amount: selected.draft.bondAmount,
      cash_amount: selected.draft.cashAmount,
    },
    sourceContext: {
      legalScenarioMatrixVersion: LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
      legalScenarioMatrixKey: selected.key,
    },
  }
}

export function runLegalClausePackScenarioMatrix({
  template = {},
  sections = null,
  scenarios = SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS,
  allowLegacy = false,
  requireApproval = true,
} = {}) {
  const templateSections = getSections(template, sections)
  const legacyCompatible = Boolean(allowLegacy && Number(template.governance_version || 0) === 0)
  const scenarioResults = scenarios.map((selectedScenario) => {
    const facts = buildSouthAfricanLegalDealFacts({ draft: selectedScenario.draft, source: 'phase_5_scenario_matrix' })
    const resolution = resolveSouthAfricanLegalClausePacks(facts)
    const placeholders = {
      ...buildSouthAfricanLegalDealFactPlaceholders(facts),
      ...buildSouthAfricanLegalClausePackPlaceholders(resolution),
    }
    const activePackKeys = resolution.activePackKeys.filter((key) => key !== 'residential_resale_core_pack')
    const activePackSet = new Set(activePackKeys)
    const rows = getScenarioRows(templateSections, placeholders, legacyCompatible)
    const issues = []
    const coverage = buildLegalClausePackCoverage({
      template: { ...template, sections: templateSections },
      sections: templateSections,
      requiredPackKeys: activePackKeys,
      allowLegacy,
      requireApproval,
    })
    const runtimeAssembly = buildOtpRuntimeAssembly({
      template,
      sections: templateSections,
      placeholders,
      resolution,
      coverage,
    })

    for (const packKey of activePackKeys) {
      const linkedRows = rows.filter((row) => row.packKeys.includes(packKey) && row.wordingPresent)
      const visibleRows = linkedRows.filter((row) => row.visible)
      const approvedRows = visibleRows.filter((row) => !requireApproval || row.approval.approved)
      if (!linkedRows.length) {
        issues.push(packIssue('missing_wording', packKey, `${packKey} has no linked wording.`))
      } else if (!visibleRows.length) {
        issues.push(packIssue('active_pack_hidden', packKey, `${packKey} is active but its wording is hidden.`, linkedRows.map((row) => row.index)))
      } else if (!approvedRows.length) {
        issues.push(packIssue('approval_required', packKey, `${packKey} is visible but not approved and locked.`, visibleRows.map((row) => row.index)))
      }
    }

    for (const row of rows.filter((item) => item.visible && item.wordingPresent)) {
      for (const packKey of row.packKeys) {
        if (!activePackSet.has(packKey)) {
          issues.push(packIssue(
            'inactive_pack_visible',
            packKey,
            `${packKey} wording is visible although the pack is not active.`,
            [row.index],
          ))
        }
      }
    }

    for (const conflict of resolution.conflicts || []) {
      issues.push({
        code: conflict.code,
        packKey: conflict.packKeys?.[0] || null,
        message: conflict.message,
        sectionIndexes: [],
        blocking: true,
      })
    }

    for (const runtimeBlocker of runtimeAssembly.blockers || []) {
      if (issues.some((item) => item.code === runtimeBlocker.code && item.packKey === runtimeBlocker.packKey)) continue
      issues.push(packIssue(
        runtimeBlocker.code,
        runtimeBlocker.packKey,
        runtimeBlocker.message,
      ))
    }

    return {
      key: selectedScenario.key,
      label: selectedScenario.label,
      description: selectedScenario.description,
      factsKey: facts.factsKey,
      activePackKeys,
      visibleSectionIndexes: rows.filter((row) => row.visible).map((row) => row.index),
      issues,
      reviewItems: resolution.reviewItems || [],
      runtimeAssembly,
      passed: resolution.signingReady && runtimeAssembly.canAssemble && issues.length === 0,
    }
  })

  const exercisedPackKeys = Array.from(new Set(scenarioResults.flatMap((item) => item.activePackKeys)))
  const publishablePackKeys = listPublishableLegalClausePackKeys()
  const unexercisedPackKeys = publishablePackKeys.filter((key) => !exercisedPackKeys.includes(key))
  const failedScenarios = scenarioResults.filter((item) => !item.passed)
  const blockingMessages = [
    ...failedScenarios.map((item) => (
      `${item.label}: ${item.issues[0]?.message || item.reviewItems[0]?.message || 'scenario requires review'}`
    )),
    ...(unexercisedPackKeys.length
      ? [`Reference scenarios do not exercise: ${unexercisedPackKeys.join(', ')}.`]
      : []),
  ]
  const templateFingerprint = buildLegalClausePackTemplateFingerprint(template, templateSections)
  const certificationKey = [
    LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
    templateFingerprint,
    `${scenarioResults.length}_${scenarioResults.map((item) => item.factsKey).join('_')}`,
  ].join('__')

  return {
    schemaVersion: LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
    templateFingerprint,
    certificationKey,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((item) => item.passed).length,
    failedCount: failedScenarios.length,
    scenarios: scenarioResults,
    exercisedPackKeys,
    exercisedPackCount: exercisedPackKeys.length,
    publishablePackCount: publishablePackKeys.length,
    unexercisedPackKeys,
    failedScenarios,
    blockingMessages,
    canPublish: failedScenarios.length === 0 && unexercisedPackKeys.length === 0,
  }
}
