const text = value => typeof value === 'string' ? value.trim() : ''

// Listing-linked sellers keep their current listing authority. Only explicit
// transaction manual captures supply the additional seller directory people.
export function transactionSellerDirectoryPeople({ formData = {}, listingId = null } = {}) {
  const snapshot = formData.__bridge_transaction_parties
  if (listingId || !['agent_manual','seller_link'].includes(formData.__bridge_transaction_seller_capture?.source) || snapshot?.version !== 'transaction_party_profile_v1') return null
  const seller = snapshot.seller
  if (!Array.isArray(seller?.people)) return null
  const entity = ['individual','foreign_individual','multiple_owners','unknown'].includes(seller.entityType) ? '' : text(seller.name)
  return seller.people.filter(person => person && (text(person.name) || text(person.email) || text(person.phone) || (person.primaryContact && entity))).map(person => ({
    id: text(person.id), name: text(person.name) || (person.primaryContact ? entity : ''), email: text(person.email), phone: text(person.phone),
    type: text(seller.entityType), company: entity, partyRole: text(person.role),
  }))
}
