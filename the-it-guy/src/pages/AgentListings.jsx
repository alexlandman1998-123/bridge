import { Building2, Copy, ExternalLink, FileCheck2, Plus, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const STORAGE_KEY = 'itg:agent-private-listings:v1'

const LISTING_VIEW_TABS = [
  { key: 'developments', label: 'Developments' },
  { key: 'private_sales', label: 'Private Sales' },
]

const DEFAULT_DOCS = [
  { key: 'mandate_to_sell', label: 'Mandate to sell', status: 'requested' },
  { key: 'seller_fica', label: 'Seller FICA', status: 'requested' },
  { key: 'rates_account', label: 'Rates account', status: 'requested' },
  { key: 'levies_account', label: 'Levies account', status: 'requested' },
  { key: 'title_deed', label: 'Title deed / ownership proof', status: 'requested' },
  { key: 'utility_account', label: 'Utility account', status: 'requested' },
]

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `listing_${Date.now()}`
}

function readListings() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeListings(rows) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'R 0'
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getDocStatusPillClass(status) {
  if (status === 'approved' || status === 'completed') {
    return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  }
  if (status === 'reviewed') {
    return 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
  }
  if (status === 'rejected') {
    return 'border-[#f6d7d7] bg-[#fff5f5] text-[#b42318]'
  }
  return 'border-[#dbe4ef] bg-[#f8fbff] text-[#48627f]'
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Requested'
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function AgentListings() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, profile } = useWorkspace()
  const [activeTab, setActiveTab] = useState('developments')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewListingModal, setShowNewListingModal] = useState(false)
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [privateListings, setPrivateListings] = useState([])
  const [form, setForm] = useState({
    listingTitle: '',
    propertyType: 'House',
    suburb: '',
    city: '',
    askingPrice: '',
    commissionType: 'percentage',
    commissionPercentage: '5',
    commissionAmount: '',
    commissionNotes: '',
    mandateType: 'sole',
    mandateStartDate: '',
    mandateEndDate: '',
    sellerName: '',
    sellerEmail: '',
    sellerPhone: '',
    ratesAccountNumber: '',
    leviesAccountNumber: '',
    marketingSource: '',
    listingMediaUrl: '',
    notes: '',
  })

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const developments = isSupabaseConfigured ? await fetchDevelopmentOptions() : []
      setDevelopmentOptions(Array.isArray(developments) ? developments : [])
      setPrivateListings(readListings())
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load listings at the moment.')
      setDevelopmentOptions([])
      setPrivateListings(readListings())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!location.state?.openNewListing) {
      return
    }

    setShowNewListingModal(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const tabCounts = useMemo(
    () => ({
      developments: developmentOptions.length,
      private_sales: privateListings.length,
    }),
    [developmentOptions.length, privateListings.length],
  )

  const listingSummary = useMemo(() => {
    const requestedDocs = privateListings.reduce((count, listing) => {
      const docs = Array.isArray(listing.requiredDocuments) ? listing.requiredDocuments : []
      return count + docs.filter((doc) => doc.status === 'requested').length
    }, 0)

    const approvedDocs = privateListings.reduce((count, listing) => {
      const docs = Array.isArray(listing.requiredDocuments) ? listing.requiredDocuments : []
      return count + docs.filter((doc) => doc.status === 'approved' || doc.status === 'completed').length
    }, 0)

    return {
      activeListings: privateListings.length,
      requestedDocs,
      approvedDocs,
    }
  }, [privateListings])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function resetForm() {
    setForm({
      listingTitle: '',
      propertyType: 'House',
      suburb: '',
      city: '',
      askingPrice: '',
      commissionType: 'percentage',
      commissionPercentage: '5',
      commissionAmount: '',
      commissionNotes: '',
      mandateType: 'sole',
      mandateStartDate: '',
      mandateEndDate: '',
      sellerName: '',
      sellerEmail: '',
      sellerPhone: '',
      ratesAccountNumber: '',
      leviesAccountNumber: '',
      marketingSource: '',
      listingMediaUrl: '',
      notes: '',
    })
  }

  function handleSaveListing(event) {
    event.preventDefault()

    if (!form.listingTitle.trim() || !form.sellerName.trim()) {
      setError('Listing title and seller name are required.')
      return
    }

    const token = `seller-${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.bridgenine.co.za'

    const record = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      listingTitle: form.listingTitle.trim(),
      propertyType: form.propertyType,
      suburb: form.suburb.trim(),
      city: form.city.trim(),
      askingPrice: Number(form.askingPrice || 0),
      mandateType: form.mandateType,
      mandateStartDate: form.mandateStartDate || null,
      mandateEndDate: form.mandateEndDate || null,
      seller: {
        name: form.sellerName.trim(),
        email: form.sellerEmail.trim(),
        phone: form.sellerPhone.trim(),
      },
      commission: {
        commission_type: form.commissionType,
        commission_percentage: Number(form.commissionPercentage || 0),
        commission_amount: Number(form.commissionAmount || 0),
        commission_notes: form.commissionNotes.trim(),
        agent_id: String(profile?.email || profile?.id || '').trim().toLowerCase(),
        agency_id: profile?.agencyId || '',
        principal_id: profile?.principalId || '',
      },
      sellerOnboarding: {
        token,
        link: `${baseUrl}/client/onboarding/${token}?role=seller`,
        status: 'sent',
      },
      marketing: {
        source: form.marketingSource.trim(),
        mediaUrl: form.listingMediaUrl.trim(),
        notes: form.notes.trim(),
      },
      ownership: {
        ratesAccountNumber: form.ratesAccountNumber.trim(),
        leviesAccountNumber: form.leviesAccountNumber.trim(),
      },
      requiredDocuments: DEFAULT_DOCS.map((doc) => ({ ...doc })),
    }

    const nextRows = [record, ...privateListings]
    setPrivateListings(nextRows)
    writeListings(nextRows)
    setShowNewListingModal(false)
    resetForm()
    setError('')
  }

  async function copySellerLink(link) {
    if (!link) {
      return
    }

    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy seller onboarding link:', link)
    }
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <SectionHeader
          title="Listings"
          copy="Manage development inventory, private sales mandates, seller onboarding, and required listing documents."
          actions={
            <Button type="button" onClick={() => setShowNewListingModal(true)} className="shrink-0">
              <Plus size={16} />
              New Listing
            </Button>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Private Listings</p>
            <p className="mt-2 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingSummary.activeListings}</p>
          </div>
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Seller Docs Requested</p>
            <p className="mt-2 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingSummary.requestedDocs}</p>
          </div>
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Seller Docs Approved</p>
            <p className="mt-2 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingSummary.approvedDocs}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {LISTING_VIEW_TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                    : 'border-[#d4deea] bg-[#f8fbff] text-[#35546c] hover:border-[#b7c8db]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-[0.7rem] text-[#35546c]">{tabCounts[tab.key] || 0}</span>
              </button>
            )
          })}
        </div>

        {error ? <p className="mb-3 rounded-[14px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">{error}</p> : null}

        {loading ? (
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm text-[#6c7f95]">Loading listings…</div>
        ) : null}

        {!loading && activeTab === 'developments' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {developmentOptions.length ? (
              developmentOptions.map((development) => (
                <article key={development.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Assigned development</p>
                      <h3 className="mt-1 text-base font-semibold text-[#142132]">{development.name}</h3>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d4deea] bg-white text-[#35546c]">
                      <Building2 size={16} />
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#5f7288]">Create buyer interest, manage available units, and start a deal linked to this development.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/units?developmentId=${encodeURIComponent(development.id)}`)}
                    >
                      View Units
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/pipeline?developmentId=${encodeURIComponent(development.id)}`)}
                    >
                      Create Buyer Interest
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm text-[#6c7f95]">
                No assigned developments yet.
              </div>
            )}
          </div>
        ) : null}

        {!loading && activeTab === 'private_sales' ? (
          <div className="space-y-4">
            {privateListings.length ? (
              privateListings.map((listing) => (
                <article key={listing.id} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Private Sale Listing</p>
                      <h3 className="mt-1 text-[1.05rem] font-semibold text-[#142132]">{listing.listingTitle}</h3>
                      <p className="mt-1 text-sm text-[#5f7288]">
                        {listing.propertyType} • {listing.suburb || 'Suburb pending'} • {listing.city || 'City pending'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Asking Price</p>
                      <p className="mt-1 text-[1.05rem] font-semibold text-[#142132]">{formatCurrency(listing.askingPrice)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5">
                      <p className="text-[0.7rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Seller</p>
                      <p className="mt-1 text-sm font-semibold text-[#22364a]">{listing.seller?.name || 'Not captured'}</p>
                      <p className="text-xs text-[#61758d]">{listing.seller?.phone || 'Phone pending'}</p>
                    </div>
                    <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5">
                      <p className="text-[0.7rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Commission</p>
                      <p className="mt-1 text-sm font-semibold text-[#22364a]">
                        {listing.commission?.commission_type === 'fixed'
                          ? formatCurrency(listing.commission?.commission_amount)
                          : `${listing.commission?.commission_percentage || 0}%`}
                      </p>
                      <p className="text-xs text-[#61758d]">{listing.commission?.commission_notes || 'Agent commission captured'}</p>
                    </div>
                    <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5">
                      <p className="text-[0.7rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Mandate</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-[#22364a]">{listing.mandateType || 'Sole'}</p>
                      <p className="text-xs text-[#61758d]">
                        {listing.mandateStartDate || 'Start pending'} {listing.mandateEndDate ? `→ ${listing.mandateEndDate}` : ''}
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5">
                      <p className="text-[0.7rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Seller Onboarding</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-[#22364a]">{listing.sellerOnboarding?.status || 'generated'}</p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78] hover:text-[#173d5e]"
                        onClick={() => copySellerLink(listing.sellerOnboarding?.link)}
                      >
                        <Copy size={13} />
                        Copy onboarding link
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[14px] border border-[#dce6f2] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Required Seller Documents</p>
                      <span className="text-xs font-semibold text-[#48627f]">{listing.requiredDocuments?.length || 0} requested</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {(listing.requiredDocuments || []).map((doc) => (
                        <div key={doc.key} className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-2">
                          <p className="text-xs font-semibold text-[#22364a]">{doc.label}</p>
                          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${getDocStatusPillClass(doc.status)}`}>
                            {formatStatusLabel(doc.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/pipeline')}>
                      <UserRound size={14} />
                      Create Pipeline Item
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/deals')}>
                      <ExternalLink size={14} />
                      Start Deal
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/documents')}>
                      <FileCheck2 size={14} />
                      Open Documents
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-8 text-center text-sm text-[#6c7f95]">
                No private listings captured yet. Use <strong>New Listing</strong> to start a seller-first deal workflow.
              </div>
            )}
          </div>
        ) : null}
      </section>

      {showNewListingModal ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#091322]/40 p-5 backdrop-blur-[1.5px]">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-[#dce4ef] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.24)]">
            <SectionHeader
              title="New Private Listing"
              copy="Capture listing, seller, mandate, commission, and onboarding details to initiate a private sale workflow."
            />

            <form className="mt-5 space-y-5" onSubmit={handleSaveListing}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing title</span>
                  <Field value={form.listingTitle} onChange={(event) => updateForm('listingTitle', event.target.value)} placeholder="3 Bedroom House - Moreleta Park" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property type</span>
                  <Field as="select" value={form.propertyType} onChange={(event) => updateForm('propertyType', event.target.value)}>
                    <option>House</option>
                    <option>Apartment</option>
                    <option>Townhouse</option>
                    <option>Commercial</option>
                    <option>Agricultural</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Asking price</span>
                  <Field type="number" value={form.askingPrice} onChange={(event) => updateForm('askingPrice', event.target.value)} placeholder="2500000" min="0" step="1000" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Suburb</span>
                  <Field value={form.suburb} onChange={(event) => updateForm('suburb', event.target.value)} placeholder="Moreleta Park" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">City</span>
                  <Field value={form.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="Pretoria" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Mandate type</span>
                  <Field as="select" value={form.mandateType} onChange={(event) => updateForm('mandateType', event.target.value)}>
                    <option value="sole">Sole</option>
                    <option value="open">Open</option>
                    <option value="dual">Dual</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Marketing source</span>
                  <Field value={form.marketingSource} onChange={(event) => updateForm('marketingSource', event.target.value)} placeholder="Private referral" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller name</span>
                  <Field value={form.sellerName} onChange={(event) => updateForm('sellerName', event.target.value)} placeholder="Seller legal name" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller email</span>
                  <Field type="email" value={form.sellerEmail} onChange={(event) => updateForm('sellerEmail', event.target.value)} placeholder="seller@email.com" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Seller phone</span>
                  <Field value={form.sellerPhone} onChange={(event) => updateForm('sellerPhone', event.target.value)} placeholder="082..." />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission type</span>
                  <Field as="select" value={form.commissionType} onChange={(event) => updateForm('commissionType', event.target.value)}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission %</span>
                  <Field type="number" min="0" step="0.1" value={form.commissionPercentage} onChange={(event) => updateForm('commissionPercentage', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission amount</span>
                  <Field type="number" min="0" step="100" value={form.commissionAmount} onChange={(event) => updateForm('commissionAmount', event.target.value)} placeholder="Optional fixed amount" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Media URL</span>
                  <Field value={form.listingMediaUrl} onChange={(event) => updateForm('listingMediaUrl', event.target.value)} placeholder="Drive / Dropbox link" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Mandate start</span>
                  <Field type="date" value={form.mandateStartDate} onChange={(event) => updateForm('mandateStartDate', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Mandate end</span>
                  <Field type="date" value={form.mandateEndDate} onChange={(event) => updateForm('mandateEndDate', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Rates account</span>
                  <Field value={form.ratesAccountNumber} onChange={(event) => updateForm('ratesAccountNumber', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Levies account</span>
                  <Field value={form.leviesAccountNumber} onChange={(event) => updateForm('leviesAccountNumber', event.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission notes</span>
                  <Field as="textarea" value={form.commissionNotes} onChange={(event) => updateForm('commissionNotes', event.target.value)} placeholder="Any special splits, caps, or principal notes" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing / seller notes</span>
                  <Field as="textarea" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Mandate reminders, ownership context, FICA notes" />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e6edf5] pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowNewListingModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Listing &amp; Send Seller Onboarding
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AgentListings
