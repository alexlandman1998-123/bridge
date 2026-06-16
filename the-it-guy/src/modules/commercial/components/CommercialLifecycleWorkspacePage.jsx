import { Eye, FileSignature, FileText, Handshake, TrendingUp } from 'lucide-react'
import { isValidElement, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import CommercialOnboardingSendAction from './CommercialOnboardingSendAction'
import CommercialHeadsOfTermsPage from '../pages/CommercialHeadsOfTermsPage'
import CommercialViewingsPage from '../pages/CommercialViewingsPage'
import { getCommercialAllHeadsOfTerms, getCommercialLookupData } from '../services/commercialApi'
import CommercialCrudPage from './CommercialCrudPage'
import CommercialWorkspaceTabs from './CommercialWorkspaceTabs'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isLeasingRequirement(row = {}) {
  return normalizeLower(row.requirement_type) === 'lease'
}

function isSalesRequirement(row = {}) {
  return ['purchase', 'investment'].includes(normalizeLower(row.requirement_type))
}

function isQualifiedRequirement(row = {}) {
  return ['qualified', 'shortlisting', 'matching', 'viewing', 'viewing_scheduled', 'proposal', 'negotiating', 'negotiation', 'hot', 'lease_stage', 'won', 'converted', 'closed_won'].includes(normalizeLower(row.stage))
}

function isActiveDeal(row = {}) {
  return !['converted', 'lost', 'closed_lost', 'closed_won', 'archived', 'inactive'].includes(normalizeLower(row.stage || row.status))
}

function isRelevantHeadsOfTerms(row = {}) {
  return !['converted', 'superseded', 'archived'].includes(normalizeLower(row.status))
}

function isLegalReviewLease(row = {}) {
  return ['draft', 'pending_signature'].includes(normalizeLower(row.status))
}

function isSignedLease(row = {}) {
  return ['executed', 'active'].includes(normalizeLower(row.status))
}

function isActiveLease(row = {}) {
  return normalizeLower(row.status) === 'active'
}

function isSalesOfferStage(row = {}) {
  return ['negotiation', 'proposal', 'hot_draft', 'hot_sent', 'hot_accepted', 'heads_of_terms'].includes(normalizeLower(row.stage))
}

function isSalesAgreementStage(row = {}) {
  return ['sale_pending', 'hot_signed'].includes(normalizeLower(row.status))
}

function isRegisteredSale(row = {}) {
  return normalizeLower(row.status) === 'completed'
}

function scopeTitle(mode = 'leasing') {
  return mode === 'leasing' ? 'Leasing' : 'Sales'
}

function scopeDescription(mode = 'leasing') {
  return mode === 'leasing'
    ? 'Separate leasing opportunities, viewings, Heads of Terms, and leases into one clean operating workspace.'
    : 'Separate sales opportunities, viewings, offers, and transactions into one clean operating workspace.'
}

function scopeTabs(mode = 'leasing') {
  if (mode === 'leasing') {
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'opportunities', label: 'Opportunities' },
      { id: 'viewings', label: 'Viewings' },
      { id: 'heads-of-terms', label: 'Heads of Terms' },
      { id: 'leases', label: 'Leases' },
    ]
  }
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'opportunities', label: 'Opportunities' },
    { id: 'viewings', label: 'Viewings' },
    { id: 'offers', label: 'Offers' },
    { id: 'transactions', label: 'Transactions' },
  ]
}

function WorkspaceHeader({ title, description, tabs = [], activeTab = '', onTabChange, actions = [] }) {
  return (
    <>
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {actions.length ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => {
              if (isValidElement(action)) {
                return <div key={action.key || index}>{action}</div>
              }
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
                >
                  {action.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <CommercialWorkspaceTabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
      </section>
    </>
  )
}

function PipelineStageStrip({ stages = [] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-stretch gap-3">
        {stages.map((stage) => {
          const Icon = stage.icon
          return (
            <article key={stage.label} className="min-w-[176px] rounded-[22px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
                <Icon size={18} />
              </span>
              <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">{stage.label}</p>
              <p className="mt-2 text-[1.65rem] font-bold tracking-[-0.05em] text-[#102236]">{formatNumber(stage.count)}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function OverviewSurface({ mode = 'leasing', lookupData = {}, headsOfTerms = [] }) {
  const requirements = lookupData.requirements || []
  const deals = lookupData.deals || []
  const leases = lookupData.leases || []
  const transactions = lookupData.transactions || []
  const listings = lookupData.listings || []
  const vacancies = lookupData.vacancies || []

  const scopedRequirements = mode === 'leasing' ? requirements.filter(isLeasingRequirement) : requirements.filter(isSalesRequirement)
  const scopedDeals = deals.filter((row) => normalizeLower(row.deal_type) === (mode === 'leasing' ? 'lease' : 'sale'))
  const scopedTransactions = transactions.filter((row) => normalizeLower(row.transaction_type) === (mode === 'leasing' ? 'lease' : 'sale'))

  const totalPipelineValue = scopedDeals.reduce((sum, row) => sum + toNumber(row.deal_value), 0)
  const totalStock = mode === 'leasing' ? vacancies.length : listings.filter((row) => ['sale', 'investment'].includes(normalizeLower(row.listing_type))).length
  const totalLiveItems = mode === 'leasing' ? leases.filter(isActiveLease).length : scopedTransactions.filter(isRegisteredSale).length

  const pipelineStages = mode === 'leasing'
    ? [
        { label: 'Lead', count: scopedRequirements.length, icon: TrendingUp },
        { label: 'Qualified', count: scopedRequirements.filter(isQualifiedRequirement).length, icon: Handshake },
        { label: 'Opportunity', count: scopedDeals.filter(isActiveDeal).length, icon: FileText },
        { label: 'Viewing', count: (lookupData.viewings || []).filter((row) => normalizeLower(row.status) !== 'cancelled' && normalizeLower(row.status) !== 'no_show' && (isLeasingRequirement((lookupData.requirements || []).find((item) => item.id === row.requirement_id) || {}) || normalizeLower((lookupData.listings || []).find((item) => item.id === row.listing_id)?.listing_type) === 'lease')).length, icon: Eye },
        { label: 'Heads of Terms', count: headsOfTerms.filter(isRelevantHeadsOfTerms).length, icon: FileSignature },
        { label: 'Legal Review', count: leases.filter(isLegalReviewLease).length, icon: FileText },
        { label: 'Lease Signed', count: leases.filter(isSignedLease).length, icon: Handshake },
        { label: 'Active', count: leases.filter(isActiveLease).length, icon: TrendingUp },
      ]
    : [
        { label: 'Lead', count: scopedRequirements.length, icon: TrendingUp },
        { label: 'Qualified', count: scopedRequirements.filter(isQualifiedRequirement).length, icon: Handshake },
        { label: 'Opportunity', count: scopedDeals.filter(isActiveDeal).length, icon: FileText },
        { label: 'Viewing', count: (lookupData.viewings || []).filter((row) => normalizeLower(row.status) !== 'cancelled' && normalizeLower(row.status) !== 'no_show' && (isSalesRequirement((lookupData.requirements || []).find((item) => item.id === row.requirement_id) || {}) || ['sale', 'investment'].includes(normalizeLower((lookupData.listings || []).find((item) => item.id === row.listing_id)?.listing_type)))).length, icon: Eye },
        { label: 'Offer', count: scopedDeals.filter(isSalesOfferStage).length, icon: FileSignature },
        { label: 'Sale Agreement', count: scopedTransactions.filter(isSalesAgreementStage).length, icon: FileText },
        { label: 'Transfer', count: scopedTransactions.filter((row) => normalizeLower(row.status) === 'sale_pending').length, icon: Handshake },
        { label: 'Registered', count: scopedTransactions.filter(isRegisteredSale).length, icon: TrendingUp },
      ]

  const summaryCards = mode === 'leasing'
    ? [
        { label: 'Leasing Pipeline', value: formatCurrency(totalPipelineValue), detail: 'Open leasing opportunities' },
        { label: 'Heads of Terms', value: formatNumber(headsOfTerms.filter(isRelevantHeadsOfTerms).length), detail: 'Live terms in progress' },
        { label: 'Active Leases', value: formatNumber(totalLiveItems), detail: 'Income-producing leases' },
        { label: 'Vacancies', value: formatNumber(totalStock), detail: 'Available commercial stock' },
      ]
    : [
        { label: 'Sales Pipeline', value: formatCurrency(totalPipelineValue), detail: 'Open sales opportunities' },
        { label: 'Offers', value: formatNumber(scopedDeals.filter(isSalesOfferStage).length), detail: 'Offers and sale terms' },
        { label: 'Registered', value: formatNumber(totalLiveItems), detail: 'Completed sale transactions' },
        { label: 'Sales Listings', value: formatNumber(totalStock), detail: 'For-sale stock' },
      ]

  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">{scopeTitle(mode)} pipeline</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{scopeTitle(mode)} lifecycle</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Separate enquiries, opportunities, execution steps, and closed outcomes into a cleaner workspace.</p>
        <div className="mt-5">
          <PipelineStageStrip stages={pipelineStages} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">{card.label}</p>
            <p className="mt-4 text-[1.9rem] font-bold tracking-[-0.05em] text-[#102236]">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

async function fetchWorkspaceData(organisationId) {
  const [lookupData, headsOfTerms] = await Promise.all([
    getCommercialLookupData(organisationId),
    getCommercialAllHeadsOfTerms(organisationId).catch(() => []),
  ])
  return { lookupData, headsOfTerms }
}

function CommercialLifecycleWorkspacePage({ mode = 'leasing' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo(() => scopeTabs(mode), [mode])
  const activeTab = tabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
  const title = scopeTitle(mode)
  const description = scopeDescription(mode)
  const { data, loading, error, organisationId } = useCommercialData(fetchWorkspaceData, [])
  const onboardingLabel = mode === 'leasing' ? 'Send Tenant Onboarding' : 'Send Seller Onboarding'
  const onboardingKind = mode === 'leasing' ? 'leasing-workspace' : 'sales-workspace'
  const onboardingRecord = {
    title: `${title} workspace`,
    property_name: `${title} workspace`,
    name: `${title} workspace`,
    organisation_name: title,
  }

  const activeDealsConfig = useMemo(() => ({
    ...commercialCrudConfigs.deals,
    title: mode === 'leasing' ? 'Leasing Opportunities' : 'Sales Opportunities',
    createLabel: mode === 'leasing' ? 'Add Leasing Opportunity' : 'Add Sales Opportunity',
    emptyTitle: mode === 'leasing' ? 'No leasing opportunities yet' : 'No sales opportunities yet',
    emptyDescription: mode === 'leasing'
      ? 'Qualified commercial leasing leads will appear here as live opportunities.'
      : 'Qualified commercial sales leads will appear here as live opportunities.',
  }), [mode])

  const recordTabChange = (tabId) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tabId)
    setSearchParams(next, { replace: true })
  }

  if (activeTab === 'opportunities') {
    return (
      <CommercialCrudPage
        config={activeDealsConfig}
        pageTitle={title}
        pageDescription={description}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={recordTabChange}
        extraFilter={(record) => normalizeLower(record.deal_type) === (mode === 'leasing' ? 'lease' : 'sale')}
        searchPlaceholder={`Search ${mode} opportunities...`}
      />
    )
  }

  if (activeTab === 'leases') {
    return (
      <CommercialCrudPage
        config={commercialCrudConfigs.leases}
        pageTitle={title}
        pageDescription={description}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={recordTabChange}
        searchPlaceholder="Search leases..."
      />
    )
  }

  if (activeTab === 'transactions') {
    return (
      <CommercialCrudPage
        config={commercialCrudConfigs.transactions}
        pageTitle={title}
        pageDescription={description}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={recordTabChange}
        extraFilter={(record) => normalizeLower(record.transaction_type) === 'sale'}
        searchPlaceholder="Search sales transactions..."
      />
    )
  }

  if (activeTab === 'offers') {
    return (
      <CommercialCrudPage
        config={{
          ...commercialCrudConfigs.deals,
          title: 'Offers',
          createLabel: 'Add Offer',
          emptyTitle: 'No sales offers yet',
          emptyDescription: 'Offers and sale agreement work will appear here as the sales pipeline matures.',
        }}
        pageTitle={title}
        pageDescription={description}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={recordTabChange}
        extraFilter={(record) => normalizeLower(record.deal_type) === 'sale' && isSalesOfferStage(record)}
        searchPlaceholder="Search offers and sale agreements..."
      />
    )
  }

  if (activeTab === 'viewings') {
    return (
      <div className="grid gap-5">
        <WorkspaceHeader
          title={title}
          description={description}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={recordTabChange}
          actions={[
            <CommercialOnboardingSendAction
              key="workspace-onboarding"
              organisationId={organisationId}
              kind={onboardingKind}
              record={onboardingRecord}
              lookups={{}}
              label={onboardingLabel}
            />,
          ]}
        />
        <CommercialViewingsPage hideHeader scope={mode} />
      </div>
    )
  }

  if (activeTab === 'heads-of-terms') {
    return (
      <div className="grid gap-5">
        <WorkspaceHeader
          title={title}
          description={description}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={recordTabChange}
          actions={[
            <CommercialOnboardingSendAction
              key="workspace-onboarding"
              organisationId={organisationId}
              kind={onboardingKind}
              record={onboardingRecord}
              lookups={{}}
              label={onboardingLabel}
            />,
          ]}
        />
        <CommercialHeadsOfTermsPage hideHeader />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <WorkspaceHeader
        title={title}
        description={description}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={recordTabChange}
        actions={[
          <CommercialOnboardingSendAction
            key="workspace-onboarding"
            organisationId={organisationId}
            kind={onboardingKind}
            record={onboardingRecord}
            lookups={{}}
            label={onboardingLabel}
          />,
        ]}
      />
      {error ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
          {error}
        </section>
      ) : loading ? (
        <section className="h-56 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]" />
      ) : (
        <OverviewSurface mode={mode} lookupData={data?.lookupData || {}} headsOfTerms={data?.headsOfTerms || []} />
      )}
    </div>
  )
}

export default CommercialLifecycleWorkspacePage
