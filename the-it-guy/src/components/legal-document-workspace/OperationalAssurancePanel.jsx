import { AlertTriangle, Check, CheckCircle2, FileSearch, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'

const STATUS_PRESENTATION = Object.freeze({
  not_run: { label: 'Not assessed', classes: 'border-[#dce5ed] bg-[#f7f9fb] text-[#64778b]', Icon: FileSearch },
  healthy: { label: 'Release may continue', classes: 'border-[#b9e1c8] bg-[#eef9f2] text-[#187442]', Icon: ShieldCheck },
  critical: { label: 'Stop signature release', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]', Icon: ShieldAlert },
  review_required: { label: 'Hold for review', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]', Icon: AlertTriangle },
  incomplete: { label: 'Audit incomplete', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]', Icon: ShieldAlert },
  recovery_attention: { label: 'Recovery needs attention', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]', Icon: AlertTriangle },
  no_evidence: { label: 'Awaiting first governed OTP', classes: 'border-[#cbdceb] bg-[#f1f7fc] text-[#45677f]', Icon: FileSearch },
})

function formatState(value = '') {
  return String(value || 'review required').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortId(value = '') {
  const normalized = String(value || '').trim()
  return normalized ? normalized.slice(0, 8) : 'Not recorded'
}

export function OperationalAssurancePanel({ assurance, onRun }) {
  if (!assurance) return null
  const presentation = STATUS_PRESENTATION[assurance.status] || STATUS_PRESENTATION.not_run
  const StatusIcon = presentation.Icon
  const findings = assurance.findings || []
  const diagnostics = assurance.diagnostics

  const runAudit = () => {
    void onRun().catch(() => {})
  }

  return (
    <section className="rounded-[18px] border border-[#dbe5ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]" aria-labelledby="operational-assurance-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d4e1ea] bg-[#f1f7fc] text-[#45677f]">
            <StatusIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Live operational assurance</p>
              <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${presentation.classes}`}>{presentation.label}</span>
            </div>
            <h2 id="operational-assurance-title" className="mt-1 text-lg font-semibold text-[#142033]">Are generated OTPs being released safely?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">Read-only check of exact master-version evidence, transaction readiness, approval authority and signing release. It never edits wording, approves a document, creates signing links or triggers recovery.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={runAudit}
          disabled={assurance.loading}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#b9dcc7] bg-white px-4 text-sm font-semibold text-[#187348] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {assurance.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {assurance.loading ? 'Running audit…' : assurance.auditRun ? 'Run audit again' : 'Run operational audit'}
        </button>
      </div>

      {assurance.error ? <p className="mt-4 rounded-[10px] border border-[#edc9c2] bg-[#fff6f4] px-3 py-2 text-xs leading-5 text-[#923f31]" role="alert">{assurance.error}</p> : null}

      <div className={`mt-5 rounded-[13px] border px-4 py-3 ${presentation.classes}`}>
        <strong className="text-sm font-semibold">Recommendation</strong>
        <p className="mt-1 text-xs leading-5 opacity-90">{assurance.recommendation}</p>
      </div>

      {assurance.auditRun ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[12px] border border-[#dfe7ed] bg-[#fbfcfd] px-4 py-3">
              <dt className="text-[11px] font-semibold text-[#708397]">Assurance score</dt>
              <dd className="mt-1 text-xl font-semibold text-[#20364c]">{assurance.summary.score}%</dd>
            </div>
            <div className="rounded-[12px] border border-[#dfe7ed] bg-[#fbfcfd] px-4 py-3">
              <dt className="text-[11px] font-semibold text-[#708397]">Governed OTPs</dt>
              <dd className="mt-1 text-xl font-semibold text-[#20364c]">{assurance.summary.governedPackets}</dd>
            </div>
            <div className="rounded-[12px] border border-[#dfe7ed] bg-[#fbfcfd] px-4 py-3">
              <dt className="text-[11px] font-semibold text-[#708397]">Exact versions verified</dt>
              <dd className="mt-1 text-xl font-semibold text-[#20364c]">{Math.max(0, assurance.summary.canonicalPackets - assurance.summary.invalidCanonicalVersions)}</dd>
            </div>
            <div className="rounded-[12px] border border-[#dfe7ed] bg-[#fbfcfd] px-4 py-3">
              <dt className="text-[11px] font-semibold text-[#708397]">Actions required</dt>
              <dd className="mt-1 text-xl font-semibold text-[#20364c]">{assurance.summary.criticalPackets + assurance.summary.warningPackets}</dd>
            </div>
          </dl>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operational assurance checks">
            {assurance.steps.map((step) => (
              <li key={step.key} className={`rounded-[12px] border px-3 py-3 ${step.passed ? 'border-[#d2e7da] bg-[#f5fbf7]' : 'border-[#ead9b9] bg-[#fffaf1]'}`}>
                <div className="flex items-center gap-2">
                  {step.passed ? <Check className="h-3.5 w-3.5 shrink-0 text-[#16804d]" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#a27325]" aria-hidden="true" />}
                  <strong className="text-xs font-semibold text-[#30455b]">{step.label}</strong>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[#718397]">{step.detail}</p>
              </li>
            ))}
          </ol>

          <div className="mt-5 border-t border-[#e3e9ee] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#263b50]">Findings requiring attention</h3>
              {diagnostics?.generatedAt ? <span className="text-[11px] text-[#7c8da0]">Audit completed {new Date(diagnostics.generatedAt).toLocaleString('en-ZA')}</span> : null}
            </div>
            {findings.length ? (
              <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                {findings.map((finding) => (
                  <li key={`${finding.packetId}-${finding.versionId || finding.operationalState}`} className={`rounded-[12px] border p-4 ${finding.severity === 'critical' ? 'border-[#edc9c2] bg-[#fff7f5]' : 'border-[#ead9b9] bg-[#fffaf2]'}`}>
                    <div className="flex items-start gap-3">
                      {finding.severity === 'critical' ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#9b3127]" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#98600b]" aria-hidden="true" />}
                      <div className="min-w-0">
                        <strong className="block truncate text-sm font-semibold text-[#30455b]">{finding.title}</strong>
                        <p className="mt-1 text-[11px] leading-5 text-[#718397]">Version {finding.versionNumber || '—'} · Master {shortId(finding.canonicalTemplateVersionId)} · {formatState(finding.operationalState)}</p>
                        <p className="mt-2 text-xs leading-5 text-[#53697e]">{finding.action}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-[11px] border border-[#d2e7da] bg-[#f5fbf7] px-3 py-3 text-xs font-semibold text-[#237047]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                No critical or review findings in the audited OTPs.
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
