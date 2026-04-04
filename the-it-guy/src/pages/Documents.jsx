import { Download, FileUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Field from '../components/ui/Field'
import FilterBar, { FilterBarGroup } from '../components/ui/FilterBar'
import SearchInput from '../components/ui/SearchInput'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDocumentsByUnit, fetchTransactionsByParticipant, uploadDocument } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function Documents() {
  const { workspace, role, profile } = useWorkspace()
  const [unitWorkspaces, setUnitWorkspaces] = useState([])
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [developmentFilter, setDevelopmentFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [docStatusFilter, setDocStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const [error, setError] = useState('')
  const isBondRole = role === 'bond_originator'
  const isAttorneyRole = role === 'attorney'
  const workspaceLabel = isBondRole ? 'Applications' : isAttorneyRole ? 'Transfers' : 'Units'

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const baseData = await fetchDocumentsByUnit({
        developmentId: workspace.id === 'all' ? null : workspace.id,
      })

      let data = baseData
      const scopedRoleType =
        role === 'agent' ? 'agent' : role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : null
      if (scopedRoleType && profile?.id) {
        const participantRows = await fetchTransactionsByParticipant({ userId: profile.id, roleType: scopedRoleType })
        const allowedTransactionIds = new Set(participantRows.map((item) => item?.transaction?.id).filter(Boolean))
        data = baseData.filter((item) => allowedTransactionIds.has(item?.transaction?.id))
      }

      setUnitWorkspaces(data)
      setSelectedUnitId((previous) => {
        if (previous && data.some((item) => item.unit.id === previous)) {
          return previous
        }

        return data[0]?.unit.id || ''
      })
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, role, workspace.id])

  const filteredWorkspaces = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return unitWorkspaces.filter((item) => {
      if (query) {
        const haystack = [item.development?.name, item.unit?.unit_number, item.buyer?.name, item.stage]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(query)) {
          return false
        }
      }

      if (developmentFilter !== 'all' && String(item.development?.id || '') !== developmentFilter) {
        return false
      }

      if (stageFilter !== 'all' && String(item.stage || '').toLowerCase() !== stageFilter) {
        return false
      }

      if (docStatusFilter === 'outstanding' && Number(item.checklistSummary?.missingCount || 0) === 0) {
        return false
      }

      if (
        docStatusFilter === 'complete' &&
        Number(item.checklistSummary?.totalRequired || 0) !== Number(item.checklistSummary?.uploadedCount || 0)
      ) {
        return false
      }

      return true
    })
  }, [developmentFilter, docStatusFilter, searchTerm, stageFilter, unitWorkspaces])

  const selectedWorkspace = useMemo(
    () => filteredWorkspaces.find((item) => item.unit.id === selectedUnitId) || filteredWorkspaces[0] || null,
    [filteredWorkspaces, selectedUnitId],
  )

  const selectedOutstanding = useMemo(
    () => (selectedWorkspace?.requiredChecklist || []).filter((item) => !item.complete),
    [selectedWorkspace?.requiredChecklist],
  )

  const selectedCompleted = useMemo(
    () => (selectedWorkspace?.requiredChecklist || []).filter((item) => item.complete),
    [selectedWorkspace?.requiredChecklist],
  )
  const selectedTotalRequirements = Number(selectedWorkspace?.requiredChecklist?.length || 0)
  const selectedCompletionPercent = selectedTotalRequirements ? Math.round((selectedCompleted.length / selectedTotalRequirements) * 100) : 0

  const stageOptions = useMemo(
    () => ['all', ...new Set(unitWorkspaces.map((item) => String(item.stage || '').toLowerCase()).filter(Boolean))],
    [unitWorkspaces],
  )

  const developmentOptions = useMemo(
    () =>
      [
        { value: 'all', label: 'All' },
        ...Array.from(
          new Map(
            unitWorkspaces
              .filter((item) => item?.development?.id)
              .map((item) => [item.development.id, item.development?.name || 'Unknown Development']),
          ),
        ).map(([value, label]) => ({ value, label })),
      ],
    [unitWorkspaces],
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!filteredWorkspaces.length) {
      setSelectedUnitId('')
      return
    }

    if (!filteredWorkspaces.some((item) => item.unit.id === selectedUnitId)) {
      setSelectedUnitId(filteredWorkspaces[0].unit.id)
    }
  }, [filteredWorkspaces, selectedUnitId])

  async function handleChecklistUpload(item, file) {
    if (!file || !selectedWorkspace?.transaction?.id) {
      return
    }

    try {
      setUploadingKey(item.key)
      setError('')
      await uploadDocument({
        transactionId: selectedWorkspace.transaction.id,
        file,
        category: item.label || 'General',
        requiredDocumentKey: item.key || null,
      })
      await loadData()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload document.')
    } finally {
      setUploadingKey('')
    }
  }

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
          <section className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <FilterBar>
              <FilterBarGroup className="gap-4 lg:flex-none">
                <label className="flex min-w-[170px] flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
                  <Field as="select" value={developmentFilter} onChange={(event) => setDevelopmentFilter(event.target.value)}>
                    {developmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="flex min-w-[150px] flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Stage</span>
                  <Field as="select" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                    <option value="all">All</option>
                    {stageOptions
                      .filter((value) => value !== 'all')
                      .map((value) => (
                        <option key={value} value={value}>
                          {value
                            .split(' ')
                            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                            .join(' ')}
                        </option>
                      ))}
                  </Field>
                </label>

                <label className="flex min-w-[160px] flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Documents</span>
                  <Field as="select" value={docStatusFilter} onChange={(event) => setDocStatusFilter(event.target.value)}>
                    <option value="all">All</option>
                    <option value="outstanding">Outstanding</option>
                    <option value="complete">Complete</option>
                  </Field>
                </label>
              </FilterBarGroup>

              <FilterBarGroup className="min-w-[320px] lg:ml-auto lg:max-w-[460px] lg:justify-end">
                <div className="flex w-full flex-col gap-2">
                  <span aria-hidden className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-transparent">
                    Search
                  </span>
                  <SearchInput
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Search by ${isBondRole ? 'application' : isAttorneyRole ? 'transfer' : 'unit'}, buyer, or stage`}
                  />
                </div>
              </FilterBarGroup>
            </FilterBar>
          </section>

          <section className="grid gap-8 xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
            <section className="rounded-[22px] border border-[#dde4ee] bg-white p-7 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <SectionHeader
                title={workspaceLabel}
                actions={
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    {unitWorkspaces.length} {isBondRole ? 'application' : isAttorneyRole ? 'transaction' : 'unit'} workspaces
                  </span>
                }
              />

              <div className="mt-8 max-h-[920px] overflow-y-auto pr-1">
                <div className="grid gap-4">
                  {filteredWorkspaces.map((workspaceItem) => {
                    const isActive = workspaceItem.unit.id === selectedWorkspace?.unit.id
                    const uploadedCount = workspaceItem.checklistSummary?.uploadedCount || 0
                    const totalRequired = workspaceItem.checklistSummary?.totalRequired || 0
                    const completionPercent = totalRequired ? Math.round((uploadedCount / totalRequired) * 100) : 0

                    return (
                      <button
                        key={workspaceItem.unit.id}
                        type="button"
                        className={`overflow-hidden rounded-[20px] border text-left transition duration-150 ease-out ${
                          isActive
                            ? 'border-[#a8c3de] bg-[#f8fbff] shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                            : 'border-[#dde4ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:border-[#ccd6e3] hover:bg-[#fbfdff]'
                        }`}
                        onClick={() => setSelectedUnitId(workspaceItem.unit.id)}
                      >
                        <div className="flex items-center justify-between bg-[#496b88] px-5 py-4 text-white">
                          <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#eef5fb]">
                            {workspaceItem.development?.name || 'Unknown Development'}
                          </span>
                          <strong className="text-[1rem] font-semibold tracking-[-0.02em]">
                            Unit {workspaceItem.unit.unit_number}
                          </strong>
                        </div>

                        <div className="flex flex-col gap-5 px-5 py-5">
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">
                              {workspaceItem.buyer?.name || 'No buyer assigned'}
                            </p>
                            <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                              {workspaceItem.stage}
                            </span>
                          </div>

                          <div className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="text-[0.88rem] font-medium text-[#70839a]">Documents</span>
                              <strong className="text-[1rem] font-semibold text-[#162334]">
                                {uploadedCount}/{totalRequired}
                              </strong>
                            </div>
                            <small className="block text-[0.82rem] text-[#7b8ca2]">Required docs uploaded</small>
                            <div className="mt-3 h-3 rounded-full bg-[#e9eff6]" aria-hidden>
                              <div className="h-full rounded-full bg-[#7fa7cc]" style={{ width: `${completionPercent}%` }} />
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <em className={`text-[0.92rem] font-semibold not-italic ${uploadedCount > 0 && uploadedCount === totalRequired ? 'text-[#1c8b4a]' : 'text-[#d17a00]'}`}>
                              {uploadedCount > 0 && uploadedCount === totalRequired ? 'Documents ready' : 'Documents pending'}
                            </em>
                            <span className="text-[0.92rem] font-semibold text-[#2563eb]">
                              {isActive ? 'Viewing details' : 'Select workspace →'}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {!filteredWorkspaces.length ? (
                    <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                      No unit document workspaces match these filters.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {selectedWorkspace ? (
              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-7 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <SectionHeader
                  title={`${selectedWorkspace.development?.name} • Unit ${selectedWorkspace.unit.unit_number}`}
                  copy={`${selectedWorkspace.buyer?.name || 'No buyer assigned'} • ${selectedWorkspace.stage}`}
                />

                <section className="mt-8 rounded-[22px] border border-[#e4ebf4] bg-[#fbfcfe] p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Progress</span>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <strong className="text-[2.6rem] font-semibold tracking-[-0.05em] text-[#142132]">
                          {selectedCompleted.length}/{selectedTotalRequirements}
                        </strong>
                        <span className="pb-1 text-sm font-medium text-[#6b7d93]">
                          {selectedOutstanding.length} outstanding
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                      {selectedCompletionPercent}% complete
                    </span>
                  </div>
                  <div className="mt-4 h-3 rounded-full bg-[#e9eff6]" aria-hidden>
                    <div className="h-full rounded-full bg-[#7fa7cc]" style={{ width: `${selectedCompletionPercent}%` }} />
                  </div>
                </section>

                <section className="mt-6 rounded-[20px] border border-[#e4ebf4] bg-[#fbfcfe] p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Outstanding Documents</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Upload the remaining documents needed for this workspace.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#f2d8a7] bg-[#fff7e9] px-3 py-1 text-[0.78rem] font-semibold text-[#8a5a15]">
                      {selectedOutstanding.length}
                    </span>
                  </div>
                  <ul className="mt-5 flex flex-col gap-3">
                    {selectedOutstanding.map((item) => (
                      <li key={item.key} className="flex flex-col gap-4 rounded-[16px] border border-[#f4e0b7] bg-[#fff7e9] px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <strong className="block text-[0.98rem] font-semibold text-[#8a5a15]">{item.label}</strong>
                          <p className="mt-1 text-sm text-[#aa7a34]">Required before this workspace can be treated as complete.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#e1c27f] bg-white px-3 py-2 text-sm font-semibold text-[#8a5a15] transition duration-150 ease-out hover:bg-[#fffdf8]">
                            <FileUp size={14} />
                            {uploadingKey === item.key ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingKey === item.key || !selectedWorkspace?.transaction?.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                void handleChecklistUpload(item, file)
                                event.target.value = ''
                              }}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                    {!selectedOutstanding.length ? (
                      <li className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No missing requirements.
                      </li>
                    ) : null}
                  </ul>
                </section>

                <section className="mt-6 rounded-[20px] border border-[#e4ebf4] bg-[#fbfcfe] p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Completed</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Download completed files or upload a replacement version.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#d6ece0] bg-[#edfdf3] px-3 py-1 text-[0.78rem] font-semibold text-[#1c7d45]">
                      {selectedCompleted.length}
                    </span>
                  </div>
                  <ul className="mt-5 flex flex-col gap-3">
                    {selectedCompleted.map((item) => (
                      <li key={item.key} className="flex flex-col gap-4 rounded-[16px] border border-[#d6ece0] bg-[#edfdf3] px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <strong className="block text-[0.98rem] font-semibold text-[#1c7d45]">{item.label}</strong>
                          <p className="mt-1 truncate text-sm text-[#478c64]">{item.matchedDocument?.name || 'Uploaded file available'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {item.matchedDocument?.url ? (
                            <a
                              href={item.matchedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#bfe3ce] bg-white px-3 py-2 text-sm font-semibold text-[#1c7d45] transition duration-150 ease-out hover:bg-[#f8fffb]"
                            >
                              <Download size={14} />
                              Download
                            </a>
                          ) : null}
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#bfe3ce] bg-white px-3 py-2 text-sm font-semibold text-[#1c7d45] transition duration-150 ease-out hover:bg-[#f8fffb]">
                            <FileUp size={14} />
                            {uploadingKey === item.key ? 'Uploading…' : 'Upload New'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingKey === item.key || !selectedWorkspace?.transaction?.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                void handleChecklistUpload(item, file)
                                event.target.value = ''
                              }}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                    {!selectedCompleted.length ? (
                      <li className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No completed requirements yet.
                      </li>
                    ) : null}
                  </ul>
                </section>

                {!selectedWorkspace?.transaction?.id ? (
                  <div className="mt-6 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
                    Create a transaction first to upload documents from this view.
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="rounded-[22px] border border-[#dde4ee] bg-white px-8 py-10 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">No workspace selected</h3>
                <p className="mt-3 text-[0.98rem] leading-7 text-[#6b7d93]">
                  Choose a unit from the left to review its document checklist.
                </p>
              </section>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}

export default Documents
