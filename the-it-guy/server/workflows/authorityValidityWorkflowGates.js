export const AUTHORITY_VALIDITY_WORKFLOW_GATES_VERSION = 'authority_validity_workflow_gates_v1'

export const AUTHORITY_VALIDITY_GATE_KEYS = Object.freeze({
  legalAuthorityValidityReady: 'legal_authority_validity_ready',
})

const ENTITY_TYPES_REQUIRING_AUTHORITY = new Set(['company', 'close_corporation', 'trust'])
const READY_STATUSES = new Set(['approved', 'validated', 'valid', 'confirmed', 'complete', 'completed', 'satisfied', 'ready'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some(hasValue)
  return normalizeText(value).length > 0
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function readPath(source = {}, path = '') {
  return normalizeText(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => {
      if (!current || typeof current !== 'object') return undefined
      return current[key]
    }, source)
}

function firstField(source = {}, fields = []) {
  for (const field of fields) {
    const value = readPath(source, field)
    if (hasValue(value)) return value
  }
  return undefined
}

function firstFromSources(sources = [], fields = []) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const value = firstField(source, fields)
    if (hasValue(value)) return value
  }
  return undefined
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['1', 'true', 'yes', 'y', 'on', 'approved', 'confirmed', 'valid', 'validated', 'complete', 'completed'].includes(normalized)
}

function normalizeEntityType(value = '') {
  const normalized = normalizeKey(value)
  if (['company', 'pty', 'pty_ltd', 'corporate', 'business'].includes(normalized)) return 'company'
  if (['close_corporation', 'close_corp', 'cc'].includes(normalized)) return 'close_corporation'
  if (['trust', 'family_trust'].includes(normalized)) return 'trust'
  return normalized
}

function entityLabel(role = '', entityType = '') {
  const party = role === 'seller' ? 'Seller' : 'Buyer'
  if (entityType === 'close_corporation') return `${party} close corporation`
  if (entityType === 'trust') return `${party} trust`
  if (entityType === 'company') return `${party} company`
  return `${party} entity`
}

function authorityRoot(transaction = {}) {
  return parseJsonObject(
    transaction.authority_validity_json ||
      transaction.authorityValidityJson ||
      transaction.legal_authority_json ||
      transaction.legalAuthorityJson ||
      transaction.authorityValidity ||
      transaction.authority_validity ||
      transaction.legalAuthority ||
      transaction.legal_authority,
  )
}

function routingProfile(transaction = {}) {
  return parseJsonObject(
    transaction.routing_profile_json ||
      transaction.routingProfileJson ||
      transaction.routing_profile ||
      transaction.routingProfile,
  )
}

function factRoot(transaction = {}) {
  return parseJsonObject(
    transaction.facts_json ||
      transaction.factsJson ||
      transaction.canonical_facts_json ||
      transaction.canonicalFactsJson ||
      transaction.facts,
  )
}

function roleAuthoritySources(transaction = {}, role = 'buyer') {
  const authority = authorityRoot(transaction)
  const routing = routingProfile(transaction)
  const facts = factRoot(transaction)
  const roleSpecific = role === 'seller'
    ? parseJsonObject(transaction.seller_authority_validity_json || transaction.sellerAuthorityValidityJson || transaction.sellerAuthorityValidity)
    : parseJsonObject(transaction.buyer_authority_validity_json || transaction.buyerAuthorityValidityJson || transaction.buyerAuthorityValidity)
  const flatAuthority = {
    status: transaction[`${role}_authority_validity_status`] || transaction[`${role}AuthorityValidityStatus`] || '',
    review_status: transaction[`${role}_authority_review_status`] || transaction[`${role}AuthorityReviewStatus`] || '',
    reviewed_at: transaction[`${role}_authority_reviewed_at`] || transaction[`${role}AuthorityReviewedAt`] || '',
    reviewed_by: transaction[`${role}_authority_reviewed_by`] || transaction[`${role}AuthorityReviewedBy`] || '',
    signatory_name: transaction[`${role}_authorised_signatory_name`] || transaction[`${role}AuthorisedSignatoryName`] || transaction[`${role}_authorized_signatory_name`] || transaction[`${role}AuthorizedSignatoryName`] || '',
    signatory_matches_resolution: transaction[`${role}_signatory_matches_resolution`] || transaction[`${role}SignatoryMatchesResolution`] || '',
    quorum_confirmed: transaction[`${role}_authority_quorum_confirmed`] || transaction[`${role}AuthorityQuorumConfirmed`] || '',
    transaction_scope_confirmed: transaction[`${role}_authority_scope_confirmed`] || transaction[`${role}AuthorityScopeConfirmed`] || '',
    letters_of_authority_current: transaction[`${role}_letters_of_authority_current`] || transaction[`${role}LettersOfAuthorityCurrent`] || '',
  }

  return [
    roleSpecific,
    flatAuthority,
    readPath(authority, role),
    readPath(authority, `${role}.authority_validity`),
    readPath(authority, `${role}.authorityValidity`),
    readPath(authority, `${role}.legal_authority`),
    readPath(authority, `${role}.legalAuthority`),
    readPath(routing, `${role}.authority_validity`),
    readPath(routing, `${role}.authorityValidity`),
    readPath(routing, `${role}.legal_authority`),
    readPath(routing, `${role}.legalAuthority`),
    readPath(facts, role),
    readPath(facts, `${role}.authority_validity`),
    readPath(facts, `${role}.authorityValidity`),
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item))
}

function roleEntityType(transaction = {}, role = 'buyer') {
  const routing = routingProfile(transaction)
  const facts = factRoot(transaction)
  const fields = role === 'seller'
    ? [
        'seller_type',
        'sellerType',
        'seller_entity_type',
        'sellerEntityType',
        'seller.legal_type',
        'seller.legalType',
        'seller.entity_type',
        'seller.entityType',
      ]
    : [
        'purchaser_type',
        'purchaserType',
        'buyer_type',
        'buyerType',
        'buyer_entity_type',
        'buyerEntityType',
        'purchaser_entity_type',
        'purchaserEntityType',
        'buyer.legal_type',
        'buyer.legalType',
        'buyer.entity_type',
        'buyer.entityType',
      ]
  return normalizeEntityType(firstFromSources([transaction, routing, facts], fields))
}

function associatedPeople(transaction = {}, role = 'buyer', entityType = '') {
  const sources = roleAuthoritySources(transaction, role)
  const pathsByType = {
    company: ['directors', 'company.directors', 'entity.directors'],
    close_corporation: ['members', 'close_corporation.members', 'cc.members', 'entity.members'],
    trust: ['trustees', 'trust.trustees', 'entity.trustees'],
  }
  for (const source of sources) {
    for (const path of pathsByType[entityType] || []) {
      const value = readPath(source, path)
      if (Array.isArray(value) && value.length) return value
    }
  }
  return []
}

function signatoryNameFromSources(sources = []) {
  return normalizeText(firstFromSources(sources, [
    'signatory_name',
    'signatoryName',
    'authorised_signatory_name',
    'authorisedSignatoryName',
    'authorized_signatory_name',
    'authorizedSignatoryName',
    'authorised_member_name',
    'authorisedMemberName',
    'authorised_trustee_name',
    'authorisedTrusteeName',
    'authorised_signatory.name',
    'authorized_signatory.name',
    'authorised_member.name',
    'authorised_trustee.name',
  ]))
}

function hasMarkedSignatory(people = []) {
  return people.some((person) =>
    truthyFlag(person?.signing_authority ?? person?.signingAuthority ?? person?.authorised ?? person?.authorized ?? person?.is_signatory ?? person?.isSignatory),
  )
}

function validationStatus(sources = []) {
  return normalizeKey(firstFromSources(sources, [
    'status',
    'review_status',
    'reviewStatus',
    'validity_status',
    'validityStatus',
    'authority_status',
    'authorityStatus',
  ]))
}

function reviewedAt(sources = []) {
  return firstFromSources(sources, ['reviewed_at', 'reviewedAt', 'validated_at', 'validatedAt', 'approved_at', 'approvedAt'])
}

function reviewedBy(sources = []) {
  return firstFromSources(sources, ['reviewed_by', 'reviewedBy', 'validated_by', 'validatedBy', 'approved_by', 'approvedBy'])
}

function flagFromSources(sources = [], fields = []) {
  const value = firstFromSources(sources, fields)
  return hasValue(value) ? truthyFlag(value) : false
}

function buildIssue(code, message, requiredEvidence = []) {
  return {
    code,
    message,
    gateKey: AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
    requiredEvidence,
  }
}

function evaluateAuthoritySubject(subject = {}) {
  const { role, entityType, label, sources, people } = subject
  const status = validationStatus(sources)
  const statusReady = READY_STATUSES.has(status)
  const reviewed = hasValue(reviewedAt(sources)) && hasValue(reviewedBy(sources))
  const signatoryIdentified = hasValue(signatoryNameFromSources(sources)) || hasMarkedSignatory(people)
  const signatoryConfirmed = flagFromSources(sources, [
    'signatory_confirmed',
    'signatoryConfirmed',
    'signatory_matches_resolution',
    'signatoryMatchesResolution',
    'authorised_signatory_confirmed',
    'authorisedSignatoryConfirmed',
    'authorized_signatory_confirmed',
    'authorizedSignatoryConfirmed',
  ])
  const quorumConfirmed = flagFromSources(sources, [
    'quorum_confirmed',
    'quorumConfirmed',
    'quorum_valid',
    'quorumValid',
    'all_required_signatures_confirmed',
    'allRequiredSignaturesConfirmed',
    'all_trustees_signed',
    'allTrusteesSigned',
    'all_trustees_signing_confirmed',
    'allTrusteesSigningConfirmed',
    'members_resolution_confirmed',
    'membersResolutionConfirmed',
  ])
  const scopeConfirmed = flagFromSources(sources, [
    'transaction_scope_confirmed',
    'transactionScopeConfirmed',
    'resolution_scope_confirmed',
    'resolutionScopeConfirmed',
    'scope_confirmed',
    'scopeConfirmed',
    'authority_scope_confirmed',
    'authorityScopeConfirmed',
  ])
  const currentAuthorityConfirmed = entityType !== 'trust' || flagFromSources(sources, [
    'letters_current',
    'lettersCurrent',
    'letters_of_authority_current',
    'lettersOfAuthorityCurrent',
    'master_authority_current',
    'masterAuthorityCurrent',
    'trustee_authority_current',
    'trusteeAuthorityCurrent',
  ])
  const detailedReady = reviewed && signatoryIdentified && signatoryConfirmed && quorumConfirmed && scopeConfirmed && currentAuthorityConfirmed
  const ready = statusReady || detailedReady
  const issues = []

  if (!ready) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_VALIDITY_REVIEW_REQUIRED',
      `${label} authority must be reviewed for signatory, quorum, and transaction scope before transfer can advance.`,
      ['authority_validity_review'],
    ))
  }
  if (!statusReady && !signatoryIdentified) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_SIGNATORY_REQUIRED',
      `${label} needs a named or marked authorised signatory.`,
      ['authorised_signatory'],
    ))
  }
  if (!statusReady && !signatoryConfirmed) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_SIGNATORY_MATCH_REQUIRED',
      `${label} signatory must be confirmed against the authority document.`,
      ['signatory_authority_match'],
    ))
  }
  if (!statusReady && !quorumConfirmed) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_QUORUM_REQUIRED',
      `${label} quorum or all-required-signature authority must be confirmed.`,
      ['quorum_or_required_signatures'],
    ))
  }
  if (!statusReady && !scopeConfirmed) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_SCOPE_REQUIRED',
      `${label} authority must be confirmed as valid for this transaction.`,
      ['transaction_scope_authority'],
    ))
  }
  if (!statusReady && entityType === 'trust' && !currentAuthorityConfirmed) {
    issues.push(buildIssue(
      'LEGAL_AUTHORITY_CURRENT_REQUIRED',
      `${label} letters of authority or trustee appointment must be confirmed current.`,
      ['current_letters_of_authority'],
    ))
  }

  return {
    ...subject,
    status,
    reviewed,
    signatoryIdentified,
    signatoryConfirmed,
    quorumConfirmed,
    scopeConfirmed,
    currentAuthorityConfirmed,
    ready,
    issues,
  }
}

export function extractAuthorityValiditySubjects(transaction = {}) {
  return ['buyer', 'seller']
    .map((role) => {
      const entityType = roleEntityType(transaction, role)
      if (!ENTITY_TYPES_REQUIRING_AUTHORITY.has(entityType)) return null
      const sources = roleAuthoritySources(transaction, role)
      return {
        role,
        entityType,
        label: entityLabel(role, entityType),
        sources,
        people: associatedPeople(transaction, role, entityType),
      }
    })
    .filter(Boolean)
}

export function evaluateAuthorityValidityWorkflowGates(transaction = {}, options = {}) {
  const subjects = extractAuthorityValiditySubjects(transaction).map(evaluateAuthoritySubject)
  const blockers = subjects.flatMap((subject) =>
    subject.issues.map((issue) => ({ ...issue, subject })),
  )
  return {
    version: AUTHORITY_VALIDITY_WORKFLOW_GATES_VERSION,
    hasAuthoritySubjects: subjects.length > 0,
    subject_count: subjects.length,
    subjects,
    gates: {
      [AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady]: {
        gateKey: AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
        label: 'Legal Authority Validity Ready',
        status: blockers.length ? 'blocked' : 'ready',
        ready: blockers.length === 0,
        blockers,
      },
    },
    now: options.now || null,
  }
}

function gateAppliesToTargetParentStage(targetParentStage = '') {
  const stage = normalizeKey(targetParentStage)
  return ['transfer', 'registration', 'complete'].includes(stage)
}

export function buildAuthorityValidityWorkflowBlockers(transaction = {}, options = {}) {
  if (!gateAppliesToTargetParentStage(options.targetParentStage)) return []
  const evaluated = evaluateAuthorityValidityWorkflowGates(transaction, options)
  if (!evaluated.hasAuthoritySubjects) return []
  return evaluated.gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].blockers.map((item) => ({
    code: item.code,
    message: item.message,
    severity: 'hard',
    ownerRole: options.ownerRole || 'attorney',
    workflowKey: options.workflowKey || '',
    stepKey: options.stepKey || undefined,
    requiredEvidence: item.requiredEvidence || [],
    gateKey: item.gateKey,
    authorityRole: item.subject?.role || null,
    authorityEntityType: item.subject?.entityType || null,
    authorityLabel: item.subject?.label || null,
    actionKey: options.actionKey || null,
  }))
}

export function areAuthorityValidityWorkflowGatesSatisfied(transaction = {}, gateKey = '') {
  if (normalizeKey(gateKey) !== AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady) return true
  const evaluated = evaluateAuthorityValidityWorkflowGates(transaction)
  if (!evaluated.hasAuthoritySubjects) return true
  return evaluated.gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].ready
}
