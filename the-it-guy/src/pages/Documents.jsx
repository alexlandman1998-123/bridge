import { Building2, Download, FileUp, FolderKanban, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import FilterBar, { FilterBarGroup } from '../components/ui/FilterBar'
import SearchInput from '../components/ui/SearchInput'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  deleteDevelopmentDocument,
  fetchDevelopmentDetail,
  fetchDevelopmentOptions,
  fetchDocumentsByUnit,
  fetchTransactionsByParticipant,
  saveDevelopmentDocument,
  uploadDocument,
} from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const HUB_SECTIONS = [
  { key: 'client', label: 'Client Documents' },
  { key: 'development', label: 'Development Documents' },
  { key: 'company', label: 'Company Documents' },
]

const CLIENT_CATEGORY_RULES = [
  { key: 'fica', label: 'FICA / Compliance', keywords: ['fica', 'id', 'address', 'compliance'] },
  { key: 'sales', label: 'Sales Documents', keywords: ['otp', 'offer', 'sale', 'sales'] },
  { key: 'finance', label: 'Finance / Bond Documents', keywords: ['bond', 'bank', 'finance', 'loan', 'grant'] },
  { key: 'transfer', label: 'Transfer Documents', keywords: ['transfer', 'attorney', 'registration', 'deed'] },
  { key: 'pop', label: 'Proof of Payment', keywords: ['payment', 'proof', 'deposit', 'reservation'] },
  { key: 'additional', label: 'Additional Requested Documents', keywords: ['additional', 'request', 'supporting'] },
]

const DEVELOPMENT_DOC_TYPES = [
  { value: 'nhbrc', label: 'NHBRC Certificates' },
  { value: 'building_plans', label: 'Approved Building Plans' },
  { value: 'approvals', label: 'Development Approvals' },
  { value: 'zoning', label: 'Zoning Documents' },
  { value: 'engineering', label: 'Services / Engineering Documents' },
  { value: 'erf', label: 'Erf Diagrams' },
  { value: 'occupation', label: 'Occupation Certificates' },
  { value: 'brochure', label: 'Brochures / Marketing Documents' },
  { value: 'legal', label: 'Development Legal Documents' },
  { value: 'other', label: 'Other Supporting Documents' },
]

const COMPANY_DOC_TYPES = [
  'Company Registration Documents',
  'CIPC Documents',
  'Tax Clearance / SARS Documents',
  'VAT Registration',
  'B-BBEE Certificate',
  'Bank Confirmation Letter',
  'Director IDs',
  'Resolution Documents',
  'Standard Company Profile',
  'Standard Legal / Compliance Documents',
]

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusBadgeClass(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['approved', 'uploaded', 'complete', 'completed', 'verified'].includes(normalized)) {
    return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  }
  if (['pending', 'pending_review', 'under_review'].includes(normalized)) {
    return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
  }
  if (['rejected', 'declined'].includes(normalized)) {
    return 'border-[#f5d0d0] bg-[#fff4f4] text-[#b42318]'
  }
  return 'border-[#e8edf4] bg-[#f9fbfd] text-[#6b7d93]'
}

function inferClientCategory(requirement) {
  const source = `${requirement?.label || ''} ${requirement?.key || ''}`.toLowerCase()
  const match = CLIENT_CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => source.includes(keyword)))
  return match ? match.label : 'Additional Requested Documents'
}

function groupChecklistByCategory(checklist = []) {
  const grouped = {}
  for (const row of checklist) {
    const label = inferClientCategory(row)
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(row)
  }
  return grouped
}

function getCompanyDocsStorageKey(profileId) {
  return `itg:developer-company-docs:v1:${profileId || 'default'}`
}

function readCompanyDocs(profileId) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getCompanyDocsStorageKey(profileId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCompanyDocs(profileId, rows) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getCompanyDocsStorageKey(profileId), JSON.stringify(rows))
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file.'))
    reader.readAsDataURL(file)
  })
}

function buildDevelopmentContextOptions(workspaces = []) {
  const developmentMap = new Map()
  const privateOptions = []

  for (const row of workspaces) {
    const developmentId = String(row?.development?.id || '').trim()
    const transactionId = String(row?.transaction?.id || '').trim()
    if (developmentId) {
      if (!developmentMap.has(developmentId)) {
        developmentMap.set(developmentId, {
          value: `development:${developmentId}`,
          kind: 'development',
          developmentId,
          label: row?.development?.name || 'Unknown Development',
        })
      }
    } else if (transactionId) {
      privateOptions.push({
        value: `private:${transactionId}`,
        kind: 'private',
        transactionId,
        label: `${row?.buyer?.name || 'Private Buyer'} • ${row?.unit?.unit_number ? `Unit ${row.unit.unit_number}` : 'Standalone'}`,
      })
    }
  }

  return [...developmentMap.values(), ...privateOptions]
}

function Documents() {
  const { workspace, role, profile } = useWorkspace()
  const [section, setSection] = useState('client')
  const [unitWorkspaces, setUnitWorkspaces] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [selectedContextKey, setSelectedContextKey] = useState('all')
  const [selectedClientTransactionId, setSelectedClientTransactionId] = useState('all')
  const [selectedDevelopmentId, setSelectedDevelopmentId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const [error, setError] = useState('')

  const [developmentDetail, setDevelopmentDetail] = useState(null)
  const [developmentDocumentsLoading, setDevelopmentDocumentsLoading] = useState(false)
  const [savingDevelopmentDocument, setSavingDevelopmentDocument] = useState(false)
  const [developmentDocumentForm, setDevelopmentDocumentForm] = useState({
    id: '',
    documentType: 'other',
    title: '',
    description: '',
    fileUrl: '',
  })

  const [companyDocuments, setCompanyDocuments] = useState([])
  const [companyDocumentForm, setCompanyDocumentForm] = useState({
    id: '',
    title: '',
    category: COMPANY_DOC_TYPES[0],
    status: 'uploaded',
    fileName: '',
    fileUrl: '',
  })

  const scopedRoleType =
    role === 'agent' ? 'agent' : role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : null

  const loadBaseData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const [unitRows, developmentRows] = await Promise.all([
        fetchDocumentsByUnit({ developmentId: workspace.id === 'all' ? null : workspace.id }),
        fetchDevelopmentOptions(),
      ])

      let filteredRows = unitRows
      if (scopedRoleType && profile?.id) {
        const participantRows = await fetchTransactionsByParticipant({ userId: profile.id, roleType: scopedRoleType })
        const allowedTransactionIds = new Set(participantRows.map((item) => item?.transaction?.id).filter(Boolean))
        filteredRows = unitRows.filter((item) => allowedTransactionIds.has(item?.transaction?.id))
      }

      setUnitWorkspaces(filteredRows)
      setDevelopmentOptions(developmentRows)
      setSelectedContextKey('all')
      setSelectedClientTransactionId('all')
      const initialDevelopmentId = workspace.id !== 'all' ? workspace.id : developmentRows[0]?.id || ''
      setSelectedDevelopmentId(initialDevelopmentId)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load documents.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id, scopedRoleType, workspace.id])

  useEffect(() => {
    void loadBaseData()
  }, [loadBaseData])

  useEffect(() => {
    setCompanyDocuments(readCompanyDocs(profile?.id || ''))
  }, [profile?.id])

  useEffect(() => {
    async function loadDevelopmentDetailData() {
      if (section !== 'development' || !selectedDevelopmentId) {
        setDevelopmentDetail(null)
        return
      }

      try {
        setError('')
        setDevelopmentDocumentsLoading(true)
        const detail = await fetchDevelopmentDetail(selectedDevelopmentId)
        setDevelopmentDetail(detail)
      } catch (loadError) {
        setError(loadError.message || 'Unable to load development documents.')
      } finally {
        setDevelopmentDocumentsLoading(false)
      }
    }

    void loadDevelopmentDetailData()
  }, [section, selectedDevelopmentId])

  const clientContextOptions = useMemo(() => buildDevelopmentContextOptions(unitWorkspaces), [unitWorkspaces])

  const selectedContext = useMemo(
    () => clientContextOptions.find((item) => item.value === selectedContextKey) || null,
    [clientContextOptions, selectedContextKey],
  )

  const clientScopedRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    let rows = unitWorkspaces
    if (selectedContext?.kind === 'development') {
      rows = rows.filter((item) => String(item?.development?.id || '') === selectedContext.developmentId)
      if (selectedClientTransactionId !== 'all') {
        rows = rows.filter((item) => String(item?.transaction?.id || '') === selectedClientTransactionId)
      }
    }

    if (selectedContext?.kind === 'private') {
      rows = rows.filter((item) => String(item?.transaction?.id || '') === selectedContext.transactionId)
    }

    if (!query) return rows

    return rows.filter((item) => {
      const haystack = [
        item?.development?.name,
        item?.buyer?.name,
        item?.unit?.unit_number,
        item?.stage,
        item?.transaction?.transaction_reference,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [searchTerm, selectedClientTransactionId, selectedContext, unitWorkspaces])

  const clientOptionsForDevelopment = useMemo(() => {
    if (selectedContext?.kind !== 'development') return []
    return clientScopedRows
      .map((row) => ({
        value: String(row?.transaction?.id || ''),
        label: `${row?.buyer?.name || 'Client'}${row?.unit?.unit_number ? ` • Unit ${row.unit.unit_number}` : ''}`,
      }))
      .filter((item) => item.value)
  }, [clientScopedRows, selectedContext?.kind])

  useEffect(() => {
    if (selectedContext?.kind !== 'development') {
      setSelectedClientTransactionId('all')
      return
    }

    if (selectedClientTransactionId === 'all') return
    if (!clientOptionsForDevelopment.some((item) => item.value === selectedClientTransactionId)) {
      setSelectedClientTransactionId('all')
    }
  }, [clientOptionsForDevelopment, selectedClientTransactionId, selectedContext?.kind])

  const selectedClientWorkspace = useMemo(() => clientScopedRows[0] || null, [clientScopedRows])

  async function handleChecklistUpload(workspaceRow, item, file) {
    if (!file || !workspaceRow?.transaction?.id) return

    try {
      setUploadingKey(item.key)
      setError('')
      await uploadDocument({
        transactionId: workspaceRow.transaction.id,
        file,
        category: item.label || 'General',
        requiredDocumentKey: item.key || null,
      })
      await loadBaseData()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload document.')
    } finally {
      setUploadingKey('')
    }
  }

  async function handleSaveDevelopmentDocument(event) {
    event.preventDefault()
    if (!selectedDevelopmentId) return

    try {
      setSavingDevelopmentDocument(true)
      setError('')
      await saveDevelopmentDocument({
        developmentId: selectedDevelopmentId,
        documentId: developmentDocumentForm.id || null,
        documentType: developmentDocumentForm.documentType,
        title: developmentDocumentForm.title,
        description: developmentDocumentForm.description,
        fileUrl: developmentDocumentForm.fileUrl,
      })
      setDevelopmentDocumentForm({ id: '', documentType: 'other', title: '', description: '', fileUrl: '' })
      const detail = await fetchDevelopmentDetail(selectedDevelopmentId)
      setDevelopmentDetail(detail)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save development document.')
    } finally {
      setSavingDevelopmentDocument(false)
    }
  }

  async function handleDeleteDevelopmentDoc(documentId) {
    try {
      setSavingDevelopmentDocument(true)
      setError('')
      await deleteDevelopmentDocument(documentId)
      const detail = await fetchDevelopmentDetail(selectedDevelopmentId)
      setDevelopmentDetail(detail)
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove document.')
    } finally {
      setSavingDevelopmentDocument(false)
    }
  }

  async function handleCompanyFileUpload(file) {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCompanyDocumentForm((previous) => ({
        ...previous,
        fileName: file.name,
        fileUrl: dataUrl,
      }))
    } catch (uploadError) {
      setError(uploadError.message)
    }
  }

  function handleSaveCompanyDocument(event) {
    event.preventDefault()
    if (!companyDocumentForm.title.trim()) {
      setError('Company document title is required.')
      return
    }

    const now = new Date().toISOString()
    const next = {
      id: companyDocumentForm.id || `company_doc_${Date.now()}`,
      title: companyDocumentForm.title.trim(),
      category: companyDocumentForm.category,
      status: companyDocumentForm.status || 'uploaded',
      fileName: companyDocumentForm.fileName || 'Document file',
      fileUrl: companyDocumentForm.fileUrl || '',
      updatedAt: now,
      createdAt: companyDocumentForm.id
        ? companyDocuments.find((item) => item.id === companyDocumentForm.id)?.createdAt || now
        : now,
    }

    const rows = companyDocumentForm.id
      ? companyDocuments.map((item) => (item.id === companyDocumentForm.id ? next : item))
      : [next, ...companyDocuments]

    setCompanyDocuments(rows)
    writeCompanyDocs(profile?.id || '', rows)
    setCompanyDocumentForm({ id: '', title: '', category: COMPANY_DOC_TYPES[0], status: 'uploaded', fileName: '', fileUrl: '' })
    setError('')
  }

  function handleEditCompanyDocument(item) {
    setCompanyDocumentForm({
      id: item.id,
      title: item.title,
      category: item.category,
      status: item.status,
      fileName: item.fileName,
      fileUrl: item.fileUrl,
    })
  }

  function handleDeleteCompanyDocument(documentId) {
    const rows = companyDocuments.filter((item) => item.id !== documentId)
    setCompanyDocuments(rows)
    writeCompanyDocs(profile?.id || '', rows)
    if (companyDocumentForm.id === documentId) {
      setCompanyDocumentForm({ id: '', title: '', category: COMPANY_DOC_TYPES[0], status: 'uploaded', fileName: '', fileUrl: '' })
    }
  }

  const groupedClientChecklist = useMemo(
    () => groupChecklistByCategory(selectedClientWorkspace?.requiredChecklist || []),
    [selectedClientWorkspace?.requiredChecklist],
  )

  const developmentDocuments = useMemo(() => developmentDetail?.documents || [], [developmentDetail?.documents])

  const developmentDocumentGroups = useMemo(() => {
    const grouped = {}
    for (const row of developmentDocuments) {
      const type = String(row?.documentType || 'other')
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(row)
    }
    return grouped
  }, [developmentDocuments])

  return (
    <section className="space-y-5">
      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}

      {loading ? (
        <LoadingSkeleton lines={10} className="rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" />
      ) : null}

      {!loading && isSupabaseConfigured ? (
        <>
          <section className="rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="grid gap-2 md:grid-cols-3">
              {HUB_SECTIONS.map((item) => {
                const active = section === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSection(item.key)}
                    className={`rounded-[16px] border px-4 py-3 text-left transition ${
                      active ? 'border-[#1f4f78] bg-[#1f4f78] text-white' : 'border-[#dbe6f2] bg-[#fbfcfe] text-[#35546c]'
                    }`}
                  >
                    <span className="text-sm font-semibold">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {section === 'client' ? (
            <>
              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <FilterBar>
                  <FilterBarGroup className="gap-4 lg:flex-none">
                    <label className="flex min-w-[280px] flex-col gap-2">
                      <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Select Development / Property</span>
                      <Field as="select" value={selectedContextKey} onChange={(event) => setSelectedContextKey(event.target.value)}>
                        <option value="all">All</option>
                        {clientContextOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.kind === 'development' ? `Development • ${option.label}` : `Private • ${option.label}`}
                          </option>
                        ))}
                      </Field>
                    </label>

                    <label className="flex min-w-[260px] flex-col gap-2">
                      <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Select Client / Buyer</span>
                      <Field
                        as="select"
                        value={selectedClientTransactionId}
                        onChange={(event) => setSelectedClientTransactionId(event.target.value)}
                        disabled={selectedContext?.kind !== 'development'}
                      >
                        <option value="all">{selectedContext?.kind === 'development' ? 'All buyers in development' : 'Client selected from property context'}</option>
                        {clientOptionsForDevelopment.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Field>
                    </label>
                  </FilterBarGroup>

                  <FilterBarGroup className="min-w-[320px] lg:ml-auto lg:max-w-[420px] lg:justify-end">
                    <div className="flex w-full flex-col gap-2">
                      <span aria-hidden className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-transparent">Search</span>
                      <SearchInput
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search by client, unit, property, or stage"
                      />
                    </div>
                  </FilterBarGroup>
                </FilterBar>
              </section>

              {selectedClientWorkspace ? (
                <section className="space-y-5">
                  <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <SectionHeader
                      title={selectedClientWorkspace?.buyer?.name || 'Client / Buyer'}
                      copy={`${selectedClientWorkspace?.development?.name || 'Private property'}${selectedClientWorkspace?.unit?.unit_number ? ` • Unit ${selectedClientWorkspace.unit.unit_number}` : ''} • ${selectedClientWorkspace?.stage || 'Unknown stage'}`}
                      actions={
                        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                          Status: {selectedClientWorkspace?.stage || 'Unknown'}
                        </span>
                      }
                    />
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="text-[0.74rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Uploaded</span>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{selectedClientWorkspace?.checklistSummary?.uploadedCount || 0}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="text-[0.74rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Missing</span>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{selectedClientWorkspace?.checklistSummary?.missingCount || 0}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="text-[0.74rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Required</span>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{selectedClientWorkspace?.checklistSummary?.totalRequired || 0}</p>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4">
                    {Object.entries(groupedClientChecklist).map(([categoryLabel, rows]) => (
                      <article key={categoryLabel} className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <header className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="text-[1rem] font-semibold text-[#142132]">{categoryLabel}</h3>
                          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-xs font-semibold text-[#66758b]">
                            {rows.length} item{rows.length === 1 ? '' : 's'}
                          </span>
                        </header>
                        <div className="space-y-3">
                          {rows.map((item) => (
                            <div key={item.key} className="flex flex-col gap-3 rounded-[14px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-3 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#142132]">{item.label}</p>
                                <p className="mt-1 text-xs text-[#6b7d93]">{item.matchedDocument?.name || 'No file uploaded yet'}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item.complete ? 'uploaded' : 'missing')}`}>
                                  {item.complete ? 'Uploaded' : 'Missing'}
                                </span>
                                {item.matchedDocument?.url ? (
                                  <a
                                    href={item.matchedDocument.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-[10px] border border-[#dbe6f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                  >
                                    <Download size={13} />
                                    Download
                                  </a>
                                ) : null}
                                <label className="inline-flex cursor-pointer items-center gap-1 rounded-[10px] border border-[#dbe6f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                                  <FileUp size={13} />
                                  {uploadingKey === item.key ? 'Uploading...' : item.complete ? 'Replace' : 'Upload'}
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={uploadingKey === item.key || !selectedClientWorkspace?.transaction?.id}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0]
                                      void handleChecklistUpload(selectedClientWorkspace, item, file)
                                      event.target.value = ''
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </section>
                </section>
              ) : (
                <section className="rounded-[22px] border border-[#dde4ee] bg-white px-6 py-8 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  No client document context matches the selected filters.
                </section>
              )}
            </>
          ) : null}

          {section === 'development' ? (
            <section className="space-y-5">
              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <FilterBar>
                  <FilterBarGroup className="gap-4 lg:flex-none">
                    <label className="flex min-w-[300px] flex-col gap-2">
                      <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Select Development</span>
                      <Field as="select" value={selectedDevelopmentId} onChange={(event) => setSelectedDevelopmentId(event.target.value)}>
                        <option value="">Select development</option>
                        {developmentOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </Field>
                    </label>
                  </FilterBarGroup>
                </FilterBar>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <SectionHeader
                    title={developmentDetail?.development?.name || 'Development Documents'}
                    copy="NHBRC, plans, approvals, legal assets, marketing packs, and support documents."
                    actions={
                      <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                        {developmentDocuments.length} files
                      </span>
                    }
                  />

                  {developmentDocumentsLoading ? (
                    <LoadingSkeleton lines={5} className="mt-4" />
                  ) : developmentDocuments.length ? (
                    <div className="mt-5 space-y-4">
                      {Object.entries(developmentDocumentGroups).map(([groupKey, rows]) => {
                        const groupLabel = DEVELOPMENT_DOC_TYPES.find((item) => item.value === groupKey)?.label || normalizeLabel(groupKey)
                        return (
                          <article key={groupKey} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                            <header className="mb-3 flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold text-[#142132]">{groupLabel}</h4>
                              <span className="text-xs font-semibold text-[#6b7d93]">{rows.length}</span>
                            </header>
                            <div className="space-y-2">
                              {rows.map((item) => (
                                <div key={item.id} className="flex flex-col gap-2 rounded-[12px] border border-[#dfe8f3] bg-white px-3 py-2 md:flex-row md:items-center md:justify-between">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-[#142132]">{item.title}</p>
                                    <p className="mt-1 text-xs text-[#6b7d93]">{item.description || 'No description'} • {formatDate(item.uploadedAt || item.createdAt)}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {item.fileUrl ? (
                                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[10px] border border-[#dbe6f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#35546c]">
                                        <Download size={12} />
                                        Download
                                      </a>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="text-xs"
                                      onClick={() =>
                                        setDevelopmentDocumentForm({
                                          id: item.id,
                                          documentType: item.documentType || 'other',
                                          title: item.title || '',
                                          description: item.description || '',
                                          fileUrl: item.fileUrl || '',
                                        })
                                      }
                                    >
                                      Replace
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => void handleDeleteDevelopmentDoc(item.id)} disabled={savingDevelopmentDocument}>
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#6b7d93]">
                      No development documents uploaded yet for this development.
                    </div>
                  )}
                </section>

                <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <SectionHeader title={developmentDocumentForm.id ? 'Replace Development Document' : 'Upload Development Document'} />
                  <form className="mt-4 space-y-3" onSubmit={handleSaveDevelopmentDocument}>
                    <label className="grid gap-2">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Document Category</span>
                      <Field
                        as="select"
                        value={developmentDocumentForm.documentType}
                        onChange={(event) => setDevelopmentDocumentForm((previous) => ({ ...previous, documentType: event.target.value }))}
                      >
                        {DEVELOPMENT_DOC_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Title</span>
                      <Field
                        value={developmentDocumentForm.title}
                        onChange={(event) => setDevelopmentDocumentForm((previous) => ({ ...previous, title: event.target.value }))}
                        placeholder="e.g. NHBRC Certificate"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Description</span>
                      <Field
                        as="textarea"
                        rows={3}
                        value={developmentDocumentForm.description}
                        onChange={(event) => setDevelopmentDocumentForm((previous) => ({ ...previous, description: event.target.value }))}
                        placeholder="Optional context"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">File URL</span>
                      <Field
                        value={developmentDocumentForm.fileUrl}
                        onChange={(event) => setDevelopmentDocumentForm((previous) => ({ ...previous, fileUrl: event.target.value }))}
                        placeholder="https://..."
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="submit" size="sm" disabled={!selectedDevelopmentId || savingDevelopmentDocument}>
                        {savingDevelopmentDocument ? 'Saving...' : developmentDocumentForm.id ? 'Save Replacement' : 'Upload Document'}
                      </Button>
                      {developmentDocumentForm.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDevelopmentDocumentForm({ id: '', documentType: 'other', title: '', description: '', fileUrl: '' })}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </form>
                </section>
              </section>
            </section>
          ) : null}

          {section === 'company' ? (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <SectionHeader
                  title="Company Documents"
                  copy="Company registration, compliance, finance, governance, and profile documents."
                  actions={
                    <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                      {companyDocuments.length} files
                    </span>
                  }
                />

                {companyDocuments.length ? (
                  <div className="mt-5 space-y-3">
                    {companyDocuments.map((item) => (
                      <article key={item.id} className="flex flex-col gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#142132]">{item.title}</p>
                          <p className="mt-1 text-xs text-[#6b7d93]">{item.category} • {item.fileName || 'No file name'} • {formatDate(item.updatedAt || item.createdAt)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item.status)}`}>
                            {normalizeLabel(item.status)}
                          </span>
                          {item.fileUrl ? (
                            <a href={item.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[10px] border border-[#dbe6f2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#35546c]">
                              <Download size={12} />
                              Download
                            </a>
                          ) : null}
                          <Button size="sm" variant="secondary" className="text-xs" onClick={() => handleEditCompanyDocument(item)}>Replace</Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleDeleteCompanyDocument(item.id)}>Remove</Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#6b7d93]">
                    No company documents uploaded yet.
                  </div>
                )}
              </section>

              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <SectionHeader title={companyDocumentForm.id ? 'Replace Company Document' : 'Upload Company Document'} />
                <form className="mt-4 space-y-3" onSubmit={handleSaveCompanyDocument}>
                  <label className="grid gap-2">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Document Category</span>
                    <Field
                      as="select"
                      value={companyDocumentForm.category}
                      onChange={(event) => setCompanyDocumentForm((previous) => ({ ...previous, category: event.target.value }))}
                    >
                      {COMPANY_DOC_TYPES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Field>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Title</span>
                    <Field
                      value={companyDocumentForm.title}
                      onChange={(event) => setCompanyDocumentForm((previous) => ({ ...previous, title: event.target.value }))}
                      placeholder="e.g. CIPC Registration"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
                    <Field
                      as="select"
                      value={companyDocumentForm.status}
                      onChange={(event) => setCompanyDocumentForm((previous) => ({ ...previous, status: event.target.value }))}
                    >
                      <option value="uploaded">Uploaded</option>
                      <option value="pending_review">Pending Review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </Field>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Upload File</span>
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#fbfcfe] px-3 py-2 text-sm font-semibold text-[#35546c]">
                      <FileUp size={14} />
                      {companyDocumentForm.fileName ? `Selected: ${companyDocumentForm.fileName}` : 'Choose file'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          void handleCompanyFileUpload(file)
                          event.target.value = ''
                        }}
                      />
                    </label>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" size="sm">{companyDocumentForm.id ? 'Save Replacement' : 'Upload Document'}</Button>
                    {companyDocumentForm.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCompanyDocumentForm({ id: '', title: '', category: COMPANY_DOC_TYPES[0], status: 'uploaded', fileName: '', fileUrl: '' })}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </form>
              </section>
            </section>
          ) : null}

          {!loading && !unitWorkspaces.length && section === 'client' ? (
            <section className="rounded-[22px] border border-dashed border-[#d8e2ee] bg-white px-6 py-8 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              No client transaction documents are available in this workspace yet.
            </section>
          ) : null}

          {!loading && section === 'development' && !selectedDevelopmentId ? (
            <section className="rounded-[22px] border border-dashed border-[#d8e2ee] bg-white px-6 py-8 text-sm text-[#6b7d93] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              Select a development to view and manage development-level documents.
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export default Documents
