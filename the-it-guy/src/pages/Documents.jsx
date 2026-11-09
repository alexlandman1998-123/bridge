import { DOCUMENT_UPLOAD_HELP_TEXT, validateDocumentUploadFile } from '../lib/documentUploadPolicy.js'
import { AlertTriangle, Building2, Download, FileSignature, FileUp, FolderKanban, RotateCcw, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CompanyDocuments from '../components/documents/CompanyDocuments.jsx'
import DocumentUploadProgress from '../components/documents/DocumentUploadProgress.jsx'
import { describeDocumentUploadFailure, refreshAfterSavedDocumentUpload } from '../lib/documentUploadLifecycle.js'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import FilterBar, { FilterBarGroup } from '../components/ui/FilterBar'
import SearchInput from '../components/ui/SearchInput'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { buildSellerMandateDocumentModel } from '../core/documents/sellerMandateInformationModel'
import { uploadDocument } from '../domains/documents/uploadWorkflow.js'
import { deleteDevelopmentDocument, saveDevelopmentDocument, uploadDevelopmentDocumentAsset } from '../lib/developmentDetailApi'
import { fetchDevelopmentOptions } from '../domains/developments/selectionReadApi.js'
import { fetchDocumentWorkspacePage } from '../domains/documents/workspaceReadApi.js'
import { useDocumentClientWorkspace } from '../domains/documents/useDocumentClientWorkspace.js'
import { fetchDevelopmentDocuments } from '../domains/developments/readApi.js'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { DOCUMENT_UPLOAD_ACCEPT } from '../lib/documentUploadPolicy'
import { createScopedReadCache, watchScopedReadInvalidation } from '../lib/scopedReadCache.js'
import { createCoalescedRefresh } from '../lib/coalescedRefresh.js'
import { markRouteMilestone } from '../lib/performanceTrace.js'

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

function isMandateChecklistRequirement(item = {}) {
  const source = `${item?.key || ''} ${item?.label || ''}`.toLowerCase()
  return source.includes('mandate')
}

function normalizeDocumentTimestamp(value = '') {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getMandateLifecycleLabel(document = {}) {
  return normalizeLabel(
    document?.sellerMandateLifecycleState ||
      document?.sellerMandateDocumentVariant ||
      document?.portalDocumentType ||
      document?.document_type ||
      document?.category ||
      'mandate',
  )
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
  const { workspace, role, profile, currentWorkspace, currentMembership } = useWorkspace()
  const documentScope = `${profile?.id || ''}:${role}:${workspace.id}:${currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id || currentMembership?.organisationId || currentMembership?.organisation_id || ''}:${currentMembership?.workspaceRole || currentMembership?.workspace_role || currentMembership?.organisationRole || currentMembership?.role || ''}`
  const referenceData = useMemo(() => createScopedReadCache({ scopeKey: documentScope }), [documentScope])
  const indexCacheRef = useRef(null)
  const indexRequestRef = useRef(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [section, setSection] = useState('client')
  const [unitIndex, setUnitIndex] = useState({ scope: '', rows: [] })
  const unitWorkspaces = useMemo(() => unitIndex.scope === documentScope ? unitIndex.rows : [], [unitIndex, documentScope])
  const setUnitWorkspaces = useCallback(rows => setUnitIndex({ scope: documentScope, rows }), [documentScope])
  const [developmentIndex, setDevelopmentIndex] = useState({ scope: '', rows: [] })
  const developmentOptions = developmentIndex.scope === documentScope ? developmentIndex.rows : []
  const setDevelopmentOptions = useCallback(rows => setDevelopmentIndex({ scope: documentScope, rows }), [documentScope])
  const [selectedContextKey, setSelectedContextKey] = useState('all')
  const [selectedClientTransactionId, setSelectedClientTransactionId] = useState('all')
  const [selectedDevelopmentId, setSelectedDevelopmentId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [developmentFile, setDevelopmentFile] = useState(null)
  const [uploadFailures, setUploadFailures] = useState({})
  const [error, setError] = useState('')
  const [baseError, setBaseError] = useState('')

  const [developmentDetail, setDevelopmentDetail] = useState(null)
  const [includeDevelopmentHistory, setIncludeDevelopmentHistory] = useState(false)
  const [developmentDocumentsLoading, setDevelopmentDocumentsLoading] = useState(false)
  const [savingDevelopmentDocument, setSavingDevelopmentDocument] = useState(false)
  const [developmentDocumentForm, setDevelopmentDocumentForm] = useState({
    id: '',
    documentType: 'other',
    title: '',
    description: '',
    fileUrl: '',
  })

  const scopedRoleType =
    role === 'agent' ? 'agent' : role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : null

  const loadBaseData = useCallback(async ({ append = false, force = false } = {}) => {
    const request = ++indexRequestRef.current
    if (!isSupabaseConfigured || section === 'company') { setLoading(false); setBaseError(''); return }
    if (indexCacheRef.current?.scope !== documentScope) {
      indexCacheRef.current = { scope: documentScope, rows: [], loaded: false, nextCursor: null, options: null, organisationId: '' }
      setUnitWorkspaces([])
      setDevelopmentOptions([])
      setNextCursor(null)
    }
    const cache = indexCacheRef.current
    try {
      setError('')
      setBaseError('')
      if (append) setLoadingMore(true)
      else setLoading(true)
      if (!cache.organisationId) {
        const contextOrganisationId = currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id
        const settings = contextOrganisationId ? null : await fetchOrganisationSettings()
        cache.organisationId = String(contextOrganisationId || settings?.organisation?.id || '').trim()
        if (!cache.organisationId) throw new Error('An organisation is required to load documents.')
      }
      if (request !== indexRequestRef.current) return
      if (section === 'development') {
        const options = cache.options && Date.now() - cache.optionsLoadedAt < 30_000 ? cache.options : await fetchDevelopmentOptions({ organisationId: cache.organisationId })
        if (request !== indexRequestRef.current) return
        cache.options = options
        cache.optionsLoadedAt = Date.now()
        setDevelopmentOptions(options)
        const preferred = workspace.id !== 'all' && options.some(row => row.id === workspace.id) ? workspace.id : ''
        setSelectedDevelopmentId(current => preferred || (options.some(row => row.id === current) ? current : options[0]?.id || ''))
        return
      }
      if (!cache.loaded || append || force || Date.now() - cache.loadedAt >= 30_000) {
        const page = await fetchDocumentWorkspacePage({ organisationId: cache.organisationId,
          developmentId: workspace.id === 'all' ? null : workspace.id,
          userId: profile?.id || '', roleType: scopedRoleType, afterUnitId: append ? cache.nextCursor : null, referenceData })
        if (request !== indexRequestRef.current) return
        cache.rows = append ? [...cache.rows, ...page.rows] : page.rows
        cache.nextCursor = page.nextCursor
        cache.loaded = true
        cache.loadedAt = Date.now()
      }
      setUnitWorkspaces(cache.rows)
      setNextCursor(cache.nextCursor)
    } catch (cause) {
      if (request === indexRequestRef.current) setBaseError(cause.message || 'Unable to load documents.')
    } finally {
      if (request === indexRequestRef.current) { setLoading(false); setLoadingMore(false) }
    }
  }, [currentWorkspace?.id, currentWorkspace?.organisationId, currentWorkspace?.organisation_id, documentScope, profile?.id, scopedRoleType, section, setDevelopmentOptions, setUnitWorkspaces, workspace.id, referenceData])

  useEffect(() => {
    setSelectedContextKey('all')
    setSelectedClientTransactionId('all')
    setSelectedDevelopmentId('')
    setDevelopmentDetail(null)
    setDevelopmentFile(null)
    setDevelopmentDocumentForm({ id: '', documentType: 'other', title: '', description: '', fileUrl: '' })
  }, [documentScope])
  useEffect(() => {
    void loadBaseData()
    return () => { indexRequestRef.current += 1 }
  }, [loadBaseData])



  useEffect(() => {
    let active = true
    async function loadDevelopmentDetailData() {
      if (section !== 'development' || !selectedDevelopmentId || developmentIndex.scope !== documentScope || !developmentIndex.rows.some(row => row.id === selectedDevelopmentId)) {
        setDevelopmentDetail(null)
        return
      }

      try {
        setError('')
        setDevelopmentDocumentsLoading(true)
        setDevelopmentDetail(null)
        const documents = await fetchDevelopmentDocuments(selectedDevelopmentId, { includeHistory: includeDevelopmentHistory })
        const detail = { documents, scope: documentScope, developmentId: selectedDevelopmentId }
        if (active) setDevelopmentDetail(detail)
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load development documents.')
      } finally {
        if (active) setDevelopmentDocumentsLoading(false)
      }
    }

    void loadDevelopmentDetailData()
    return () => { active = false }
  }, [section, selectedDevelopmentId, includeDevelopmentHistory, documentScope, developmentIndex])

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
  }, [searchTerm, selectedContext, unitWorkspaces])

  const clientOptionsForDevelopment = useMemo(() => {
    if (selectedContext?.kind === 'private') return []
    return clientScopedRows
      .map((row) => ({
        value: String(row?.transaction?.id || ''),
        label: `${row?.buyer?.name || 'Client'}${row?.unit?.unit_number ? ` • Unit ${row.unit.unit_number}` : ''}`,
      }))
      .filter((item) => item.value)
  }, [clientScopedRows, selectedContext?.kind])

  useEffect(() => {
    if (selectedContext?.kind === 'private') {
      setSelectedClientTransactionId('all')
      return
    }

    if (selectedClientTransactionId === 'all') return
    if (!clientOptionsForDevelopment.some((item) => item.value === selectedClientTransactionId)) {
      setSelectedClientTransactionId('all')
    }
  }, [clientOptionsForDevelopment, selectedClientTransactionId, selectedContext?.kind])

  const selectedClientIndexRow = useMemo(() => {
    if (section !== 'client') return null
    const id = selectedContext?.kind === 'private' ? selectedContext.transactionId : selectedClientTransactionId
    return id === 'all' ? null : clientScopedRows.find(row => row.transaction?.id === id) || null
  }, [clientScopedRows, section, selectedClientTransactionId, selectedContext])
  const clientWorkspace = useDocumentClientWorkspace(selectedClientIndexRow, documentScope, referenceData)
  const selectedClientWorkspace = clientWorkspace.data
  const referenceRefreshRef = useRef(null)
  useEffect(() => {
    referenceRefreshRef.current = async type => {
      if (!type.includes('document-requirements')) {
        if (indexCacheRef.current?.scope === documentScope) { indexCacheRef.current.loaded = false; indexCacheRef.current.options = null }
        await loadBaseData({ force: true })
      }
      await clientWorkspace.refresh({ force: true })
    }
  }, [documentScope, loadBaseData, clientWorkspace.refresh])
  useEffect(() => {
    const refresh = createCoalescedRefresh({ minIntervalMs: 200 })
    const stop = watchScopedReadInvalidation(referenceData, { onInvalidate(type) {
      void refresh.run(documentScope, () => referenceRefreshRef.current?.(type)).catch(() => {})
    } })
    return () => { stop(); refresh.cancel() }
  }, [referenceData, documentScope])
  const indexReady = unitIndex.scope === documentScope && !loading && !baseError
  useEffect(() => {
    if (section === 'client' && indexReady) markRouteMilestone('interactive_ready')
  }, [section, indexReady])

  const clientMandateDocuments = useMemo(() => {
    const mandateRows = (selectedClientWorkspace?.documents || [])
      .map((document) => {
        const model = buildSellerMandateDocumentModel(document)
        return {
          ...document,
          ...model,
        }
      })
      .filter((document) => document.isSellerMandate)
      .sort((left, right) => {
        const leftTimestamp = normalizeDocumentTimestamp(left?.updated_at || left?.created_at)
        const rightTimestamp = normalizeDocumentTimestamp(right?.updated_at || right?.created_at)
        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp
        }

        return (right?.sellerMandateVersionNumber || 0) - (left?.sellerMandateVersionNumber || 0)
      })

    return mandateRows
  }, [selectedClientWorkspace?.documents])

  const latestMandateDocument = clientMandateDocuments[0] || null
  const mandateHistoryDocuments = clientMandateDocuments.slice(1)

  const clientChecklistRows = useMemo(
    () => (selectedClientWorkspace?.requiredChecklist || []).filter((item) => !isMandateChecklistRequirement(item)),
    [selectedClientWorkspace?.requiredChecklist],
  )

  async function handleChecklistUpload(workspaceRow, item, file) {
    if (!file || !workspaceRow?.transaction?.id) return

    try {
      setUploadingKey(item.key)
      setError('')
      const saved = await uploadDocument({
        transactionId: workspaceRow.transaction.id,
        onProgress: setUploadProgress,
        file,
        category: item.label || 'General',
        requiredDocumentKey: item.key || null,
      })
      setUploadFailures((current) => {
        const next = { ...current }
        delete next[item.key]
        return next
      })
      await refreshAfterSavedDocumentUpload(saved, clientWorkspace.refresh, setError)
    } catch (uploadError) {
      const message = describeDocumentUploadFailure(uploadError)
      setUploadFailures((current) => ({
        ...current,
        [item.key]: {
          file,
          message,
        },
      }))
      setError(message)
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
      if (!developmentFile && !developmentDocumentForm.fileUrl.trim()) throw new Error('Choose a document file or enter its HTTPS link before saving.')
      const fields = {
        developmentId: selectedDevelopmentId,
        documentId: developmentDocumentForm.id || null,
        documentType: developmentDocumentForm.documentType,
        title: developmentDocumentForm.title,
        description: developmentDocumentForm.description,
      }
      const saved = developmentFile
        ? await uploadDevelopmentDocumentAsset({ ...fields, file: developmentFile, onProgress: setUploadProgress })
        : await saveDevelopmentDocument({ ...fields, documentId: null, supersedesDocumentId: fields.documentId, fileUrl: developmentDocumentForm.fileUrl })
      setDevelopmentDocumentForm({ id: '', documentType: 'other', title: '', description: '', fileUrl: '' })
      setDevelopmentFile(null)
      await refreshAfterSavedDocumentUpload(saved, async () => {
        const documents = await fetchDevelopmentDocuments(selectedDevelopmentId, { includeHistory: includeDevelopmentHistory })
        const detail = { documents, scope: documentScope, developmentId: selectedDevelopmentId }
        setDevelopmentDetail(detail)
      }, setError)
    } catch (saveError) {
      setError(describeDocumentUploadFailure(saveError))
      if (developmentFile) setUploadProgress({ stage: 'failed', fileName: developmentFile.name, message: describeDocumentUploadFailure(saveError) })
    } finally {
      setSavingDevelopmentDocument(false)
    }
  }

  async function handleDeleteDevelopmentDoc(documentId) {
    try {
      setSavingDevelopmentDocument(true)
      setError('')
      await deleteDevelopmentDocument(documentId)
      setDevelopmentDetail((current) => current ? { ...current, documents: current.documents.filter((item) => item.id !== documentId) } : current)
      try {
        const documents = await fetchDevelopmentDocuments(selectedDevelopmentId, { includeHistory: includeDevelopmentHistory })
        const detail = { documents, scope: documentScope, developmentId: selectedDevelopmentId }
        setDevelopmentDetail(detail)
      } catch {
        setError('Document removed, but the list could not be refreshed. Reopen the development to see the latest list.')
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove document.')
    } finally {
      setSavingDevelopmentDocument(false)
    }
  }

  const clientChecklistSummary = useMemo(() => {
    const uploadedCount = clientChecklistRows.filter((item) => item.complete).length
    const totalRequired = clientChecklistRows.length
    return {
      uploadedCount,
      missingCount: totalRequired - uploadedCount,
      totalRequired,
    }
  }, [clientChecklistRows])

  const groupedClientChecklist = useMemo(() => groupChecklistByCategory(clientChecklistRows), [clientChecklistRows])

  const developmentDocuments = useMemo(() => developmentDetail?.scope === documentScope && developmentDetail?.developmentId === selectedDevelopmentId ? developmentDetail.documents : [], [developmentDetail, documentScope, selectedDevelopmentId])

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

      <DocumentUploadProgress progress={uploadProgress} />
      {error ? (
        <p role="alert" className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}
      {baseError ? <div role="alert" className="rounded-[16px] border border-[#f3d2cc] bg-white p-5"><p>{baseError}</p><Button variant="secondary" onClick={() => void loadBaseData({ force: true })}>Retry document workspaces</Button></div> : null}

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
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#60758c]">
                <p>{unitWorkspaces.length} unit workspaces loaded. Choose a client to view their documents.</p>
                {selectedClientIndexRow ? <Button variant="secondary" disabled={clientWorkspace.loading} onClick={() => void clientWorkspace.refresh()}>Refresh client documents</Button> : null}
                {nextCursor !== null ? <Button variant="secondary" disabled={loadingMore} onClick={() => void loadBaseData({ append: true })}>{loadingMore ? 'Loading more…' : 'Load more clients'}</Button> : null}
              </div>
              {clientWorkspace.loading ? <p role="status">Loading client documents…</p> : null}
              {clientWorkspace.error ? <div role="alert"><p>{clientWorkspace.error}</p><Button onClick={() => void clientWorkspace.refresh()}>Retry client documents</Button></div> : null}

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
                        disabled={selectedContext?.kind === 'private'}
                      >
                        <option value="all">{selectedContext?.kind === 'private' ? 'Client selected from property context' : 'Choose a client / buyer'}</option>
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
                        placeholder="Search loaded clients, units, properties or stages"
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
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{clientChecklistSummary.uploadedCount}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="text-[0.74rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Missing</span>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{clientChecklistSummary.missingCount}</p>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="text-[0.74rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Required</span>
                        <p className="mt-2 text-xl font-semibold text-[#142132]">{clientChecklistSummary.totalRequired}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <SectionHeader
                      title="Seller mandate"
                      copy="Seller Profile generates the latest file and Documents stores its version history."
                      actions={
                        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                          {clientMandateDocuments.length} version{clientMandateDocuments.length === 1 ? '' : 's'}
                        </span>
                      }
                    />
                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                      <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] p-4">
                        {latestMandateDocument ? (
                          <div className="space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#dbe6f2] bg-white text-[#35546c]">
                                    <FileSignature size={18} />
                                  </span>
                                  <div>
                                    <p className="text-[0.98rem] font-semibold text-[#142132]">
                                      {latestMandateDocument?.sellerMandateTitle || latestMandateDocument?.name || latestMandateDocument?.title || 'Mandate'}
                                    </p>
                                    <p className="text-xs text-[#6b7d93]">
                                      {getMandateLifecycleLabel(latestMandateDocument)}
                                    </p>
                                  </div>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-[#5f7288]">
                                  The newest file is kept here so Documents stays the source of truth.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-xs font-semibold text-[#35546c]">
                                  Version {latestMandateDocument?.sellerMandateVersionNumber || 1}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(latestMandateDocument?.status || latestMandateDocument?.sellerMandateLifecycleState || 'uploaded')}`}>
                                  {normalizeLabel(latestMandateDocument?.status || latestMandateDocument?.sellerMandateLifecycleState || 'Uploaded')}
                                </span>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-[14px] border border-[#e4ebf4] bg-white px-4 py-3">
                                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Stored</span>
                                <p className="mt-1 text-sm font-semibold text-[#142132]">
                                  {formatDate(latestMandateDocument?.updated_at || latestMandateDocument?.created_at)}
                                </p>
                              </div>
                              <div className="rounded-[14px] border border-[#e4ebf4] bg-white px-4 py-3">
                                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Source</span>
                                <p className="mt-1 text-sm font-semibold text-[#142132]">Generated from Seller Profile</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {latestMandateDocument?.url ? (
                                <a
                                  href={latestMandateDocument.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-[10px] border border-[#dbe6f2] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                >
                                  <Download size={13} />
                                  Download latest file
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#dbe6f2] bg-white text-[#35546c]">
                              <FileSignature size={18} />
                            </span>
                            <div>
                              <p className="text-[0.98rem] font-semibold text-[#142132]">No seller mandate file yet</p>
                              <p className="mt-1 text-sm leading-6 text-[#5f7288]">
                                Generate it from Seller Profile and it will appear here automatically.
                              </p>
                            </div>
                          </div>
                        )}
                      </article>

                      <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] p-4">
                        <h4 className="text-sm font-semibold text-[#142132]">Version history</h4>
                        <div className="mt-3 space-y-3">
                          {mandateHistoryDocuments.length ? (
                            mandateHistoryDocuments.map((document) => (
                              <div key={document.id || `${document.document_type || 'mandate'}-${document.created_at || document.updated_at || ''}`} className="rounded-[14px] border border-[#e4ebf4] bg-white px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#142132]">
                                      {document?.sellerMandateTitle || document?.name || document?.title || 'Mandate'}
                                    </p>
                                    <p className="mt-1 text-xs text-[#6b7d93]">
                                      {getMandateLifecycleLabel(document)}
                                    </p>
                                  </div>
                                  <span className="inline-flex shrink-0 items-center rounded-full border border-[#dbe6f2] bg-[#f7f9fc] px-2.5 py-1 text-xs font-semibold text-[#35546c]">
                                    v{document?.sellerMandateVersionNumber || 1}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-[#6b7d93]">
                                  {formatDate(document?.updated_at || document?.created_at)}
                                </p>
                                {document?.url ? (
                                  <a
                                    href={document.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#35546c]"
                                  >
                                    <Download size={13} />
                                    Download
                                  </a>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#6b7d93]">No older versions yet.</p>
                          )}
                        </div>
                      </article>
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
                                {uploadFailures[item.key] ? (
                                  <p className="mt-1 flex items-start gap-1 text-xs font-medium text-[#b45309]">
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                    {uploadFailures[item.key].message}
                                  </p>
                                ) : null}
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
                                    type="file" title={DOCUMENT_UPLOAD_HELP_TEXT}
                                    accept={DOCUMENT_UPLOAD_ACCEPT}
                                    className="hidden"
                                    disabled={uploadingKey === item.key || !selectedClientWorkspace?.transaction?.id}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0]
                                      void handleChecklistUpload(selectedClientWorkspace, item, file)
                                      event.target.value = ''
                                    }}
                                  />
                                </label>
                                <span className="block text-xs font-normal text-slate-500">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
                                {uploadFailures[item.key]?.file ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleChecklistUpload(selectedClientWorkspace, item, uploadFailures[item.key].file)}
                                    disabled={uploadingKey === item.key || !selectedClientWorkspace?.transaction?.id}
                                    className="inline-flex items-center gap-1 rounded-[10px] border border-[#f2d6ac] bg-[#fffaf0] px-3 py-1.5 text-xs font-semibold text-[#9a5b13] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <RotateCcw size={13} />
                                    Retry {uploadFailures[item.key].file.name}
                                  </button>
                                ) : null}
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
                  {clientScopedRows.length ? 'Choose a client / buyer to view their document checklist.' : 'No client document context matches the selected filters.'}
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
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDevelopmentHistory} onChange={event => setIncludeDevelopmentHistory(event.target.checked)} />Show protected history</label>
                  </FilterBarGroup>
                </FilterBar>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <SectionHeader
                    title={developmentOptions.find((item) => item.id === selectedDevelopmentId)?.name || 'Development Documents'}
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
                                    <p className="mt-1 text-xs text-[#6b7d93]">{item.archivedAt ? 'Protected history · ' : ''}{item.description || 'No description'} • {formatDate(item.uploadedAt || item.createdAt)}</p>
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
                                      disabled={savingDevelopmentDocument || Boolean(item.archivedAt)}
                                      onClick={() => {
                                        setDevelopmentFile(null)
                                        setDevelopmentDocumentForm({
                                          id: item.id,
                                          documentType: item.documentType || 'other',
                                          title: item.title || '',
                                          description: item.description || '',
                                          fileUrl: item.fileUrl || '',
                                        })
                                      }}
                                    >
                                      Replace
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => void handleDeleteDevelopmentDoc(item.id)} disabled={savingDevelopmentDocument || Boolean(item.archivedAt)}>
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
                      <span className="text-sm font-semibold">Document file</span>
                      <input type="file" accept={DOCUMENT_UPLOAD_ACCEPT} disabled={savingDevelopmentDocument} onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        try {
                          validateDocumentUploadFile(file, { surface: 'development_asset' })
                          setDevelopmentFile(file)
                          setError('')
                        } catch (fileError) { setError(describeDocumentUploadFailure(fileError)) }
                        event.target.value = ''
                      }} />
                      {developmentFile ? <span className="text-xs">Selected: {developmentFile.name}</span> : null}
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
                          onClick={() => { setDevelopmentFile(null); setDevelopmentDocumentForm({ id: '', documentType: 'other', title: '', description: '', fileUrl: '' }) }}
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

          {section === 'company' ? <CompanyDocuments key={documentScope} actorId={profile?.id || ''}
            organisationId={currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id || ''}
            organisationName={currentWorkspace?.name || currentWorkspace?.organisationName || ''} /> : null}

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
