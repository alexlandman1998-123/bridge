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

function readStructuredPath(source = {}, path = '') {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined || value === '') return []
  return [value]
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function yesNo(value) {
  const normalized = normalizeKey(value)
  if (['yes', 'y', 'true', '1', 'on'].includes(normalized)) return 'yes'
  if (['no', 'n', 'false', '0', 'off'].includes(normalized)) return 'no'
  return ''
}

function compactName(entry = {}) {
  const explicit = firstText(
    entry.full_name,
    entry.fullName,
    entry.displayName,
  )
  if (explicit) return explicit
  const combined = [entry.name || entry.first_name || entry.firstName, entry.surname || entry.last_name || entry.lastName]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
  if (combined) return combined
  return firstText(entry.name)
}

function hasAssociatedPartyData(entry = {}) {
  if (!entry || typeof entry !== 'object') return false
  return [
    entry.full_name,
    entry.fullName,
    entry.name,
    entry.first_name,
    entry.firstName,
    entry.surname,
    entry.last_name,
    entry.lastName,
    entry.id_number,
    entry.identity_number,
    entry.idNumber,
    entry.passport_number,
    entry.phone,
    entry.email,
    entry.residential_address,
    entry.residentialAddress,
    entry.proofAddress,
    entry.ownership_percentage,
    entry.ownershipPercentage,
    entry.ownership_share,
    entry.ownershipShare,
    entry.role_title,
    entry.roleTitle,
    entry.signing_authority,
    entry.signingAuthority,
  ].some((value) => normalizeText(value).length > 0)
}

export function normalizeAssociatedParty(entry = {}, options = {}) {
  const index = Number(options.index || 0)
  const roleLabel = normalizeText(options.roleLabel || entry.role_title || entry.roleTitle || 'Party')
  const displayName = compactName(entry)
  return {
    index,
    roleLabel,
    displayName,
    keySuffix: String(index + 1),
    idNumber: firstText(entry.id_number, entry.identity_number, entry.idNumber, entry.passport_number),
    email: firstText(entry.email),
    phone: firstText(entry.phone),
    residentialAddress: firstText(entry.residential_address, entry.residentialAddress, entry.proofAddress),
    ownershipPercentage: firstText(entry.ownership_percentage, entry.ownershipPercentage, entry.ownership_share, entry.ownershipShare),
    signingAuthority: yesNo(entry.signing_authority ?? entry.signingAuthority),
    raw: entry,
  }
}

export function getAssociatedParties(source = {}, options = {}) {
  const paths = toArray(options.paths)
  const fallbackKeys = toArray(options.fallbackKeys)
  const defaultRole = normalizeText(options.defaultRole || options.roleLabel || 'Party')
  let entries = []

  for (const path of paths) {
    const value = readStructuredPath(source, path)
    if (Array.isArray(value) && value.length) {
      entries = value
      break
    }
  }

  if (!entries.length) {
    for (const key of fallbackKeys) {
      if (Array.isArray(source?.[key]) && source[key].length) {
        entries = source[key]
        break
      }
    }
  }

  return entries
    .filter(hasAssociatedPartyData)
    .map((entry, index) => normalizeAssociatedParty(entry, { index, roleLabel: defaultRole }))
}

export function buildAssociatedPartyRequirementDefinitions(parties = [], options = {}) {
  const keyPrefix = normalizeKey(options.keyPrefix || 'party')
  const roleLabel = normalizeText(options.roleLabel || 'Party')
  const groupKey = normalizeText(options.groupKey || 'buyer_fica')
  const group = normalizeText(options.group || groupKey)
  const expectedFromRole = normalizeText(options.expectedFromRole || '')
  const defaultVisibility = normalizeText(options.defaultVisibility || '')
  const includeProofOfAddress = options.includeProofOfAddress !== false
  const definitions = []

  parties.forEach((party, index) => {
    const normalizedParty = party?.keySuffix
      ? party
      : normalizeAssociatedParty(party, { index, roleLabel })
    const sequence = index + 1
    const labelPrefix = `${roleLabel} ${sequence}`
    const nameSuffix = normalizedParty.displayName ? ` - ${normalizedParty.displayName}` : ''
    const generatedFrom = {
      participantRole: normalizeKey(roleLabel),
      participantIndex: sequence,
      participantName: normalizedParty.displayName || '',
      ownershipPercentage: normalizedParty.ownershipPercentage || '',
      signingAuthority: normalizedParty.signingAuthority || '',
      cardinalityExpanded: true,
    }

    definitions.push({
      key: `${keyPrefix}_${sequence}_id_document`,
      label: `${labelPrefix} ID Document / Passport${nameSuffix}`,
      name: `${labelPrefix} ID Document / Passport${nameSuffix}`,
      groupKey,
      group,
      description: `Identity document for ${labelPrefix.toLowerCase()}${normalizedParty.displayName ? ` (${normalizedParty.displayName})` : ''}.`,
      expectedFromRole: expectedFromRole || undefined,
      defaultVisibility: defaultVisibility || undefined,
      generatedFrom,
      cardinalityExpanded: true,
    })

    if (includeProofOfAddress) {
      definitions.push({
        key: `${keyPrefix}_${sequence}_proof_of_address`,
        label: `${labelPrefix} Proof of Address${nameSuffix}`,
        name: `${labelPrefix} Proof of Address${nameSuffix}`,
        groupKey,
        group,
        description: `Proof of address for ${labelPrefix.toLowerCase()}${normalizedParty.displayName ? ` (${normalizedParty.displayName})` : ''}.`,
        expectedFromRole: expectedFromRole || undefined,
        defaultVisibility: defaultVisibility || undefined,
        generatedFrom,
        cardinalityExpanded: true,
      })
    }
  })

  return definitions
}

export function hasAssociatedPartyCardinality(source = {}, configs = []) {
  return configs.some((config) => getAssociatedParties(source, config).length > 1)
}

export function hasAssociatedPartyPresence(source = {}, configs = []) {
  return configs.some((config) => getAssociatedParties(source, config).length > 0)
}
