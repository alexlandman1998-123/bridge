import {
  CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
  MATTER_PLAN_ACTION_PRIORITIES as P,
  MATTER_PLAN_ACTION_STATES as S,
  MATTER_PLAN_CAPABILITIES as C,
  MATTER_PLAN_DEPENDENCY_TYPES as D,
  MATTER_PLAN_DUE_DATE_RULE_TYPES as U,
  MATTER_PLAN_EVIDENCE_TYPES as E,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  validateConveyancerMatterPlan,
  validateMatterPlanAction,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { resolveLegalRequirements } from './attorneyWorkflowResolver.js'

export const CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION = 'conveyancer_matter_plan_generator_v1'

const TRANSFER_ROLE = R.transferAttorney

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, stableValue(value[field])]))
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function fingerprint(value) {
  const source = stableStringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function evidenceRequirement({ id, label, type = E.document, required = true, requiresApproval = false }) {
  return {
    key: key(id),
    label: text(label),
    type,
    required,
    requiresApproval,
  }
}

function actionDependency(actionKey) {
  return { key: actionKey, type: D.action, required: true }
}

function afterAction(actionKey, offsetDays = 0) {
  return { type: U.actionCompletionOffset, referenceKey: actionKey, offsetDays }
}

function documentEvidence(requirement = {}) {
  return evidenceRequirement({
    id: requirement.id,
    label: requirement.label,
    type: E.document,
    required: requirement.required !== false,
    requiresApproval: requirement.required !== false,
  })
}

function uniqueEvidence(requirements = []) {
  const byKey = new Map()
  for (const requirement of requirements) {
    if (requirement?.key && !byKey.has(requirement.key)) byKey.set(requirement.key, requirement)
  }
  return [...byKey.values()]
}

function canonicalFactsSnapshot(facts = {}, requirements = {}) {
  return stableValue({
    transactionType: facts.transactionType,
    financeType: facts.financeType,
    propertyType: facts.propertyType,
    propertyTenure: facts.propertyTenure,
    vatTreatment: facts.vatTreatment,
    buyerEntityType: facts.buyerEntityType,
    sellerEntityType: facts.sellerEntityType,
    sellerHasExistingBond: facts.sellerHasExistingBond === true,
    requiresBondAttorney: facts.requiresBondAttorney === true,
    requiresCancellationAttorney: facts.requiresCancellationAttorney === true,
    hasMultipleBuyers: facts.hasMultipleBuyers === true,
    hasMultipleSellers: facts.hasMultipleSellers === true,
    workflowTemplateKey: facts.workflowTemplateKey || '',
    routingProfileVersion: facts.routingProfileVersion || '',
    missingFields: [...(facts.missingFields || [])].sort(),
    requiredAttorneyRoles: [...(requirements.requiredAttorneyRoles || [])].sort(),
    requiredDocumentIds: (requirements.documentRequirements || [])
      .filter((item) => item.required !== false)
      .map((item) => item.id)
      .filter(Boolean)
      .sort(),
  })
}

function actionDefinition(action) {
  return {
    key: action.key,
    label: action.label,
    description: action.description,
    priority: action.priority,
    ownerRole: action.owner?.role,
    requiredCapability: action.requiredCapability,
    dependencies: action.dependencies,
    dueDateRule: action.dueDateRule,
    evidenceRequirements: action.evidenceRequirements,
    ruleId: action.provenance?.ruleId,
    ruleVersion: action.provenance?.ruleVersion,
  }
}

function withDefinitionFingerprint(action) {
  return { ...action, definitionFingerprint: fingerprint(actionDefinition(action)) }
}

function makeAction({
  key: actionKey,
  label,
  description,
  priority = P.normal,
  ownerRole = TRANSFER_ROLE,
  capability = C.executeLegal,
  dependencies = [],
  dueDateRule = { type: U.none },
  evidenceRequirements = [],
  ruleId,
  rationale,
}) {
  return withDefinitionFingerprint({
    key: actionKey,
    label,
    description,
    state: dependencies.length ? S.upcoming : S.doNow,
    priority,
    owner: { role: ownerRole, userId: null, teamId: null },
    requiredCapability: capability,
    dependencies,
    dueDateRule,
    evidenceRequirements: uniqueEvidence(evidenceRequirements),
    evidence: [],
    waitingOn: '',
    stateReason: '',
    completedAt: null,
    provenance: {
      generatorVersion: CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION,
      ruleId,
      ruleVersion: 1,
      rationale,
    },
  })
}

function transferDocuments(requirements = []) {
  return requirements.filter((item) => !item.attorneyRole || item.attorneyRole === TRANSFER_ROLE || item.attorneyRole === 'conveyancer')
}

function documentsInCategories(documents, categories) {
  const allowed = new Set(categories)
  return documents.filter((item) => allowed.has(item.category))
}

function signingEvidence(requirements = []) {
  const transferRequirements = requirements.filter((item) => !item.attorneyRole || item.attorneyRole === TRANSFER_ROLE)
  return transferRequirements.map((item) => evidenceRequirement({
    id: item.id,
    label: item.label,
    type: E.signature,
    required: item.required !== false,
  }))
}

function buildGeneratedActions(requirements) {
  const { facts } = requirements
  const documents = transferDocuments(requirements.documentRequirements || [])
  const actions = []
  const trace = []

  const add = (ruleId, action, rationale) => {
    actions.push(action)
    trace.push({ ruleId, outcome: 'selected', actionKey: action.key, rationale })
  }
  const skip = (ruleId, rationale) => trace.push({ ruleId, outcome: 'skipped', actionKey: null, rationale })

  add('open_matter', makeAction({
    key: 'open_matter',
    label: 'Open and triage the transfer matter',
    description: 'Confirm the signed instruction, create the matter record and identify immediate exceptions.',
    priority: P.critical,
    ownerRole: R.secretary,
    capability: C.executeOperational,
    dueDateRule: { type: U.planActivationOffset, offsetDays: 0 },
    evidenceRequirements: [evidenceRequirement({ id: 'signed_transfer_instruction', label: 'Signed transfer instruction' })],
    ruleId: 'open_matter',
    rationale: 'Every transfer requires a controlled matter opening.',
  }), 'Required for every transfer.')

  if ((facts.missingFields || []).length) {
    add('resolve_fact_gaps', makeAction({
      key: 'resolve_fact_gaps',
      label: 'Resolve matter classification gaps',
      description: 'Confirm the facts that affect legal requirements before relying on the generated plan.',
      priority: P.critical,
      dependencies: [actionDependency('open_matter')],
      dueDateRule: afterAction('open_matter', 0),
      evidenceRequirements: facts.missingFields.map((field) => evidenceRequirement({
        id: `confirmed_${field}`,
        label: `Confirmed ${text(field).replaceAll('_', ' ')}`,
        type: E.data,
      })),
      ruleId: 'resolve_fact_gaps',
      rationale: `Missing canonical facts: ${facts.missingFields.join(', ')}.`,
    }), 'The facts resolver reported fields that can change the plan.')
  } else {
    skip('resolve_fact_gaps', 'All plan-driving canonical facts are present.')
  }

  const identityDependencies = [actionDependency('open_matter')]
  if ((facts.missingFields || []).length) identityDependencies.push(actionDependency('resolve_fact_gaps'))
  const ficaEvidence = documentsInCategories(documents, ['fica_documents']).map(documentEvidence)
  add('verify_parties', makeAction({
    key: 'verify_parties',
    label: 'Verify parties and complete FICA',
    description: 'Verify buyer and seller identities, risk information and party records.',
    priority: P.critical,
    dependencies: identityDependencies,
    dueDateRule: afterAction('open_matter', 2),
    evidenceRequirements: ficaEvidence.length ? ficaEvidence : [
      evidenceRequirement({ id: 'buyer_fica_verified', label: 'Buyer FICA verified', type: E.confirmation, requiresApproval: true }),
      evidenceRequirement({ id: 'seller_fica_verified', label: 'Seller FICA verified', type: E.confirmation, requiresApproval: true }),
    ],
    ruleId: 'verify_parties',
    rationale: `Buyer is ${facts.buyerEntityType}; seller is ${facts.sellerEntityType}.`,
  }), 'Party verification is mandatory for every matter.')

  const authorityEvidence = documentsInCategories(documents, ['entity_documents']).map(documentEvidence)
  const authorityApplies = authorityEvidence.length > 0 || facts.buyerIsCompany || facts.buyerIsTrust || facts.sellerIsCompany ||
    facts.sellerIsTrust || facts.hasMultipleBuyers || facts.hasMultipleSellers
  if (authorityApplies) {
    add('verify_authority', makeAction({
      key: 'verify_authority',
      label: 'Verify entity and signing authority',
      description: 'Confirm resolutions, representative authority, beneficial ownership and signing configuration.',
      priority: P.critical,
      dependencies: [actionDependency('verify_parties')],
      dueDateRule: afterAction('verify_parties', 2),
      evidenceRequirements: authorityEvidence.length ? authorityEvidence : [
        evidenceRequirement({ id: 'signing_authority_confirmed', label: 'Signing authority confirmed', type: E.decision, requiresApproval: true }),
      ],
      ruleId: 'verify_authority',
      rationale: 'The party configuration or its legal document contract requires authority checks.',
    }), 'Entity, marital-status or multi-party facts require an authority workstream.')
  } else {
    skip('verify_authority', 'Both parties are single natural-person parties.')
  }

  if (facts.requiresBondAttorney) {
    add('coordinate_bond_attorney', makeAction({
      key: 'coordinate_bond_attorney',
      label: 'Coordinate the bank-appointed bond attorney',
      description: 'Capture the bank appointment, invite the confirmed firm to the shared workspace and track its formal instruction. The transfer attorney does not choose the firm.',
      priority: P.high,
      capability: C.executeOperational,
      dependencies: [actionDependency('open_matter')],
      dueDateRule: afterAction('open_matter', 1),
      evidenceRequirements: [
        evidenceRequirement({ id: 'bond_attorney_bank_appointment', label: 'Bank appointment evidence', type: E.externalReference, requiresApproval: true }),
        evidenceRequirement({ id: 'bond_attorney_platform_access', label: 'Bond attorney platform access confirmed', type: E.confirmation }),
        evidenceRequirement({ id: 'bond_attorney_instruction', label: 'Bank instruction confirmed', type: E.externalReference, requiresApproval: true }),
      ],
      ruleId: 'coordinate_bond_attorney',
      rationale: `Finance type ${facts.financeType} requires a bond attorney.`,
    }), 'Bond or hybrid finance requires bank-appointed bond-attorney coordination.')
  } else {
    skip('coordinate_bond_attorney', `Finance type ${facts.financeType} does not currently require a bond attorney.`)
  }

  if (facts.requiresCancellationAttorney) {
    add('coordinate_cancellation_attorney', makeAction({
      key: 'coordinate_cancellation_attorney',
      label: 'Coordinate the bank-appointed cancellation attorney',
      description: 'Capture the existing lender appointment, invite the confirmed firm to the shared workspace and track its formal instruction. The transfer attorney does not choose the firm.',
      priority: P.urgent,
      capability: C.executeOperational,
      dependencies: [actionDependency('open_matter')],
      dueDateRule: afterAction('open_matter', 1),
      evidenceRequirements: [
        evidenceRequirement({ id: 'cancellation_attorney_bank_appointment', label: 'Existing lender appointment evidence', type: E.externalReference, requiresApproval: true }),
        evidenceRequirement({ id: 'cancellation_attorney_platform_access', label: 'Cancellation attorney platform access confirmed', type: E.confirmation }),
        evidenceRequirement({ id: 'cancellation_attorney_instruction', label: 'Lender cancellation instruction confirmed', type: E.externalReference, requiresApproval: true }),
      ],
      ruleId: 'coordinate_cancellation_attorney',
      rationale: 'The seller has an existing bond or cancellation is explicitly required.',
    }), 'Seller bond facts require bank-appointed cancellation-attorney coordination.')
  } else {
    skip('coordinate_cancellation_attorney', 'No seller bond or cancellation requirement is currently recorded.')
  }

  const clearanceEvidence = documentsInCategories(documents, ['clearance_documents', 'property_documents', 'property_compliance'])
    .filter((item) => item.required !== false)
    .map(documentEvidence)
  add('obtain_clearances', makeAction({
    key: 'obtain_clearances',
    label: 'Obtain rates, levy and compliance clearances',
    description: 'Drive municipal, sectional-title or HOA and sale-agreement compliance requirements applicable to the property.',
    priority: P.high,
    dependencies: [actionDependency('open_matter')],
    dueDateRule: afterAction('open_matter', 3),
    evidenceRequirements: uniqueEvidence([
      evidenceRequirement({ id: 'rates_clearance', label: 'Rates clearance evidence', requiresApproval: true }),
      ...clearanceEvidence,
      ...(facts.isSectionalTitle || facts.isEstateHoa
        ? [evidenceRequirement({ id: 'levy_clearance', label: 'Levy or HOA clearance evidence', requiresApproval: true })]
        : []),
    ]),
    ruleId: 'obtain_clearances',
    rationale: `Property tenure is ${facts.propertyTenure}.`,
  }), 'Every transfer requires clearance handling, varied by property tenure.')

  const taxEvidence = facts.hasVatTreatment
    ? [evidenceRequirement({ id: 'vat_treatment_confirmed', label: 'VAT treatment confirmed', type: E.decision, requiresApproval: true })]
    : [evidenceRequirement({ id: 'transfer_duty_receipt', label: 'Transfer duty receipt or exemption', requiresApproval: true })]
  add('confirm_tax_position', makeAction({
    key: 'confirm_tax_position',
    label: 'Confirm transfer tax position',
    description: 'Determine VAT or transfer-duty treatment, complete the declaration and retain proof of outcome.',
    priority: P.high,
    ownerRole: R.accounts,
    capability: C.manageFinancial,
    dependencies: [actionDependency('verify_parties')],
    dueDateRule: afterAction('verify_parties', 3),
    evidenceRequirements: taxEvidence,
    ruleId: 'confirm_tax_position',
    rationale: `Canonical VAT treatment is ${facts.vatTreatment}.`,
  }), 'Every transfer requires a recorded tax treatment.')

  const financeDependencies = [actionDependency('verify_parties')]
  if (facts.requiresBondAttorney) financeDependencies.push(actionDependency('coordinate_bond_attorney'))
  const financeEvidence = facts.requiresBondAttorney
    ? [
        evidenceRequirement({ id: 'bond_grant_or_instruction', label: 'Bond grant or instruction', type: E.externalReference, requiresApproval: true }),
        evidenceRequirement({ id: 'guarantees_issued', label: 'Guarantees issued and accepted', type: E.document, requiresApproval: true }),
      ]
    : [evidenceRequirement({ id: 'purchase_funds_confirmed', label: 'Purchase funds or proof of funds confirmed', type: E.confirmation, requiresApproval: true })]
  add('confirm_financial_readiness', makeAction({
    key: 'confirm_financial_readiness',
    label: 'Confirm financial readiness and guarantees',
    description: 'Confirm the purchase-price funding path and secure acceptable guarantees or funds.',
    priority: P.critical,
    dependencies: financeDependencies,
    dueDateRule: afterAction('verify_parties', 5),
    evidenceRequirements: financeEvidence,
    ruleId: 'confirm_financial_readiness',
    rationale: `Finance type is ${facts.financeType}.`,
  }), 'The transfer cannot lodge without a reliable funding outcome.')

  const draftingDependencies = [actionDependency('verify_parties'), actionDependency('confirm_tax_position')]
  if (authorityApplies) draftingDependencies.push(actionDependency('verify_authority'))
  const matterSourceEvidence = documentsInCategories(documents, [
    'transaction_documents',
    'development_documents',
    'commercial_documents',
  ]).filter((item) => item.required !== false).map(documentEvidence)
  add('draft_transfer_documents', makeAction({
    key: 'draft_transfer_documents',
    label: 'Draft and review transfer documents',
    description: 'Generate the matter-specific transfer pack, apply clauses and complete legal review.',
    priority: P.high,
    dependencies: draftingDependencies,
    dueDateRule: afterAction('verify_parties', 5),
    evidenceRequirements: [
      ...matterSourceEvidence,
      evidenceRequirement({ id: 'transfer_document_pack', label: 'Reviewed transfer document pack', requiresApproval: true }),
    ],
    ruleId: 'draft_transfer_documents',
    rationale: 'The verified party and tax facts drive the transfer pack.',
  }), 'Every transfer requires a reviewed transfer pack.')

  const signatures = signingEvidence(requirements.signingRequirements || [])
  add('complete_signatures', makeAction({
    key: 'complete_signatures',
    label: 'Arrange and complete transfer signing',
    description: 'Coordinate signing, verify execution and retain the signed transfer pack.',
    priority: P.high,
    dependencies: [actionDependency('draft_transfer_documents')],
    dueDateRule: afterAction('draft_transfer_documents', 3),
    evidenceRequirements: signatures.length ? signatures : [
      evidenceRequirement({ id: 'buyer_transfer_signature', label: 'Buyer transfer signature', type: E.signature }),
      evidenceRequirement({ id: 'seller_transfer_signature', label: 'Seller transfer signature', type: E.signature }),
    ],
    ruleId: 'complete_signatures',
    rationale: 'The reviewed transfer pack must be validly executed.',
  }), 'Every transfer requires execution by the relevant parties.')

  const readinessDependencies = [
    'complete_signatures',
    'obtain_clearances',
    'confirm_financial_readiness',
    ...(facts.requiresBondAttorney ? ['coordinate_bond_attorney'] : []),
    ...(facts.requiresCancellationAttorney ? ['coordinate_cancellation_attorney'] : []),
  ].map(actionDependency)
  add('confirm_lodgement_readiness', makeAction({
    key: 'confirm_lodgement_readiness',
    label: 'Complete the lodgement readiness review',
    description: 'Confirm all transfer, bond and cancellation dependencies are aligned before lodgement.',
    priority: P.critical,
    dependencies: readinessDependencies,
    dueDateRule: afterAction('complete_signatures', 2),
    evidenceRequirements: [evidenceRequirement({
      id: 'lodgement_readiness_approved',
      label: 'Lodgement readiness approved',
      type: E.decision,
      requiresApproval: true,
    })],
    ruleId: 'confirm_lodgement_readiness',
    rationale: 'Lodgement is gated by signed documents, funds, clearances and linked legal lanes.',
  }), 'A formal readiness decision prevents premature lodgement.')

  add('lodge_transfer', makeAction({
    key: 'lodge_transfer',
    label: 'Lodge the transfer at the deeds office',
    description: 'Lodge the coordinated transfer set and capture the deeds-office reference.',
    priority: P.critical,
    dependencies: [actionDependency('confirm_lodgement_readiness')],
    dueDateRule: afterAction('confirm_lodgement_readiness', 1),
    evidenceRequirements: [evidenceRequirement({ id: 'deeds_lodgement_reference', label: 'Deeds-office lodgement reference', type: E.externalReference })],
    ruleId: 'lodge_transfer',
    rationale: 'An approved matter proceeds to deeds-office lodgement.',
  }), 'Required after the lodgement gate is satisfied.')

  add('register_transfer', makeAction({
    key: 'register_transfer',
    label: 'Coordinate and confirm registration',
    description: 'Track preparation, coordinate linked attorneys and record confirmed registration.',
    priority: P.critical,
    dependencies: [actionDependency('lodge_transfer')],
    dueDateRule: afterAction('lodge_transfer', 10),
    evidenceRequirements: [evidenceRequirement({ id: 'registration_confirmation', label: 'Registration confirmation', type: E.externalReference, requiresApproval: true })],
    ruleId: 'register_transfer',
    rationale: 'Registration completes the legal transfer event.',
  }), 'Required after lodgement.')

  add('close_matter', makeAction({
    key: 'close_matter',
    label: 'Reconcile and close the transfer matter',
    description: 'Complete financial reconciliation, deliver closing records and archive the matter.',
    priority: P.normal,
    dependencies: [actionDependency('register_transfer')],
    dueDateRule: afterAction('register_transfer', 5),
    evidenceRequirements: [
      evidenceRequirement({ id: 'final_account_reconciled', label: 'Final account reconciled', type: E.payment, requiresApproval: true }),
      evidenceRequirement({ id: 'closing_pack_delivered', label: 'Closing pack delivered' }),
    ],
    ruleId: 'close_matter',
    rationale: 'Registration must be followed by controlled financial and records close-out.',
  }), 'Every registered transfer requires close-out.')

  return { actions, trace }
}

function carryForwardRuntimeState(actions, previousPlan, trace) {
  if (!previousPlan?.actions?.length) return actions
  const previousByKey = new Map(previousPlan.actions.map((action) => [action.key, action]))
  const actionKeys = actions.map((action) => action.key)

  return actions.map((action) => {
    const previous = previousByKey.get(action.key)
    if (!previous) return action
    const previousFingerprint = previous.definitionFingerprint || fingerprint(actionDefinition(previous))
    if (previousFingerprint !== action.definitionFingerprint) {
      trace.push({ ruleId: action.provenance.ruleId, outcome: 'progress_reset', actionKey: action.key, rationale: 'The generated action definition changed.' })
      return action
    }

    const candidate = {
      ...action,
      state: previous.state,
      owner: { ...action.owner, userId: previous.owner?.userId || null, teamId: previous.owner?.teamId || null },
      evidence: Array.isArray(previous.evidence) ? previous.evidence : [],
      waitingOn: previous.waitingOn || '',
      stateReason: previous.stateReason || '',
      completedAt: previous.completedAt || null,
    }
    if (!validateMatterPlanAction(candidate, { actionKeys }).valid) {
      trace.push({ ruleId: action.provenance.ruleId, outcome: 'progress_reset', actionKey: action.key, rationale: 'The previous runtime state no longer satisfies the A1 contract.' })
      return action
    }
    trace.push({ ruleId: action.provenance.ruleId, outcome: 'progress_carried_forward', actionKey: action.key, rationale: 'The action definition is unchanged.' })
    return candidate
  })
}

function transactionOrganisationId(transaction = {}, explicitOrganisationId = '') {
  return text(explicitOrganisationId || transaction.organisation_id || transaction.organisationId || transaction.organization_id || transaction.organizationId)
}

export function generateConveyancerMatterPlan({
  transaction = {},
  organisationId = '',
  generatedAt = '',
  sourceFactsVersion = '',
  planId = '',
  previousPlan = null,
  changeReason = '',
  carryForwardProgress = true,
} = {}) {
  const requirements = resolveLegalRequirements(transaction)
  const factsSnapshot = canonicalFactsSnapshot(requirements.facts, requirements)
  const factsFingerprint = fingerprint(factsSnapshot)
  const version = previousPlan ? Number(previousPlan.version || 0) + 1 : 1
  const transactionId = text(requirements.facts.transactionId || transaction.id || transaction.transaction_id)
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const resolvedSourceFactsVersion = text(sourceFactsVersion) || `matter_facts_${factsFingerprint}`
  const resolvedPlanId = text(planId) || `matter_plan_${key(transactionId || 'unknown')}_v${version}_${factsFingerprint}`
  const generated = buildGeneratedActions(requirements)
  const actions = carryForwardProgress && previousPlan
    ? carryForwardRuntimeState(generated.actions, previousPlan, generated.trace)
    : generated.actions

  const plan = {
    contractVersion: CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
    generatorVersion: CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION,
    planId: resolvedPlanId,
    transactionId,
    organisationId: transactionOrganisationId(transaction, organisationId),
    version,
    status: MATTER_PLAN_STATUSES.draft,
    previousPlanId: previousPlan?.planId || previousPlan?.plan_id || null,
    changeReason: previousPlan ? text(changeReason) : '',
    generatedAt: resolvedGeneratedAt,
    activatedAt: null,
    sourceFactsVersion: resolvedSourceFactsVersion,
    factsSnapshot,
    actions,
    generationTrace: {
      generatorVersion: CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION,
      factsFingerprint,
      selectedActionKeys: actions.map((action) => action.key),
      decisions: generated.trace,
      warnings: [...new Set(requirements.warnings || [])],
    },
  }
  const validation = validateConveyancerMatterPlan(plan)
  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings: [...new Set([...validation.warnings, ...(requirements.warnings || [])])],
    plan: validation.plan,
    facts: requirements.facts,
    requirements,
    trace: plan.generationTrace,
  }
}
