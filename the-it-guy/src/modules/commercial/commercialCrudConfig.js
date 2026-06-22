import { createElement } from 'react'
import { Link } from 'react-router-dom'
import CommercialListingWizard from './components/CommercialListingWizard'
import CommercialVacancyCreateModal from './components/CommercialVacancyCreateModal'
import CommercialStatusPill from './components/CommercialStatusPill'
import { formatCurrency, formatDate, formatList, formatNumber, titleize } from './commercialFormatters'
import { getCommercialNextAction, getCommercialUpdatedDate } from './commercialPresentation'
import { lifecycleOptions } from './commercialWorkflow'
import { scoreListingQuality } from './services/commercialIntelligenceApi'
import {
  getPropertyTypeOptionsByCategory,
  normalizePropertyCategory,
} from '../../lib/propertyTaxonomy'
import {
  archiveCommercialCompany,
  archiveCommercialContact,
  archiveCommercialDeal,
  archiveCommercialLandlord,
  archiveCommercialLease,
  archiveCommercialListing,
  archiveCommercialProperty,
  archiveCommercialRequirement,
  archiveCommercialTenant,
  archiveCommercialVacancy,
  createCommercialCompany,
  createCommercialContact,
  createCommercialDeal,
  createCommercialLandlord,
  createCommercialLease,
  createCommercialListing,
  createCommercialProperty,
  createCommercialRequirement,
  createCommercialTenant,
  createCommercialTransaction,
  createCommercialVacancy,
  getCommercialCompanies,
  getCommercialContacts,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialVacancies,
  updateCommercialCompany,
  updateCommercialContact,
  updateCommercialDeal,
  updateCommercialLandlord,
  updateCommercialLease,
  updateCommercialListing,
  updateCommercialProperty,
  updateCommercialRequirement,
  updateCommercialTenant,
  updateCommercialTransaction,
  updateCommercialVacancy,
  archiveCommercialTransaction,
  getCommercialTransactions,
} from './services/commercialApi'

export const ACTIVE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

const LEASE_STATUSES = [
  ...lifecycleOptions('leases'),
  { value: 'archived', label: 'Archived' },
]

const VACANCY_STATUSES = [
  ...lifecycleOptions('vacancies'),
]

export const LISTING_STATUSES = [
  ...lifecycleOptions('listings'),
]

export const LISTING_CATEGORIES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'office', label: 'Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'investment', label: 'Investment' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'development_land', label: 'Development Land' },
]

export const LISTING_TYPES = [
  { value: 'lease', label: 'To Let' },
  { value: 'sale', label: 'For Sale' },
  { value: 'investment', label: 'Investment' },
  { value: 'development', label: 'Development' },
]

export const REQUIREMENT_STAGES = [
  ...lifecycleOptions('requirements'),
]

export const DEAL_STAGES = [
  ...lifecycleOptions('deals'),
]

export const TRANSACTION_STAGES = [
  ...lifecycleOptions('transactions'),
]

export const PROPERTY_TYPES = [
  ...getPropertyTypeOptionsByCategory('commercial'),
  ...getPropertyTypeOptionsByCategory('industrial'),
  ...getPropertyTypeOptionsByCategory('retail'),
  ...getPropertyTypeOptionsByCategory('agricultural'),
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'investment', label: 'Investment' },
  { value: 'development_land', label: 'Development Land' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'land', label: 'Land' },
]

const COMMERCIAL_PROPERTY_CATEGORIES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
]

function normalizeCommercialPropertyCategory(value = '') {
  const normalized = normalizePropertyCategory(value, { fallback: 'commercial' })
  if (COMMERCIAL_PROPERTY_CATEGORIES.some((category) => category.value === normalized)) return normalized
  return 'commercial'
}

function commercialPropertyCategoryOptions() {
  return COMMERCIAL_PROPERTY_CATEGORIES
}

function commercialPropertyTypeOptions(values = {}) {
  const category = normalizeCommercialPropertyCategory(values.property_category || values.property_type)
  const options = [...getPropertyTypeOptionsByCategory(category)]

  if (category === 'commercial') {
    options.push(
      { value: 'office', label: 'Office' },
      { value: 'mixed_use', label: 'Mixed Use' },
      { value: 'investment', label: 'Investment' },
      { value: 'development_land', label: 'Development Land' },
      { value: 'land', label: 'Land' },
    )
  }

  if (category === 'industrial') options.push({ value: 'industrial', label: 'Industrial' })
  if (category === 'retail') options.push({ value: 'retail', label: 'Retail' })
  if (category === 'agricultural') options.push({ value: 'agricultural', label: 'Agricultural' })

  const seen = new Set()
  return options.filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

function showForPropertyCategories(...categories) {
  const allowed = new Set(categories.flat().map((category) => normalizeCommercialPropertyCategory(category)))
  return (values, record) => {
    const currentCategory = normalizeCommercialPropertyCategory(values?.property_category || record?.property_type || record?.property_category)
    return allowed.has(currentCategory)
  }
}

function workspaceLink(to, label) {
  return createElement(Link, { to, className: 'font-semibold text-[#1267a3] transition hover:text-[#0c4f80]' }, label)
}

const CONTACT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
]

const COMPANY_TYPES = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'investor', label: 'Investor' },
  { value: 'developer', label: 'Developer' },
  { value: 'property_fund', label: 'Property Fund' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
]

const COMPANY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'archived', label: 'Archived' },
]

const CONTACT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

const LANDLORD_TYPES = [
  { value: 'individual', label: 'Private Individual' },
  { value: 'company', label: 'Company' },
  { value: 'cc', label: 'Close Corporation' },
  { value: 'trust', label: 'Trust' },
  { value: 'fund', label: 'Property Fund' },
  { value: 'reit', label: 'REIT' },
  { value: 'listed_company', label: 'Listed Company' },
  { value: 'government_entity', label: 'Government Entity' },
  { value: 'private_owner', label: 'Private Owner' },
  { value: 'listed_fund', label: 'Listed Fund' },
  { value: 'property_company', label: 'Property Company' },
  { value: 'developer', label: 'Developer' },
  { value: 'institution', label: 'Institution' },
]

const PROPERTY_ADDRESS_MAPPING = { streetAddress: 'address' }
const COMPANY_ADDRESS_MAPPING = { streetAddress: 'address' }
const LANDLORD_REGISTERED_ADDRESS_MAPPING = { streetAddress: 'registered_address' }
const TENANT_CURRENT_LOCATION_MAPPING = { streetAddress: 'current_location' }
const REQUIREMENT_AREA_MAPPING = { arrayField: 'preferred_locations' }
const LISTING_ADDRESS_MAPPING = { streetAddress: 'address' }

function getLookupLabel(lookups, kind, id, fallback = '-') {
  if (!id) return fallback
  const match = (lookups?.[kind] || []).find((item) => item.value === id)
  return match?.label || fallback
}

function statusColumn() {
  return { key: 'status', label: 'Status', render: (row) => createElement(CommercialStatusPill, { value: row.status }) }
}

function brokerColumn(key = 'assigned_broker') {
  return { key, label: 'Broker Owner', render: (row, lookups) => getLookupLabel(lookups, 'brokers', row[key] || row.broker_id, 'Unassigned') }
}

function nextActionColumn(kind) {
  return { key: 'next_action', label: 'Next Action', sortable: false, render: (row) => getCommercialNextAction(kind, row) }
}

function updatedColumn() {
  return { key: 'updated_at', label: 'Last Activity', render: (row) => getCommercialUpdatedDate(row) }
}

function standardSortOptions(valueKey = 'updated_at', valueLabel = 'Value / GLA') {
  return [
    { key: 'updated_at', direction: 'desc', label: 'Newest updated' },
    { key: 'updated_at', direction: 'asc', label: 'Oldest updated' },
    { key: valueKey, direction: 'desc', label: `${valueLabel}: high to low` },
    { key: valueKey, direction: 'asc', label: `${valueLabel}: low to high` },
  ]
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
  companies: {
    kind: 'companies',
    title: 'Companies',
    description: 'Manage occupiers, investors, landlords, property funds, and corporate clients as the core commercial CRM account record.',
    createLabel: 'New company',
    documentsEntityType: 'commercial_company',
    emptyTitle: 'No companies yet',
    emptyDescription: 'Create companies so requirements, deals, and transactions can be managed against real commercial clients and counterparties.',
    fetchRecords: getCommercialCompanies,
    createRecord: createCommercialCompany,
    updateRecord: updateCommercialCompany,
    archiveRecord: archiveCommercialCompany,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('company_name', 'Company name'),
    filters: [
      { key: 'company_type', label: 'Company type', options: COMPANY_TYPES },
      { key: 'status', label: 'Status', options: COMPANY_STATUSES },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
    ],
    searchLookupFields: [{ name: 'broker_id', optionsFrom: 'brokers' }],
    columns: [
      { key: 'company_name', label: 'Company' },
      { key: 'company_type', label: 'Type', render: (row) => titleize(row.company_type) },
      { key: 'industry', label: 'Industry', render: (row) => row.industry || '-' },
      brokerColumn('broker_id'),
      nextActionColumn('companies'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'company_name', label: 'Company name', required: true },
      { name: 'company_type', label: 'Company type', type: 'select', required: true, options: COMPANY_TYPES, defaultValue: 'tenant' },
      { name: 'industry', label: 'Industry' },
      { name: 'website', label: 'Website' },
      { name: 'registration_number', label: 'Registration number' },
      { name: 'vat_number', label: 'VAT number' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', type: 'email' },
      {
        name: 'address',
        label: 'Address',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing the company address...',
        description: 'Select a Google Places result, or type manually if the address is not listed.',
        addressMapping: COMPANY_ADDRESS_MAPPING,
      },
      { name: 'city', label: 'City' },
      { name: 'province', label: 'Province' },
      { name: 'country', label: 'Country' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'broker_id', label: 'Broker owner', type: 'select', optionsFrom: 'brokers', required: true },
      { name: 'status', label: 'Status', type: 'select', options: COMPANY_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  contacts: {
    kind: 'contacts',
    title: 'Contacts',
    description: 'Track commercial decision makers, leasing executives, directors, fund managers, and day-to-day property contacts.',
    createLabel: 'New contact',
    documentsEntityType: 'commercial_contact',
    emptyTitle: 'No contacts yet',
    emptyDescription: 'Create contacts under each company so brokers can work against real people, not just account names.',
    fetchRecords: getCommercialContacts,
    createRecord: createCommercialContact,
    updateRecord: updateCommercialContact,
    archiveRecord: archiveCommercialContact,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('last_name', 'Contact name'),
    filters: [
      { key: 'company_id', label: 'Company', optionsFrom: 'companies' },
      { key: 'status', label: 'Status', options: CONTACT_STATUSES },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
    ],
    searchLookupFields: [
      { name: 'company_id', optionsFrom: 'companies' },
      { name: 'broker_id', optionsFrom: 'brokers' },
    ],
    columns: [
      { key: 'name', label: 'Contact', render: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || '-' },
      { key: 'company_id', label: 'Company', render: (row, lookups) => getLookupLabel(lookups, 'companies', row.company_id) },
      { key: 'job_title', label: 'Role', render: (row) => row.job_title || '-' },
      { key: 'decision_maker', label: 'Decision Maker', render: (row) => row.decision_maker ? 'Yes' : 'No' },
      brokerColumn('broker_id'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'company_id', label: 'Company', type: 'select', optionsFrom: 'companies', required: true },
      { name: 'first_name', label: 'First name', required: true },
      { name: 'last_name', label: 'Last name' },
      { name: 'job_title', label: 'Job title' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'mobile', label: 'Mobile' },
      { name: 'preferred_contact_method', label: 'Preferred contact method', type: 'select', options: CONTACT_METHODS },
      { name: 'decision_maker', label: 'Decision maker', type: 'checkbox' },
      { name: 'is_primary', label: 'Primary contact', type: 'checkbox' },
      { name: 'status', label: 'Status', type: 'select', options: CONTACT_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  landlords: {
    kind: 'landlords',
    title: 'Landlords',
    description: 'Manage landlords, landlord contacts, portfolios, mandates, and available space.',
    createLabel: 'New landlord',
    documentsEntityType: 'commercial_landlord',
    emptyTitle: 'No landlords yet',
    emptyDescription: 'Add your first landlord to start tracking mandates, properties, vacancies, and portfolio activity.',
    fetchRecords: getCommercialLandlords,
    createRecord: createCommercialLandlord,
    updateRecord: updateCommercialLandlord,
    archiveRecord: archiveCommercialLandlord,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('name', 'Landlord name'),
    filters: [{ key: 'status', label: 'Status', options: ACTIVE_STATUSES }],
    columns: [
      { key: 'name', label: 'Landlord', render: (row) => workspaceLink(`/commercial/landlords/${row.id}`, row.legal_name || row.name || 'Landlord') },
      { key: 'entity_type', label: 'Type', render: (row) => titleize(row.entity_type || row.landlord_type) },
      { key: 'main_email', label: 'Main Contact', render: (row) => row.main_email || row.email || row.contact_person || '-' },
      { key: 'onboarding_status', label: 'Onboarding', render: (row) => titleize(row.onboarding_status || 'not_sent') },
      nextActionColumn('landlords'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'name', label: 'Landlord display name', required: true },
      { name: 'legal_name', label: 'Legal entity name', required: true },
      { name: 'trading_name', label: 'Trading name' },
      { name: 'entity_type', label: 'Entity type', type: 'select', options: LANDLORD_TYPES, defaultValue: 'company' },
      { name: 'registration_number', label: 'Registration number' },
      { name: 'vat_number', label: 'VAT number' },
      { name: 'contact_person', label: 'Contact person' },
      { name: 'main_email', label: 'Main email', type: 'email' },
      { name: 'main_phone', label: 'Main phone' },
      { name: 'email', label: 'Legacy email', type: 'email' },
      { name: 'phone', label: 'Legacy phone' },
      {
        name: 'registered_address',
        label: 'Registered address',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing the registered address...',
        description: 'Select the closest Google Places result, or keep a manual address.',
        addressMapping: LANDLORD_REGISTERED_ADDRESS_MAPPING,
      },
      { name: 'postal_address', label: 'Postal address', type: 'textarea', span: 'full' },
      { name: 'website', label: 'Website' },
      { name: 'preferred_contact_method', label: 'Preferred contact method', type: 'select', options: CONTACT_METHODS },
      { name: 'onboarding_status', label: 'Onboarding status', type: 'select', options: [
        { value: 'not_sent', label: 'Not Sent' },
        { value: 'sent', label: 'Sent' },
        { value: 'opened', label: 'Opened' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'submitted', label: 'Submitted' },
        { value: 'missing_information', label: 'Missing Information' },
        { value: 'complete', label: 'Complete' },
        { value: 'expired', label: 'Expired' },
      ], defaultValue: 'not_sent' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'portfolio_notes', label: 'Portfolio notes', type: 'textarea', span: 'full' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  tenants: {
    kind: 'tenants',
    title: 'Tenants',
    description: 'Manage tenant contacts, requirements, lease history, and future expansion opportunities.',
    createLabel: 'New tenant',
    documentsEntityType: 'commercial_tenant',
    emptyTitle: 'No tenants yet',
    emptyDescription: 'Add tenants so brokers can capture requirements, track lease expiries, and manage future demand.',
    fetchRecords: getCommercialTenants,
    createRecord: createCommercialTenant,
    updateRecord: updateCommercialTenant,
    archiveRecord: archiveCommercialTenant,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('current_lease_expiry', 'Lease expiry'),
    filters: [{ key: 'status', label: 'Status', options: ACTIVE_STATUSES }],
    columns: [
      { key: 'name', label: 'Tenant' },
      { key: 'industry', label: 'Industry', render: (row) => row.industry || '-' },
      { key: 'contact_person', label: 'Contact Person', render: (row) => row.contact_person || '-' },
      { key: 'current_lease_expiry', label: 'Lease Expiry', render: (row) => formatDate(row.current_lease_expiry) },
      nextActionColumn('tenants'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'name', label: 'Tenant/company name', required: true },
      { name: 'contact_person', label: 'Contact person' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'industry', label: 'Industry' },
      { name: 'company_size', label: 'Company size' },
      {
        name: 'current_location',
        label: 'Current location',
        type: 'address',
        mode: 'area',
        span: 'full',
        placeholder: 'Search current premises or area...',
        description: 'Use a premises address or area-level result. Manual entries are allowed.',
        addressMapping: TENANT_CURRENT_LOCATION_MAPPING,
      },
      { name: 'current_lease_expiry', label: 'Current lease expiry', type: 'date' },
      { name: 'preferred_contact_method', label: 'Preferred contact method', type: 'select', options: CONTACT_METHODS },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  properties: {
    kind: 'properties',
    title: 'Properties',
    description: 'Manage commercial property stock, availability, vacancies, and property-specific leasing context.',
    createLabel: 'New property',
    documentsEntityType: 'commercial_property',
    emptyTitle: 'No properties yet',
    emptyDescription: 'Add your first commercial property to start tracking vacancies, leases, and landlord activity.',
    fetchRecords: getCommercialProperties,
    createRecord: createCommercialProperty,
    updateRecord: updateCommercialProperty,
    archiveRecord: archiveCommercialProperty,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('gla_m2', 'GLA'),
    filters: [
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
    ],
    columns: [
      { key: 'property_name', label: 'Property', render: (row) => workspaceLink(`/commercial/properties/${row.id}`, row.property_name || 'Property') },
      { key: 'property_type', label: 'Type', render: (row) => titleize(row.property_type) },
      { key: 'location', label: 'Location', render: (row) => [row.suburb, row.city].filter(Boolean).join(', ') || row.address || '-' },
      { key: 'landlord_id', label: 'Landlord', render: (row, lookups) => getLookupLabel(lookups, 'landlords', row.landlord_id) },
      { key: 'gla_m2', label: 'GLA', render: (row) => formatNumber(row.gla_m2, 'm²') },
      { key: 'available_space_m2', label: 'Available Space', render: (row) => formatNumber(row.available_space_m2, 'm²') },
      { key: 'vacancy_percentage', label: 'Vacancy %', render: (row) => `${formatNumber(row.vacancy_percentage)}%` },
      nextActionColumn('properties'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'property_name', label: 'Property name', required: true },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'broker_id', label: 'Broker owner', type: 'select', optionsFrom: 'brokers', required: true },
      {
        name: 'property_category',
        label: 'Property category',
        type: 'select',
        options: commercialPropertyCategoryOptions(),
        required: true,
        persist: false,
        getInitialValue: (record) => normalizeCommercialPropertyCategory(record?.property_type || record?.property_category || 'commercial'),
        onChange: (nextValue, previous, next) => {
          if (next.property_type && normalizeCommercialPropertyCategory(next.property_type) !== normalizeCommercialPropertyCategory(nextValue)) {
            next.property_type = ''
          }
        },
      },
      {
        name: 'property_type',
        label: 'Property type',
        type: 'select',
        options: commercialPropertyTypeOptions,
        required: true,
        visibleWhen: (values, record) => Boolean(values.property_category || record?.property_type || record?.property_category),
        help: 'Choose the subtype for the selected category.',
      },
      {
        name: 'address',
        label: 'Property address',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing the property address...',
        description: 'Select the Google Places result to store clean suburb, city, province, postal code, and map data.',
        addressMapping: PROPERTY_ADDRESS_MAPPING,
      },
      { name: 'suburb', label: 'Suburb' },
      { name: 'city', label: 'City' },
      { name: 'province', label: 'Province' },
      { name: 'postal_code', label: 'Postal code' },
      { name: 'country', label: 'Country', defaultValue: 'South Africa' },
      { name: 'gla_m2', label: 'GLA m²', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'available_space_m2', label: 'Available space m²', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'number_of_units', label: 'Number of units', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'vacancy_percentage', label: 'Vacancy percentage', type: 'percentage', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'zoning', label: 'Zoning', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'parking_ratio', label: 'Parking ratio', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'loading_bays', label: 'Loading bays', type: 'number', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'power_supply', label: 'Power supply', visibleWhen: showForPropertyCategories('commercial', 'industrial') },
      { name: 'height_m', label: 'Height m', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial') },
      { name: 'asking_rental_per_m2', label: 'Asking rental per m²', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'asking_sale_price', label: 'Asking sale price', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail', 'agricultural') },
      { name: 'building_grade', label: 'Building grade', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'backup_power', label: 'Backup power', type: 'checkbox', visibleWhen: showForPropertyCategories('commercial', 'industrial') },
      { name: 'generator', label: 'Generator', type: 'checkbox', visibleWhen: showForPropertyCategories('commercial', 'industrial') },
      { name: 'solar', label: 'Solar', type: 'checkbox', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'fibre', label: 'Fibre', type: 'checkbox', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'number_of_lifts', label: 'Number of lifts', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'retail') },
      { name: 'amenities', label: 'Amenities', type: 'textarea', span: 'full', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'yard_size_m2', label: 'Yard size m²', type: 'number', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'eaves_height_m', label: 'Eaves height m', type: 'number', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'roller_doors', label: 'Roller doors', type: 'number', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'truck_access', label: 'Truck access', type: 'checkbox', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'sprinklers', label: 'Sprinklers', type: 'checkbox', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'warehouse_area_m2', label: 'Warehouse area m²', type: 'number', visibleWhen: showForPropertyCategories('industrial') },
      { name: 'office_area_m2', label: 'Office area m²', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'frontage_m', label: 'Frontage m', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'retail') },
      { name: 'anchor_tenants', label: 'Anchor tenants', visibleWhen: showForPropertyCategories('retail', 'commercial') },
      { name: 'foot_traffic', label: 'Foot traffic', visibleWhen: showForPropertyCategories('retail') },
      { name: 'trading_hours', label: 'Trading hours', visibleWhen: showForPropertyCategories('retail') },
      { name: 'mall_type', label: 'Mall type', visibleWhen: showForPropertyCategories('retail') },
      { name: 'visibility_rating', label: 'Visibility rating', visibleWhen: showForPropertyCategories('retail') },
      { name: 'noi', label: 'NOI', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'cap_rate', label: 'Cap rate %', type: 'percentage', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'wale_months', label: 'WALE months', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'gross_yield', label: 'Gross yield %', type: 'percentage', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'net_yield', label: 'Net yield %', type: 'percentage', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail') },
      { name: 'annual_income', label: 'Annual income', type: 'number', visibleWhen: showForPropertyCategories('commercial', 'industrial', 'retail', 'agricultural') },
      { name: 'land_size_m2', label: 'Land size m²', type: 'number', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'bulk', label: 'Bulk', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'coverage', label: 'Coverage', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'services_available', label: 'Services available', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'environmental_status', label: 'Environmental status', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'farm_size_ha', label: 'Farm size ha', type: 'number', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'water_rights', label: 'Water rights', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'irrigation', label: 'Irrigation', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'crop_type', label: 'Crop type', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'livestock_capacity', label: 'Livestock capacity', visibleWhen: showForPropertyCategories('agricultural') },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  vacancies: {
    kind: 'vacancies',
    title: 'Vacancies',
    description: 'Manage available units, floors, live GLA, asking rentals, landlord instructions, availability dates, broker assignments, and vacancy status.',
    createLabel: 'New vacancy',
    createModal: CommercialVacancyCreateModal,
    documentsEntityType: 'commercial_vacancy',
    emptyTitle: 'No vacancies yet',
    emptyDescription: 'Capture live commercial availability so brokers can match tenant demand to stock.',
    fetchRecords: getCommercialVacancies,
    createRecord: createCommercialVacancy,
    updateRecord: updateCommercialVacancy,
    archiveRecord: archiveCommercialVacancy,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('available_area_m2', 'Available GLA'),
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'status', label: 'Status', options: VACANCY_STATUSES },
      { key: 'broker_assignment', label: 'Broker Owner', optionsFrom: 'brokers' },
    ],
    columns: [
      { key: 'vacancy_name', label: 'Vacancy', render: (row) => workspaceLink(`/commercial/vacancies/${row.id}`, row.vacancy_name || 'Vacancy') },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'unit_or_floor', label: 'Unit/Floor', render: (row) => row.unit_or_floor || '-' },
      { key: 'available_area_m2', label: 'Available GLA', render: (row) => formatNumber(row.available_area_m2, 'm²') },
      { key: 'asking_rental', label: 'Asking Rental', render: (row) => formatCurrency(row.asking_rental) },
      brokerColumn('broker_assignment'),
      nextActionColumn('vacancies'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'vacancy_name', label: 'Vacancy name', required: true },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties', required: true },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'unit_or_floor', label: 'Unit/Floor' },
      { name: 'available_area_m2', label: 'Available area m²', type: 'number' },
      { name: 'asking_rental', label: 'Asking rental', type: 'number' },
      { name: 'availability_date', label: 'Availability date', type: 'date' },
      {
        name: 'formatted_address',
        label: 'Address override',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing an address if this vacancy is not tied to the selected property...',
        description: 'Vacancies usually inherit address data from the selected property. Use this only for unlisted or temporary premises.',
      },
      { name: 'broker_assignment', label: 'Assigned broker', type: 'select', optionsFrom: 'brokers', required: true },
      { name: 'status', label: 'Status', type: 'select', options: VACANCY_STATUSES, defaultValue: 'draft' },
      { name: 'incentives', label: 'Incentives', type: 'textarea', span: 'full' },
      { name: 'fit_out_allowance', label: 'Fit-out allowance', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  listings: {
    kind: 'listings',
    title: 'Listings',
    description: 'Manage market-facing commercial opportunities linked to landlords, properties, vacancies, brokers, teams, and branches.',
    createLabel: 'Add Listing',
    createModal: CommercialListingWizard,
    documentsEntityType: 'commercial_listing',
    secondaryActions: [{ label: 'Assignments', to: '/commercial/brokers/assignments' }],
    emptyTitle: 'No listings yet',
    emptyDescription: 'Create a commercial listing to market a vacancy, property, or specialist opportunity.',
    fetchRecords: getCommercialListings,
    createRecord: createCommercialListing,
    updateRecord: updateCommercialListing,
    archiveRecord: archiveCommercialListing,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('pricing', 'Pricing'),
    searchFields: ['title', 'description', 'listing_category', 'listing_type', 'listing_status', 'pricing_notes'],
    searchLookupFields: [
      { name: 'landlord_id', optionsFrom: 'landlords' },
      { name: 'property_id', optionsFrom: 'properties' },
      { name: 'vacancy_id', optionsFrom: 'vacancies' },
      { name: 'broker_id', optionsFrom: 'brokers' },
    ],
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
      { key: 'listing_status', label: 'Listing Status', options: LISTING_STATUSES },
      { key: 'listing_category', label: 'Category', options: LISTING_CATEGORIES },
      { key: 'featured', label: 'Featured', options: [{ value: 'true', label: 'Featured' }, { value: 'false', label: 'Standard' }] },
    ],
    columns: [
      { key: 'title', label: 'Listing', render: (row) => workspaceLink(`/commercial/listings/${row.id}`, row.title || 'Listing') },
      { key: 'listing_category', label: 'Category', render: (row) => titleize(row.listing_category) },
      { key: 'listing_status', label: 'Status', render: (row) => createElement(CommercialStatusPill, { value: row.listing_status || row.status }) },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'vacancy_id', label: 'Vacancy', render: (row, lookups) => getLookupLabel(lookups, 'vacancies', row.vacancy_id) },
      { key: 'pricing', label: 'Pricing', render: (row) => formatCurrency(row.pricing) },
      { key: 'quality', label: 'Quality', sortable: false, render: (row) => `${scoreListingQuality(row).score}%` },
      brokerColumn('broker_id'),
      nextActionColumn('listings'),
      updatedColumn(),
    ],
    fields: [
      { name: 'title', label: 'Listing title', required: true },
      { name: 'listing_type', label: 'Listing type', type: 'select', options: LISTING_TYPES, defaultValue: 'lease' },
      { name: 'listing_category', label: 'Listing category', type: 'select', options: LISTING_CATEGORIES, defaultValue: 'office' },
      { name: 'listing_status', label: 'Listing status', type: 'select', options: LISTING_STATUSES, defaultValue: 'draft' },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
      { name: 'vacancy_id', label: 'Vacancy', type: 'select', optionsFrom: 'vacancies' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'broker_id', label: 'Broker owner', type: 'select', optionsFrom: 'brokers', required: true },
      { name: 'pricing', label: 'Pricing', type: 'number' },
      {
        name: 'formatted_address',
        label: 'Listing address',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing the listing address...',
        description: 'Use this when the listing is not fully represented by the linked property yet.',
        addressMapping: LISTING_ADDRESS_MAPPING,
      },
      { name: 'pricing_notes', label: 'Pricing notes', span: 'full' },
      { name: 'available_from', label: 'Available from', type: 'date' },
      { name: 'featured', label: 'Featured', type: 'checkbox' },
      { name: 'status', label: 'Internal status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'description', label: 'Description', type: 'textarea', span: 'full' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  requirements: {
    kind: 'requirements',
    title: 'Requirements',
    description: 'Track tenant and investor requirements, preferred locations, budgets, and progress status.',
    createLabel: 'New requirement',
    documentsEntityType: 'commercial_requirement',
    secondaryActions: [{ label: 'Pipeline view', to: '/commercial/requirements/pipeline' }],
    emptyTitle: 'No requirements yet',
    emptyDescription: 'Capture tenant requirements so brokers can match them to available vacancies.',
    fetchRecords: getCommercialRequirements,
    createRecord: createCommercialRequirement,
    updateRecord: updateCommercialRequirement,
    archiveRecord: archiveCommercialRequirement,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('max_size_m2', 'Required GLA'),
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'assigned_broker', label: 'Broker Owner', optionsFrom: 'brokers' },
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'stage', label: 'Stage', options: REQUIREMENT_STAGES },
      { key: 'property_type', label: 'Property type', options: PROPERTY_TYPES },
    ],
    searchLookupFields: [
      { name: 'company_id', optionsFrom: 'companies' },
      { name: 'contact_id', optionsFrom: 'contacts' },
      { name: 'tenant_id', optionsFrom: 'tenants' },
    ],
    crossValidate: maxGreaterThanMin('min_size_m2', 'max_size_m2', 'Max size cannot be less than min size.'),
    columns: [
      { key: 'requirement_name', label: 'Requirement' },
      { key: 'company_id', label: 'Company', render: (row, lookups) => getLookupLabel(lookups, 'companies', row.company_id, getLookupLabel(lookups, 'tenants', row.tenant_id, titleize(row.client_type))) },
      { key: 'contact_id', label: 'Contact', render: (row, lookups) => getLookupLabel(lookups, 'contacts', row.contact_id, '-') },
      { key: 'size', label: 'Size Needed', render: (row) => `${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}` },
      { key: 'preferred_locations', label: 'Locations', render: (row) => formatList(row.preferred_locations) },
      { key: 'stage', label: 'Stage', render: (row) => titleize(row.stage) },
      brokerColumn(),
      nextActionColumn('requirements'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'requirement_name', label: 'Requirement name', required: true },
      { name: 'requirement_type', label: 'Requirement type', type: 'select', required: true, options: [{ value: 'lease', label: 'Lease' }, { value: 'purchase', label: 'Purchase' }, { value: 'investment', label: 'Investment' }] },
      { name: 'client_type', label: 'Client type', type: 'select', options: [{ value: 'tenant', label: 'Tenant' }, { value: 'investor', label: 'Investor' }, { value: 'owner_occupier', label: 'Owner Occupier' }] },
      { name: 'company_id', label: 'Company', type: 'select', optionsFrom: 'companies' },
      { name: 'contact_id', label: 'Contact', type: 'select', optionsFrom: 'contacts' },
      { name: 'tenant_id', label: 'Linked tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'property_type', label: 'Property type', type: 'select', options: PROPERTY_TYPES },
      {
        name: 'preferred_locations',
        label: 'Preferred area',
        type: 'address',
        mode: 'area',
        span: 'full',
        placeholder: 'Search suburb, city or node...',
        description: 'Select an area-level Google result, or type a preferred node manually.',
        addressMapping: REQUIREMENT_AREA_MAPPING,
      },
      { name: 'min_size_m2', label: 'Min size m²', type: 'number' },
      { name: 'max_size_m2', label: 'Max size m²', type: 'number' },
      { name: 'budget_min', label: 'Budget min', type: 'number' },
      { name: 'budget_max', label: 'Budget max', type: 'number' },
      { name: 'target_occupation_date', label: 'Target occupation date', type: 'date' },
      { name: 'lease_term_months', label: 'Lease term months', type: 'number' },
      { name: 'assigned_broker', label: 'Assigned broker', type: 'select', optionsFrom: 'brokers' },
      { name: 'stage', label: 'Stage', type: 'select', options: REQUIREMENT_STAGES, defaultValue: 'new_requirement' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'special_requirements', label: 'Special requirements', type: 'textarea', span: 'full' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  deals: {
    kind: 'deals',
    title: 'Deals',
    description: 'Track commercial leasing and sales deals from requirement through signed agreement.',
    createLabel: 'New deal',
    documentsEntityType: 'commercial_deal',
    showHeadsOfTerms: true,
    secondaryActions: [{ label: 'Pipeline view', to: '/commercial/deals/pipeline' }],
    emptyTitle: 'No commercial deals yet',
    emptyDescription: 'Create a deal once a tenant shows interest in a vacancy or property.',
    fetchRecords: getCommercialDeals,
    createRecord: createCommercialDeal,
    updateRecord: updateCommercialDeal,
    archiveRecord: archiveCommercialDeal,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('deal_value', 'Deal value'),
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'assigned_broker', label: 'Broker Owner', optionsFrom: 'brokers' },
      { key: 'status', label: 'Status', options: ACTIVE_STATUSES },
      { key: 'stage', label: 'Stage', options: DEAL_STAGES },
      { key: 'deal_type', label: 'Deal type', options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] },
    ],
    searchLookupFields: [
      { name: 'company_id', optionsFrom: 'companies' },
      { name: 'contact_id', optionsFrom: 'contacts' },
      { name: 'tenant_id', optionsFrom: 'tenants' },
      { name: 'property_id', optionsFrom: 'properties' },
    ],
    columns: [
      { key: 'deal_name', label: 'Deal' },
      { key: 'deal_type', label: 'Type', render: (row) => titleize(row.deal_type) },
      { key: 'company_id', label: 'Company', render: (row, lookups) => getLookupLabel(lookups, 'companies', row.company_id, getLookupLabel(lookups, 'tenants', row.tenant_id)) },
      { key: 'contact_id', label: 'Contact', render: (row, lookups) => getLookupLabel(lookups, 'contacts', row.contact_id, '-') },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'listing_id', label: 'Listing', render: (row, lookups) => getLookupLabel(lookups, 'listings', row.listing_id) },
      { key: 'stage', label: 'Stage', render: (row) => titleize(row.stage) },
      { key: 'deal_value', label: 'Value', render: (row) => formatCurrency(row.deal_value) },
      brokerColumn(),
      nextActionColumn('deals'),
      updatedColumn(),
      statusColumn(),
    ],
    fields: [
      { name: 'deal_name', label: 'Deal name', required: true },
      { name: 'deal_type', label: 'Deal type', type: 'select', required: true, options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] },
      { name: 'requirement_id', label: 'Linked requirement', type: 'select', optionsFrom: 'requirements' },
      { name: 'company_id', label: 'Company', type: 'select', optionsFrom: 'companies' },
      { name: 'contact_id', label: 'Contact', type: 'select', optionsFrom: 'contacts' },
      { name: 'tenant_id', label: 'Linked tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'landlord_id', label: 'Linked landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_id', label: 'Linked property', type: 'select', optionsFrom: 'properties' },
      { name: 'listing_id', label: 'Linked listing', type: 'select', optionsFrom: 'listings' },
      {
        name: 'formatted_address',
        label: 'Property address',
        type: 'address',
        span: 'full',
        placeholder: 'Start typing the property address...',
        description: 'Use when the deal is not linked to a property record yet.',
      },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'assigned_broker', label: 'Assigned broker', type: 'select', optionsFrom: 'brokers' },
      { name: 'stage', label: 'Stage', type: 'select', options: DEAL_STAGES, defaultValue: 'requirement' },
      { name: 'deal_value', label: 'Deal value', type: 'number' },
      { name: 'estimated_commission', label: 'Estimated commission', type: 'number' },
      { name: 'expected_close_date', label: 'Expected close date', type: 'date' },
      { name: 'probability_percentage', label: 'Probability percentage', type: 'percentage' },
      { name: 'status', label: 'Status', type: 'select', options: ACTIVE_STATUSES, defaultValue: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  transactions: {
    kind: 'transactions',
    title: 'Transactions',
    description: 'Track commercial lease and sale transactions from negotiation through completion.',
    createLabel: 'New transaction',
    documentsEntityType: 'commercial_transaction',
    emptyTitle: 'No transactions yet',
    emptyDescription: 'Open a commercial transaction once an opportunity moves into active deal execution.',
    fetchRecords: getCommercialTransactions,
    createRecord: createCommercialTransaction,
    updateRecord: updateCommercialTransaction,
    archiveRecord: archiveCommercialTransaction,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('target_value', 'Target value'),
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
      { key: 'status', label: 'Status', options: TRANSACTION_STAGES },
      { key: 'transaction_type', label: 'Transaction type', options: [{ value: 'lease', label: 'Leasing' }, { value: 'sale', label: 'Sales' }] },
    ],
    searchLookupFields: [
      { name: 'company_id', optionsFrom: 'companies' },
      { name: 'contact_id', optionsFrom: 'contacts' },
      { name: 'property_id', optionsFrom: 'properties' },
      { name: 'vacancy_id', optionsFrom: 'vacancies' },
      { name: 'deal_id', optionsFrom: 'deals' },
    ],
    columns: [
      { key: 'transaction_name', label: 'Transaction', render: (row) => workspaceLink(`/commercial/transactions/${row.id}`, row.transaction_name || 'Commercial transaction') },
      { key: 'transaction_type', label: 'Type', render: (row) => titleize(row.transaction_type) },
      { key: 'company_id', label: 'Client / Company', render: (row, lookups) => getLookupLabel(lookups, 'companies', row.company_id, '-') },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id, '-') },
      { key: 'deal_id', label: 'Opportunity', render: (row, lookups) => getLookupLabel(lookups, 'deals', row.deal_id, '-') },
      { key: 'status', label: 'Status', render: (row) => createElement(CommercialStatusPill, { value: row.status }) },
      { key: 'target_value', label: 'Value', render: (row) => formatCurrency(row.target_value) },
      { key: 'expected_close_date', label: 'Target Close', render: (row) => formatDate(row.expected_close_date) },
      { key: 'actual_close_date', label: 'Actual Close', render: (row) => formatDate(row.actual_close_date) },
      { key: 'broker_id', label: 'Broker Owner', render: (row, lookups) => getLookupLabel(lookups, 'brokers', row.broker_id, 'Unassigned') },
      updatedColumn(),
    ],
    fields: [
      { name: 'transaction_name', label: 'Transaction name', required: true },
      { name: 'transaction_type', label: 'Transaction type', type: 'select', required: true, options: [{ value: 'lease', label: 'Leasing' }, { value: 'sale', label: 'Sales' }] },
      { name: 'deal_id', label: 'Linked opportunity', type: 'select', optionsFrom: 'deals' },
      { name: 'requirement_id', label: 'Linked lead', type: 'select', optionsFrom: 'requirements' },
      { name: 'company_id', label: 'Company', type: 'select', optionsFrom: 'companies' },
      { name: 'contact_id', label: 'Contact', type: 'select', optionsFrom: 'contacts' },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
      { name: 'vacancy_id', label: 'Vacancy', type: 'select', optionsFrom: 'vacancies' },
      { name: 'listing_id', label: 'Listing', type: 'select', optionsFrom: 'listings' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'broker_id', label: 'Assigned broker', type: 'select', optionsFrom: 'brokers', required: true },
      { name: 'status', label: 'Status', type: 'select', options: TRANSACTION_STAGES, defaultValue: 'draft' },
      { name: 'target_value', label: 'Target value', type: 'number' },
      { name: 'expected_close_date', label: 'Expected close date', type: 'date' },
      { name: 'actual_close_date', label: 'Actual close date', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
    ],
  },
  leases: {
    kind: 'leases',
    title: 'Leases',
    description: 'Manage lease records, renewals, expiries, deposits, escalation percentages, and occupation dates.',
    createLabel: 'New lease',
    documentsEntityType: 'commercial_lease',
    emptyTitle: 'No leases yet',
    emptyDescription: 'Signed leases will appear here once deals are finalised and ready for lease management.',
    fetchRecords: getCommercialLeases,
    createRecord: createCommercialLease,
    updateRecord: updateCommercialLease,
    archiveRecord: archiveCommercialLease,
    defaultSortKey: 'updated_at',
    defaultSortDirection: 'desc',
    sortOptions: standardSortOptions('monthly_rental', 'Monthly rental'),
    filters: [
      { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
      { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
      { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
      { key: 'status', label: 'Status', options: LEASE_STATUSES },
    ],
    crossValidate: leaseDateValidation,
    columns: [
      { key: 'tenant_id', label: 'Tenant', render: (row, lookups) => getLookupLabel(lookups, 'tenants', row.tenant_id) },
      { key: 'property_id', label: 'Property', render: (row, lookups) => getLookupLabel(lookups, 'properties', row.property_id) },
      { key: 'lease_end_date', label: 'Lease End', render: (row) => formatDate(row.lease_end_date) },
      { key: 'monthly_rental', label: 'Monthly Rental', render: (row) => formatCurrency(row.monthly_rental) },
      { key: 'escalation_percentage', label: 'Escalation', render: (row) => `${formatNumber(row.escalation_percentage)}%` },
      nextActionColumn('leases'),
      updatedColumn(),
      { key: 'status', label: 'Renewal Status', render: (row) => createElement(CommercialStatusPill, { value: row.status }) },
    ],
    fields: [
      { name: 'deal_id', label: 'Linked deal', type: 'select', optionsFrom: 'deals' },
      { name: 'tenant_id', label: 'Tenant', type: 'select', optionsFrom: 'tenants' },
      { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
      { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties' },
      { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
      { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
      { name: 'broker_id', label: 'Broker owner', type: 'select', optionsFrom: 'brokers' },
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
