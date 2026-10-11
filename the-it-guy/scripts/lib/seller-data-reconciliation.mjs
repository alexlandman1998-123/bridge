import { createHash } from 'node:crypto'
import { buildListingSellerInformationModel } from '../../src/services/listings/listingSellerInformationModel.js'
import { buildSellerRelationshipReport } from '../../src/services/listings/listingSellerRelationshipModel.js'
import { transactionSellerProfileFromSource, transactionSellerProfileFormData } from '../../src/core/transactions/transactionPartyProfile.js'
import { SELLER_DATA_FIELDS } from '../../src/lib/sellerDataOwnershipContract.js'
import { normalizeSellerProfileType } from '../../src/lib/sellerPartyAuthorityContract.js'
import { normalizeSellerEntityType } from '../../src/lib/sellerEntityModel.js'
import { sellerYesNoValue } from '../../src/lib/sellerFicaOnboardingFields.js'
import { sellerAuditCaptureFields } from './seller-data-alignment-audit.mjs'

const text = value => String(value ?? '').trim()
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const at = (value, path) => path.split('.').reduce((result, key) => result?.[key], value)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clone = value => structuredClone(value)
const requiredTables = ['private_listings', 'private_listing_seller_onboarding', 'leads', 'contacts', 'transactions', 'onboarding_form_data', 'transaction_participants', 'client_portal_contexts', 'profiles']
const requiredMigrations = ['20261010215549', '20261010225607', '20261011065947', '20261011073408']
const requiredFunctions = ['save_private_listing_seller_onboarding_profile', 'save_private_listing_seller_canonical_update', 'bridge_get_transaction_seller_edit_context', 'bridge_save_transaction_seller_details', 'bridge_get_transaction_seller_profile']
const sourceColumns = ['seller_source_onboarding_id', 'seller_source_contact_key']
const contactAliases = { email: ['email', 'sellerEmail'], phone: ['phone', 'sellerPhone', 'mobile'] }
const contactPaths = field => [`seller.contact.${field}`, `seller.primary_contact.${field}`, `seller.${field}`]
const normalContact = (field, value) => field === 'email' ? text(value).toLowerCase() : text(value)

// The collector exports seller facts, not portal/signing credentials. Also
// strip unsupported embedded payloads before any snapshot or packet is saved.
function cleanProfile(value) {
  if (Array.isArray(value)) return value.map(cleanProfile)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|secret|password|credential|signature|generated.?html|documents|version.?history|^__|^auth(?:entication|orization|state|_state|_token|$)/i.test(key)).map(([key, item]) => [key, cleanProfile(item)]))
}

export function sanitizeSellerAlignmentSnapshot(snapshot) {
  const result = clone(snapshot)
  const rows = table => result.tables?.[table] || []
  for (const row of rows('private_listing_seller_onboarding')) {
    row.form_data = cleanProfile(Object.fromEntries(Object.entries(object(row.form_data)).filter(([key]) => sellerAuditCaptureFields.includes(key))))
    row.canonical_facts_json = cleanProfile(object(row.canonical_facts_json))
  }
  for (const row of rows('private_listings')) row.seller_canonical_facts_json = cleanProfile(object(row.seller_canonical_facts_json))
  for (const row of rows('onboarding_form_data')) {
    const form = object(row.form_data)
    row.form_data = {
      ...Object.fromEntries(['seller_name', 'seller_email', 'seller_phone'].filter(key => Object.hasOwn(form, key)).map(key => [key, form[key]])),
      __bridge_transaction_parties: { seller: cleanProfile(object(form.__bridge_transaction_parties?.seller)) },
    }
  }
  return result
}

function information(facts, capture = {}) {
  return buildListingSellerInformationModel({ sellerCanonicalFacts: facts, sellerOnboarding: { formData: capture, storedCanonicalFacts: facts } })
}

function modelFields(model) {
  // Operational property facts have a different owner after mandate/handoff.
  // This packet never repairs addresses, prices, decisions or document copies.
  return Object.fromEntries(model.groups.flatMap(group => group.rows.filter(row => group.key !== 'property' || !['address', 'ownership'].includes(row.key)).map(row => [`${group.key}.${row.key}`, row.value ?? ''])))
}

function stable(value) {
  if (Array.isArray(value)) {
    const items = value.map(stable)
    return items.every(item => item && typeof item === 'object' && text(item.id)) ? items.sort((a, b) => text(a.id).localeCompare(text(b.id))) : items
  }
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
}

function otherOwnedCanonicalFields(facts) {
  // Audit declared facts omitted from a compact display. Compare whole saved
  // rosters by source ID; child [] paths are covered by those roster entries.
  // Operational listing address, property type and price are excluded.
  return Object.fromEntries(SELLER_DATA_FIELDS.filter(field => field.authority === 'private_listing_seller_onboarding' && !['contact_email', 'contact_phone'].includes(field.key) && !field.canonicalPaths.some(path => path.includes('[]'))).map(field => {
    const legacyPaths = field.key === 'scheme_section' ? ['property.scheme.section_number'] : field.key === 'scheme_unit' ? ['property.scheme.unit_number'] : []
    const value = [...field.canonicalPaths, ...legacyPaths].map(path => at(facts, path)).find(item => item !== undefined)
    return [`canonical.${field.key}`, stable(value) ?? '']
  }))
}

function differences(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(key => JSON.stringify(before[key] ?? '') !== JSON.stringify(after[key] ?? '')).map(field => ({ field, before: before[field] ?? '', proposed: after[field] ?? '' }))
}

function identityKnown(model) {
  const d = model.draft
  if (['individual', 'married', 'foreign_individual'].includes(model.profileType)) return Boolean(d.sellerFirstName && d.sellerSurname && (d.idNumber || d.foreignPassportNumber))
  if (['company', 'close_corporation', 'foreign_company'].includes(model.profileType)) return Boolean(d.companyName && (d.companyRegistrationNumber || d.foreignRegistrationNumber))
  if (['trust', 'foreign_trust'].includes(model.profileType)) return Boolean(d.trustName && d.trustRegistrationNumber)
  if (model.profileType === 'multiple_owners') return d.multipleOwners.length >= 2 && !model.requiresPersonReview
  // Estate, POA and unspecified entities require authority review.
  return false
}

function conflictingProtectedAliases(form) {
  const valueFor = (field, value) => {
    if (['owner_structure_type', 'legal_type'].includes(field.key)) return normalizeSellerProfileType(value, text(value))
    if (field.key === 'owner_entity_type') return normalizeSellerEntityType(value, text(value))
    if (['popi_consent', 'ownership_confirmed', 'spouse_involved'].includes(field.key)) return sellerYesNoValue(value) || (text(value).toLowerCase() === 'accepted' ? 'yes' : text(value))
    return stable(typeof value === 'string' ? value.trim() : value)
  }
  return SELLER_DATA_FIELDS.filter(field => field.authority === 'private_listing_seller_onboarding' && ['legal_identity', 'ownership', 'authority', 'compliance'].includes(field.sensitivity)).filter(field => {
    const values = field.formFields.filter(path => !path.includes('.') && !path.includes('[') && Object.hasOwn(form, path)).map(path => JSON.stringify(valueFor(field, form[path])))
    return new Set(values).size > 1
  }).map(field => field.key)
}

export function buildSellerReconciliationPacket(input) {
  if (!input || !Array.isArray(input.scope?.listingIds) || new Set(input.scope.listingIds).size !== input.scope.listingIds.length) throw new Error('An explicit, unique listing scope is required.')
  if (input.readOnly !== 'on' || !input.capturedAt || !/^[a-z]{20}$/.test(input.environment?.projectRef || '')) throw new Error('A labelled read-only hosted snapshot is required.')
  const snapshot = sanitizeSellerAlignmentSnapshot(input)
  const rows = table => Array.isArray(snapshot.tables?.[table]) ? snapshot.tables[table] : []
  const complete = new Set(snapshot.completeTables || [])
  const missingCoverage = requiredTables.filter(table => !complete.has(table) || !Array.isArray(snapshot.tables?.[table]))
  const roots = new Set(snapshot.scope.listingIds.map(text))
  const listings = rows('private_listings').filter(row => roots.has(text(row.id)))
  const captures = rows('private_listing_seller_onboarding').filter(row => roots.has(text(row.private_listing_id)))
  const transactions = rows('transactions').filter(row => roots.has(text(row.listing_id)) && !row.is_demo_data && !row.deleted_at)
  const txIds = new Set(transactions.map(row => text(row.id)))
  const leadIds = new Set(listings.flatMap(row => [text(row.seller_lead_id), text(row.originating_crm_lead_id)]).filter(Boolean))
  const leads = rows('leads').filter(row => leadIds.has(text(row.lead_id)) || roots.has(text(row.listing_id)))
  const contacts = new Set([...leads.map(row => text(row.contact_id)), ...listings.map(row => text(row.seller_profile_id)), ...transactions.map(row => text(row.seller_contact_id))].filter(Boolean))
  const contexts = rows('client_portal_contexts').filter(row => row.context_type === 'selling' && row.status === 'active' && (roots.has(text(row.listing_id)) || txIds.has(text(row.transaction_id)) || leadIds.has(text(row.seller_lead_id))))
  const scopedIds = {
    private_listings: roots, private_listing_seller_onboarding: new Set(captures.map(row => text(row.id))),
    transactions: txIds, leads: new Set(leads.map(row => text(row.lead_id))), contacts,
    client_portal_contexts: new Set(contexts.map(row => text(row.id))),
    transaction_participants: new Set(rows('transaction_participants').filter(row => txIds.has(text(row.transaction_id)) && !row.removed_at).map(row => text(row.id))),
  }
  // Keep all reference metadata loaded; filter findings to this active scope.
  const graph = buildSellerRelationshipReport(snapshot)
  const inScope = item => scopedIds[item.record.table]?.has(item.record.id)
  const confirmedContactSlots = new Set(rows('transaction_participants').filter(person => {
    const tx = transactions.find(row => text(row.id) === text(person.transaction_id))
    const sources = captures.filter(row => text(row.private_listing_id) === text(tx?.listing_id))
    return person.role_type === 'seller' && !person.removed_at && sources.length === 1 && text(person.seller_source_onboarding_id) === text(sources[0].id) && person.seller_source_contact_key === 'primary_contact'
  }).map(person => text(person.id)))
  const relationshipIssues = graph.issues.filter(inScope).filter(issue => !(issue.code === 'participant_person_link_unconfirmed' && confirmedContactSlots.has(issue.record.id)))
  const unchecked = graph.unchecked.filter(inScope)
  const missingMigrations = requiredMigrations.filter(version => !snapshot.schema?.guardMigrations?.includes(version))
  const missingFunctions = requiredFunctions.filter(name => !snapshot.schema?.functions?.includes(name))
  const missingSourceColumns = sourceColumns.filter(name => !snapshot.schema?.participantSourceColumns?.includes(name))
  const releaseReady = !missingMigrations.length && !missingFunctions.length && !missingSourceColumns.length
  const records = []
  const proposals = []
  const reviews = []

  for (const listingId of [...roots].sort()) {
    const matches = listings.filter(row => text(row.id) === listingId)
    const sources = captures.filter(row => text(row.private_listing_id) === listingId)
    const relatedLeads = leads.filter(lead => text(lead.listing_id) === listingId || matches.some(listing => [text(listing.seller_lead_id), text(listing.originating_crm_lead_id)].includes(text(lead.lead_id))))
    const relatedTransactions = transactions.filter(tx => text(tx.listing_id) === listingId)
    const relatedTxIds = new Set(relatedTransactions.map(tx => text(tx.id)))
    const relatedLeadIds = new Set(relatedLeads.map(lead => text(lead.lead_id)))
    const relatedIds = new Set([listingId, ...sources.map(source => text(source.id)), ...relatedLeadIds, ...relatedTxIds,
      ...relatedLeads.map(lead => text(lead.contact_id)), ...matches.map(listing => text(listing.seller_profile_id)), ...relatedTransactions.map(tx => text(tx.seller_contact_id)),
      ...rows('transaction_participants').filter(person => relatedTxIds.has(text(person.transaction_id)) && !person.removed_at).map(person => text(person.id)),
      ...contexts.filter(context => text(context.listing_id) === listingId || relatedTxIds.has(text(context.transaction_id)) || relatedLeadIds.has(text(context.seller_lead_id))).map(context => text(context.id))].filter(Boolean))
    const relatedIssues = relationshipIssues.filter(issue => relatedIds.has(issue.record.id))
    const record = { listingId, captureId: sources.length === 1 ? text(sources[0].id) : null, status: 'aligned', reasons: [], fields: [], candidateIds: [] }
    const requireReview = reason => { if (!record.reasons.includes(reason)) record.reasons.push(reason); record.status = 'review_required' }
    if (matches.length !== 1) requireReview('listing_identity_missing_or_ambiguous')
    if (sources.length > 1) requireReview('multiple_current_captures')
    if (!sources.length) { if (record.status === 'aligned') record.status = 'capture_required'; record.reasons.push('no_current_seller_capture') }
    if (missingCoverage.length || unchecked.length) requireReview('reference_coverage_incomplete')
    if (relatedIssues.length) requireReview('relationship_or_person_identity_review')
    if (relatedIssues.some(issue => ['person_source_identity_missing', 'person_source_identity_duplicated', 'canonical_person_source_identity_missing'].includes(issue.code))) requireReview('saved_person_ids_require_review')
    if (relatedIssues.some(issue => issue.code === 'person_roster_aliases_conflict')) requireReview('person_roster_aliases_require_review')
    if (matches.length !== 1 || sources.length !== 1) { records.push(record); continue }
    const listing = matches[0], source = sources[0]
    const facts = object(source.canonical_facts_json), projected = object(listing.seller_canonical_facts_json)
    const current = information(facts, object(source.form_data))
    const sourceModel = information(facts)
    const targetModel = information(projected)
    const internal = differences(modelFields(sourceModel), modelFields(current))
    const stale = differences(modelFields(targetModel), modelFields(current))
    for (const field of ['email', 'phone']) {
      const proposed = normalContact(field, current.draft[field])
      const sourceValues = contactPaths(field).map(path => at(facts, path)).filter(value => value !== undefined)
      if (sourceValues.some(value => normalContact(field, value) !== proposed)) requireReview('canonical_contact_aliases_disagree')
      const hiddenTargetPaths = contactPaths(field).filter(path => at(projected, path) !== undefined && normalContact(field, at(projected, path)) !== proposed)
      if (hiddenTargetPaths.length && !stale.some(item => item.field === `contact.${field}`)) stale.push({ field: `contact.${field}`, before: at(projected, hiddenTargetPaths[0]), proposed })
    }
    const otherCanonical = differences(otherOwnedCanonicalFields(projected), otherOwnedCanonicalFields(facts))
    record.fields = stale.map(item => item.field)
    record.captureCanonicalFields = internal.map(item => item.field)
    record.otherOwnedCanonicalFields = otherCanonical.map(item => item.field)
    record.conflictingProtectedAliases = conflictingProtectedAliases(object(source.form_data))
    if (record.conflictingProtectedAliases.length) requireReview('protected_capture_aliases_disagree')
    if (!Object.keys(object(facts.seller)).length) requireReview('canonical_seller_capture_missing')
    if (source.form_shape !== 'object' || source.canonical_shape !== 'object' || listing.canonical_shape !== 'object') requireReview('invalid_or_missing_capture_shape')
    if (source.status !== 'completed') requireReview('capture_not_completed')
    if (!identityKnown(current)) requireReview('legal_identity_requires_confirmation')
    if (current.requiresPersonReview || sourceModel.requiresPersonReview || targetModel.requiresPersonReview) requireReview('saved_person_ids_require_review')
    if (internal.length) requireReview('capture_and_its_canonical_projection_disagree')
    if (otherCanonical.length) requireReview('seller_owned_canonical_projection_disagrees')
    if (stale.some(item => !['contact.email', 'contact.phone'].includes(item.field))) requireReview('protected_seller_fields_disagree')
    if (stale.length && (!source.protected_seller_fingerprint || source.protected_seller_fingerprint !== listing.protected_seller_fingerprint)) requireReview('protected_source_payloads_disagree')
    if (stale.length && (!source.updated_at || !listing.updated_at || !source.canonical_fingerprint || !listing.canonical_fingerprint)) requireReview('revision_evidence_missing')
    const evidence = (snapshot.evidence || []).filter(row => row.listingId === listingId)
    if (stale.length && (evidence.length !== 1 || !evidence[0].fingerprint)) requireReview('document_preservation_evidence_missing')
    const patch = []
    for (const field of ['email', 'phone']) {
      if (!stale.some(item => item.field === `contact.${field}`)) continue
      const aliasValues = contactAliases[field].filter(key => Object.hasOwn(object(source.form_data), key)).map(key => normalContact(field, source.form_data[key]))
      const proposed = normalContact(field, current.draft[field])
      const sourceValues = contactPaths(field).map(path => at(facts, path)).filter(value => value !== undefined)
      const targetPaths = contactPaths(field).filter(path => at(projected, path) !== undefined)
      if (!aliasValues.length || new Set(aliasValues).size !== 1 || aliasValues[0] !== proposed || !sourceValues.length || sourceValues.some(value => normalContact(field, value) !== proposed) || !targetPaths.length) requireReview('contact_source_or_aliases_require_review')
      for (const path of targetPaths) if (normalContact(field, at(projected, path)) !== proposed) patch.push({ path, before: at(projected, path), proposed, sourceFields: contactAliases[field].filter(key => Object.hasOwn(object(source.form_data), key)) })
    }
    if (stale.length && !patch.length) requireReview('no_unambiguous_contact_patch')
    const recovery = { sourceUpdatedAt: source.updated_at, targetUpdatedAt: listing.updated_at, sourceCanonicalFingerprint: source.canonical_fingerprint,
      sourceCaptureDigest: hash(source.form_data), targetCanonicalFingerprint: listing.canonical_fingerprint, documentEvidenceFingerprint: evidence[0]?.fingerprint }
    if (record.status === 'aligned' && patch.length) {
      const candidate = { listingId, organisationId: text(listing.organisation_id), captureId: text(source.id), target: 'private_listings.seller_canonical_facts_json',
        changes: patch, reason: 'Completed explicit capture and its canonical contact agree; only listing contact projection differs; protected seller payloads agree.',
        recovery, preserveSignedAndReviewedCopies: true }
      candidate.id = hash({ environment: snapshot.environment, candidate }).slice(0, 24)
      candidate.status = releaseReady ? 'awaiting_explicit_repair_approval' : 'awaiting_guard_release_and_repair_approval'
      proposals.push(candidate)
      record.status = 'contact_projection_candidate'
      record.candidateIds.push(candidate.id)
    }
    if (record.status === 'review_required') reviews.push({ listingId, captureId: text(source.id), reasons: [...record.reasons], source: 'private_listing_seller_onboarding', proposedCurrentFields: stale, otherOwnedCanonicalDifferences: otherCanonical, captureCanonicalDifferences: internal,
      conflictingAliasValues: record.conflictingProtectedAliases.map(key => ({ field: key, values: Object.fromEntries(SELLER_DATA_FIELDS.find(field => field.key === key).formFields.filter(path => Object.hasOwn(object(source.form_data), path)).map(path => [path, source.form_data[path]])) })),
      recovery, preserveSignedAndReviewedCopies: true })
    records.push(record)
  }

  // CRM links identify a contact record, not necessarily the legal seller or
  // signatory. Differences are review-only until the same person is confirmed.
  const crmReviews = []
  const privateCrmReviews = []
  for (const listing of listings) {
    const sources = captures.filter(row => text(row.private_listing_id) === text(listing.id))
    if (sources.length !== 1) continue
    const current = information(sources[0].canonical_facts_json, sources[0].form_data)
    const ids = new Set(leads.filter(lead => text(lead.listing_id) === text(listing.id) || [text(listing.seller_lead_id), text(listing.originating_crm_lead_id)].includes(text(lead.lead_id))).map(lead => text(lead.contact_id)).filter(Boolean))
    if (listing.seller_profile_id) ids.add(text(listing.seller_profile_id))
    for (const id of ids) {
      const contact = rows('contacts').find(row => text(row.contact_id) === id)
      if (!contact || text(contact.organisation_id) !== text(listing.organisation_id)) continue
      const fields = ['email', 'phone'].filter(field => contact[field] !== undefined && normalContact(field, contact[field]) !== normalContact(field, current.draft[field]))
      if (fields.length) {
        const review = { listingId: text(listing.id), contactId: id, fields, reason: 'Confirm that CRM contact and current seller contact represent the same person before synchronising.' }
        crmReviews.push(review)
        privateCrmReviews.push({ ...review, status: 'same_person_confirmation_required', captureId: text(sources[0].id), sourceUpdatedAt: sources[0].updated_at, targetUpdatedAt: contact.updated_at,
          values: fields.map(field => ({ field, before: contact[field], proposedAfterConfirmation: current.draft[field], source: 'private_listing_seller_onboarding' })) })
      }
    }
  }
  const transactionReviews = []
  for (const transaction of transactions) {
    const sources = captures.filter(row => text(row.private_listing_id) === text(transaction.listing_id))
    const listing = listings.find(row => text(row.id) === text(transaction.listing_id))
    const forms = rows('onboarding_form_data').filter(row => text(row.transaction_id) === text(transaction.id))
    const review = { transactionId: text(transaction.id), listingId: text(transaction.listing_id), status: 'review_required', reasons: [], fields: [] }
    if (sources.length !== 1 || !listing || text(transaction.organisation_id) !== text(listing.organisation_id)) review.reasons.push('transaction_source_relationship_requires_review')
    else {
      const source = sources[0]
      const current = information(source.canonical_facts_json, source.form_data)
      const expected = transactionSellerProfileFromSource({ facts: source.canonical_facts_json, formData: source.form_data, onboardingId: text(source.id), updatedAt: source.updated_at })
      const flat = differences({ name: transaction.seller_name, email: transaction.seller_email, phone: transaction.seller_phone }, { name: expected.name, email: current.draft.email, phone: current.draft.phone })
      review.fields.push(...flat.map(item => `transactions.seller_${item.field}`))
      if (flat.length) review.reasons.push('transaction_contact_projection_disagrees')
      if (forms.length !== 1) review.reasons.push('transaction_capture_missing_or_ambiguous')
      else {
        const stored = forms[0].form_data?.__bridge_transaction_parties?.seller
        if (!stored || !Object.keys(stored).length) review.reasons.push('transaction_seller_handoff_missing')
        else {
          const handoff = differences(modelFields(information({}, transactionSellerProfileFormData(stored))), modelFields(current))
          if (handoff.length) review.reasons.push('transaction_seller_handoff_disagrees')
          review.fields.push(...handoff.map(item => `seller_handoff.${item.field}`))
          // Exact source identity and role checks are independent of names,
          // contact details and array order. Never change signing decisions.
          const expectedPeople = expected.people.filter(person => person.sourcePersonId)
          const savedPeople = Array.isArray(stored.people) ? stored.people : []
          if (expectedPeople.some(person => !savedPeople.some(saved => saved.sourceOnboardingId === source.id && saved.sourcePersonId === person.sourcePersonId && saved.role === person.role))) review.reasons.push('transaction_person_handoff_identity_missing')
        }
      }
      if (review.reasons.length) reviews.push({ ...review, captureId: text(source.id), proposedCurrentProfile: expected, sourceUpdatedAt: source.updated_at, targetUpdatedAt: transaction.updated_at, preserveSignedAndReviewedCopies: true })
    }
    if (!review.reasons.length) review.status = 'aligned'
    transactionReviews.push(review)
  }
  const unlinkedTransactions = rows('transactions').filter(row => !row.is_demo_data && !row.deleted_at && !text(row.listing_id))
  const sellerLeads = rows('leads').filter(row => !row.is_demo_data && /seller/i.test(row.lead_category || ''))
  const statusCounts = Object.fromEntries([...new Set(records.map(row => row.status))].sort().map(status => [status, records.filter(row => row.status === status).length]))
  const reasonCounts = Object.fromEntries([...new Set(records.flatMap(row => row.reasons))].sort().map(reason => [reason, records.filter(row => row.reasons.includes(reason)).length]))
  const report = {
    version: 'seller_reconciliation_dry_run_v1', mode: 'read_only_dry_run', environment: snapshot.environment, capturedAt: snapshot.capturedAt,
    automaticRepairAllowed: false, liveWritesPerformed: 0,
    releasePrerequisites: { ready: releaseReady, basis: 'schema_presence_only', runtimeVerification: 'required_before_release_or_repair', missingMigrations, missingFunctions, missingSourceColumns },
    coverage: { scope: snapshot.scope.description, missingTables: missingCoverage, identityIndexTablesNotChecked: graph.coverage.incompleteTables.filter(table => table.startsWith('agency_client_')), uncheckedRelationships: unchecked.length,
      currentLinkedTransactions: transactions.length, transactionFieldComparison: transactions.length ? 'explicit_links_only' : 'no_linked_non_demo_transactions_in_scope',
      actorRlsAndBrowserConcurrency: 'not_certified_by_administrative_snapshot' },
    summary: { listings: roots.size, captures: captures.length, sellerLeads: sellerLeads.length, sellerLeadsWithoutListing: sellerLeads.filter(row => !text(row.listing_id)).length,
      activeSellingContexts: contexts.length, unlinkedNonDemoTransactions: unlinkedTransactions.length, statusCounts, reasonCounts, relationshipIssues: relationshipIssues.length, crmContactReviewPairs: crmReviews.length, contactProjectionCandidates: proposals.length,
      linkedTransactionReviews: transactionReviews.filter(row => row.status === 'review_required').length },
    records, relationshipIssues, crmContactReviews: crmReviews, linkedTransactions: transactionReviews,
    candidates: proposals.map(({ id, listingId, organisationId, captureId, target, changes, reason, status }) => ({ id, listingId, organisationId, captureId, target, paths: changes.map(change => change.path), reason, status })),
    legacyTransactions: unlinkedTransactions.map(row => ({ transactionId: text(row.id), status: 'relationship_review_no_inferred_link' })),
    nextAction: 'Release verified guards separately, resolve review cases, then approve an exact bounded candidate set. Refresh all revisions and evidence before any repair; preserve documents and transaction decisions.',
  }
  const packet = { version: report.version, mode: report.mode, environment: report.environment, capturedAt: report.capturedAt,
    approvalRequired: true, maximumCandidateCount: proposals.length, applySupported: false, snapshotDigest: hash(snapshot),
    scopeListingIds: [...roots].sort(), recordStatuses: records, relationshipReviews: relationshipIssues, legacyTransactionReviews: report.legacyTransactions,
    proposals, reviews, crmContactReviews: privateCrmReviews, recoveryPolicy: 'Compare source, target and evidence fingerprints under the guarded transaction immediately before any separately approved repair. Restore only these exact paths if unchanged since that repair; never replace whole captures, legal facts, decisions or signed evidence.' }
  packet.id = hash(packet)
  report.packetId = packet.id
  return { report, packet }
}
