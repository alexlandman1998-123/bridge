import { Building2, CheckCircle2, ChevronRight, FileText, Layers3, Plus, Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import {
  createCommercialCompany,
  createCommercialContact,
  getCommercialLookupData,
  registerCommercialGeneratedDocument,
} from '../services/commercialApi'
import {
  COMMERCIAL_ASSET_CATEGORY_OPTIONS,
  COMMERCIAL_DOCUMENT_TEMPLATE_FAMILIES,
  resolveCommercialDocumentTitle,
} from '../../../services/documents/commercialDocumentAdapterService'
import {
  fetchPacketTemplate,
  generatePacketVersion,
  listPacketTemplates,
  renderPacketPreview,
  savePacketDraft,
} from '../../../core/documents/packetService'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function normalizeText(value) {
  return String(value || '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function toOption(row = {}) {
  return {
    value: row.id || row.userId || row.user_id || '',
    label: row.company_name || row.name || row.title || row.vacancy_name || row.property_name || row.deal_name || row.fullName || row.full_name || row.email || 'Record',
    row,
  }
}

function RecordSelect({ label, value, onChange, options = [], placeholder = 'Select…', details = '' }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {details ? <p className="text-xs text-slate-500">{details}</p> : null}
    </label>
  )
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function resolveContextRecord(options = [], id = '') {
  return options.find((row) => String(row.id) === String(id)) || null
}

function CommercialDocumentGeneratorPage() {
  const [searchParams] = useSearchParams()
  const [packetType, setPacketType] = useState(normalizeText(searchParams.get('packetType')) || 'commercial_lease')
  const [assetCategory, setAssetCategory] = useState(normalizeText(searchParams.get('assetCategory')) || 'office')
  const [companyId, setCompanyId] = useState(normalizeText(searchParams.get('companyId')))
  const [landlordId, setLandlordId] = useState(normalizeText(searchParams.get('landlordId')))
  const [assetManagerId, setAssetManagerId] = useState(normalizeText(searchParams.get('assetManagerId')))
  const [propertyId, setPropertyId] = useState(normalizeText(searchParams.get('propertyId')))
  const [vacancyId, setVacancyId] = useState(normalizeText(searchParams.get('vacancyId')))
  const [listingId, setListingId] = useState(normalizeText(searchParams.get('listingId')))
  const [dealId, setDealId] = useState(normalizeText(searchParams.get('dealId')))
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDetail, setTemplateDetail] = useState(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSummary, setPreviewSummary] = useState({ critical: [], warnings: [] })
  const [previewBusy, setPreviewBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const [generateBusy, setGenerateBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [generatedDocument, setGeneratedDocument] = useState(null)
  const [templates, setTemplates] = useState([])
  const [createCompanyForm, setCreateCompanyForm] = useState({
    companyName: '',
    brokerId: '',
    registrationNumber: '',
    vatNumber: '',
    registeredAddress: '',
    postalAddress: '',
    phone: '',
    email: '',
  })
  const [createContactForm, setCreateContactForm] = useState({
    fullName: '',
    position: '',
    email: '',
    mobile: '',
    idNumber: '',
    signingCapacity: 'Authorised Signatory',
    authorityConfirmed: true,
    brokerId: '',
  })

  const fetcher = useMemo(() => (organisationId) => getCommercialLookupData(organisationId), [])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const brokers = Array.isArray(data?.brokers) ? data.brokers : []
  const companies = Array.isArray(data?.companies) ? data.companies : []
  const landlords = Array.isArray(data?.landlords) ? data.landlords : []
  const contacts = Array.isArray(data?.contacts) ? data.contacts : []
  const properties = Array.isArray(data?.properties) ? data.properties : []
  const vacancies = Array.isArray(data?.vacancies) ? data.vacancies : []
  const listings = Array.isArray(data?.listings) ? data.listings : []
  const deals = Array.isArray(data?.deals) ? data.deals : []

  const selectedBrokerId = createCompanyForm.brokerId || createContactForm.brokerId || brokers[0]?.userId || brokers[0]?.id || ''
  const selectedCompany = resolveContextRecord(companies, companyId)
  const selectedLandlord = resolveContextRecord(landlords, landlordId)
  const selectedAssetManager = resolveContextRecord(contacts, assetManagerId)
  const selectedProperty = resolveContextRecord(properties, propertyId)
  const selectedVacancy = resolveContextRecord(vacancies, vacancyId)
  const selectedListing = resolveContextRecord(listings, listingId)
  const selectedDeal = resolveContextRecord(deals, dealId)

  useEffect(() => {
    if (!createCompanyForm.brokerId && selectedBrokerId) {
      setCreateCompanyForm((previous) => ({ ...previous, brokerId: selectedBrokerId }))
    }
    if (!createContactForm.brokerId && selectedBrokerId) {
      setCreateContactForm((previous) => ({ ...previous, brokerId: selectedBrokerId }))
    }
  }, [createCompanyForm.brokerId, createContactForm.brokerId, selectedBrokerId])

  useEffect(() => {
    if (selectedProperty?.landlord_id && !landlordId) {
      setLandlordId(selectedProperty.landlord_id)
    }
  }, [landlordId, selectedProperty?.landlord_id])

  useEffect(() => {
    let active = true
    async function loadTemplates() {
      try {
        const rows = await listPacketTemplates({
          packetType,
          moduleType: 'commercial',
          includeInactive: true,
        })
        if (!active) return
        const next = Array.isArray(rows) ? rows : []
        setTemplates(next)
        setSelectedTemplateId((previous) => {
          if (previous && next.some((row) => row.id === previous)) return previous
          return next[0]?.id || ''
        })
      } catch (loadError) {
        if (active) {
          setActionError(loadError?.message || 'Commercial templates could not be loaded.')
        }
      }
    }
    void loadTemplates()
    return () => {
      active = false
    }
  }, [packetType])

  useEffect(() => {
    let active = true
    async function loadTemplateDetail() {
      if (!selectedTemplateId) {
        setTemplateDetail(null)
        return
      }
      try {
        const detail = await fetchPacketTemplate(selectedTemplateId, { includeSections: true })
        if (!active) return
        setTemplateDetail(detail)
      } catch (loadError) {
        if (active) setActionError(loadError?.message || 'Commercial template could not be loaded.')
      }
    }
    void loadTemplateDetail()
    return () => {
      active = false
    }
  }, [selectedTemplateId])

  const context = useMemo(() => ({
    documentContextType: 'commercial',
    commercialTransactionType: packetType === 'commercial_sale' ? 'sale' : 'lease',
    assetCategory,
    company: selectedCompany,
    landlord: selectedLandlord || selectedCompany,
    assetManager: selectedAssetManager || {
      full_name: createContactForm.fullName,
      position: createContactForm.position,
      email: createContactForm.email,
      mobile: createContactForm.mobile,
      id_number: createContactForm.idNumber,
      signing_capacity: createContactForm.signingCapacity,
      authorityConfirmed: createContactForm.authorityConfirmed,
    },
    property: selectedProperty,
    vacancy: selectedVacancy,
    listing: selectedListing,
    deal: selectedDeal,
    broker: resolveContextRecord(brokers, selectedBrokerId) || null,
    organisation: data?.organisation || null,
    commissionPercentage: selectedDeal?.estimated_commission || selectedListing?.commission_percentage || '',
    mandateType: packetType === 'commercial_sale' ? 'Sales Mandate' : 'Leasing Mandate',
  }), [
    assetCategory,
    brokers,
    createContactForm.authorityConfirmed,
    createContactForm.email,
    createContactForm.fullName,
    createContactForm.idNumber,
    createContactForm.mobile,
    createContactForm.position,
    createContactForm.signingCapacity,
    data?.organisation,
    packetType,
    selectedBrokerId,
    selectedCompany,
    selectedLandlord,
    selectedDeal,
    selectedListing,
    selectedProperty,
    selectedVacancy,
    selectedAssetManager,
  ])

  const filteredTemplates = useMemo(() => {
    return templates.filter((row) => row.packet_type === packetType || row.packetType === packetType)
  }, [packetType, templates])

  async function handleCreateCompany() {
    setActionError('')
    setActionMessage('')
    try {
      if (!createCompanyForm.companyName || !selectedBrokerId) {
        throw new Error('Company name and broker are required.')
      }
      const created = await createCommercialCompany({
        company_name: createCompanyForm.companyName,
        broker_id: selectedBrokerId,
        registration_number: createCompanyForm.registrationNumber,
        vat_number: createCompanyForm.vatNumber,
        address: createCompanyForm.registeredAddress,
        postal_address: createCompanyForm.postalAddress,
        phone: createCompanyForm.phone,
        email: createCompanyForm.email,
      })
      setCompanyId(created?.id || '')
      setActionMessage('Landlord / owner company created.')
    } catch (createError) {
      setActionError(createError?.message || 'Company could not be created.')
    }
  }

  async function handleCreateContact() {
    setActionError('')
    setActionMessage('')
    try {
      if (!selectedCompany?.id || !createContactForm.fullName || !selectedBrokerId) {
        throw new Error('Select a company, add a name, and choose a broker first.')
      }
      const [firstName, ...rest] = createContactForm.fullName.split(' ')
      const created = await createCommercialContact({
        company_id: selectedCompany.id,
        broker_id: selectedBrokerId,
        first_name: firstName,
        last_name: rest.join(' '),
        job_title: createContactForm.position,
        email: createContactForm.email,
        mobile: createContactForm.mobile,
        notes: [
          createContactForm.idNumber ? `ID Number: ${createContactForm.idNumber}` : '',
          `Signing Capacity: ${createContactForm.signingCapacity || 'Authorised Signatory'}`,
          `Authority Confirmed: ${createContactForm.authorityConfirmed ? 'Yes' : 'No'}`,
        ].filter(Boolean).join('\n'),
      })
      setAssetManagerId(created?.id || '')
      setActionMessage('Asset manager / signatory created.')
    } catch (createError) {
      setActionError(createError?.message || 'Signatory could not be created.')
    }
  }

  async function handlePreview() {
    if (!templateDetail) return
    setActionError('')
    setActionMessage('')
    setPreviewBusy(true)
    try {
      const preview = await renderPacketPreview({
        packetType,
        context,
        template: templateDetail,
        title: resolveCommercialDocumentTitle(packetType, context),
      })
      setPreviewHtml(preview?.previewHtml || '')
      setPreviewSummary({
        critical: preview?.critical || [],
        warnings: preview?.warnings || [],
      })
      setActionMessage(preview?.critical?.length ? 'Preview generated with missing information.' : 'Preview generated successfully.')
    } catch (previewError) {
      setPreviewHtml('')
      setPreviewSummary({ critical: [], warnings: [] })
      setActionError(previewError?.message || 'Preview could not be generated.')
    } finally {
      setPreviewBusy(false)
    }
  }

  async function handleSaveDraft() {
    if (!templateDetail) return
    setActionError('')
    setActionMessage('')
    setDraftBusy(true)
    try {
      const result = await savePacketDraft({
        packetType,
        context,
        template: templateDetail,
      })
      setPreviewHtml(result?.previewHtml || previewHtml)
      setActionMessage('Commercial document draft saved.')
    } catch (draftError) {
      setActionError(draftError?.message || 'Draft could not be saved.')
    } finally {
      setDraftBusy(false)
    }
  }

  async function handleGenerate() {
    if (!templateDetail) return
    setActionError('')
    setActionMessage('')
    setGenerateBusy(true)
    try {
      const result = await generatePacketVersion({
        packetType,
        context,
        template: templateDetail,
      })
      const entityType = selectedVacancy?.id
        ? 'commercial_vacancy'
        : selectedListing?.id
          ? 'commercial_listing'
          : selectedProperty?.id
            ? 'commercial_property'
            : selectedDeal?.id
              ? 'commercial_deal'
              : selectedLandlord?.id
                ? 'commercial_landlord'
                : selectedCompany?.id
                  ? 'commercial_company'
                  : 'commercial_property'
      const entityId = selectedVacancy?.id || selectedListing?.id || selectedProperty?.id || selectedDeal?.id || selectedLandlord?.id || selectedCompany?.id || ''
      if (result?.version?.rendered_file_path && entityId) {
        const generatedDocument = await registerCommercialGeneratedDocument({
          organisationId,
          entityType,
          entityId,
          documentName: templateDetail.template_label || templateDetail.template_key || 'Commercial document',
          category: packetType,
          filePath: result.version.rendered_file_path,
          fileName: result.version.rendered_file_name,
          fileBucket: 'documents',
          mimeType: 'application/pdf',
          versionNumber: result.version.version_number || 1,
          notes: `Generated from the commercial document generator for ${packetType}.`,
        })
        setGeneratedDocument(generatedDocument)
      }
      setActionMessage('Commercial document generated and saved.')
    } catch (generateError) {
      setActionError(generateError?.message || 'Commercial document could not be generated.')
    } finally {
      setGenerateBusy(false)
    }
  }

  if (loading) {
    return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  }
  if (error) {
    return <CommercialEmptyState title="Commercial document generator unavailable" description={error} />
  }

  const landlordCompanyOptions = companies.map(toOption)
  const landlordRecordOptions = landlords.map(toOption)
  const assetManagerOptions = contacts.filter((row) => !companyId || String(row.company_id || '') === String(companyId)).map(toOption)
  const propertyOptions = properties.map(toOption)
  const vacancyOptions = vacancies.filter((row) => !propertyId || String(row.property_id || '') === String(propertyId)).map(toOption)
  const listingOptions = listings
    .filter((row) => !vacancyId || String(row.vacancy_id || '') === String(vacancyId) || !row.vacancy_id)
    .map(toOption)
  const dealOptions = deals

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
      <section className="grid gap-5">
        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial / Documents</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">Commercial Document Generator</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Build commercial sales and leasing documents from the same packet engine used in the residential platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/commercial/documents" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <FileText size={16} />
                Document Centre
              </Link>
              <Link to="/commercial/settings/document-templates" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <Layers3 size={16} />
                Templates
              </Link>
            </div>
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 1"
            title="What is this document for?"
            description="Choose the commercial document family first so the template library and fields stay focused."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              { key: 'commercial_lease', label: 'Lease', detail: 'Leasing mandates, heads of terms, offer to lease, and lease templates.' },
              { key: 'commercial_sale', label: 'Sale', detail: 'Sales mandates, NDAs, offers to purchase, and diligence templates.' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPacketType(option.key)}
                className={`rounded-2xl border p-4 text-left transition ${packetType === option.key ? 'border-[#9fb9d1] bg-[#eef5fb]' : 'border-slate-200 bg-[#fbfcfe] hover:bg-white'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#102236]">{option.label}</p>
                  {packetType === option.key ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                </div>
                <p className="mt-2 text-sm text-slate-500">{option.detail}</p>
              </button>
            ))}
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 2"
            title="What asset category is this for?"
            description="The field set changes with the asset class so missing information stays manageable."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COMMERCIAL_ASSET_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAssetCategory(option.value)}
                className={`rounded-2xl border p-4 text-left transition ${assetCategory === option.value ? 'border-[#9fb9d1] bg-[#eef5fb]' : 'border-slate-200 bg-[#fbfcfe] hover:bg-white'}`}
              >
                <p className="text-sm font-semibold text-[#102236]">{option.label}</p>
              </button>
            ))}
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 3"
            title="Landlord / Owner Company"
            description="Select an existing company or create a new owner entity for reuse."
          />
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3">
              <RecordSelect
                label="Select Company"
                value={companyId}
                onChange={setCompanyId}
                options={landlordCompanyOptions}
                placeholder="Choose a landlord / owner company"
                details={selectedCompany?.registration_number ? `Reg: ${selectedCompany.registration_number}` : ''}
              />
              <RecordSelect
                label="Linked Landlord Record"
                value={landlordId}
                onChange={setLandlordId}
                options={landlordRecordOptions}
                placeholder="Optional"
                details={selectedLandlord?.registration_number ? `Reg: ${selectedLandlord.registration_number}` : ''}
              />
              {selectedCompany ? (
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-600">
                  <p className="font-semibold text-[#102236]">{selectedCompany.company_name || selectedCompany.name}</p>
                  <p className="mt-1">{[selectedCompany.address, selectedCompany.city, selectedCompany.province].filter(Boolean).join(', ') || 'Address pending'}</p>
                </div>
              ) : null}
              {selectedLandlord ? (
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-600">
                  <p className="font-semibold text-[#102236]">{selectedLandlord.name || selectedLandlord.legal_name || 'Landlord'}</p>
                  <p className="mt-1">{[selectedLandlord.registered_address, selectedLandlord.postal_address].filter(Boolean).join(', ') || 'Address pending'}</p>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Create company</p>
              <div className="mt-3 grid gap-2">
                <input value={createCompanyForm.companyName} onChange={(event) => setCreateCompanyForm((previous) => ({ ...previous, companyName: event.target.value }))} placeholder="Company name" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <select value={createCompanyForm.brokerId} onChange={(event) => setCreateCompanyForm((previous) => ({ ...previous, brokerId: event.target.value }))} className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none">
                  <option value="">Broker</option>
                  {brokers.map((broker) => (
                    <option key={broker.userId || broker.id} value={broker.userId || broker.id}>{firstText(broker.fullName, broker.name, broker.email)}</option>
                  ))}
                </select>
                <input value={createCompanyForm.registrationNumber} onChange={(event) => setCreateCompanyForm((previous) => ({ ...previous, registrationNumber: event.target.value }))} placeholder="Registration number" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createCompanyForm.vatNumber} onChange={(event) => setCreateCompanyForm((previous) => ({ ...previous, vatNumber: event.target.value }))} placeholder="VAT number" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <textarea value={createCompanyForm.registeredAddress} onChange={(event) => setCreateCompanyForm((previous) => ({ ...previous, registeredAddress: event.target.value }))} placeholder="Registered address" className="min-h-20 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                <button type="button" onClick={handleCreateCompany} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                  <Plus size={16} />
                  Create Company
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 4"
            title="Asset Manager / Authorised Signatory"
            description="This is the human decision-maker who signs or authorises the document on behalf of the company."
          />
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3">
              <RecordSelect
                label="Select Signatory"
                value={assetManagerId}
                onChange={setAssetManagerId}
                options={assetManagerOptions}
                placeholder="Choose an existing contact"
                details={selectedAssetManager?.job_title ? selectedAssetManager.job_title : ''}
              />
              {selectedAssetManager ? (
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-600">
                  <p className="font-semibold text-[#102236]">{firstText(selectedAssetManager.first_name, selectedAssetManager.last_name, selectedAssetManager.name)}</p>
                  <p className="mt-1">{selectedAssetManager.email || 'Email pending'} · {selectedAssetManager.mobile || selectedAssetManager.phone || 'Mobile pending'}</p>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Create signatory</p>
              <div className="mt-3 grid gap-2">
                <input value={createContactForm.fullName} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, fullName: event.target.value }))} placeholder="Full name" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createContactForm.position} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, position: event.target.value }))} placeholder="Position / title" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createContactForm.email} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="Email" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createContactForm.mobile} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, mobile: event.target.value }))} placeholder="Mobile" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createContactForm.idNumber} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, idNumber: event.target.value }))} placeholder="ID number (optional)" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <input value={createContactForm.signingCapacity} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, signingCapacity: event.target.value }))} placeholder="Signing capacity" className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none" />
                <label className="flex items-center gap-2 text-sm font-semibold text-[#102236]">
                  <input type="checkbox" checked={createContactForm.authorityConfirmed} onChange={(event) => setCreateContactForm((previous) => ({ ...previous, authorityConfirmed: event.target.checked }))} />
                  Authority confirmed
                </label>
                <button type="button" onClick={handleCreateContact} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                  <Plus size={16} />
                  Create Signatory
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 5"
            title="Commercial context"
            description="Select linked records so the document can pull existing data instead of asking for everything manually."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RecordSelect label="Property" value={propertyId} onChange={(value) => { setPropertyId(value); const property = resolveContextRecord(properties, value); if (property?.landlord_id && !companyId) setCompanyId(property.landlord_id) }} options={propertyOptions} placeholder="Optional" />
            <RecordSelect label="Vacancy" value={vacancyId} onChange={setVacancyId} options={vacancyOptions} placeholder="Optional" />
            <RecordSelect label="Listing" value={listingId} onChange={setListingId} options={listingOptions} placeholder="Optional" />
            <RecordSelect label="Deal" value={dealId} onChange={setDealId} options={dealOptions.map(toOption)} placeholder="Optional" />
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Step 6"
            title="Template selection"
            description="Commercial templates are isolated from residential templates by module scope."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.length ? filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`rounded-2xl border p-4 text-left transition ${selectedTemplateId === template.id ? 'border-[#9fb9d1] bg-[#eef5fb]' : 'border-slate-200 bg-[#fbfcfe] hover:bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{template.template_label || template.template_key}</p>
                    <p className="mt-1 text-xs text-slate-500">{template.version_tag || 'v1'} · {titleize(template.template_format || 'docx')}</p>
                  </div>
                  {selectedTemplateId === template.id ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                </div>
                <p className="mt-2 text-xs text-slate-500">{template.description || 'Commercial document template'}</p>
              </button>
            )) : (
              <CommercialEmptyState title="No commercial templates available" description="Create commercial templates from the commercial template studio first." />
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(COMMERCIAL_DOCUMENT_TEMPLATE_FAMILIES[packetType] || []).slice(0, 6).map((templateName) => (
              <div key={templateName} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                <p className="text-sm font-semibold text-[#102236]">{templateName}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Review"
            title="Missing information"
            description="Preview the document to see the exact fields still needing attention before generation."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {previewSummary.critical.length ? (
              previewSummary.critical.map((row) => (
                <span key={`${row.placeholderKey}-${row.message}`} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{row.placeholderLabel || row.message}</span>
              ))
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">No missing required information</span>
            )}
            {previewSummary.warnings.map((row) => (
              <span key={`${row.placeholderKey}-${row.message}`} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{row.placeholderLabel || row.message}</span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handlePreview} disabled={!templateDetail || previewBusy} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
              <Sparkles size={16} />
              {previewBusy ? 'Previewing…' : 'Preview'}
            </button>
            <button type="button" onClick={handleSaveDraft} disabled={!templateDetail || draftBusy} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
              <Save size={16} />
              {draftBusy ? 'Saving…' : 'Save Draft'}
            </button>
            <button type="button" onClick={handleGenerate} disabled={!templateDetail || generateBusy} className="inline-flex items-center gap-2 rounded-2xl bg-[#102b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
              <FileText size={16} />
              {generateBusy ? 'Generating…' : 'Generate & Save'}
            </button>
          </div>
          {actionError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div> : null}
          {actionMessage ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionMessage}</div> : null}
        </section>
      </section>

      <aside className="grid gap-5">
        <section className={CARD_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Preview</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.035em] text-[#102236]">{templateDetail?.template_label || 'Select a template'}</h2>
            </div>
            <CommercialStatusPill value={packetType === 'commercial_sale' ? 'sale' : 'lease'} />
          </div>
          <div className="mt-4 rounded-3xl border border-slate-200 bg-[#fbfcfe] p-3">
            {previewHtml ? (
              <iframe title="Commercial document preview" srcDoc={previewHtml} className="h-[640px] w-full rounded-2xl border border-slate-200 bg-white" />
            ) : (
              <div className="flex h-[640px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                Generate a preview to inspect the rendered document.
              </div>
            )}
          </div>
          {generatedDocument ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Saved document</p>
              <p className="mt-1 text-sm text-emerald-700">{generatedDocument.document_name || 'Commercial document'} · {generatedDocument.file_name || 'PDF'}</p>
            </div>
          ) : null}
        </section>

        <section className={CARD_CLASS}>
          <SectionHeader
            eyebrow="Context"
            title="Current selection"
            description="A quick look at the records currently feeding the packet."
          />
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Document family</p>
              <p className="mt-1 font-semibold text-[#102236]">{packetType === 'commercial_sale' ? 'Commercial Sale' : 'Commercial Lease'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Asset category</p>
              <p className="mt-1 font-semibold text-[#102236]">{COMMERCIAL_ASSET_CATEGORY_OPTIONS.find((item) => item.value === assetCategory)?.label || titleize(assetCategory)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Owner company</p>
              <p className="mt-1 font-semibold text-[#102236]">{selectedCompany?.company_name || selectedCompany?.name || 'Pending'}</p>
            </div>
            {selectedLandlord ? (
              <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Landlord record</p>
                <p className="mt-1 font-semibold text-[#102236]">{selectedLandlord.name || selectedLandlord.legal_name || 'Pending'}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Signatory</p>
              <p className="mt-1 font-semibold text-[#102236]">{firstText(selectedAssetManager?.first_name, selectedAssetManager?.last_name, selectedAssetManager?.name) || 'Pending'}</p>
            </div>
            {selectedProperty ? <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Property</p><p className="mt-1 font-semibold text-[#102236]">{selectedProperty.property_name}</p><p className="mt-1 text-xs text-slate-500">{selectedProperty.address || 'Address pending'}</p></div> : null}
            {selectedVacancy ? <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Vacancy</p><p className="mt-1 font-semibold text-[#102236]">{selectedVacancy.vacancy_name}</p></div> : null}
            {selectedListing ? <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Listing</p><p className="mt-1 font-semibold text-[#102236]">{selectedListing.title}</p></div> : null}
            {selectedDeal ? <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Deal</p><p className="mt-1 font-semibold text-[#102236]">{selectedDeal.deal_name}</p></div> : null}
          </div>
        </section>
      </aside>
    </div>
  )
}

export default CommercialDocumentGeneratorPage
