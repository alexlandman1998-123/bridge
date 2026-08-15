export const BOND_APPLICATION_BROWSER_E2E_VERSION = 'phase-16-v1'

export const BOND_APPLICATION_BROWSER_E2E_SCENARIOS = Object.freeze([
  {
    key: 'buyer_deep_link_unlock',
    actor: 'buyer',
    routePattern: '/client/:token/bond-application',
    purpose: 'A bond application email link can open the buyer directly into the unlocked application workspace after OTP verification.',
    requiredSelectors: [
      '[data-bond-ux-task-workspace="phase-10"]',
      '[data-bond-ux-next-action-bar="true"]',
      '[data-bond-ux-section-stepper="true"]',
    ],
    requiredTexts: [
      'Guided application path',
      'Next action',
      'Confirm what is already filled first',
    ],
  },
  {
    key: 'buyer_prefill_confirmation',
    actor: 'buyer',
    routePattern: '/client/:token/bond-application',
    purpose: 'The buyer can review data that was prefilled from agent onboarding or buyer onboarding before completing missing fields.',
    requiredSelectors: [
      '[data-bond-prefill-confirmation-cards="true"]',
      '[data-bond-prefill-section-actions="true"]',
    ],
    requiredTexts: [
      'Review and confirm',
      'Confirm Section',
      'Complete Missing Field',
      'Save Progress',
    ],
  },
  {
    key: 'buyer_document_blockers',
    actor: 'buyer',
    routePattern: '/client/:token/bond-application',
    purpose: 'Outstanding bond documents remain visible as blockers from the buyer workspace.',
    requiredSelectors: [
      '[data-bond-ux-task-workspace="phase-10"]',
    ],
    requiredTexts: [
      'Documents',
      'Upload Document',
      'document',
    ],
  },
  {
    key: 'originator_review_workspace',
    actor: 'bond_originator',
    routePattern: '/attorney/transactions/:transactionId',
    purpose: 'The originator can review buyer-confirmed, system-prefilled, and missing fields before bank submission.',
    requiredSelectors: [
      '[data-bond-originator-review-workspace="phase-15"]',
      '[data-bond-originator-action-list="true"]',
    ],
    requiredTexts: [
      'Originator Review Workspace',
      'Originator Action List',
      'Buyer Section Confirmations',
      'Buyer Portal Field Alignment',
    ],
  },
  {
    key: 'originator_handoff_pdf',
    actor: 'bond_originator',
    routePattern: 'bond-application-pdf',
    purpose: 'The generated handoff PDF includes the same review context used in the originator workspace.',
    requiredSelectors: [],
    requiredTexts: [
      'Originator Review Workspace',
      'Originator Action List',
      'Buyer Section Confirmations',
      'Buyer Portal Field Alignment',
    ],
  },
])

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function buildBondApplicationBrowserE2EContract() {
  const scenarios = BOND_APPLICATION_BROWSER_E2E_SCENARIOS.map((scenario) => ({
    ...scenario,
    requiredSelectors: [...scenario.requiredSelectors],
    requiredTexts: [...scenario.requiredTexts],
  }))

  return {
    version: BOND_APPLICATION_BROWSER_E2E_VERSION,
    status: 'browser_e2e_contract_locked',
    scenarioCount: scenarios.length,
    scenarios,
    requiredSelectors: unique(scenarios.flatMap((scenario) => scenario.requiredSelectors)),
    requiredTexts: unique(scenarios.flatMap((scenario) => scenario.requiredTexts)),
    runtimeChecks: [
      'page_has_visible_content',
      'no_vite_error_overlay',
      'buyer_workspace_markers',
      'buyer_prefill_confirmation_markers',
      'originator_workspace_markers',
      'originator_handoff_pdf_sections',
    ],
  }
}
