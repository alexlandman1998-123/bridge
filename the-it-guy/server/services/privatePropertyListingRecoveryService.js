import { extractPrivatePropertyXmlTag, normalizePrivatePropertyText } from './privatePropertyClient.js'
import { resolvePrivatePropertyExternalStatus } from './privatePropertyListingSyncService.js'

function normalized(value) {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Compare PP's retained fields, never our last submitted payload. PP can
// acknowledge an update while silently retaining a previously activated address.
export function comparePrivatePropertyStoredAddress(address = {}, stored = {}) {
  const fields = ['streetName', 'streetNumber', 'complexName', 'unitNumber']
  const intendedId = Number(address.suburbId)
  const storedId = Number(stored.suburbId)
  if (intendedId > 0 && storedId > 0) fields.push('suburbId')
  else fields.push('suburb', 'town', 'province')
  return fields.filter((field) => normalized(address[field]) !== normalized(stored[field]))
}

export async function inspectPrivatePropertyListingRecovery({ portal, existingSync = {}, address = {} } = {}) {
  const propertyId = normalizePrivatePropertyText(existingSync.property_id)
  const branchGuid = normalizePrivatePropertyText(existingSync.branch_guid)
  if (!propertyId) return { checked: false, canReactivate: false, blockers: [], message: '' }
  const base = { checked: true, checkedAt: new Date().toISOString(), propertyId, branchGuid, listingType: existingSync.listing_type || 'Sale', canReactivate: false, blockers: [] }
  try {
    if (!branchGuid) throw new Error('The existing Private Property branch is missing.')
    const [statusResponse, detailsResponse] = await Promise.all([
      portal.getListingStatus({ branchGuid, propertyId }),
      portal.getListingsDetails({ branchGuid, uniqueListingId: propertyId }),
    ])
    const portalStatus = extractPrivatePropertyXmlTag(statusResponse.data, 'GetListingStatusResult')
    const externalStatus = resolvePrivatePropertyExternalStatus({ privatePropertyStatus: portalStatus, fallback: 'unknown' })
    const xml = extractPrivatePropertyXmlTag(detailsResponse.data, 'GetListingsDetailsResult')
    if (extractPrivatePropertyXmlTag(xml, 'PropertyId') !== propertyId) throw new Error('Private Property did not return the expected listing details.')
    const storedAddress = Object.fromEntries([
      ['streetName', 'StreetName'], ['streetNumber', 'StreetNumber'], ['complexName', 'ComplexName'], ['unitNumber', 'UnitNumber'],
      ['suburb', 'Suburb'], ['suburbId', 'SuburbId'], ['town', 'Town'], ['province', 'Province'],
    ].map(([key, tag]) => [key, extractPrivatePropertyXmlTag(xml, tag)]))
    const reference = extractPrivatePropertyXmlTag(xml, 'Ref') || existingSync.private_property_ref || ''
    const addressLocked = Boolean(existingSync.activated_at || reference || ['active', 'inactive', 'paused', 'removed'].includes(externalStatus))
    const changedFields = comparePrivatePropertyStoredAddress(address, storedAddress)
    if (addressLocked && !(Number(storedAddress.suburbId) > 0 || storedAddress.suburb && storedAddress.town && storedAddress.province)) {
      throw new Error('Private Property returned an incomplete address for this existing record.')
    }
    const result = { ...base, portalStatus, externalStatus, reference, addressLocked, storedAddress, changedFields }
    if (addressLocked && changedFields.length) return {
      ...result, blockers: ['private_property_locked_address_mismatch'],
      message: 'Private Property retains a different address for this listing. Its address is locked, so sending changes or reactivating it will not correct the location. Review the stored address before taking further action.',
    }
    if (externalStatus === 'inactive') return {
      ...result, canReactivate: true, blockers: ['private_property_reactivation_required'],
      message: 'Private Property reports this listing as inactive. The stored address matches. Use Reactivate on Private Property; sending content changes will not reactivate it.',
    }
    if (['removed', 'paused', 'failed', 'unknown'].includes(externalStatus)) return {
      ...result, blockers: ['private_property_existing_listing_requires_review'],
      message: `Private Property reports ${portalStatus || 'an unknown status'}. Refresh and review the existing record before sending changes.`,
    }
    return { ...result, message: '' }
  } catch {
    return { ...base, blockers: ['private_property_existing_record_not_verified'], message: 'Arch9 could not verify the existing Private Property record. Refresh the check before sending changes; no submission or status change was made.' }
  }
}

export function applyPrivatePropertyRecoveryToReadiness(report, recovery) {
  report.recovery = recovery
  if (!recovery.checked) return report
  // The retained portal address supersedes any comparison with a submitted
  // fingerprint, which may already contain an address PP silently ignored.
  report.checks = report.checks.filter((check) => check.name !== 'activated_address_protection')
  report.checks.push({ name: 'existing_portal_record', status: recovery.blockers.length ? 'BLOCKED' : 'PASS', blockers: recovery.blockers, warnings: [], details: recovery })
  report.blockers = [...new Set(report.checks.flatMap((check) => check.blockers))]
  report.warnings = [...new Set(report.checks.flatMap((check) => check.warnings))]
  report.ready = report.blockers.length === 0
  report.recovery = { ...recovery, canReactivate: recovery.canReactivate && report.blockers.every((blocker) => blocker === 'private_property_reactivation_required') }
  report.status = report.ready ? 'READY' : 'BLOCKED'
  if (!report.ready) report.nextStep = recovery.message || report.nextStep
  return report
}
