import {
  SELLER_DATA_OWNERSHIP_VERSION,
  SELLER_PERSON_COLLECTIONS,
  SELLER_RECORD_OWNERSHIP,
  sellerPersonSourceKey,
} from '../../lib/sellerDataOwnershipContract.js'
import { normalizeSellerProfileType } from '../../lib/sellerPartyAuthorityContract.js'

const text = value => String(value ?? '').trim()
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const at = (value, path) => path.split('.').reduce((result, key) => result?.[key], value)
const requiredTables = [
  'private_listings', 'private_listing_seller_onboarding', 'leads', 'contacts',
  'transactions', 'transaction_participants', 'agency_client_profiles', 'agency_client_links', 'client_portal_contexts',
]

// Inspect already-authorised records only. No database client, writes, inferred
// identity matches, latest-row selection or raw personal values in the report.
export function buildSellerRelationshipReport(snapshot = {}) {
  const tables = object(snapshot.tables)
  const complete = new Set(Array.isArray(snapshot.completeTables) ? snapshot.completeTables : [])
  const issues = []
  const unchecked = []
  const references = []
  const indexes = new Map()
  const rows = table => Array.isArray(tables[table]) ? tables[table] : []
  const idOf = (table, row) => text(row?.[SELLER_RECORD_OWNERSHIP[table]?.identity || 'id'])
  const recordRef = (table, row) => ({ table, id: idOf(table, row) })
  const add = (code, table, row, field, target = null) => issues.push({ code, record: recordRef(table, row), field, target })

  for (const [table, records] of Object.entries(tables)) {
    if (!Array.isArray(records)) throw new Error('Seller relationship tables must contain arrays of records.')
    const index = new Map()
    for (const row of records) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Seller relationship records must be objects.')
      const id = idOf(table, row)
      if (!id) { add('record_identity_missing', table, row, 'id'); continue }
      index.set(id, [...(index.get(id) || []), row])
      if (SELLER_RECORD_OWNERSHIP[table]?.scope && !text(row.organisation_id)) {
        add('organisation_scope_missing', table, row, 'organisation_id')
      }
    }
    for (const recordsForId of index.values()) {
      if (recordsForId.length > 1) add('duplicate_record_identity', table, recordsForId[0], 'id')
    }
    indexes.set(table, index)
  }

  function link(table, row, field, targetTable, targetId = row[field], organisationId = row.organisation_id) {
    const id = text(targetId)
    if (!id) return null
    const target = { table: targetTable, id }
    const matches = indexes.get(targetTable)?.get(id) || []
    if (matches.length !== 1) {
      const check = { record: recordRef(table, row), field, target }
      if (matches.length > 1) add('relationship_ambiguous', table, row, field, target)
      else if (Array.isArray(tables[targetTable]) && complete.has(targetTable)) add('relationship_target_missing', table, row, field, target)
      else unchecked.push(check)
      return null
    }
    const found = matches[0]
    if (text(organisationId) && text(found.organisation_id) && text(organisationId) !== text(found.organisation_id)) {
      add('relationship_crosses_organisation', table, row, field, target)
      return null
    }
    references.push({ record: recordRef(table, row), field, target })
    return found
  }

  for (const lead of rows('leads')) {
    link('leads', lead, 'listing_id', 'private_listings')
    link('leads', lead, 'contact_id', 'contacts')
    const transaction = link('leads', lead, 'converted_transaction_id', 'transactions')
    if (transaction && text(lead.listing_id) && text(transaction.listing_id) !== text(lead.listing_id)) {
      add('converted_transaction_listing_differs', 'leads', lead, 'converted_transaction_id', recordRef('transactions', transaction))
    }
  }
  for (const listing of rows('private_listings')) {
    for (const field of ['seller_lead_id', 'originating_crm_lead_id']) {
      const lead = link('private_listings', listing, field, 'leads')
      if (lead && text(lead.listing_id) && text(lead.listing_id) !== text(listing.id)) {
        add('lead_listing_backlink_differs', 'private_listings', listing, field, recordRef('leads', lead))
      }
    }
    // This historical column can refer to contacts or auth profiles. It is not
    // an agency_client_profiles foreign key and cannot resolve by id alone.
    if (text(listing.seller_profile_id)) {
      const candidates = ['contacts', 'profiles'].flatMap(table =>
        (indexes.get(table)?.get(text(listing.seller_profile_id)) || []).map(row => ({ table, row })))
      if (candidates.length > 1) add('seller_profile_compatibility_link_ambiguous', 'private_listings', listing, 'seller_profile_id')
      else if (!['contacts', 'profiles'].every(table => Array.isArray(tables[table]) && complete.has(table))) {
        unchecked.push({ record: recordRef('private_listings', listing), field: 'seller_profile_id', target: null })
      } else if (!candidates.length) add('seller_profile_compatibility_link_unresolved', 'private_listings', listing, 'seller_profile_id')
      else link('private_listings', listing, 'seller_profile_id', candidates[0].table)
    }
  }
  for (const onboarding of rows('private_listing_seller_onboarding')) {
    if (!text(onboarding.private_listing_id)) add('onboarding_listing_missing', 'private_listing_seller_onboarding', onboarding, 'private_listing_id')
    link('private_listing_seller_onboarding', onboarding, 'private_listing_id', 'private_listings')
  }
  for (const transaction of rows('transactions')) {
    if (!text(transaction.listing_id)) add('transaction_listing_missing', 'transactions', transaction, 'listing_id')
    link('transactions', transaction, 'listing_id', 'private_listings')
    link('transactions', transaction, 'seller_contact_id', 'contacts')
  }
  for (const participant of rows('transaction_participants')) {
    if (!text(participant.transaction_id)) add('participant_transaction_missing', 'transaction_participants', participant, 'transaction_id')
    link('transaction_participants', participant, 'transaction_id', 'transactions')
  }
  for (const context of rows('client_portal_contexts')) {
    const transaction = link('client_portal_contexts', context, 'transaction_id', 'transactions')
    const listingId = text(context.listing_id || context.private_listing_id)
    if (listingId) link('client_portal_contexts', context, 'listing_id', 'private_listings', listingId)
    if (transaction && listingId && text(transaction.listing_id) !== listingId) {
      add('portal_transaction_listing_differs', 'client_portal_contexts', context, 'transaction_id', recordRef('transactions', transaction))
    }
  }

  const sourceTables = { contact: 'contacts', lead: 'leads', listing_seller: 'private_listings', transaction_seller: 'transactions' }
  const clientSources = new Map()
  for (const clientLink of rows('agency_client_links')) {
    const sourceTable = Object.hasOwn(sourceTables, clientLink.source_kind) ? sourceTables[clientLink.source_kind] : null
    if (!sourceTable) {
      // Buyer/prospect identity is outside this sweep, unknown kinds are not.
      if (!['buyer', 'prospect', 'transaction_buyer'].includes(clientLink.source_kind)) add('client_source_kind_unknown', 'agency_client_links', clientLink, 'source_kind')
      continue
    }
    if (!text(clientLink.client_id) || !text(clientLink.source_id)) add('client_source_link_incomplete', 'agency_client_links', clientLink, 'source_id')
    link('agency_client_links', clientLink, 'client_id', 'agency_client_profiles')
    link('agency_client_links', clientLink, 'source_id', sourceTable)
    const key = JSON.stringify([text(clientLink.organisation_id), clientLink.source_kind, text(clientLink.source_id)])
    if (clientSources.has(key)) add('client_source_link_ambiguous', 'agency_client_links', clientLink, 'source_id')
    clientSources.set(key, clientLink)
  }
  for (const profile of rows('agency_client_profiles')) {
    link('agency_client_profiles', profile, 'merged_into', 'agency_client_profiles')
    const seen = new Set([text(profile.id)])
    let cursor = profile
    while (text(cursor.merged_into)) {
      const next = indexes.get('agency_client_profiles')?.get(text(cursor.merged_into))
      if (seen.has(text(cursor.merged_into))) { add('client_merge_cycle', 'agency_client_profiles', profile, 'merged_into'); break }
      if (next?.length !== 1) break
      seen.add(text(cursor.merged_into))
      cursor = next[0]
    }
  }

  const people = []
  const peopleByKey = new Map()
  for (const onboarding of rows('private_listing_seller_onboarding')) {
    const form = object(onboarding.form_data)
    const facts = object(onboarding.canonical_facts_json)
    const profileType = normalizeSellerProfileType(form.ownerStructureType || form.owner_structure_type || facts.seller?.owner_structure_type)
    for (const collection of SELLER_PERSON_COLLECTIONS) {
      const supplied = [collection.form, ...collection.aliases].filter(key => Array.isArray(form[key]))
      if (supplied.length > 1 && supplied.some(key => JSON.stringify(form[key]) !== JSON.stringify(form[supplied[0]]))) {
        add('person_roster_aliases_conflict', 'private_listing_seller_onboarding', onboarding, collection.form)
      }
      const canonical = at(facts, collection.canonical)
      const roster = supplied.length ? form[supplied[0]] : Array.isArray(canonical) ? canonical : []
      const seen = new Set()
      for (const person of roster) {
        const personId = text(person?.id)
        const key = sellerPersonSourceKey(onboarding.id, personId)
        if (!key) { add('person_source_identity_missing', 'private_listing_seller_onboarding', onboarding, collection.form); continue }
        if (seen.has(key)) add('person_source_identity_duplicated', 'private_listing_seller_onboarding', onboarding, collection.form)
        seen.add(key)
        const reference = { sourceKey: key, onboardingId: text(onboarding.id), listingId: text(onboarding.private_listing_id), personId, role: collection.rolesByProfile?.[profileType] || collection.role }
        people.push(reference)
        peopleByKey.set(key, reference)
      }
      if (Array.isArray(canonical) && canonical.some(person => !text(person?.id))) {
        add('canonical_person_source_identity_missing', 'private_listing_seller_onboarding', onboarding, collection.canonical)
      }
    }
  }
  const personLinks = Array.isArray(snapshot.personLinks) ? snapshot.personLinks : []
  if (personLinks.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Explicit seller person links must be objects.')
  }
  for (const participant of rows('transaction_participants').filter(row => row.role_type === 'seller')) {
    const matches = personLinks.filter(row => text(row.transactionParticipantId) === text(participant.id))
    if (matches.length !== 1) {
      add(matches.length ? 'participant_person_link_ambiguous' : 'participant_person_link_unconfirmed', 'transaction_participants', participant, 'id')
      continue
    }
    const mapping = matches[0]
    const person = peopleByKey.get(sellerPersonSourceKey(mapping.onboardingId, mapping.personId))
    const transactions = indexes.get('transactions')?.get(text(participant.transaction_id)) || []
    if (!person) add('participant_person_source_unresolved', 'transaction_participants', participant, 'id')
    else if (transactions.length === 1 && person.listingId !== text(transactions[0].listing_id)) {
      add('participant_person_listing_differs', 'transaction_participants', participant, 'id')
    }
  }

  const journeys = rows('private_listings').map(listing => {
    const onboardings = rows('private_listing_seller_onboarding').filter(row => text(row.private_listing_id) === text(listing.id))
    const loaded = Array.isArray(tables.private_listing_seller_onboarding) && complete.has('private_listing_seller_onboarding')
    if (onboardings.length > 1) add('current_seller_profile_ambiguous', 'private_listings', listing, 'seller_onboarding')
    return {
      listingId: text(listing.id), organisationId: text(listing.organisation_id),
      leadIds: [...new Set([listing.seller_lead_id, listing.originating_crm_lead_id,
        ...rows('leads').filter(row => text(row.listing_id) === text(listing.id)).map(row => row.lead_id)].map(text).filter(Boolean))],
      transactionIds: rows('transactions').filter(row => text(row.listing_id) === text(listing.id)).map(row => text(row.id)),
      currentProfile: {
        table: 'private_listing_seller_onboarding', id: loaded && onboardings.length === 1 ? text(onboardings[0].id) : '',
        state: onboardings.length > 1 ? 'ambiguous' : !loaded ? 'not_checked' : onboardings.length ? 'identified' : 'capture_required',
      },
    }
  })
  const incompleteTables = requiredTables.filter(table => !Array.isArray(tables[table]) || !complete.has(table))
  return {
    version: SELLER_DATA_OWNERSHIP_VERSION, mode: 'read_only',
    status: issues.length ? 'review_required' : incompleteTables.length || unchecked.length ? 'incomplete'
      : !journeys.length ? 'no_records'
        : journeys.some(row => row.currentProfile.state === 'capture_required') ? 'capture_required' : 'aligned_relationships',
    coverage: { completeTables: [...complete].filter(table => Array.isArray(tables[table])), incompleteTables },
    summary: { journeys: journeys.length, people: new Set(people.map(row => row.sourceKey)).size, issues: issues.length, unchecked: unchecked.length },
    journeys, people, references, issues, unchecked,
  }
}
