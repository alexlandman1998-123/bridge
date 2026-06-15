import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import CommercialStatusPill from '../components/CommercialStatusPill'
import CommercialCrudPage from '../components/CommercialCrudPage'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import { formatCurrency, formatList, formatNumber, titleize } from '../commercialFormatters'

const LEAD_TABS = [
  { id: 'all', label: 'All Leads' },
  { id: 'sales', label: 'Sales Leads' },
  { id: 'leasing', label: 'Leasing Leads' },
  { id: 'unclassified', label: 'Unclassified' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function getLeadTypeValue(record = {}) {
  const requirementType = normalizeLower(record.requirement_type)
  if (requirementType === 'lease') return 'leasing'
  if (['purchase', 'investment'].includes(requirementType)) return 'sales'
  return 'unclassified'
}

function getLeadTypeLabel(record = {}) {
  const type = getLeadTypeValue(record)
  if (type === 'leasing') return 'Leasing'
  if (type === 'sales') return 'Sales'
  return 'Unclassified'
}

function getLeadTypeTone(record = {}) {
  const type = getLeadTypeValue(record)
  if (type === 'leasing') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (type === 'sales') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function getLeadStatus(record = {}) {
  const stage = normalizeLower(record.stage)
  if (['won', 'converted', 'closed_won'].includes(stage)) return 'Converted'
  if (['lost', 'closed_lost'].includes(stage)) return 'Lost'
  if (stage === 'unqualified') return 'Unqualified'
  if (stage === 'contacted') return 'Contacted'
  if (['qualified', 'shortlisting', 'matching', 'viewing', 'viewing_scheduled', 'proposal', 'negotiating', 'negotiation', 'hot', 'lease_stage'].includes(stage)) return 'Qualified'
  return 'New'
}

function sizeLabel(record = {}) {
  const min = formatNumber(record.min_size_m2, 'm²')
  const max = formatNumber(record.max_size_m2, 'm²')
  if (min === '-' && max === '-') return '-'
  return `${min} - ${max}`
}

function budgetLabel(record = {}) {
  const type = getLeadTypeValue(record)
  if (type === 'leasing') {
    const budgetMax = formatCurrency(record.budget_max)
    const budgetMin = formatCurrency(record.budget_min)
    if (budgetMin === '-' && budgetMax === '-') return '-'
    return `${budgetMin} - ${budgetMax}`
  }
  const salesMax = formatCurrency(record.budget_max)
  const salesMin = formatCurrency(record.budget_min)
  if (salesMin === '-' && salesMax === '-') return '-'
  return `${salesMin} - ${salesMax}`
}

function leadTabFilter(record = {}, activeTab = 'all') {
  const type = getLeadTypeValue(record)
  const status = getLeadStatus(record)
  if (activeTab === 'sales') return type === 'sales'
  if (activeTab === 'leasing') return type === 'leasing'
  if (activeTab === 'unclassified') return type === 'unclassified'
  if (activeTab === 'qualified') return status === 'Qualified'
  if (activeTab === 'converted') return status === 'Converted'
  return true
}

function leadActionLabel(record = {}) {
  const type = getLeadTypeValue(record)
  const status = getLeadStatus(record)
  if (status === 'Converted') return type === 'leasing' ? 'Open Leasing Opportunity' : type === 'sales' ? 'Open Sales Opportunity' : 'Review Opportunity'
  if (type === 'leasing') return 'Convert to Leasing Opportunity'
  if (type === 'sales') return 'Convert to Sales Opportunity'
  return 'Classify Lead to Convert'
}

function CommercialLeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = LEAD_TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'all'

  const config = useMemo(() => ({
    ...commercialCrudConfigs.requirements,
    title: 'Leads',
    createLabel: 'Add Lead',
    emptyTitle: 'No leads yet',
    emptyDescription: 'Capture commercial sales and leasing enquiries, then qualify and convert them into opportunities.',
    secondaryActions: [],
    columns: [
      { key: 'requirement_name', label: 'Lead' },
      {
        key: 'lead_type',
        label: 'Type',
        sortable: false,
        render: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getLeadTypeTone(row)}`}>
            {getLeadTypeLabel(row)}
          </span>
        ),
      },
      {
        key: 'company_id',
        label: 'Client / Company',
        render: (row, lookups) =>
          lookups.companies.find((item) => item.value === row.company_id)?.label
            || lookups.tenants.find((item) => item.value === row.tenant_id)?.label
            || '-',
      },
      {
        key: 'requirement_summary',
        label: 'Requirement',
        sortable: false,
        render: (row) => [titleize(row.property_type || ''), formatList(row.preferred_locations)].filter(Boolean).join(' · ') || '-',
      },
      { key: 'area', label: 'Area', sortable: false, render: (row) => sizeLabel(row) },
      { key: 'budget_rental', label: 'Budget / Rental', sortable: false, render: (row) => budgetLabel(row) },
      {
        key: 'assigned_broker',
        label: 'Broker',
        render: (row, lookups) => lookups.brokers.find((item) => item.value === row.assigned_broker || item.value === row.broker_id)?.label || row.assigned_broker || row.broker_id || 'Unassigned',
      },
      {
        key: 'lead_status',
        label: 'Status',
        sortable: false,
        render: (row) => <CommercialStatusPill value={getLeadStatus(row).toLowerCase().replace(/\s+/g, '_')} label={getLeadStatus(row)} />,
      },
      {
        key: 'updated_at',
        label: 'Last Activity',
        render: (row) => row.updated_at || row.created_at ? new Date(row.updated_at || row.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      },
    ],
    fields: commercialCrudConfigs.requirements.fields.map((field) => {
      if (field.name === 'requirement_name') return { ...field, label: 'Lead name' }
      if (field.name === 'requirement_type') {
        return {
          ...field,
          label: 'Lead type',
          options: [
            { value: 'lease', label: 'Leasing' },
            { value: 'purchase', label: 'Sales' },
            { value: 'investment', label: 'Sales Investment' },
          ],
        }
      }
      return field
    }),
  }), [])

  return (
    <CommercialCrudPage
      config={config}
      pageTitle="Leads"
      pageDescription="Capture, qualify, and convert commercial sales and leasing enquiries."
      createLabel="Add Lead"
      secondaryActions={[
        {
          label: 'Import Leads',
          onClick: () => window.alert('Lead import is not wired into Commercial yet.'),
        },
      ]}
      tabs={LEAD_TABS}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        const next = new URLSearchParams(searchParams)
        next.set('tab', tabId)
        setSearchParams(next, { replace: true })
      }}
      searchPlaceholder="Search leads, companies, locations, and brokers..."
      extraFilter={(record) => leadTabFilter(record, activeTab)}
      drawerPrimaryActionLabel={leadActionLabel}
    />
  )
}

export default CommercialLeadsPage
