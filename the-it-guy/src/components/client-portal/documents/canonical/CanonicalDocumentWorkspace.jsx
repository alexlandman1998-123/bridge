import { createElement, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, FolderOpen, ShieldAlert } from 'lucide-react'
import {
  WORKFLOW_GATE_LABELS,
  buildCanonicalDocumentWorkspaceModel,
  formatCanonicalLabel,
  isCanonicalReadinessUiEnabled,
} from '../../../../services/documents/canonicalDocumentWorkspaceService'
import DocumentPackSection from './DocumentPackSection'
import RequirementCard from './RequirementCard'

function MiniMetric({ label, value, tone = 'neutral' }) {
  const classes = {
    neutral: 'border-[#dbe5ef] bg-[#f8fbff] text-[#142132]',
    good: 'border-[#ccebd8] bg-[#f0fbf4] text-[#1f7d44]',
    warn: 'border-[#f7d6b7] bg-[#fff7ed] text-[#9a4d00]',
    bad: 'border-[#f4b7b7] bg-[#fff1f1] text-[#b42318]',
  }
  return (
    <div className={`rounded-[16px] border px-3 py-3 ${classes[tone] || classes.neutral}`}>
      <p className="text-xl font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] opacity-75">{label}</p>
    </div>
  )
}

function GateReadinessPanel({ gates = [] }) {
  const visibleGates = gates.filter((gate) => gate.totalCount > 0 || gate.blockingCount > 0)
  if (!visibleGates.length || !isCanonicalReadinessUiEnabled()) return null

  return (
    <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Transaction Readiness</h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Workflow gates show which document packs are still holding up progress.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleGates.map((gate) => (
          <article key={gate.gate} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#142132]">{gate.label || WORKFLOW_GATE_LABELS[gate.gate] || formatCanonicalLabel(gate.gate)}</p>
                <p className="mt-1 text-xs text-[#6b7d93]">{gate.blockingCount ? `${gate.blockingCount} blocker document${gate.blockingCount === 1 ? '' : 's'} missing` : 'No blockers'}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${gate.ready ? 'bg-[#f0fbf4] text-[#1f7d44]' : 'bg-[#fff7ed] text-[#9a4d00]'}`}>
                {gate.percentReady}%
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[#e4edf6]">
              <div className={`h-full rounded-full ${gate.ready ? 'bg-[#2e9b5d]' : 'bg-[#d97706]'}`} style={{ width: `${Math.min(Math.max(gate.percentReady || 0, 0), 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FocusSection({ title, subtitle, icon: Icon, items = [], emptyState = '', tone = 'neutral', uploadingDocumentKey, openingDocumentPath, onUpload, onOpenDocument }) {
  const toneClass = tone === 'bad'
    ? 'border-[#f4b7b7] bg-[#fff8f8]'
    : tone === 'warn'
      ? 'border-[#f7d6b7] bg-[#fffaf5]'
      : 'border-[#dbe5ef] bg-white'
  return (
    <section className={`rounded-[22px] border p-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/60 bg-white text-[#35546c] shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
          {Icon ? createElement(Icon, { size: 18 }) : null}
        </span>
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {items.length ? items.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />
        )) : (
          <p className="rounded-[14px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#6b7d93]">{emptyState}</p>
        )}
      </div>
    </section>
  )
}

function CanonicalDocumentWorkspace({
  requirements = [],
  documentCenter = {},
  role = 'seller',
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const model = useMemo(
    () => buildCanonicalDocumentWorkspaceModel({ requirements, documentCenter, role }),
    [documentCenter, requirements, role],
  )
  const initialExpanded = model.packs.filter((pack) => pack.blockerCount || pack.missingCount).slice(0, 3).map((pack) => pack.key)
  const [expandedPacks, setExpandedPacks] = useState(() => new Set(initialExpanded))

  if (!model.hasRequirements) {
    return (
      <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-3">
          <FolderOpen size={22} className="mt-1 text-[#35546c]" />
          <div>
            <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">Document Data Room</h3>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">No canonical document requirements are available yet. The existing document centre remains available.</p>
          </div>
        </div>
      </section>
    )
  }

  const togglePack = (packKey) => {
    setExpandedPacks((previous) => {
      const next = new Set(previous)
      if (next.has(packKey)) next.delete(packKey)
      else next.add(packKey)
      return next
    })
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[28px] border border-[#dbe5ef] bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Document Data Room</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#142132]">Transaction readiness documents</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Grouped by document packs, blockers, review status, and the workflow gates each item affects.</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
            <MiniMetric label="Overall" value={`${model.readiness.overall.percentComplete}%`} tone={model.readiness.overall.ready ? 'good' : 'warn'} />
            <MiniMetric label="Packs" value={model.packs.length} />
            <MiniMetric label="Blockers" value={model.criticalMissing.length} tone={model.criticalMissing.length ? 'bad' : 'good'} />
            <MiniMetric label="Review" value={model.needsReview.length} tone={model.needsReview.length ? 'warn' : 'good'} />
          </div>
        </div>
      </div>

      <GateReadinessPanel gates={model.readiness.gates} />

      <div className="grid gap-4 xl:grid-cols-3">
        <FocusSection
          title="Critical Missing Documents"
          subtitle="These documents block a workflow gate or transaction milestone."
          icon={ShieldAlert}
          items={model.criticalMissing}
          emptyState="No blocker documents are currently missing."
          tone={model.criticalMissing.length ? 'bad' : 'neutral'}
          uploadingDocumentKey={uploadingDocumentKey}
          openingDocumentPath={openingDocumentPath}
          onUpload={onUpload}
          onOpenDocument={onOpenDocument}
        />
        <FocusSection
          title="Rejected & Needs Re-upload"
          subtitle="Rejected documents need a corrected replacement."
          icon={AlertTriangle}
          items={model.rejected}
          emptyState="No rejected documents need attention."
          tone={model.rejected.length ? 'bad' : 'neutral'}
          uploadingDocumentKey={uploadingDocumentKey}
          openingDocumentPath={openingDocumentPath}
          onUpload={onUpload}
          onOpenDocument={onOpenDocument}
        />
        <FocusSection
          title="Needs Review"
          subtitle="Uploaded documents waiting for professional review."
          icon={Clock3}
          items={model.needsReview}
          emptyState="No uploaded documents are waiting for review."
          tone={model.needsReview.length ? 'warn' : 'neutral'}
          uploadingDocumentKey={uploadingDocumentKey}
          openingDocumentPath={openingDocumentPath}
          onUpload={onUpload}
          onOpenDocument={onOpenDocument}
        />
      </div>

      <div className="grid gap-4">
        {model.packs.map((pack) => (
          <DocumentPackSection
            key={pack.key}
            pack={pack}
            expanded={expandedPacks.has(pack.key)}
            onToggle={() => togglePack(pack.key)}
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            onUpload={onUpload}
            onOpenDocument={onOpenDocument}
          />
        ))}
      </div>

      {model.readiness.overall.ready ? (
        <div className="rounded-[20px] border border-[#ccebd8] bg-[#f0fbf4] p-4 text-sm leading-6 text-[#1f7d44]">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={17} className="mt-0.5" />
            <p>All currently visible canonical document requirements are satisfied or provisionally satisfied.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default CanonicalDocumentWorkspace
