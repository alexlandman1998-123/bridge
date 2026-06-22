import { Link } from 'react-router-dom'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import { formatCurrency, formatDate, formatNumber } from '../commercialFormatters'
import CommercialCrudPage from '../components/CommercialCrudPage'
import CommercialStatusPill from '../components/CommercialStatusPill'
import CommercialTenantOnboardingModal from '../components/CommercialTenantOnboardingModal'
import {
  createCommercialLease,
  createCommercialTenant,
  getCommercialLeaseTenancies,
  updateCommercialTenant,
  updateCommercialVacancy,
} from '../services/commercialApi'

function lookupLabel(lookups, key, value, fallback = '-') {
  if (!value) return fallback
  const match = (lookups?.[key] || []).find((item) => String(item.value || item.id || '') === String(value))
  return match?.label || match?.name || match?.property_name || match?.deal_name || fallback
}

function leaseTerm(row = {}) {
  const start = formatDate(row.lease_start_date)
  const end = formatDate(row.lease_end_date)
  if (start !== '-' && end !== '-') return `${start} - ${end}`
  if (row.lease_term_months) return `${formatNumber(row.lease_term_months)} months`
  return '-'
}

function tenantLabel(row, lookups) {
  const tenant = lookupLabel(lookups, 'tenants', row.tenant_id, '')
  const deal = lookupLabel(lookups, 'deals', row.deal_id, '')
  return tenant || deal || 'Tenant pending'
}

function cleanText(value) {
  return String(value || '').trim()
}

function withSourceNotes(notes = '', sourceLabel = '') {
  const cleanNotes = cleanText(notes)
  const cleanSource = cleanText(sourceLabel)
  return [cleanSource ? `Source: ${cleanSource}` : '', cleanNotes].filter(Boolean).join('\n\n') || null
}

async function createTenantOccupancyRecord(payload = {}) {
  const tenantProfilePayload = {
    organisation_id: payload.organisation_id,
    branch_id: payload.branch_id || null,
    team_id: payload.team_id || null,
    broker_id: payload.broker_id || null,
    name: payload.tenant_name,
    contact_person: payload.contact_person,
    phone: payload.contact_number,
    email: payload.email,
    registration_number: payload.registration_number || null,
    vat_number: payload.vat_number || null,
    industry: payload.industry || null,
    website: payload.website || null,
    current_lease_expiry: payload.lease_end_date || null,
    status: 'active',
  }
  const tenant = payload.tenant_id
    ? await updateCommercialTenant(payload.tenant_id, tenantProfilePayload).catch(() => ({ id: payload.tenant_id }))
    : await createCommercialTenant(tenantProfilePayload)
  const tenantId = tenant?.id || payload.tenant_id
  if (!tenantId) throw new Error('Tenant profile could not be created.')

  const lease = await createCommercialLease({
    organisation_id: payload.organisation_id,
    tenant_id: tenantId,
    landlord_id: payload.landlord_id || null,
    property_id: payload.property_id || null,
    vacancy_id: payload.vacancy_id || null,
    deal_id: payload.deal_id || null,
    branch_id: payload.branch_id || null,
    team_id: payload.team_id || null,
    broker_id: payload.broker_id || null,
    lease_start_date: payload.lease_start_date || null,
    lease_end_date: payload.lease_end_date || null,
    occupation_date: payload.occupation_date || payload.lease_start_date || null,
    lease_term_months: payload.lease_term_months || null,
    monthly_rental: payload.monthly_rental || null,
    rental_per_m2: payload.rental_per_m2 || null,
    escalation_percentage: payload.escalation_percentage || null,
    deposit_amount: payload.deposit_amount || null,
    renewal_option: Boolean(payload.renewal_option),
    renewal_notice_date: payload.renewal_notice_date || null,
    status: payload.status || 'active',
    notes: withSourceNotes(payload.notes, payload.source_label),
  })

  const occupancyStatuses = new Set(['active', 'pending_occupation', 'notice_given', 'renewal_pending'])
  if (lease?.vacancy_id && lease?.lease_start_date && occupancyStatuses.has(String(lease.status || '').toLowerCase())) {
    await updateCommercialVacancy(lease.vacancy_id, { status: 'occupied' }, { logActivity: false }).catch(() => null)
  }

  return lease
}

const TENANT_OCCUPANCY_FIELDS = [
  { name: 'tenant_id', label: 'Existing tenant', type: 'select', optionsFrom: 'tenants', required: true, help: 'Select a tenant already captured in the commercial tenant directory.' },
  { name: 'property_id', label: 'Property', type: 'select', optionsFrom: 'properties', required: true },
  { name: 'vacancy_id', label: 'Vacancy / unit', type: 'select', optionsFrom: 'vacancies', help: 'Linking a vacancy lets the platform mark it occupied when this lease is active.' },
  { name: 'landlord_id', label: 'Landlord', type: 'select', optionsFrom: 'landlords' },
  { name: 'deal_id', label: 'Linked deal', type: 'select', optionsFrom: 'deals', help: 'Optional for tenants being added manually outside the deal workflow.' },
  { name: 'branch_id', label: 'Branch / office', type: 'select', optionsFrom: 'branches' },
  { name: 'team_id', label: 'Team', type: 'select', optionsFrom: 'teams' },
  { name: 'broker_id', label: 'Broker owner', type: 'select', optionsFrom: 'brokers' },
  { name: 'lease_start_date', label: 'Lease start date', type: 'date', required: true },
  { name: 'lease_end_date', label: 'Lease end date', type: 'date', required: true },
  { name: 'occupation_date', label: 'Occupation date', type: 'date' },
  { name: 'lease_term_months', label: 'Lease term months', type: 'number' },
  { name: 'monthly_rental', label: 'Monthly rental', type: 'number' },
  { name: 'rental_per_m2', label: 'Rental per m2', type: 'number' },
  { name: 'escalation_percentage', label: 'Escalation percentage', type: 'percentage' },
  { name: 'deposit_amount', label: 'Deposit amount', type: 'number' },
  { name: 'renewal_option', label: 'Renewal option', type: 'checkbox' },
  { name: 'renewal_notice_date', label: 'Renewal notice date', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', options: [
    { value: 'executed', label: 'Executed' },
    { value: 'active', label: 'Active' },
    { value: 'renewal_pending', label: 'Renewal Pending' },
    { value: 'expired', label: 'Expired' },
    { value: 'terminated', label: 'Terminated' },
  ], defaultValue: 'active' },
  { name: 'notes', label: 'Notes', type: 'textarea', span: 'full' },
]

const LEASING_TENANTS_CONFIG = {
  ...commercialCrudConfigs.leases,
  title: 'Tenants',
  description: 'Track signed commercial lease outcomes, active occupiers, lease terms, rentals, renewals and linked vacancies. Add existing tenants manually when a signed lease already exists outside the deal workflow.',
  createLabel: 'Add Existing Tenant',
  emptyTitle: 'No leasing tenants yet',
  emptyDescription: 'Closed leasing deals and manually added tenant occupancies will appear here once brokers capture active lease records.',
  fetchRecords: getCommercialLeaseTenancies,
  createRecord: createTenantOccupancyRecord,
  createModal: CommercialTenantOnboardingModal,
  defaultSortKey: 'lease_end_date',
  defaultSortDirection: 'asc',
  sortOptions: [
    { key: 'lease_end_date', direction: 'asc', label: 'Lease expiry: soonest' },
    { key: 'lease_end_date', direction: 'desc', label: 'Lease expiry: latest' },
    { key: 'monthly_rental', direction: 'desc', label: 'Rental: high to low' },
    { key: 'updated_at', direction: 'desc', label: 'Newest updated' },
  ],
  filters: [
    { key: 'branch_id', label: 'Branch', optionsFrom: 'branches' },
    { key: 'team_id', label: 'Team', optionsFrom: 'teams' },
    { key: 'broker_id', label: 'Broker Owner', optionsFrom: 'brokers' },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'executed', label: 'Executed' },
        { value: 'active', label: 'Active' },
        { value: 'renewal_pending', label: 'Renewal Pending' },
        { value: 'expired', label: 'Expired' },
        { value: 'terminated', label: 'Terminated' },
      ],
    },
  ],
  searchLookupFields: [
    { name: 'tenant_id', optionsFrom: 'tenants' },
    { name: 'property_id', optionsFrom: 'properties' },
    { name: 'vacancy_id', optionsFrom: 'vacancies' },
    { name: 'deal_id', optionsFrom: 'deals' },
    { name: 'broker_id', optionsFrom: 'brokers' },
  ],
  fields: TENANT_OCCUPANCY_FIELDS,
  columns: [
    {
      key: 'tenant_id',
      label: 'Tenant',
      render: (row, lookups) => {
        const label = tenantLabel(row, lookups)
        if (!row.id) return label
        return (
          <Link to={`/commercial/leasing/tenants/${row.id}`} className="font-semibold text-[#1267a3] transition hover:text-[#0c4f80]">
            {label}
          </Link>
        )
      },
    },
    {
      key: 'property_id',
      label: 'Property / Unit',
      render: (row, lookups) => [
        lookupLabel(lookups, 'properties', row.property_id, ''),
        lookupLabel(lookups, 'vacancies', row.vacancy_id, ''),
      ].filter(Boolean).join(' / ') || '-',
    },
    { key: 'lease_term', label: 'Lease Term', sortable: false, render: (row) => leaseTerm(row) },
    { key: 'monthly_rental', label: 'Rental', render: (row) => formatCurrency(row.monthly_rental || row.rental_per_m2) },
    { key: 'broker_id', label: 'Broker', render: (row, lookups) => lookupLabel(lookups, 'brokers', row.broker_id, 'Unassigned') },
    { key: 'lease_end_date', label: 'Renewal / Expiry', render: (row) => formatDate(row.renewal_notice_date || row.lease_end_date) },
    { key: 'status', label: 'Status', render: (row) => <CommercialStatusPill value={row.status} /> },
  ],
}

function CommercialLeasingTenantsPage() {
  return (
    <CommercialCrudPage
      config={LEASING_TENANTS_CONFIG}
      searchPlaceholder="Search tenants by occupier, property, deal, broker..."
    />
  )
}

export default CommercialLeasingTenantsPage
