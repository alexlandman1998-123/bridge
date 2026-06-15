import { formatCurrency, formatDate, formatNumber, titleize } from './commercialFormatters'

export const COMMERCIAL_STATUS_TONES = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  contacted: 'border-blue-200 bg-blue-50 text-blue-700',
  converted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  closed: 'border-violet-200 bg-violet-50 text-violet-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  executed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  closed_won: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-700',
  hot: 'border-violet-200 bg-violet-50 text-violet-700',
  hot_accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  hot_signed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  leased: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  occupied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ready_for_lease: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  renewed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  signed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  coming_soon: 'border-blue-200 bg-blue-50 text-blue-700',
  hot_sent: 'border-blue-200 bg-blue-50 text-blue-700',
  internal_review: 'border-blue-200 bg-blue-50 text-blue-700',
  marketing: 'border-blue-200 bg-blue-50 text-blue-700',
  qualified: 'border-violet-200 bg-violet-50 text-violet-700',
  hot_in_progress: 'border-violet-200 bg-violet-50 text-violet-700',
  under_offer: 'border-amber-200 bg-amber-50 text-amber-700',
  sold: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  hot_draft: 'border-slate-200 bg-slate-50 text-slate-600',
  new: 'border-slate-200 bg-slate-50 text-slate-600',
  archived: 'border-slate-200 bg-slate-100 text-slate-500',
  inactive: 'border-slate-200 bg-slate-100 text-slate-500',
  lease_pending: 'border-amber-200 bg-amber-50 text-amber-700',
  suspended: 'border-slate-200 bg-slate-100 text-slate-500',
  matching: 'border-amber-200 bg-amber-50 text-amber-700',
  negotiating: 'border-amber-200 bg-amber-50 text-amber-700',
  negotiation: 'border-amber-200 bg-amber-50 text-amber-700',
  no_show: 'border-rose-200 bg-rose-50 text-rose-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  pending_signature: 'border-amber-200 bg-amber-50 text-amber-700',
  reserved: 'border-amber-200 bg-amber-50 text-amber-700',
  renewal_pending: 'border-amber-200 bg-amber-50 text-amber-700',
  sent: 'border-blue-200 bg-blue-50 text-blue-700',
  under_negotiation: 'border-amber-200 bg-amber-50 text-amber-700',
  under_review: 'border-amber-200 bg-amber-50 text-amber-700',
  upcoming: 'border-blue-200 bg-blue-50 text-blue-700',
  viewing_scheduled: 'border-amber-200 bg-amber-50 text-amber-700',
  won: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expiring_soon: 'border-amber-200 bg-amber-50 text-amber-700',
  expired: 'border-rose-200 bg-rose-50 text-rose-700',
  closed_lost: 'border-rose-200 bg-rose-50 text-rose-700',
  lost: 'border-rose-200 bg-rose-50 text-rose-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  sale_pending: 'border-amber-200 bg-amber-50 text-amber-700',
  superseded: 'border-slate-200 bg-slate-100 text-slate-500',
  terminated: 'border-rose-200 bg-rose-50 text-rose-700',
  unqualified: 'border-rose-200 bg-rose-50 text-rose-700',
  withdrawn: 'border-rose-200 bg-rose-50 text-rose-700',
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isPresent(value) {
  return String(value ?? '').trim().length > 0
}

export function getStatusTone(value) {
  return COMMERCIAL_STATUS_TONES[normalize(value)] || 'border-blue-200 bg-blue-50 text-blue-700'
}

export function getCommercialRecordTitle(kind, record = {}) {
  if (!record) return titleize(kind)
  return record.displayName
    || record.name
    || record.property_name
    || record.vacancy_name
    || record.title
    || record.requirement_name
    || record.deal_name
    || record.transaction_name
    || record.document_name
    || record.premises_description
    || (kind === 'leases' && record.id ? `Lease ${String(record.id).slice(0, 8)}` : '')
    || titleize(kind)
}

export function getCommercialBroker(record = {}) {
  return record.assigned_broker || record.broker_assignment || record.broker_id || record.broker_owner || 'Unassigned'
}

export function getCommercialUpdatedDate(record = {}) {
  return formatDate(record.updated_at || record.uploaded_at || record.created_at)
}

export function getCommercialNextAction(kind, record = {}) {
  const status = normalize(record.status)
  const stage = normalize(record.stage)

  if (status === 'archived') return 'Review archive'

  if (kind === 'landlords') {
    if (!isPresent(record.contact_person) && !isPresent(record.email) && !isPresent(record.phone)) return 'Add landlord contact'
    if (!isPresent(record.portfolio_notes)) return 'Add portfolio notes'
    return 'Review portfolio activity'
  }

  if (kind === 'tenants') {
    if (!isPresent(record.contact_person) && !isPresent(record.email) && !isPresent(record.phone)) return 'Add tenant contact'
    if (!isPresent(record.current_lease_expiry)) return 'Add lease expiry'
    return 'Capture requirement'
  }

  if (kind === 'companies') {
    if (!isPresent(record.company_type)) return 'Set company type'
    if (!isPresent(record.broker_id)) return 'Assign broker owner'
    if (!isPresent(record.email) && !isPresent(record.phone)) return 'Add company contact details'
    return 'Add contacts'
  }

  if (kind === 'contacts') {
    if (!isPresent(record.company_id)) return 'Link company'
    if (!isPresent(record.email) && !isPresent(record.phone) && !isPresent(record.mobile)) return 'Add contact details'
    if (!record.decision_maker) return 'Confirm decision-maker status'
    return 'Link opportunity'
  }

  if (kind === 'properties') {
    if (!isPresent(record.landlord_id)) return 'Link landlord'
    if (!isPresent(record.broker_id)) return 'Assign broker owner'
    if (!Number(record.gla_m2)) return 'Add total GLA'
    if (!isPresent(record.number_of_units)) return 'Capture unit count'
    if (!isPresent(record.available_space_m2)) return 'Review vacancies'
    return Number(record.available_space_m2) > 0 ? 'Review active vacancies' : 'Review occupancy'
  }

  if (kind === 'vacancies') {
    if (!isPresent(record.property_id)) return 'Link property'
    if (!isPresent(record.broker_assignment) && !isPresent(record.broker_id)) return 'Assign broker owner'
    if (!Number(record.available_area_m2)) return 'Add available GLA'
    if (!isPresent(record.availability_date)) return 'Update availability'
    if (status === 'draft') return 'Complete vacancy detail'
    if (['leased', 'occupied'].includes(status)) return 'Review occupancy'
    if (status === 'withdrawn') return 'Confirm withdrawal'
    if (status === 'suspended') return 'Review suspension'
    if (status === 'hot_in_progress') return 'Track Heads of Terms'
    if (status === 'reserved' || status === 'under_negotiation' || status === 'under_offer') return 'Progress negotiation'
    if (status === 'marketing') return 'Track market response'
    return 'Match to requirement'
  }

  if (kind === 'listings') {
    const listingStatus = normalize(record.listing_status || record.status)
    if (!isPresent(record.title)) return 'Add listing title'
    if (!isPresent(record.property_id)) return 'Link property'
    if (!isPresent(record.vacancy_id)) return 'Link vacancy or stock'
    if (listingStatus === 'draft') return 'Complete listing'
    if (listingStatus === 'internal_review') return 'Review listing quality'
    if (listingStatus === 'approved') return 'Publish listing'
    if (listingStatus === 'published') return 'Match requirements'
    if (listingStatus === 'under_offer') return 'Progress deal'
    if (listingStatus === 'closed') return 'Review closed outcome'
    if (listingStatus === 'withdrawn') return 'Review withdrawal'
    if (listingStatus === 'expired') return 'Review listing'
    return 'Review listing'
  }

  if (kind === 'requirements') {
    if (!isPresent(record.company_id) && !isPresent(record.tenant_id)) return 'Link company'
    if (!isPresent(record.preferred_locations)) return 'Add preferred area'
    if (['new', 'new_requirement', 'qualified', 'matching', 'shortlisting'].includes(stage)) return 'Match vacancy'
    if (stage === 'viewing' || stage === 'viewing_scheduled') return 'Complete viewing'
    if (['proposal', 'negotiating', 'negotiation'].includes(stage)) return 'Create deal'
    if (['hot', 'lease_stage'].includes(stage)) return 'Progress Heads of Terms'
    if (['won', 'converted', 'closed_won'].includes(stage)) return 'Follow lease progress'
    if (['lost', 'closed_lost'].includes(stage)) return 'Review loss reason'
    return 'Follow up'
  }

  if (kind === 'deals') {
    if (!isPresent(record.company_id) && !isPresent(record.tenant_id)) return 'Link company'
    if (!isPresent(record.property_id)) return 'Link property'
    if (stage === 'new' || stage === 'requirement') return 'Qualify deal'
    if (stage === 'qualified' || stage === 'shortlist') return 'Confirm vacancy'
    if (stage === 'negotiation' || stage === 'proposal') return 'Prepare Heads of Terms'
    if (stage === 'hot_draft' || stage === 'heads_of_terms') return 'Send Heads of Terms'
    if (stage === 'hot_sent') return 'Await Heads of Terms response'
    if (stage === 'hot_accepted') return 'Get Heads of Terms signed'
    if (stage === 'lease_pending' || stage === 'lease_draft') return 'Create lease'
    if (stage === 'converted' || stage === 'signed' || stage === 'closed_won') return 'Track lease'
    if (stage === 'lost' || stage === 'closed_lost') return 'Capture loss reason'
    return 'Update deal status'
  }

  if (kind === 'transactions') {
    if (!isPresent(record.deal_id)) return 'Link deal'
    if (status === 'draft') return 'Start negotiation'
    if (status === 'negotiating') return 'Prepare Heads of Terms'
    if (status === 'hot_in_progress') return 'Progress Heads of Terms'
    if (status === 'hot_signed') return normalize(record.transaction_type) === 'sale' ? 'Prepare completion' : 'Create lease'
    if (status === 'lease_pending') return 'Complete lease'
    if (status === 'sale_pending') return 'Complete sale'
    if (status === 'completed') return 'Review closed transaction'
    if (status === 'lost') return 'Capture loss reason'
    if (status === 'cancelled') return 'Review cancellation'
    return 'Update transaction status'
  }

  if (kind === 'headsOfTerms' || kind === 'heads_of_terms') {
    if (!record.id) return 'Draft Heads of Terms'
    if (status === 'draft') return 'Send Heads of Terms'
    if (status === 'sent') return 'Await review'
    if (status === 'under_review') return 'Resolve comments'
    if (status === 'accepted') return 'Await signature'
    if (status === 'signed' || status === 'ready_for_lease') return 'Create lease'
    if (status === 'converted') return 'Track lease'
    if (status === 'rejected') return 'Revise terms'
    return 'Update Heads of Terms status'
  }

  if (kind === 'leases') {
    if (!isPresent(record.deal_id)) return 'Link deal'
    if (!isPresent(record.lease_start_date)) return 'Confirm commencement'
    if (!isPresent(record.lease_end_date)) return 'Add expiry date'
    if (status === 'draft') return 'Prepare lease'
    if (status === 'pending_signature') return 'Get signature'
    if (status === 'executed') return 'Activate lease'
    if (status === 'expiring_soon' || status === 'renewal_pending') return 'Review renewal'
    if (status === 'expired') return 'Close or renew'
    return 'Track expiry'
  }

  if (kind === 'documents') {
    if (status === 'requested') return 'Upload document'
    if (status === 'uploaded') return 'Review document'
    if (status === 'rejected') return 'Replace document'
    return 'Keep current'
  }

  return 'Review record'
}

export function buildCommercialSummaryCards(kind, record = {}, lookups = {}) {
  const lookup = (collection, id, fallback = '-') => {
    const match = (lookups?.[collection] || []).find((item) => item.value === id || item.id === id)
    return match?.label || match?.name || match?.property_name || match?.deal_name || fallback
  }
  const cards = {
    landlords: [
      ['Portfolio Type', titleize(record.landlord_type)],
      ['Main Contact', record.contact_person || 'Unassigned'],
      ['Preferred Contact', titleize(record.preferred_contact_method)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    tenants: [
      ['Industry', record.industry || '-'],
      ['Current Location', record.current_location || '-'],
      ['Lease Expiry', formatDate(record.current_lease_expiry)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    companies: [
      ['Company Type', titleize(record.company_type)],
      ['Industry', record.industry || '-'],
      ['Primary Contact', lookup('contacts', record.primary_contact_id)],
      ['Broker Owner', getCommercialBroker(record)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    contacts: [
      ['Company', lookup('companies', record.company_id)],
      ['Role', record.job_title || '-'],
      ['Email', record.email || '-'],
      ['Mobile', record.mobile || record.phone || '-'],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    properties: [
      ['Total GLA', formatNumber(record.gla_m2, 'm²')],
      ['Vacant GLA', formatNumber(record.available_space_m2, 'm²')],
      ['Occupancy', `${Math.max(0, 100 - Number(record.vacancy_percentage || 0)).toFixed(0)}%`],
      ['Main Landlord', lookup('landlords', record.landlord_id)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    vacancies: [
      ['Property', lookup('properties', record.property_id)],
      ['Available GLA', formatNumber(record.available_area_m2, 'm²')],
      ['Rental Rate', formatCurrency(record.asking_rental)],
      ['Availability', formatDate(record.availability_date)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    listings: [
      ['Category', titleize(record.listing_category)],
      ['Property', lookup('properties', record.property_id)],
      ['Vacancy', lookup('vacancies', record.vacancy_id)],
      ['Price', formatCurrency(record.pricing)],
      ['Availability', formatDate(record.available_from)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    requirements: [
      ['Company', lookup('companies', record.company_id, lookup('tenants', record.tenant_id))],
      ['Contact', lookup('contacts', record.contact_id)],
      ['Required GLA', [record.min_size_m2, record.max_size_m2].filter(isPresent).map((value) => formatNumber(value, 'm²')).join(' - ') || '-'],
      ['Preferred Area', Array.isArray(record.preferred_locations) ? record.preferred_locations.join(', ') : record.preferred_locations || '-'],
      ['Budget', [record.budget_min, record.budget_max].filter(isPresent).map(formatCurrency).join(' - ') || '-'],
      ['Broker Owner', getCommercialBroker(record)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    deals: [
      ['Deal Value', formatCurrency(record.deal_value)],
      ['Stage', titleize(record.stage)],
      ['Company', lookup('companies', record.company_id, lookup('tenants', record.tenant_id))],
      ['Contact', lookup('contacts', record.contact_id)],
      ['Property', lookup('properties', record.property_id)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    transactions: [
      ['Transaction Type', titleize(record.transaction_type)],
      ['Stage', titleize(record.status)],
      ['Company', lookup('companies', record.company_id, lookup('tenants', record.company_id))],
      ['Contact', lookup('contacts', record.contact_id)],
      ['Property', lookup('properties', record.property_id)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
    leases: [
      ['Monthly Rental', formatCurrency(record.monthly_rental)],
      ['Expiry Date', formatDate(record.lease_end_date)],
      ['Remaining Term', record.lease_term_months ? `${record.lease_term_months} months` : '-'],
      ['Tenant', lookup('tenants', record.tenant_id)],
      ['Next Action', getCommercialNextAction(kind, record)],
    ],
  }

  return cards[kind] || [
    ['Status', titleize(record.status)],
    ['Broker Owner', getCommercialBroker(record)],
    ['Last Updated', getCommercialUpdatedDate(record)],
    ['Next Action', getCommercialNextAction(kind, record)],
  ]
}
