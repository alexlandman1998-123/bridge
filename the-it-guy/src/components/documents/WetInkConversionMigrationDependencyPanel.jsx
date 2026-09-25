import { AlertTriangle, DatabaseZap, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import {
  WET_INK_CONVERSION_MIGRATION_DEPENDENCY_TYPES,
  WET_INK_CONVERSION_MIGRATION_REVIEW_STATUSES,
} from '../../services/wetInkConversionMigrationDependencyService'

const DEPENDENCY_LABELS = {
  [WET_INK_CONVERSION_MIGRATION_DEPENDENCY_TYPES.HISTORICAL_TRANSACTION_WITHOUT_WET_INK]: 'Historical transaction without wet-ink evidence',
  [WET_INK_CONVERSION_MIGRATION_DEPENDENCY_TYPES.OFFER_TRANSACTION_LINK_MISMATCH]: 'Offer-to-transaction link needs review',
  [WET_INK_CONVERSION_MIGRATION_DEPENDENCY_TYPES.ACCEPTED_OFFER_MISSING_CONVERSION_FACTS]: 'Accepted offer is missing conversion facts',
}

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function initialDraft(dependency = {}) {
  return {
    reviewStatus: dependency.reviewStatus === 'pending' ? 'reviewed_historical' : dependency.reviewStatus,
    reviewNote: dependency.reviewNote || '',
  }
}

export default function WetInkConversionMigrationDependencyPanel({
  dependencies = [],
  loading = false,
  error = '',
  savingDependencyId = '',
  onRefresh = null,
  onResolve = null,
}) {
  const [drafts, setDrafts] = useState({})

  if (!loading && !error && !dependencies.length) return null

  const updateDraft = (dependency, patch) => {
    setDrafts((current) => ({
      ...current,
      [dependency.id]: { ...initialDraft(dependency), ...current[dependency.id], ...patch },
    }))
  }

  return (
    <article className="rounded-[18px] border border-[#f0d7a8] bg-[#fffaf0] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]" data-testid="wet-ink-conversion-migration-dependencies">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#fff1d4] text-[#9a6512]"><DatabaseZap size={19} /></span>
          <div>
            <h3 className="text-base font-semibold text-[#5d4213]">Wet-ink conversion migration review</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#7a5a23]">Historical gaps are preserved for review. Recording an outcome does not create evidence, alter an existing transaction, or permit a new conversion.</p>
          </div>
        </div>
        {onRefresh ? <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#e8ce9c] bg-white px-3 text-xs font-semibold text-[#76531a] disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Refresh queue</button> : null}
      </div>

      {error ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#edcf99] bg-white px-3 py-2 text-xs leading-5 text-[#7a5a23]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p> : null}
      {loading ? <p role="status" className="mt-4 text-sm font-medium text-[#7a5a23]">Loading conversion migration dependencies…</p> : null}

      <div className="mt-4 space-y-3">
        {dependencies.map((dependency) => {
          const draft = { ...initialDraft(dependency), ...drafts[dependency.id] }
          const busy = savingDependencyId === dependency.id
          const isPending = dependency.reviewStatus === 'pending'
          return (
            <section key={dependency.id} className="rounded-[14px] border border-[#eadab8] bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#3f321d]">{DEPENDENCY_LABELS[dependency.dependencyType] || 'Conversion migration dependency'}</p>
                  <p className="mt-1 text-xs leading-5 text-[#766247]">Last detected {formatDate(dependency.lastDetectedAt)} · Offer {dependency.offerId ? `${dependency.offerId.slice(0, 8)}…` : 'not linked'} · Transaction {dependency.transactionId ? `${dependency.transactionId.slice(0, 8)}…` : 'not linked'}</p>
                  <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isPending ? 'bg-[#fff4da] text-[#8a5e13]' : 'bg-[#edf8f0] text-[#257345]'}`}>{isPending ? 'Awaiting migration review' : dependency.reviewStatus.replaceAll('_', ' ')}</p>
                </div>
                <p className="max-w-sm text-xs leading-5 text-[#7b694f]">{dependency.sourceSnapshot?.reason || 'Review the linked historical records before deployment.'}</p>
              </div>

              {isPending ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold text-[#5b482b]">Review outcome
                      <select value={draft.reviewStatus} disabled={busy} onChange={(event) => updateDraft(dependency, { reviewStatus: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-lg border border-[#dfcfaf] bg-white px-3 text-sm font-medium text-[#42351f] outline-none focus:border-[#b98735] disabled:opacity-60">
                        {WET_INK_CONVERSION_MIGRATION_REVIEW_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-[#5b482b]">Review note
                    <textarea value={draft.reviewNote} disabled={busy} onChange={(event) => updateDraft(dependency, { reviewNote: event.target.value })} rows={3} minLength={20} className="mt-1.5 w-full resize-y rounded-lg border border-[#dfcfaf] bg-white px-3 py-2 text-sm text-[#42351f] outline-none focus:border-[#b98735] disabled:opacity-60" placeholder="Record the historical facts and required remediation or disposition." />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-[#7b694f]">This is an audit decision only; it cannot make an unsigned historical record eligible for conversion.</p>
                    <button type="button" disabled={busy || draft.reviewNote.trim().length < 20} onClick={() => void onResolve?.(dependency, draft)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#70531c] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}{busy ? 'Saving…' : 'Record outcome'}</button>
                  </div>
                </>
              ) : null}
            </section>
          )
        })}
      </div>
    </article>
  )
}
