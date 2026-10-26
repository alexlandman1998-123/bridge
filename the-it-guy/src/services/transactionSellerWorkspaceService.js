import { loadTransactionSellerEditContext } from './transactionSellerSaveService.js'
import { loadTransactionSellerCapture, saveTransactionSellerCapture } from './transactionSellerCaptureService.js'
import { createListingSellerProfileBuilderDraft, buildListingSellerProfileFormPatch } from '../lib/listingSellerProfileBuilderModel.js'
import { isSellerCaptureField } from '../core/transactions/transactionSellerCapture.js'
import { saveListingSellerCanonicalUpdate } from './listings/listingSellerCanonicalUpdateService.js'

export async function loadTransactionSellerWorkspace({ transactionId, dependencies = {} }) {
  const edit = await (dependencies.loadEdit || loadTransactionSellerEditContext)({ transactionId })
  if (!edit.revision.listingId) return (dependencies.loadCapture || loadTransactionSellerCapture)({ transactionId })
  const getListing = dependencies.getListing || (await import('./privateListingService.js')).getPrivateListing
  const listing = await getListing(edit.revision.listingId, { includeRequirementsAndDocuments: false })
  if (!listing?.id || listing.id !== edit.revision.listingId) throw new Error('The linked seller profile could not be confirmed. Reload before editing.')
  return { ...edit, authority: 'listing', listing, captureDraft: createListingSellerProfileBuilderDraft(listing), roster: [], profile: {} }
}

export async function saveTransactionSellerWorkspace({ transactionId, context, draft, profile, mutationId, dependencies = {} }) {
  if (context?.authority !== 'listing') return (dependencies.saveCapture || saveTransactionSellerCapture)({ transactionId, context, profile, mutationId })
  const latest = await (dependencies.loadEdit || loadTransactionSellerEditContext)({ transactionId })
  if (latest.revision.listingId !== context.revision.listingId) throw new Error('The linked seller profile changed. Your entries remain here; reload before saving.')
  // Seller facts use the listing's guarded canonical save, exactly as its Seller
  // profile does. Property, mandate and consent evidence remain untouched.
  const patch = Object.fromEntries(Object.entries(buildListingSellerProfileFormPatch(draft)).filter(([key]) => isSellerCaptureField(key)))
  const result = await (dependencies.saveListing || saveListingSellerCanonicalUpdate)({
    listing: context.listing, formPatch: patch, mutationId, mutationType: 'seller_profile_capture',
    source: 'transaction_listing_seller_profile', organisationId: context.listing.organisationId,
    remote: true, requireIdentifiedSeller: false, syncRequirements: true,
    includeRequirementsAndDocuments: false, requirementSyncReason: 'transaction_seller_profile_capture',
  })
  if (result?.listing?.id !== context.listing.id || !result?.receipt || result.update?.mutationId !== mutationId) throw new Error('The seller save could not be confirmed. Retry to check the same save.')
  const edit = await (dependencies.loadEdit || loadTransactionSellerEditContext)({ transactionId })
  if (edit.revision.listingId !== context.revision.listingId) throw new Error('Seller details were saved to the original listing. The transaction link changed; reload its seller profile.')
  return { ...edit, authority: 'listing', listing: result.listing, captureDraft: createListingSellerProfileBuilderDraft(result.listing), roster: [], profile: {}, mutationId, warnings: result.warnings || [] }
}
