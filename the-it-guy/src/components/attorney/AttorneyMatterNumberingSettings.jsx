import { useEffect, useMemo, useState } from 'react'
import {
  ATTORNEY_MATTER_NUMBER_LANES,
  buildAttorneyMatterNumberingDraft,
  formatAttorneyMatterNumberPreview,
  getAttorneyMatterNumberingLaunchMetrics,
  getAttorneyMatterNumberingReadiness,
  getAttorneyMatterNumberingSettings,
  getNextAttorneyMatterSequence,
  saveAttorneyMatterNumberingSettings,
  validateAttorneyMatterNumberSetting,
} from '../../services/attorneyMatterNumberingService'

const LANE_LABELS = Object.freeze({
  all: 'Firm default',
  transfer: 'Transfer matters',
  bond: 'Bond matters',
  cancellation: 'Cancellation matters',
})

const READINESS_PRESENTATION = Object.freeze({
  READY: { label: 'Ready', className: 'border-[#b9e1c9] bg-[#f2fbf5] text-[#1f7a45]' },
  READY_WITH_WARNINGS: { label: 'Ready with warnings', className: 'border-[#f3d9a8] bg-[#fff8ec] text-[#8a5b08]' },
  NEEDS_BACKFILL: { label: 'Backfill required', className: 'border-[#f3d9a8] bg-[#fff8ec] text-[#8a5b08]' },
  BLOCKED: { label: 'Release blocked', className: 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]' },
  UNKNOWN: { label: 'Check unavailable', className: 'border-[#d9e4ef] bg-[#f7f9fc] text-[#607387]' },
})

const READINESS_ISSUE_LABELS = Object.freeze({
  missing_matter_files: 'Missing active matter files',
  unresolved_platform_references: 'Unresolved platform references',
  duplicate_effective_references: 'Duplicate effective references',
  invalid_reference_states: 'Invalid confirmation states',
  missing_reference_history: 'Missing audit history',
  orphan_matter_files: 'Files without an active assignment',
})

function formatChangedAt(value) {
  if (!value) return 'Unknown time'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function NumberingFields({ setting, disabled, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Prefix
        <input className="ui-input" value={setting.prefix} maxLength={32} disabled={disabled} onChange={(event) => onChange('prefix', event.target.value)} placeholder="YL" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Suffix <span className="font-normal text-[#7b8da6]">Optional</span>
        <input className="ui-input" value={setting.suffix} maxLength={32} disabled={disabled} onChange={(event) => onChange('suffix', event.target.value)} placeholder="TRF" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Separator
        <input className="ui-input" value={setting.separator} maxLength={5} disabled={disabled} onChange={(event) => onChange('separator', event.target.value)} placeholder="-" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Sequence digits
        <input className="ui-input" type="number" min="1" max="12" value={setting.sequencePadding} disabled={disabled} onChange={(event) => onChange('sequencePadding', Number(event.target.value))} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-[#24364b]">
        <input type="checkbox" checked={setting.enabled !== false} disabled={disabled} onChange={(event) => onChange('enabled', event.target.checked)} />
        Generate provisional numbers
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-[#24364b]">
        <input type="checkbox" checked={setting.includeYear !== false} disabled={disabled} onChange={(event) => onChange('includeYear', event.target.checked)} />
        Include year
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Year format
        <select className="ui-select" value={setting.yearFormat} disabled={disabled || setting.includeYear === false} onChange={(event) => onChange('yearFormat', event.target.value)}>
          <option value="YYYY">2026</option>
          <option value="YY">26</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#24364b]">
        Sequence reset
        <select className="ui-select" value={setting.resetFrequency} disabled={disabled} onChange={(event) => onChange('resetFrequency', event.target.value)}>
          <option value="annual">Reset every year</option>
          <option value="continuous">Never reset</option>
        </select>
      </label>
    </div>
  )
}

export default function AttorneyMatterNumberingSettings({ firmId, canManage }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [draft, setDraft] = useState(() => buildAttorneyMatterNumberingDraft())
  const [savedDraft, setSavedDraft] = useState(() => buildAttorneyMatterNumberingDraft())
  const [sequences, setSequences] = useState([])
  const [history, setHistory] = useState([])
  const [readiness, setReadiness] = useState(null)
  const [readinessError, setReadinessError] = useState('')
  const [refreshingReadiness, setRefreshingReadiness] = useState(false)
  const [launchMetrics, setLaunchMetrics] = useState(null)
  const [launchMetricsError, setLaunchMetricsError] = useState('')

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedDraft), [draft, savedDraft])

  useEffect(() => {
    let active = true
    async function load() {
      if (!firmId) return
      setLoading(true)
      setError('')
      setReadinessError('')
      setLaunchMetricsError('')
      try {
        const [result, readinessResult, launchMetricsResult] = await Promise.all([
          getAttorneyMatterNumberingSettings(firmId),
          canManage
            ? getAttorneyMatterNumberingReadiness(firmId).catch((readinessLoadError) => {
              if (active) setReadinessError(readinessLoadError?.message || 'Unable to assess rollout readiness.')
              return null
            })
            : Promise.resolve(null),
          canManage
            ? getAttorneyMatterNumberingLaunchMetrics(firmId).catch((metricsLoadError) => {
              if (active) setLaunchMetricsError(metricsLoadError?.message || 'Unable to load launch telemetry.')
              return null
            })
            : Promise.resolve(null),
        ])
        if (!active) return
        const nextDraft = buildAttorneyMatterNumberingDraft(result.settings)
        setDraft(nextDraft)
        setSavedDraft(nextDraft)
        setSequences(result.sequences)
        setHistory(result.history)
        setReadiness(readinessResult)
        setLaunchMetrics(launchMetricsResult)
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Unable to load matter-number settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [canManage, firmId])

  async function refreshReadiness() {
    setRefreshingReadiness(true)
    setReadinessError('')
    setLaunchMetricsError('')
    try {
      const [readinessResult, launchMetricsResult] = await Promise.allSettled([
        getAttorneyMatterNumberingReadiness(firmId),
        getAttorneyMatterNumberingLaunchMetrics(firmId),
      ])
      if (readinessResult.status === 'fulfilled') setReadiness(readinessResult.value)
      else setReadinessError(readinessResult.reason?.message || 'Unable to assess rollout readiness.')
      if (launchMetricsResult.status === 'fulfilled') setLaunchMetrics(launchMetricsResult.value)
      else setLaunchMetricsError(launchMetricsResult.reason?.message || 'Unable to load launch telemetry.')
    } finally {
      setRefreshingReadiness(false)
    }
  }

  function updateSetting(lane, field, value) {
    setSuccess('')
    setDraft((previous) => ({
      ...previous,
      [lane]: { ...previous[lane], [field]: value },
    }))
  }

  function setUseFirmDefault(lane, useFirmDefault) {
    setSuccess('')
    setDraft((previous) => ({
      ...previous,
      [lane]: useFirmDefault
        ? { ...previous.all, lane, useFirmDefault: true }
        : { ...previous.all, lane, useFirmDefault: false },
    }))
  }

  function getEffectiveSetting(lane) {
    const setting = draft[lane]
    if (lane !== 'all' && setting.useFirmDefault) return { ...draft.all, lane: 'all' }
    return setting
  }

  async function handleSave() {
    const configured = [draft.all, ...ATTORNEY_MATTER_NUMBER_LANES
      .filter((lane) => !draft[lane].useFirmDefault)
      .map((lane) => draft[lane])]
    const firstError = configured.flatMap((setting) => validateAttorneyMatterNumberSetting(setting))[0]
    if (firstError) {
      setError(firstError)
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await saveAttorneyMatterNumberingSettings(firmId, draft)
      const refreshed = await getAttorneyMatterNumberingSettings(firmId)
      const nextDraft = buildAttorneyMatterNumberingDraft(refreshed.settings)
      setDraft(nextDraft)
      setSavedDraft(nextDraft)
      setSequences(refreshed.sequences)
      setHistory(refreshed.history)
      setSuccess('Matter-number settings saved. Existing matters were not renumbered.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save matter-number settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-[16px] border border-[#e1e9f1] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
      <div className="space-y-1">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8da6]">Filing system</span>
        <h2 className="text-xl font-semibold text-[#162334]">Matter numbering</h2>
        <p className="max-w-3xl text-sm leading-6 text-[#607387]">
          Generate a provisional number when a firm matter is opened. The filing number can still be replaced later without changing the Arch9 reference.
        </p>
      </div>

      {!canManage ? (
        <div className="mt-4 rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5b08]">
          You can view these rules, but only firm administrators and directors can change them.
        </div>
      ) : null}
      {error ? <div className="mt-4 rounded-[12px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}
      {success ? <div className="mt-4 rounded-[12px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{success}</div> : null}

      {loading ? (
        <div className="mt-5 rounded-[14px] border border-dashed border-[#d9e4ef] bg-[#f9fbfe] px-5 py-12 text-center text-sm text-[#6b7d93]">Loading matter-number settings…</div>
      ) : (
        <div className="mt-5 space-y-4">
          {canManage ? (
            <article className="rounded-[14px] border border-[#e3eaf2] bg-[#fbfcfe] p-4" data-testid="matter-numbering-readiness">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8da6]">Phase 7 rollout gate</span>
                  <h3 className="mt-1 text-base font-semibold text-[#162334]">Matter-number readiness</h3>
                  <p className="mt-1 text-sm text-[#6b7d93]">Checks active-file coverage, reference uniqueness, state integrity, and audit history without changing any data.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${READINESS_PRESENTATION[readiness?.status]?.className || READINESS_PRESENTATION.UNKNOWN.className}`}>
                    {READINESS_PRESENTATION[readiness?.status]?.label || READINESS_PRESENTATION.UNKNOWN.label}
                  </span>
                  <button type="button" className="min-h-9 rounded-[9px] border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#40556d] disabled:opacity-50" disabled={refreshingReadiness} onClick={refreshReadiness}>
                    {refreshingReadiness ? 'Checking…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {readinessError ? (
                <div className="mt-3 rounded-[10px] border border-[#f3d9a8] bg-[#fff8ec] px-3 py-2 text-sm text-[#8a5b08]">{readinessError}</div>
              ) : null}

              {readiness ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-[11px] border border-[#e3eaf2] bg-white px-3 py-3">
                      <span className="block text-xs text-[#718399]">Active-file coverage</span>
                      <strong className="mt-1 block text-lg text-[#162334]">{readiness.coveragePercent}%</strong>
                      <span className="text-xs text-[#7b8da6]">{readiness.coveredFileCount} of {readiness.expectedFileCount}</span>
                    </div>
                    <div className="rounded-[11px] border border-[#e3eaf2] bg-white px-3 py-3">
                      <span className="block text-xs text-[#718399]">Missing files</span>
                      <strong className="mt-1 block text-lg text-[#162334]">{readiness.missingFileCount}</strong>
                      <span className="text-xs text-[#7b8da6]">Requires controlled backfill</span>
                    </div>
                    <div className="rounded-[11px] border border-[#e3eaf2] bg-white px-3 py-3">
                      <span className="block text-xs text-[#718399]">Duplicate references</span>
                      <strong className="mt-1 block text-lg text-[#162334]">{readiness.duplicateReferenceGroupCount}</strong>
                      <span className="text-xs text-[#7b8da6]">Case-insensitive groups</span>
                    </div>
                    <div className="rounded-[11px] border border-[#e3eaf2] bg-white px-3 py-3">
                      <span className="block text-xs text-[#718399]">Audit-history gaps</span>
                      <strong className="mt-1 block text-lg text-[#162334]">{readiness.historyGapCount}</strong>
                      <span className="text-xs text-[#7b8da6]">Numbered files without history</span>
                    </div>
                  </div>
                  {readiness.issueCodes.length ? (
                    <p className="text-xs text-[#6b7d93]">
                      Operational flags: {readiness.issueCodes.map((issueCode) => READINESS_ISSUE_LABELS[issueCode] || issueCode).join(' · ')}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-[#1f7a45]">No numbering integrity issues detected.</p>
                  )}

                  <div className="border-t border-[#e6edf4] pt-3" data-testid="matter-numbering-launch-telemetry">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8da6]">Phase 8 launch telemetry</span>
                        <p className="mt-1 text-xs text-[#6b7d93]">Aggregate activity only. No matter numbers, transaction IDs, or user identities are exposed.</p>
                      </div>
                      {launchMetrics ? (
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${launchMetrics.status === 'HEALTHY' ? READINESS_PRESENTATION.READY.className : launchMetrics.status === 'ATTENTION' ? READINESS_PRESENTATION.READY_WITH_WARNINGS.className : READINESS_PRESENTATION.BLOCKED.className}`}>
                          {launchMetrics.status === 'HEALTHY' ? 'Healthy' : launchMetrics.status === 'ATTENTION' ? 'Attention' : 'Blocked'} · {launchMetrics.windowHours}h
                        </span>
                      ) : null}
                    </div>
                    {launchMetricsError ? <p className="mt-2 text-xs text-[#8a5b08]">{launchMetricsError}</p> : null}
                    {launchMetrics ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['Files opened', launchMetrics.activity.filesOpened],
                          ['Generated', launchMetrics.activity.referencesGenerated],
                          ['Confirmed', launchMetrics.activity.referencesConfirmed],
                          ['Changed', launchMetrics.activity.referencesChanged],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[9px] bg-white px-3 py-2">
                            <span className="block text-[0.68rem] text-[#7b8da6]">{label}</span>
                            <strong className="text-sm text-[#24364b]">{value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          ) : null}

          {['all', ...ATTORNEY_MATTER_NUMBER_LANES].map((lane) => {
            const setting = draft[lane]
            const effectiveSetting = getEffectiveSetting(lane)
            const nextSequence = getNextAttorneyMatterSequence(sequences, effectiveSetting)
            const preview = formatAttorneyMatterNumberPreview(effectiveSetting, nextSequence)
            const inherited = lane !== 'all' && setting.useFirmDefault
            return (
              <article key={lane} className="rounded-[14px] border border-[#e3eaf2] bg-[#fbfcfe] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#162334]">{LANE_LABELS[lane]}</h3>
                    <p className="mt-1 text-sm text-[#6b7d93]">
                      {lane === 'all' ? 'Used whenever a lane-specific override is not configured.' : inherited ? 'Currently inherits the firm default.' : 'Uses its own prefix, suffix, and sequence.'}
                    </p>
                  </div>
                  {lane !== 'all' ? (
                    <label className="flex items-center gap-2 text-sm font-medium text-[#24364b]">
                      <input type="checkbox" checked={inherited} disabled={!canManage || saving} onChange={(event) => setUseFirmDefault(lane, event.target.checked)} />
                      Use firm default
                    </label>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[12px] border border-[#dce8e2] bg-[#f5faf7] px-4 py-3">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#66806f]">Next-number preview</span>
                  <strong className="mt-1 block font-mono text-base text-[#174d32]">
                    {preview || 'Automatic numbering disabled'}
                  </strong>
                </div>

                <div className="mt-4">
                  <NumberingFields
                    setting={inherited ? effectiveSetting : setting}
                    disabled={!canManage || saving || inherited}
                    onChange={(field, value) => updateSetting(lane, field, value)}
                  />
                </div>
              </article>
            )
          })}

          {canManage ? (
            <div className="flex flex-col-reverse gap-3 border-t border-[#e6edf4] pt-4 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" className="min-h-10 rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] disabled:opacity-50" disabled={!dirty || saving} onClick={() => { setDraft(savedDraft); setError(''); setSuccess('') }}>
                Discard changes
              </button>
              <button type="button" className="min-h-10 rounded-[10px] bg-[#0f7f4f] px-4 text-sm font-semibold text-white disabled:bg-[#cbd8e5]" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save numbering rules'}
              </button>
            </div>
          ) : null}

          {history.length ? (
            <div className="border-t border-[#e6edf4] pt-4">
              <h3 className="text-sm font-semibold text-[#24364b]">Recent changes</h3>
              <ul className="mt-2 divide-y divide-[#edf2f6]">
                {history.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-[#40556d]">{LANE_LABELS[entry.lane] || entry.lane} {entry.changeType}</span>
                    <time className="text-[#7b8da6]" dateTime={entry.changedAt || undefined}>{formatChangedAt(entry.changedAt)}</time>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
