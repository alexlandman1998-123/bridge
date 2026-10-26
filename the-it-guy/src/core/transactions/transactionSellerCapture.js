import { buildListingSellerProfileFormPatch, createListingSellerProfileBuilderDraft } from '../../lib/listingSellerProfileBuilderModel.js'
import { getSellerFieldOwnership } from '../../lib/sellerDataOwnershipContract.js'
import { transactionSellerProfileFormData, transactionSellerProfileFromSource } from './transactionPartyProfile.js'

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
export const isSellerCaptureField = key => !/[.\]]|\[/.test(key) && !/consent|signature|signed|token|password/i.test(key) && getSellerFieldOwnership(key)?.canonicalPaths.some(path => path.startsWith('seller.'))

export function sellerCaptureDraft(context) {
  const profile = context.profile || {}
  // Older transaction captures recorded the singleton owner without isOwner.
  // Retain their saved identity using the explicit primary person reference.
  const natural = ['individual', 'foreign_individual'].includes(profile.entityType)
  const people = profile.people || []
  const owner = natural ? people.find(person => person.isOwner || (person.primaryContact && (!person.role || person.role === 'owner'))) : null
  const compatible = owner ? { ...profile, people: people.map(person => person === owner ? { ...person, isOwner: true } : person) } : profile
  const formData = transactionSellerProfileFormData(compatible)
  if (owner) for (const [field, value] of Object.entries({ dateOfBirth: owner.dateOfBirth, nationality: owner.nationality, residentialAddress: owner.residentialAddress, incomeTaxNumber: owner.incomeTaxNumber, maritalStatus: owner.maritalStatus, maritalRegime: owner.maritalRegime })) {
    if (!Object.hasOwn(formData, field) && value !== undefined) formData[field] = value
  }
  // With no profile yet, seed contacts from this transaction, not from a lead.
  return createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData }, sellerName: context.details?.name, sellerEmail: context.details?.email, sellerPhone: context.details?.phone })
}

export function buildTransactionSellerCapture(draft, context, primaryId, uuid = () => crypto.randomUUID()) {
  const profile = transactionSellerProfileFromSource({ formData: buildListingSellerProfileFormPatch(draft), personId: primaryId })
  const original = context.profile?.people || []
  const primary = profile.people.find(person => person.sourceSlot === 'primary_contact') || profile.people.find(person => person.id === primaryId) || profile.people.find(person => person.primaryContact)
  const ids = new Map()
  const people = profile.people.map(person => {
    const previous = original.find(saved => (person.sourcePersonId && saved.sourcePersonId === person.sourcePersonId && saved.role === person.role) || (person.sourceSlot && saved.sourceSlot === person.sourceSlot && saved.role === person.role))
    const primaryContact = person === primary
    const id = primaryContact ? primaryId : isUuid(person.id) ? person.id : isUuid(previous?.id) ? previous.id : uuid()
    ids.set(person.id, id)
    return { ...person, ...(draft.branch === 'foreign_individual' && person.role === 'owner' ? { identityNumber: draft.foreignPassportNumber || '' } : {}), id, primaryContact, sourceOnboardingId: '', sourcePersonId: id, sourceKey: '', sourceLinkStatus: 'captured' }
  })
  return {
    ...profile,
    profileFields: Object.fromEntries(Object.entries(profile.profileFields || {}).filter(([key]) => isSellerCaptureField(key))),
    people: people.map(person => ({ ...person, spouseOfId: ids.get(person.spouseOfId) || person.spouseOfId })),
  }
}
