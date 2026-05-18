import { createElement } from 'react'
import CommercialStatusPill from './components/CommercialStatusPill'
import { formatCurrency, formatDate, formatList, formatNumber, titleize } from './commercialFormatters'
import {
  archiveCommercialDeal,
  archiveCommercialLandlord,
  archiveCommercialLease,
  archiveCommercialProperty,
  archiveCommercialRequirement,
  archiveCommercialTenant,
  archiveCommercialVacancy,
  createCommercialDeal,
  createCommercialLandlord,
  createCommercialLease,
  createCommercialProperty,
  createCommercialRequirement,
  createCommercialTenant,
  createCommercialVacancy,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialProperties,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialVacancies,
  updateCommercialDeal,
  updateCommercialLandlord,
  updateCommercialLease,
  updateCommercialProperty,
  updateCommercialRequirement,
  updateCommercialTenant,
  updateCommercialVacancy,
} from './services/commercialApi'

export const ACTIVE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

const LEASE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'archived', label: 'Archived' },
]

const VACANCY_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'under_negotiation', label: 'Under Negotiation' },
  { value: 'leased', label: 'Leased' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'archived', label: 'Archived' },
]

export const REQUIREMENT_STAGES = [
  { value: 'new_requirement', label: 'New Requirement' },
  { value: 'shortlisting', label: 'Shortlisting' },
  { value: 'viewing', label: 'Viewing' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'lease_stage', label: 'Lease Stage' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

export const DEAL_STAGES = [
  { value: 'requirement', label: 'Requirement' },
  { value: 'shortlist', label: 'Shortlist' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'heads_of_terms', label: 'Heads of Terms' },
  { value: 'lease_draft', label: 'Lease Draft' },
  { value: 'signed', label: 'Signed' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

export const PROPERTY_TYPES = [
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed_use', label: 'Mixed-use' },
  { value: 'land', label: 'Land' },
]

const CONTACT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
]

const LANDLORD_TYPES = [
  { value: 'private_owner', label: 'Private Owner' },
  { value: 'listed_fund', label: 'Listed Fund' },
  { value: 'property_company', label: 'Property Company' },
  { value: 'developer', label: 'Developer' },
  { value: 'institution', label: 'Institution' },
]

function getLookupLabel(lookups, kind, id, fallback = '-') {
  if (!id) return fallback
  const match = (lookups?.[kind] || []).find((item) => item.value === id)
  return match?.label || fallback
}

function statusColumn() {
  return { key: 'status', label: 'Status', render: (row) => createElement(CommercialStatusPill, { value: row.status }) }
}

function maxGreaterThanMin(minKey, maxKey, message) {
  return (values) => {
    const min = Number(values[minKey])
    const max = Number(values[maxKey])
    if (String(values[minKey] || '').trim() && String(values[maxKey] || '').trim() && Number.isFinite(min) && Number.isFinite(max) && max < min) {
      return { [maxKey]: message }
    }
    return {}
  }
}

function leaseDateValidation(values) {
  const start = values.lease_start_date ? new Date(values.lease_start_date) : null
  const end = values.lease_end_date ? new Date(values.lease_end_date) : null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
    return { lease_end_date: 'Lease end date cannot be before lease start date.' }
  }
  return {}
}

export const commercialCrudConfigs = {
  landlords: {
    title: 'Landlords',
    description: 'Manage landlords, landlord contacts, portfolios, mandates, and available space.',
    createLabel: 'New landlord',
    emptyTitle: 'No landlords yet',
    emptyDescription: 'Create landlord records to start building the commercial portfolio layer.',
    fetchRecords: getCommercialLandlords,
    createRecord: createCommercialLandlord,
    updateRecord: updateCommercialLandlord,
    archiveRecord: archiveCommercialLandlord,
    filters: [{ key: 'status', label: 'Status', options: ACTIVE_STATUSES }],
    columns: [
      { key: 'name', label: 'Landlord' },
      { key: 'landlord_type', label: 'Type', render: (row) => titleize(row.landlord_type) },
      { key: 'contact_person', label: 'Contact Person', render: (row) => row.contact_person || '-' },
      { key: 'email', label: 'Email', render: (row) => row.email || '-' },
      { key: 'phone', label: 'Phone', render: (row) => row.phone || '-' },
      statusColumn(),
    ],
    fields: [
      { name: 'name', label: 'Landlord name', required: true },
      { name: 'landlord_type', label: 'Landlord type', type: 'select', options: LANDLORD_TYPES },
      { name: 'contact_person', label: 'Contact person' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'website', label: 'Website' },
      { name: 'preferred_contact_method', label: 'Preferred contact method', type: 'select', options: CONTACT_METHODS },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'portfolio_notes', label: 'Portfolio notes', type: 'textarea', span: 'full' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  tenants: {
    title: 'Tenants',
    description: 'Manage tenant contacts, requirements, lease history, and future expansion opportunities.',
    createLabel: 'New tenant',
    emptyTitle: 'No tenants yet',
    emptyDescription: 'Create tenant records to prepare requirement tracking and lease history.',
    fetchRecords: getCommercialTenants,
    createRecord: createCommercialTenant,
    updateRecord: updateCommercialTenant,
    archiveRecord: archiveCommercialTenant,
    filters: [{ key: 'status', label: 'Status', options: ACTIVE_STATUSES }],
    columns: [
      { key: 'name', label: 'Tenant' },
      { key: 'industry', label: 'Industry', render: (row) => row.industry || '-' },
      { key: 'contact_person', label: 'Contact Person', render: (row) => row.contact_person || '-' },
      { key: 'current_location', label: 'Current Location', render: (row) => row.current_location || '-' },
      { key: 'current_lease_expiry', label: 'Lease Expiry', render: (row) => formatDate(row.current_lease_expiry) },
      statusColumn(),
    ],
    fields: [
      { name: 'name', label: 'Tenant/company name', required: true },
      { name: 'contact_person', label: 'Contact person' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'industry', label: 'Industry' },
      { name: 'company_size', label: 'Company size' },
      { name: 'current_location', label: 'Current location' },
      { name: 'current_lease_expiry', label: 'Current lease expiry', type: 'date' },
      { name: 'preferred_contact_method', label: 'Preferred contact method', type: 'select', options: CONTACT_METHODS },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  properties: {
    title: 'Properties',
    description: 'Manage commercial property stock, availability, vacancies, and property-specific leasing context.',
    createLabel: 'New property',
    emptyTitle: 'No commercial properties yet',
    emptyDescription: 'Create commercial property stock before linking requirements, deals, and leases.',
    fetchRecords: getCommercialProperties,
    createRecord: createCommercialProperty,
    updateRecord: updateCommercialProperty,
    archiveRecord: archiveCommercialProperty,
    filters: [
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
    ],
    columns: [
      { key: 'property_name', label: 'Property' },
      { key: 'property_type', label: 'Type', render: (row) => titleize(row.property_type) },
      { key: 'location', label: 'Location', render: (row) => [row.suburb, row.city].filter(Boolean).join(', ') || row.address || '-' },
      { key: 'landlord_id', label: 'Landlord', render: (row, lookups) => getLookupLabel(lookups, 'landlords', row.landlord_id) },
      { key: 'gla_m2', label: 'GLA', render: (row) => formatNumber(row.gla_m2, 'm²') },
      { key: 'available_space_m2', label: 'Available Space', render: (row) => formatNumber(row.available_space_m2, 'm²') },
      { key: 'vacancy_percentage', label: 'Vacancy %', render: (row) => `${formatNumber(row.vacancy_percentage)}%` },
      statusColumn(),
    ],
    fields: [
      { name: 'property_name', label: 'Property name', required: true },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_type', label: 'Property type', type: 'select', options: PROPERTY_TYPES },
      { name: 'address', label: 'Address', span: 'full' },
      { name: 'suburb', label: 'Suburb' },
      { name: 'city', label: 'City' },
      { name: 'province', label: 'Province' },
      { name: 'country', label: 'Country', defaultValue: 'South Africa' },
      { name: 'gla_m2', label: 'GLA m²', type: 'number' },
      { name: 'available_space_m2', label: 'Available space m²', type: 'number' },
      { name: 'vacancy_percentage', label: 'Vacancy percentage', type: 'percentage' },
      { name: 'zoning', label: 'Zoning' },
      { name: 'parking_ratio', label: 'Parking ratio' },
      { name: 'loading_bays', label: 'Loading bays', type: 'number' },
      { name: 'power_supply', label: 'Power supply' },
      { name: 'height_m', label: 'Height m', type: 'number' },
      { name: 'asking_rental_per_m2', label: 'Asking rental per m²', type: 'number' },
      { name: 'asking_sale_price', label: 'Asking sale price', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  vacancies: {
    title: 'Vacancies',
    description: 'Manage available units, floors, live GLA, asking rentals, landlord instructions, availability dates, broker assignments, and vacancy status.',
    createLabel: 'New vacancy',
    emptyTitle: 'No vacancies yet',
    emptyDescription: 'Capture live commercial availability so leasing teams can match tenant demand to stock.',
    fetchRecords: getCommercialVacancies,
    createRecord: createCommercialVacancy,
    updateRecord: updateCommercialVacancy,
    archiveRecord: archiveCommercialVacancy,
    filters: [
      { key: 'status', label: 'Status', options: VACANCY_STATUSES },
    ],
    columns: [
      { key: 'vacancy_name', label: 'Vacancy' },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'landlord_id', label: 'Landlord', render: (row, lookups) => getLookupLabel(lookups, 'landlords', row.landlord_id) },
      { key: 'unit_or_floor', label: 'Unit/Floor', render: (row) => row.unit_or_floor || '-' },
      { key: 'available_area_m2', label: 'Available GLA', render: (row) => formatNumber(row.available_area_m2, 'm²') },
      { key: 'asking_rental', label: 'Asking Rental', render: (row) => formatCurrency(row.asking_rental) },
      { key: 'availability_date', label: 'Availability', render: (row) => formatDate(row.availability_date) },
      statusColumn(),
    ],
    fields: [
      { name: 'vacancy_name', label: 'Vacancy name', required: true },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'unit_or_floor', label: 'Unit/Floor' },
      { name: 'available_area_m2', label: 'Available area m²', type: 'number' },
      { name: 'asking_rental', label: 'Asking rental', type: 'number' },
      { name: 'availability_date', label: 'Availability date', type: 'date' },
      { name: 'broker_assignment', label: 'Broker assignment id' },
      { name: 'status', label: 'Status', type: 'select', options: VACANCY_STATUSES, defaultValue: 'available' },
      { name: 'incentives', label: 'Incentives', type: 'textarea', span: 'full' },
      { name: 'fit_out_allowance', label: 'Fit-out allowance', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  requirements: {
    title: 'Requirements',
    description: 'Track tenant and investor requirements, preferred locations, budgets, and progress status.',
    createLabel: 'New requirement',
    documentsEntityType: 'commercial_requirement',
    secondaryActions: [{ label: 'Pipeline view', to: '/commercial/requirements/pipeline' }],
    emptyTitle: 'No requirements yet',
    emptyDescription: 'Create tenant or investor requirements to begin commercial matching.',
    fetchRecords: getCommercialRequirements,
    createRecord: createCommercialRequirement,
    updateRecord: updateCommercialRequirement,
    archiveRecord: archiveCommercialRequirement,
    filters: [
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'stage', label: 'Stage', options: REQUIREMENT_STAGES },
      { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
    ],
    crossValidate: maxGreaterThanMin('min_size_m2', 'max_size_m2', 'Max size cannot be less than min size.'),
    columns: [
      { key: 'requirement_name', label: 'Requirement' },
      { key: 'tenant_id', label: 'Client', render: (row, lookups) => getLookupLabel(lookups, 'tenants', row.tenant_id, titleize(row.client_type)) },
      { key: 'requirement_type', label: 'Type', render: (row) => titleize(row.requirement_type) },
      { key: 'size', label: 'Size Needed', render: (row) => `${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}` },
      { key: 'preferred_locations', label: 'Locations', render: (row) => formatList(row.preferred_locations) },
      { key: 'budget', label: 'Budget', render: (row) => `${formatCurrency(row.budget_min)} - ${formatCurrency(row.budget_max)}` },
      { key: 'stage', label: 'Stage', render: (row) => titleize(row.stage) },
      statusColumn(),
    ],
    fields: [
      { name: 'requirement_name', label: 'Requirement name', required: true },
      { name: 'requirement_type', label: 'Requirement type', type: 'select', required: true, options: [{ value: 'lease', label: 'Lease' }, { value: 'purchase', label: 'Purchase' }, { value: 'investment', label: 'Investment' }] },
      { name: 'client_type', label: 'Client type', type: 'select', options: [{ value: 'tenant', label: 'Tenant' }, { value: 'investor', label: 'Investor' }, { value: 'owner_occupier', label: 'Owner Occupier' }] },
      { name: 'tenant_id', label: 'Linked tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'property_type', label: 'Property type', type: 'select', options: PROPERTY_TYPES },
      { name: 'preferred_locations', label: 'Preferred locations', type: 'multiText', help: 'Separate locations with commas.' },
      { name: 'min_size_m2', label: 'Min size m²', type: 'number' },
      { name: 'max_size_m2', label: 'Max size m²', type: 'number' },
      { name: 'budget_min', label: 'Budget min', type: 'number' },
      { name: 'budget_max', label: 'Budget max', type: 'number' },
      { name: 'target_occupation_date', label: 'Target occupation date', type: 'date' },
      { name: 'lease_term_months', label: 'Lease term months', type: 'number' },
      { name: 'assigned_broker', label: 'Assigned broker id' },
      { name: 'stage', label: 'Stage', type: 'select', options: REQUIREMENT_STAGES, defaultValue: 'new_requirement' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'special_requirements', label: 'Special requirements', type: 'textarea', span: 'full' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  deals: {
    title: 'Deals',
    description: 'Track commercial leasing and sales deals from requirement through signed agreement.',
    createLabel: 'New deal',
    documentsEntityType: 'commercial_deal',
    showHeadsOfTerms: true,
    secondaryActions: [{ label: 'Pipeline view', to: '/commercial/deals/pipeline' }],
    emptyTitle: 'No commercial deals yet',
    emptyDescription: 'Create a deal once a requirement, property, or negotiation is active.',
    fetchRecords: getCommercialDeals,
    createRecord: createCommercialDeal,
    updateRecord: updateCommercialDeal,
    archiveRecord: archiveCommercialDeal,
    filters: [
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'stage', label: 'Stage', options: DEAL_STAGES },
      { key: 'deal_type', label: 'Deal type', options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] },
    ],
    columns: [
      { key: 'deal_name', label: 'Deal' },
      { key: 'deal_type', label: 'Type', render: (row) => titleize(row.deal_type) },
      { key: 'tenant_id', label: 'Tenant/Client', render: (row, lookups) => getLookupLabel(lookups, 'tenants', row.tenant_id) },
      { key: 'landlord_id', label: 'Landlord/Seller', render: (row, lookups) => getLookupLabel(lookups, 'landlords', row.landlord_id) },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'stage', label: 'Stage', render: (row) => titleize(row.stage) },
      { key: 'deal_value', label: 'Value', render: (row) => formatCurrency(row.deal_value) },
      { key: 'expected_close_date', label: 'Expected Close', render: (row) => formatDate(row.expected_close_date) },
      statusColumn(),
    ],
    fields: [
      { name: 'deal_name', label: 'Deal name', required: true },
      { name: 'deal_type', label: 'Deal type', type: 'select', required: true, options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] },
      { name: 'requirement_id', label: 'Linked requirement', type: 'select', optionsFrom: 'requirements' },
      { name: 'tenant_id', label: 'Linked tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'landlord_id', label: 'Linked landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_id', label: 'Linked property', type: 'select', optionsFrom: 'properties' },
      { name: 'assigned_broker', label: 'Assigned broker id' },
      { name: 'stage', label: 'Stage', type: 'select', options: DEAL_STAGES, defaultValue: 'requirement' },
      { name: 'deal_value', label: 'Deal value', type: 'number' },
      { name: 'estimated_commission', label: 'Estimated commission', type: 'number' },
      { name: 'expected_close_date', label: 'Expected close date', type: 'date' },
      { name: 'probability_percentage', label: 'Probability percentage', type: 'percentage' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  leases: {
    title: 'Leases',
    description: 'Manage lease records, renewals, expiries, deposits, escalation percentages, and occupation dates.',
    createLabel: 'New lease',
    documentsEntityType: 'commercial_lease',
    emptyTitle: 'No leases yet',
    emptyDescription: 'Create lease records once commercial deals are signed or ready for lease management.',
    fetchRecords: getCommercialLeases,
    createRecord: createCommercialLease,
    updateRecord: updateCommercialLease,
    archiveRecord: archiveCommercialLease,
    filters: [{ key: 'status', label: 'Status', options: LEASE_STATUSES }],
    crossValidate: leaseDateValidation,
    columns: [
      { key: 'tenant_id', label: 'Tenant', render: (row, lookups) => getLookupLabel(lookups, 'tenants', row.tenant_id) },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'landlord_id', label: 'Landlord', render: (row, lookups) => getLookupLabel(lookups, 'landlords', row.landlord_id) },
      { key: 'lease_start_date', label: 'Lease Start', render: (row) => formatDate(row.lease_start_date) },
      { key: 'lease_end_date', label: 'Lease End', render: (row) => formatDate(row.lease_end_date) },
      { key: 'monthly_rental', label: 'Monthly Rental', render: (row) => formatCurrency(row.monthly_rental) },
      { key: 'escalation_percentage', label: 'Escalation', render: (row) => `${formatNumber(row.escalation_percentage)}%` },
      { key: 'status', label: 'Renewal Status', render: (row) => createElement(CommercialStatusPill, { value: row.status }) },
    ],
    fields: [
      { name: 'deal_id', label: 'Linked deal', type: 'select', optionsFrom: 'deals' },
      { name: 'tenant_id', label: 'Tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
      { name: 'lease_start_date', label: 'Lease start date', type: 'date' },
      { name: 'lease_end_date', label: 'Lease end date', type: 'date' },
      { name: 'occupation_date', label: 'Occupation date', type: 'date' },
      { name: 'lease_term_months', label: 'Lease term months', type: 'number' },
      { name: 'monthly_rental', label: 'Monthly rental', type: 'number' },
      { name: 'rental_per_m2', label: 'Rental per m²', type: 'number' },
      { name: 'escalation_percentage', label: 'Escalation percentage', type: 'percentage' },
      { name: 'deposit_amount', label: 'Deposit amount', type: 'number' },
      { name: 'tenant_installation_allowance', label: 'Tenant installation allowance', type: 'number' },
      { name: 'rent_free_period_months', label: 'Rent-free period months', type: 'number' },
      { name: 'renewal_option', label: 'Renewal option', type: 'checkbox' },
      { name: 'renewal_notice_date', label: 'Renewal notice date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: LEASE_STATUSES, defaultValue: 'draft' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
}
