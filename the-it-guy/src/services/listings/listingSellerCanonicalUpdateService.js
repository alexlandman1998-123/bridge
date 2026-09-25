import {
  applyListingSellerCanonicalUpdateSnapshot,
  buildListingSellerCanonicalUpdate,
} from './listingSellerCanonicalUpdateModel.js'

const CONTACT_FIELD_PATTERN = /^(?:firstName|lastName|fullName|sellerName|sellerFirstName|sellerSurname|email|sellerEmail|phone|sellerPhone|mobile)$/

function text(value) {
  return String(value ?? '').trim()
}

function splitName(fullName = '') {
  const parts = text(fullName).split(/\s+/).filter(Boolean)
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '',
    lastName: parts.length > 1 ? parts.at(-1) : '',
  }
}

async function syncCrmContact(update, listing, organisationId, dependencies) {
  const leadId = text(listing.sellerLeadId || listing.originatingCrmLeadId)
  if (!organisationId || !leadId || !update.changedFields.some((key) => CONTACT_FIELD_PATTERN.test(key))) return null
  const workspace = await dependencies.fetchAgencyCrmLeadWorkspace(organisationId, leadId)
  const contact = workspace?.contacts?.[0]
  if (!contact?.contactId) return null
  const name = splitName(update.contact.fullName)
  return dependencies.updateAgencyCrmContactRecord(organisationId, contact.contactId, {
    firstName: text(update.nextFormData.sellerFirstName || update.nextFormData.firstName || name.firstName),
    lastName: text(update.nextFormData.sellerSurname || update.nextFormData.lastName || name.lastName),
    email: update.contact.email,
    phone: update.contact.phone,
    contactType: 'Seller',
  })
}

export async function saveListingSellerCanonicalUpdate(input = {}, dependencies = {}) {
  const update = buildListingSellerCanonicalUpdate(input)
  if (input.requireIdentifiedSeller === true && !update.authority.identified) {
    throw new Error('Choose and confirm the seller ownership type before saving this seller profile.')
  }

  if (input.remote === false) {
    return {
      update,
      listing: applyListingSellerCanonicalUpdateSnapshot(input.listing, update),
      receipt: { localOnly: true, mutationId: update.mutationId },
      warnings: [],
    }
  }

  const privateListingModule = dependencies.savePrivateListingSellerCanonicalUpdate
    ? null
    : await import('../privateListingService.js')
  const needsCrmProjection = input.syncLinkedCrmContact !== false &&
    text(input.organisationId) &&
    text(input.listing?.sellerLeadId || input.listing?.originatingCrmLeadId) &&
    update.changedFields.some((key) => CONTACT_FIELD_PATTERN.test(key))
  const crmModule = needsCrmProjection && (!dependencies.fetchAgencyCrmLeadWorkspace || !dependencies.updateAgencyCrmContactRecord)
    ? await import('../../lib/agencyCrmRepository.js')
    : null
  const deps = {
    savePrivateListingSellerCanonicalUpdate: dependencies.savePrivateListingSellerCanonicalUpdate || privateListingModule.savePrivateListingSellerCanonicalUpdate,
    fetchAgencyCrmLeadWorkspace: dependencies.fetchAgencyCrmLeadWorkspace || crmModule?.fetchAgencyCrmLeadWorkspace,
    updateAgencyCrmContactRecord: dependencies.updateAgencyCrmContactRecord || crmModule?.updateAgencyCrmContactRecord,
  }

  let persisted
  try {
    persisted = await deps.savePrivateListingSellerCanonicalUpdate(update, {
      syncRequirements: input.syncRequirements !== false,
      requirementSyncReason: input.requirementSyncReason,
      includeRequirementsAndDocuments: input.includeRequirementsAndDocuments !== false,
    })
  } catch (error) {
    error.canonicalUpdate = update
    if (error.committed === true) {
      return {
        update,
        listing: applyListingSellerCanonicalUpdateSnapshot(input.listing, update, error.listing),
        receipt: { committed: true, mutationId: update.mutationId, followUpRequired: true },
        syncedRequirements: error.listing?.documentRequirements || [],
        warnings: [{
          code: error.code || 'SELLER_POST_COMMIT_SYNC_FAILED',
          message: error.message,
          detail: error.cause?.message || '',
        }],
      }
    }
    throw error
  }

  const warnings = []
  if (input.syncLinkedCrmContact !== false) {
    try {
      await syncCrmContact(update, input.listing, text(input.organisationId), deps)
    } catch (error) {
      warnings.push({
        code: 'CRM_CONTACT_SYNC_FAILED',
        message: 'The seller was saved on the listing, but the linked CRM contact could not be refreshed.',
        detail: error?.message || String(error),
      })
    }
  }

  return {
    update,
    listing: applyListingSellerCanonicalUpdateSnapshot(input.listing, update, persisted.listing),
    receipt: persisted.receipt,
    syncedRequirements: persisted.syncedRequirements,
    warnings,
  }
}

export default {
  saveListingSellerCanonicalUpdate,
}
