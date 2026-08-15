import { getPurchaserEntityType, normalizePurchaserType } from '../../../../lib/purchaserPersonas.js'
import { cloneBondApplicationValue } from '../bondApplicationState.js'
import { buildLegacyBondApplicationDraft } from '../legacy/buildLegacyBondApplicationDraft.js'
import {
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  BOND_APPLICATION_PREFILL_SOURCE_PRIORITY,
  getBondApplicationPrefillSource,
} from './bondApplicationPrefillSourceMatrix.js'

export const BOND_APPLICATION_PREFILL_VERSION = 'phase-3-v1'

const SPECIAL_CONTEXT_PATHS = new Map([
  ['portal.buyer.name.first', ({ portal }) => splitName(portal?.buyer?.name).firstName],
  ['portal.buyer.name.last', ({ portal }) => splitName(portal?.buyer?.name).lastName],
  ['portal.unit.development.name', ({ portal }) => portal?.unit?.development?.name],
  ['portal.unit.unit_reference', ({ portal }) => portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : ''],
  ['portal.unit.property_reference', ({ portal }) => {
    const developmentName = String(portal?.unit?.development?.name || 'Development').trim()
    const unitNumber = String(portal?.unit?.unit_number || '').trim()
    return `${developmentName}${unitNumber ? ` - Unit ${unitNumber}` : ''}`.trim()
  }],
])

function splitName(value = '') {
  const [firstName = '', ...surnameParts] = String(value || '').trim().split(/\s+/).filter(Boolean)
  return {
    firstName,
    lastName: surnameParts.join(' '),
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function valueForStorage(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value.trim()
  return value
}

function pathSegments(path = '') {
  return String(path || '')
    .split('.')
    .flatMap((part) => {
      const bracketStart = part.indexOf('[')
      const bracketEnd = part.endsWith(']') ? part.length - 1 : -1
      if (bracketStart > 0 && bracketEnd > bracketStart + 1) {
        return [part.slice(0, bracketStart), `[${part.slice(bracketStart + 1, bracketEnd)}]`]
      }
      return [part]
    })
    .filter(Boolean)
}

function getArrayRoleItem(items = [], roleKey = '') {
  if (!Array.isArray(items)) return undefined
  return items.find((item) => String(item?.key || '').trim().toLowerCase() === String(roleKey || '').trim().toLowerCase())
}

function getByPath(root, path = '') {
  let cursor = root
  for (const segment of pathSegments(path)) {
    if (cursor === null || cursor === undefined) return undefined
    if (segment.startsWith('[') && segment.endsWith(']')) {
      cursor = getArrayRoleItem(cursor, segment.slice(1, -1))
    } else {
      cursor = cursor?.[segment]
    }
  }
  return cursor
}

function ensureObject(target, key) {
  if (!isPlainObject(target[key])) target[key] = {}
  return target[key]
}

function ensureApplicant(application, applicantKey) {
  if (!Array.isArray(application.applicants)) application.applicants = []
  let applicant = application.applicants.find((item) => item.key === applicantKey)
  if (!applicant) {
    applicant = {
      key: applicantKey,
      label: applicantKey === 'co_applicant' ? 'Co-applicant' : 'Primary applicant',
    }
    application.applicants.push(applicant)
  }
  return applicant
}

function getApplicationValue(application, path = '') {
  const segments = pathSegments(path)
  if (segments[0] === 'applicants') {
    const applicant = getArrayRoleItem(application.applicants, segments[1])
    return getByPath(applicant, segments.slice(2).join('.'))
  }
  return getByPath(application, path)
}

function setApplicationValue(application, path = '', value) {
  const segments = pathSegments(path)
  if (!segments.length) return

  if (segments[0] === 'applicants') {
    const applicant = ensureApplicant(application, segments[1])
    let cursor = applicant
    for (const segment of segments.slice(2, -1)) {
      cursor = ensureObject(cursor, segment)
    }
    cursor[segments.at(-1)] = value
    return
  }

  let cursor = application
  for (const segment of segments.slice(0, -1)) {
    cursor = ensureObject(cursor, segment)
  }
  cursor[segments.at(-1)] = value
}

function readContextPath(context, rawPath = '') {
  if (SPECIAL_CONTEXT_PATHS.has(rawPath)) {
    return SPECIAL_CONTEXT_PATHS.get(rawPath)(context)
  }
  if (rawPath.startsWith('portal.')) return getByPath(context.portal, rawPath.slice('portal.'.length))
  if (rawPath.startsWith('formData.')) return getByPath(context.formData, rawPath.slice('formData.'.length))
  return getByPath(context, rawPath)
}

function readFirstContextValue(context, paths = []) {
  for (const path of paths) {
    const value = readContextPath(context, path)
    if (isMeaningfulValue(value)) return { value, path }
  }
  return { value: undefined, path: '' }
}

function resolveSourceCandidate(field, context) {
  for (const priority of BOND_APPLICATION_PREFILL_SOURCE_PRIORITY) {
    const source = field.sources.find((item) => item.sourceKey === priority.key)
    if (!source) continue
    const resolved = readFirstContextValue(context, source.paths)
    if (isMeaningfulValue(resolved.value)) {
      return {
        sourceKey: source.sourceKey,
        sourceLabel: getBondApplicationPrefillSource(source.sourceKey)?.label || source.sourceKey,
        sourcePath: resolved.path,
        sourcePaths: source.paths,
        value: resolved.value,
        note: source.note || '',
      }
    }
  }
  return null
}

function isSavedFieldSource(sourceKey = '') {
  return sourceKey === BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication
}

function applyDerivedCompatibilityFields(application, field, value) {
  if (field.path === 'summary.buyer_entity_type') {
    const normalized = getPurchaserEntityType(normalizePurchaserType(value || 'individual'))
    setApplicationValue(application, 'summary.buyer_entity_type', normalized)
    setApplicationValue(application, 'summary.purchaser_type', normalized)
    return true
  }
  return false
}

export function buildBondApplicationPrefillDraft(portal = {}, {
  matrix = BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  baseApplication = buildLegacyBondApplicationDraft(portal),
} = {}) {
  const formData = portal?.onboardingFormData?.formData || {}
  const context = { portal, formData }
  const application = cloneBondApplicationValue(baseApplication || {}) || {}
  const sourceByPath = {}
  const missingFields = []
  const appliedFields = []
  const preservedFields = []

  for (const field of matrix) {
    const candidate = resolveSourceCandidate(field, context)
    const currentValue = getApplicationValue(application, field.path)
    const hasCurrentValue = isMeaningfulValue(currentValue)

    if (candidate) {
      sourceByPath[field.path] = {
        fieldPath: field.path,
        legacyPath: field.legacyPath,
        label: field.label,
        section: field.section,
        sourceKey: candidate.sourceKey,
        sourceLabel: candidate.sourceLabel,
        sourcePath: candidate.sourcePath,
        sourcePaths: candidate.sourcePaths,
        note: candidate.note,
        applied: !hasCurrentValue || isSavedFieldSource(candidate.sourceKey),
      }
    }

    if (!hasCurrentValue && candidate) {
      const value = valueForStorage(candidate.value)
      if (!applyDerivedCompatibilityFields(application, field, value)) {
        setApplicationValue(application, field.path, value)
      }
      appliedFields.push(field.path)
      continue
    }

    if (hasCurrentValue) {
      preservedFields.push(field.path)
    }

    if (!hasCurrentValue && field.required) {
      missingFields.push({
        path: field.path,
        label: field.label,
        section: field.section,
        originatorField: field.originatorField,
      })
    }
  }

  const sourceCounts = Object.values(sourceByPath).reduce((counts, item) => {
    counts[item.sourceKey] = (counts[item.sourceKey] || 0) + 1
    return counts
  }, {})

  application.prefill_metadata = {
    version: BOND_APPLICATION_PREFILL_VERSION,
    sourceByPath,
    sourceCounts,
    appliedFields,
    preservedFields,
    missingFields,
    generatedAt: new Date().toISOString(),
  }

  return {
    application,
    metadata: application.prefill_metadata,
  }
}

export function getBondApplicationPrefillSourceForPath(prefillMetadata = {}, path = '') {
  return prefillMetadata?.sourceByPath?.[path] || null
}
