import {
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_TEMPLATE_CAPABILITIES,
  CONVEYANCER_TEMPLATE_LANES,
  CONVEYANCER_TEMPLATE_VARIABLE_COVERAGE as VC,
  buildConveyancerTemplateGovernanceFingerprint,
  canConveyancerTemplateActor,
  normalizeConveyancerTemplateVersion,
  selectConveyancerTemplateVersion,
} from '../../core/documents/legalTemplateGovernance.js'

export const CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION = 'conveyancer_correspondence_generator_v1'

export const CONVEYANCER_CORRESPONDENCE_CHANNELS = Object.freeze({
  email: 'email',
  letter: 'letter',
  portalMessage: 'portal_message',
})

export const CONVEYANCER_CORRESPONDENCE_FORMATS = Object.freeze({
  plainText: 'plain_text',
  markdown: 'markdown',
})

const CHANNELS = new Set(Object.values(CONVEYANCER_CORRESPONDENCE_CHANNELS))
const FORMATS = new Set(Object.values(CONVEYANCER_CORRESPONDENCE_FORMATS))
const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney, R.secretary, R.firmManager])
const BOND_ROLES = new Set([R.bondAttorney, R.secretary, R.firmManager])
const CANCELLATION_ROLES = new Set([R.cancellationAttorney, R.secretary, R.firmManager])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function fail(code, errors = []) {
  return { ok: false, duplicate: false, code, errors: unique(errors), correspondence: null, event: null }
}

const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount))
}

function sha256(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''))
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = bytes.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3)
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10)
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choose + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }
  return state.map((item) => item.toString(16).padStart(8, '0')).join('')
}

export function buildConveyancerCorrespondenceAssetContentHash(asset = {}) {
  return sha256(JSON.stringify({
    channel: key(asset.channel),
    format: key(asset.format),
    subjectTemplate: String(asset.subjectTemplate ?? asset.subject_template ?? ''),
    bodyTemplate: String(asset.bodyTemplate ?? asset.body_template ?? ''),
  }))
}

export function buildConveyancerCorrespondenceClauseContentHash(legalText = '') {
  return sha256(String(legalText || ''))
}

export function buildConveyancerGovernedContentHash(value = '') {
  return sha256(typeof value === 'string' ? value : JSON.stringify(value))
}

export function buildConveyancerCorrespondenceValueHash(variableKey = '', formattedValue = '') {
  return sha256(JSON.stringify({ key: key(variableKey), value: String(formattedValue ?? '') }))
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

export function buildConveyancerCorrespondenceContentFingerprint({ subject = '', body = '', recipients = [], templateVersionId = '' } = {}) {
  return hash({ subject: subject || null, body: String(body || ''), recipients: clone(recipients), templateVersionId: text(templateVersionId) })
}

function laneAuthorised(role, lane) {
  if (lane === CONVEYANCER_TEMPLATE_LANES.transfer) return TRANSFER_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.bond) return BOND_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.cancellation) return CANCELLATION_ROLES.has(role)
  return canConveyancerTemplateActor(role, CONVEYANCER_TEMPLATE_CAPABILITIES.view)
}

function readPath(source, path) {
  const segments = text(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let current = source
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

function firstDefined(source, paths = []) {
  for (const path of paths) {
    const value = readPath(source, path)
    if (value !== undefined && value !== null && !(typeof value === 'string' && !value.trim())) return { value, path }
  }
  return { value: undefined, path: null }
}

function formatMoney(value) {
  const amount = typeof value === 'object' && value !== null ? Number(value.amount) : Number(value)
  if (!Number.isFinite(amount)) return ''
  const currency = text(typeof value === 'object' && value !== null ? value.currency : 'ZAR').toUpperCase() || 'ZAR'
  const symbol = currency === 'ZAR' ? 'R' : currency
  const [whole, decimals] = amount.toFixed(2).split('.')
  return `${symbol} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decimals}`
}

function formatDate(value) {
  if (!validDate(value)) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function formatAddress(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ')
  if (!value || typeof value !== 'object') return text(value)
  return ['line1', 'line2', 'suburb', 'city', 'province', 'postalCode', 'country'].map((field) => text(value[field])).filter(Boolean).join(', ')
}

function formatParty(value) {
  if (!value || typeof value !== 'object') return text(value)
  return text(value.displayName || value.fullName || value.full_name || value.name)
}

function formatTable(value) {
  if (!Array.isArray(value)) return text(value)
  return value.map((row) => {
    if (Array.isArray(row)) return row.map(text).join(' | ')
    if (row && typeof row === 'object') return Object.values(row).map(text).join(' | ')
    return text(row)
  }).filter(Boolean).join('\n')
}

function formatValue(value, type) {
  if (value === undefined || value === null) return ''
  if (type === 'money') return formatMoney(value)
  if (type === 'date') return formatDate(value)
  if (type === 'boolean') return value === true || key(value) === 'true' ? 'Yes' : value === false || key(value) === 'false' ? 'No' : ''
  if (type === 'number') return Number.isFinite(Number(value)) ? String(Number(value)) : ''
  if (type === 'address') return formatAddress(value)
  if (type === 'party') return formatParty(value)
  if (type === 'table') return formatTable(value)
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ')
  return text(value)
}

function extractTokens(value = '') {
  return unique([...String(value || '').matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => key(match[1])))
}

function interpolate(value, resolvedValues, { subject = false } = {}) {
  const rendered = String(value || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => resolvedValues[key(token)] ?? '')
  return subject ? rendered.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : rendered.trim()
}

function resolveBuiltInCalculated(variableKey, context) {
  if (variableKey === 'generated_date') return context.generated.date
  if (variableKey === 'generated_datetime') return context.generated.dateTime
  if (variableKey === 'matter_reference') return context.plan.planId
  if (variableKey === 'transaction_reference') return context.plan.transactionId
  if (variableKey === 'template_version') return context.template.versionTag
  return undefined
}

function normalizeClauseRecord(input = {}) {
  return {
    key: key(input.key || input.clauseKey || input.clause_key),
    version: Number(input.version || input.clauseVersion || input.clause_version || 0),
    contentHash: text(input.contentHash || input.content_hash).toLowerCase(),
    legalText: text(input.legalText || input.legal_text),
    approvedAt: input.approvedAt || input.approved_at || null,
    approvedBy: {
      role: normalizeMatterPlanOwnerRole(input.approvedBy?.role || input.approved_by?.role || input.approved_by_role),
      userId: text(input.approvedBy?.userId || input.approved_by?.user_id || input.approved_by) || null,
    },
  }
}

function resolveVariables({ template, sourceContext, manualValues, calculatedValues, clauses }) {
  const errors = []
  const resolved = {}
  const manifest = []
  const clauseManifest = []
  const clauseRegistry = (Array.isArray(clauses) ? clauses : []).map(normalizeClauseRecord)

  for (const variable of template.variables) {
    let value
    let source = null
    if (variable.coverage === VC.manual) {
      value = manualValues[variable.key]
      source = value === undefined ? null : `manual.${variable.key}`
    } else if (variable.coverage === VC.calculated) {
      const explicit = calculatedValues[variable.key]
      const fromPath = firstDefined(sourceContext, variable.sourcePaths)
      value = explicit ?? fromPath.value ?? resolveBuiltInCalculated(variable.key, sourceContext)
      source = explicit !== undefined ? `calculated.${variable.key}` : fromPath.path || (value === undefined ? null : `built_in.${variable.key}`)
    } else if (variable.coverage === VC.agencySetting) {
      if (variable.sourcePaths.some((path) => !path.startsWith('organisation.'))) errors.push(`agency_variable_source_outside_organisation:${variable.key}`)
      const found = firstDefined(sourceContext, variable.sourcePaths)
      value = found.value
      source = found.path
    } else if (variable.coverage === VC.signingPreset) {
      if (variable.sourcePaths.some((path) => !path.startsWith('signing.'))) errors.push(`signing_variable_source_outside_preset:${variable.key}`)
      const found = firstDefined(sourceContext, variable.sourcePaths)
      value = found.value
      source = found.path
    } else if (variable.coverage === VC.approvedClause) {
      const reference = template.clauses.find((item) => item.key === variable.clauseKey)
      const conditionApplies = !reference?.conditionKey || Boolean(readPath(sourceContext, reference.conditionKey))
      if (!conditionApplies) {
        value = ''
        source = `clause.${variable.clauseKey}:not_applicable`
      } else if (!reference) {
        errors.push(`template_clause_reference_missing:${variable.clauseKey || variable.key}`)
      } else {
        const clause = clauseRegistry.find((item) => item.key === reference.key && item.version === reference.version)
        if (!clause) errors.push(`approved_clause_missing:${reference.key}:v${reference.version}`)
        else if (clause.contentHash !== reference.contentHash) errors.push(`approved_clause_hash_mismatch:${reference.key}:v${reference.version}`)
        else if (buildConveyancerCorrespondenceClauseContentHash(clause.legalText) !== reference.contentHash) errors.push(`approved_clause_content_hash_invalid:${reference.key}:v${reference.version}`)
        else if (!clause.legalText) errors.push(`approved_clause_text_missing:${reference.key}:v${reference.version}`)
        else if (!validDate(clause.approvedAt) || !clause.approvedBy.userId || !canConveyancerTemplateActor(clause.approvedBy.role, CONVEYANCER_TEMPLATE_CAPABILITIES.approve)) errors.push(`approved_clause_authority_invalid:${reference.key}:v${reference.version}`)
        else if (clause.approvedAt !== reference.approvedAt || clause.approvedBy.userId !== reference.approvedBy.userId || clause.approvedBy.role !== reference.approvedBy.role) errors.push(`approved_clause_evidence_mismatch:${reference.key}:v${reference.version}`)
        else {
          value = clause.legalText
          source = `clause.${reference.key}.v${reference.version}`
          clauseManifest.push({ key: reference.key, version: reference.version, contentHash: reference.contentHash, approvedAt: clause.approvedAt, approvedBy: clause.approvedBy })
        }
      }
    } else {
      const found = firstDefined(sourceContext, variable.sourcePaths)
      value = found.value
      source = found.path
    }
    const formatted = formatValue(value, variable.type)
    if (variable.required && !formatted) errors.push(`required_correspondence_value_missing:${variable.key}`)
    resolved[variable.key] = formatted
    manifest.push({
      key: variable.key,
      type: variable.type,
      coverage: variable.coverage,
      required: variable.required,
      resolved: Boolean(formatted),
      sensitive: variable.sensitive,
      source,
      valueHash: buildConveyancerCorrespondenceValueHash(variable.key, formatted),
    })
  }

  for (const variable of template.variables.filter((item) => item.coverage === VC.approvedClause && resolved[item.key])) {
    const clauseTokens = extractTokens(resolved[variable.key])
    const unknown = clauseTokens.filter((token) => !Object.hasOwn(resolved, token))
    if (unknown.length) errors.push(...unknown.map((token) => `unmapped_clause_placeholder:${variable.clauseKey}:${token}`))
    const missing = clauseTokens.filter((token) => !resolved[token])
    if (missing.length) errors.push(...missing.map((token) => `clause_value_missing:${variable.clauseKey}:${token}`))
    if (clauseTokens.includes(variable.key)) errors.push(`recursive_clause_placeholder:${variable.clauseKey}:${variable.key}`)
    resolved[variable.key] = interpolate(resolved[variable.key], resolved)
  }
  return { valid: errors.length === 0, errors: unique(errors), resolved, manifest, clauseManifest }
}


export function resolveConveyancerCorrespondenceTemplateValues({ template = {}, sourceContext = {}, manualValues = {}, calculatedValues = {}, clauses = [] } = {}) {
  const normalizedTemplate = normalizeConveyancerTemplateVersion(template)
  const result = resolveVariables({
    template: normalizedTemplate,
    sourceContext: clone(sourceContext),
    manualValues: clone(manualValues),
    calculatedValues: clone(calculatedValues),
    clauses: clone(clauses),
  })
  return deepFreeze(clone(result))
}

function normalizeRecipients(recipients = [], channel) {
  const normalized = (Array.isArray(recipients) ? recipients : []).map((item) => ({
    role: key(item.role) || 'other',
    name: text(item.name),
    email: text(item.email).toLowerCase() || null,
    address: formatAddress(item.address) || null,
    userId: text(item.userId || item.user_id) || null,
    delivery: key(item.delivery) || 'to',
  }))
  const errors = []
  if (!normalized.length) errors.push('correspondence_recipient_required')
  if (channel === CONVEYANCER_CORRESPONDENCE_CHANNELS.email) {
    if (normalized.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email || ''))) errors.push('valid_recipient_email_required')
    if (!normalized.some((item) => item.delivery === 'to')) errors.push('primary_email_recipient_required')
  }
  if (channel === CONVEYANCER_CORRESPONDENCE_CHANNELS.letter && normalized.some((item) => !item.name || !item.address)) errors.push('letter_recipient_name_and_address_required')
  if (channel === CONVEYANCER_CORRESPONDENCE_CHANNELS.portalMessage && normalized.some((item) => !item.userId)) errors.push('portal_recipient_user_required')
  const identities = normalized.map((item) => item.email || item.userId || `${item.name}:${item.address}`)
  if (new Set(identities).size !== identities.length) errors.push('duplicate_correspondence_recipient')
  return { valid: errors.length === 0, errors: unique(errors), recipients: normalized }
}

function findAsset(assets, templateVersionId) {
  if (Array.isArray(assets)) return assets.find((item) => text(item.templateVersionId || item.template_version_id) === templateVersionId) || null
  if (assets && typeof assets === 'object') return assets[templateVersionId] || null
  return null
}

function validateAsset(asset, template) {
  const channel = key(asset?.channel)
  const format = key(asset?.format)
  const subjectTemplate = String(asset?.subjectTemplate ?? asset?.subject_template ?? '')
  const bodyTemplate = String(asset?.bodyTemplate ?? asset?.body_template ?? '')
  const errors = []
  if (!CHANNELS.has(channel)) errors.push('invalid_correspondence_channel')
  if (!FORMATS.has(format)) errors.push('invalid_correspondence_format')
  if (!bodyTemplate.trim()) errors.push('correspondence_body_template_required')
  if (channel === CONVEYANCER_CORRESPONDENCE_CHANNELS.email && !subjectTemplate.trim()) errors.push('email_subject_template_required')
  const declaredContentHash = text(asset?.contentHash || asset?.content_hash).toLowerCase()
  const calculatedContentHash = buildConveyancerCorrespondenceAssetContentHash(asset)
  if (declaredContentHash !== calculatedContentHash) errors.push('correspondence_asset_content_hash_invalid')
  if (declaredContentHash !== template.content.contentHash) errors.push('correspondence_asset_hash_mismatch')
  const assetTokens = unique([...extractTokens(subjectTemplate), ...extractTokens(bodyTemplate)]).sort()
  const governedTokens = [...template.content.placeholderKeys].sort()
  const undeclared = assetTokens.filter((token) => !governedTokens.includes(token))
  const unused = governedTokens.filter((token) => !assetTokens.includes(token))
  if (undeclared.length) errors.push(...undeclared.map((token) => `undeclared_correspondence_placeholder:${token}`))
  if (unused.length) errors.push(...unused.map((token) => `governed_placeholder_not_used:${token}`))
  return { valid: errors.length === 0, errors: unique(errors), channel, format, subjectTemplate, bodyTemplate }
}

export function generateConveyancerCorrespondence({
  plan = {},
  templates = [],
  assets = [],
  correspondenceKey = '',
  lane = CONVEYANCER_TEMPLATE_LANES.transfer,
  actor = {},
  recipients = [],
  data = {},
  organisationSettings = {},
  signingPreset = {},
  manualValues = {},
  calculatedValues = {},
  clauses = [],
  generatedAt = '',
  commandId = '',
  expectedPlanId = '',
  expectedPlanVersion = null,
  existingGenerations = [],
} = {}) {
  const validation = validateConveyancerMatterPlan(plan)
  if (!validation.valid) return fail('matter_plan_invalid', validation.errors)
  const currentPlan = validation.plan
  if (currentPlan.status !== MATTER_PLAN_STATUSES.active) return fail('active_matter_plan_required')
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  if (!text(actor.userId || actor.user_id)) return fail('correspondence_actor_user_required')
  if (!canConveyancerTemplateActor(actorRole, CONVEYANCER_TEMPLATE_CAPABILITIES.view)) return fail('correspondence_generation_not_authorised')
  const requestedLane = key(lane)
  if (!laneAuthorised(actorRole, requestedLane)) return fail('correspondence_lane_not_authorised')
  const resolvedCommandId = text(commandId)
  if (!resolvedCommandId) return fail('command_id_required')
  if (!text(expectedPlanId)) return fail('expected_plan_id_required')
  if (text(expectedPlanId) !== currentPlan.planId) return fail('stale_plan_id')
  if (!Number.isInteger(Number(expectedPlanVersion))) return fail('expected_plan_version_required')
  if (Number(expectedPlanVersion) !== Number(currentPlan.version)) return fail('stale_plan_version')
  const duplicate = (Array.isArray(existingGenerations) ? existingGenerations : []).find((item) =>
    text(item.commandId || item.command_id) === resolvedCommandId && text(item.planId || item.plan_id) === currentPlan.planId)
  if (duplicate) return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], correspondence: clone(duplicate.correspondence || duplicate), event: clone(duplicate.event || null) }
  if (!validDate(generatedAt)) return fail('generated_at_required')
  const requestedKey = key(correspondenceKey)
  if (!requestedKey) return fail('correspondence_key_required')

  const eligibleTemplates = (Array.isArray(templates) ? templates : []).filter((item) => {
    const normalized = normalizeConveyancerTemplateVersion(item)
    return normalized.templateKey === requestedKey && normalized.documentKind === 'correspondence' && normalized.packetType === 'correspondence' && normalized.lane === requestedLane
  })
  const selection = selectConveyancerTemplateVersion({
    templates: eligibleTemplates,
    matterFacts: { ...currentPlan.factsSnapshot, legal_lane: requestedLane },
    organisationId: currentPlan.organisationId,
    asOf: generatedAt,
  })
  if (selection.conflict) return fail('correspondence_template_selection_conflict', selection.candidates.slice(0, 2).map((item) => item.template.templateVersionId))
  if (!selection.selected) return fail('no_selectable_correspondence_template', selection.evaluations.flatMap((item) => item.reasons))
  const template = selection.selected
  const asset = findAsset(assets, template.templateVersionId)
  if (!asset) return fail('correspondence_template_asset_missing')
  const assetValidation = validateAsset(asset, template)
  if (!assetValidation.valid) return fail('correspondence_template_asset_invalid', assetValidation.errors)
  const recipientValidation = normalizeRecipients(recipients, assetValidation.channel)
  if (!recipientValidation.valid) return fail('correspondence_recipients_invalid', recipientValidation.errors)

  const resolvedGeneratedAt = new Date(generatedAt).toISOString()
  const sourceContext = {
    ...clone(data),
    matter: clone(currentPlan.factsSnapshot),
    plan: { planId: currentPlan.planId, version: currentPlan.version, transactionId: currentPlan.transactionId, organisationId: currentPlan.organisationId },
    organisation: clone(organisationSettings),
    signing: clone(signingPreset),
    generated: { date: resolvedGeneratedAt.slice(0, 10), dateTime: resolvedGeneratedAt },
    template: { versionTag: template.versionTag, versionNumber: template.versionNumber },
  }
  const variableResolution = resolveVariables({
    template,
    sourceContext,
    manualValues: clone(manualValues),
    calculatedValues: clone(calculatedValues),
    clauses,
  })
  if (!variableResolution.valid) return fail('correspondence_values_incomplete', variableResolution.errors)
  const subject = interpolate(assetValidation.subjectTemplate, variableResolution.resolved, { subject: true })
  const body = interpolate(assetValidation.bodyTemplate, variableResolution.resolved)
  if (assetValidation.channel === CONVEYANCER_CORRESPONDENCE_CHANNELS.email && !subject) return fail('generated_correspondence_subject_empty')
  if (!body) return fail('generated_correspondence_body_empty')
  if (extractTokens(subject).length || extractTokens(body).length) return fail('unresolved_correspondence_placeholder')

  const contentFingerprint = buildConveyancerCorrespondenceContentFingerprint({ subject, body, recipients: recipientValidation.recipients, templateVersionId: template.templateVersionId })
  const correspondenceId = `correspondence:${currentPlan.planId}:${requestedKey}:${hash(resolvedCommandId).replace('fnv1a_', '')}`
  const correspondence = deepFreeze({
    version: CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION,
    correspondenceId,
    commandId: resolvedCommandId,
    status: 'draft',
    dispatchAllowed: false,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    correspondenceKey: requestedKey,
    lane: requestedLane,
    channel: assetValidation.channel,
    format: assetValidation.format,
    subject: subject || null,
    body,
    recipients: recipientValidation.recipients,
    template: {
      templateId: template.templateId,
      templateVersionId: template.templateVersionId,
      templateKey: template.templateKey,
      versionNumber: template.versionNumber,
      versionTag: template.versionTag,
      contentHash: template.content.contentHash,
      governanceFingerprint: buildConveyancerTemplateGovernanceFingerprint(template),
      selectionReason: selection.selectionReason,
    },
    variableManifest: variableResolution.manifest,
    clauseManifest: variableResolution.clauseManifest,
    contentFingerprint,
    generatedAt: resolvedGeneratedAt,
    generatedBy: { role: actorRole, userId: text(actor.userId || actor.user_id) },
  })
  const event = deepFreeze({
    version: CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION,
    eventId: `correspondence_generation:${correspondenceId}`,
    eventType: 'correspondence_generated',
    commandId: resolvedCommandId,
    correspondenceId,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    templateVersionId: template.templateVersionId,
    templateContentHash: template.content.contentHash,
    contentFingerprint,
    variableKeys: variableResolution.manifest.map((item) => item.key),
    sensitiveVariableKeys: variableResolution.manifest.filter((item) => item.sensitive).map((item) => item.key),
    clauseReferences: variableResolution.clauseManifest.map((item) => ({ key: item.key, version: item.version, contentHash: item.contentHash })),
    recipientCount: recipientValidation.recipients.length,
    channel: assetValidation.channel,
    occurredAt: resolvedGeneratedAt,
    actor: correspondence.generatedBy,
    dispatchPerformed: false,
  })
  return { ok: true, duplicate: false, code: 'correspondence_generated', errors: [], correspondence, event }
}
