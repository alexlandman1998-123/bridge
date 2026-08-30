import { useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleHelp, Clock3, FileText, Info, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import Button from '../ui/Button'
import Drawer from '../ui/Drawer'
import { getClientComplianceVerification, recordComplianceAuditEvent, startClientComplianceVerification } from '../../services/clientComplianceService'
import { getComplianceProvider } from '../../services/complianceProviderRegistry'

const CHECK_LABELS = { identity: 'Identity', address: 'Address', sanctions: 'Sanctions', pep: 'PEP', risk: 'Risk' }
const DEFAULT_CHECKS = Object.keys(CHECK_LABELS).map((type) => ({ type, status: 'not_run', result: 'Not run' }))

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function titleCase(value) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function checkIcon(status, processing) {
  if (processing || status === 'in_progress') return <RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
  if (['not_run', 'pending', 'unavailable'].includes(status)) return <Clock3 className="h-4 w-4" />
  if (['verified', 'clear', 'low'].includes(status)) return <Check className="h-4 w-4" />
  if (['potential_match', 'review_required', 'medium', 'high'].includes(status)) return <AlertTriangle className="h-4 w-4" />
  return <XCircle className="h-4 w-4" />
}

function normalizeCheckStatus(check = {}) {
  const status = String(check.status || '').trim().toLowerCase()
  if (!status || status === 'pending') return 'not_run'
  return status
}

function buyerPanelPresentation({ status = 'not_started', missingFields = [], unavailable = false } = {}) {
  if (missingFields.length) {
    const count = missingFields.length
    return {
      key: 'incomplete',
      title: 'Additional information required',
      copy: `Complete ${count} missing field${count === 1 ? '' : 's'} before this buyer can be verified.`,
      tone: 'amber',
    }
  }
  if (unavailable) return { key: 'unavailable', title: 'Verification unavailable', copy: 'Verification is currently unavailable for this workspace.', tone: 'neutral' }
  if (status === 'in_progress') return { key: 'processing', title: 'Verification in progress', copy: "We're checking this buyer's FICA information.", tone: 'blue' }
  if (status === 'verified') return { key: 'verified', title: 'FICA verification complete', copy: 'Buyer verification is complete.', tone: 'green' }
  if (status === 'review_required') return { key: 'review', title: 'Review required', copy: 'One or more verification checks need review.', tone: 'amber' }
  if (['failed', 'incomplete'].includes(status)) return { key: 'failed', title: 'Verification unsuccessful', copy: 'Resolve the highlighted information and try again.', tone: 'red' }
  if (status === 'expired') return { key: 'expired', title: 'Verification refresh required', copy: 'The previous verification is no longer current.', tone: 'amber' }
  return { key: 'ready', title: 'Ready for FICA verification', copy: 'The required buyer information is captured and ready to check.', tone: 'green' }
}

function buyerCheckPresentation(check = {}, { missingFields = [], processing = false } = {}) {
  const type = String(check.type || '').trim().toLowerCase()
  const missingText = missingFields.join(' ').toLowerCase()
  const identityMissing = /(id|passport|name|registration)/.test(missingText)
  const addressMissing = /address/.test(missingText)
  const status = processing
    ? 'in_progress'
    : type === 'identity' && identityMissing
      ? 'incomplete'
      : type === 'address' && addressMissing
        ? 'incomplete'
        : normalizeCheckStatus(check)
  const label = status === 'not_run' ? 'Not run' : titleCase(check.result || status)
  return { ...check, status, label }
}

function buyerCheckTone(status = '') {
  if (['verified', 'clear', 'low'].includes(status)) return 'border-[#cbe7d7] bg-[#f7fcf9] text-[#157a4d]'
  if (['incomplete', 'review_required', 'medium'].includes(status)) return 'border-[#f0d9a5] bg-[#fffaf0] text-[#a26b16]'
  if (['failed', 'unable_to_verify', 'potential_match', 'high'].includes(status)) return 'border-[#f0cfcb] bg-[#fff8f7] text-[#a43e36]'
  return 'border-[#dce7f2] bg-[#fbfdff] text-[#60758b]'
}

function presentation(status, missing = [], partyLabel = 'Seller') {
  const party = partyLabel.toLowerCase()
  if (missing.length) return { title: 'Additional information required', copy: `Complete the ${party}'s information before running verification.`, tone: 'amber' }
  if (status === 'in_progress') return { title: 'Verification in progress', copy: `We're checking the ${party}'s identity and compliance information.`, tone: 'blue' }
  if (status === 'verified') return { title: 'FICA verification completed', copy: `The ${party}’s identity has been verified and the required compliance screening has been completed.`, tone: 'green' }
  if (status === 'review_required') return { title: 'Review required', copy: 'One or more checks require review before this client can be marked compliant.', tone: 'amber' }
  if (['failed', 'incomplete'].includes(status)) return { title: 'Verification could not be completed', copy: 'Resolve the highlighted information and run the verification again.', tone: 'red' }
  if (status === 'expired') return { title: 'Verification refresh required', copy: 'The previous verification is no longer current and should be refreshed.', tone: 'amber' }
  return { title: `${partyLabel} identity has not been verified`, copy: `The ${party}’s information has been captured, but identity and compliance checks have not yet been completed.`, tone: 'neutral' }
}

export default function SellerFicaVerification({ organisationId, clientContactId, sellerName, clientName = '', partyType = 'seller', entityType = 'individual', subject = {}, missingFields = [], verificationCost = null, providerKey = 'mock', providerLabel = '', canView = true, canRun = false, onCompleteInformation, onAuditActivity }) {
  const [snapshot, setSnapshot] = useState({ profile: null, run: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (!canView || !organisationId || !clientContactId) {
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    getClientComplianceVerification({ organisationId, clientContactId })
      .then((result) => { if (active) setSnapshot(result) })
      .catch((loadError) => { if (active) setError(loadError?.message || 'Verification status is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canView, clientContactId, organisationId])

  const run = snapshot.run
  const storageUnavailable = snapshot.unavailable === true
  const status = running ? 'in_progress' : run?.status || 'not_started'
  const checks = run?.checks?.length ? run.checks : DEFAULT_CHECKS
  const partyLabel = partyType === 'buyer' ? 'Buyer' : 'Seller'
  const displayName = clientName || sellerName
  const state = presentation(status, missingFields, partyLabel)
  const configuredProvider = getComplianceProvider(providerKey)
  const resolvedProviderLabel = String(providerLabel || run?.provider || configuredProvider?.label || 'configured provider').trim()
  const buyerState = buyerPanelPresentation({ status, missingFields, unavailable: storageUnavailable })
  const buyerChecks = checks.map((check) => buyerCheckPresentation(check, { missingFields, processing: running || status === 'in_progress' }))
  const risk = run?.riskRating || 'unknown'
  const canStart = canRun && !storageUnavailable && !missingFields.length && !running && status !== 'in_progress'
  const address = subject.residentialAddress || [subject.street, subject.suburb, subject.city, subject.province, subject.country].filter(Boolean).join(', ')
  const maskedId = subject.idNumber ? `${'•'.repeat(Math.max(6, String(subject.idNumber).length - 4))}${String(subject.idNumber).slice(-4)}` : 'Not captured'
  const cardClass = state.tone === 'green' ? 'border-[#b9ddca] bg-[linear-gradient(135deg,#f6fcf8_0%,#fbfefd_100%)]' : state.tone === 'amber' ? 'border-[#ead7ae] bg-[#fffdf8]' : state.tone === 'red' ? 'border-[#ecc9c5] bg-[#fffafa]' : 'border-[#d5e3ed] bg-[linear-gradient(135deg,#f8fbfd_0%,#ffffff_100%)]'
  const iconClass = state.tone === 'green' ? 'bg-[#0f8052] text-white' : state.tone === 'amber' ? 'bg-[#fff0c9] text-[#8a641d]' : state.tone === 'red' ? 'bg-[#fde8e6] text-[#a43e36]' : 'bg-[#e9f2f7] text-[#315b7a]'

  async function runVerification(rerun = false) {
    if (!canStart) return
    setRunning(true)
    setVerifyOpen(false)
    setError('')
    try {
      const nextRun = await startClientComplianceVerification({ organisationId, clientContactId, entityType, subject, providerKey, rerun })
      setSnapshot((previous) => ({ ...previous, run: nextRun }))
      onAuditActivity?.(rerun ? 'FICA verification re-run' : 'FICA verification completed', nextRun)
    } catch (runError) {
      setError(runError?.message || 'Verification could not be completed.')
      setSnapshot((previous) => ({ ...previous, run: { ...(previous.run || {}), status: 'failed' } }))
    } finally {
      setRunning(false)
    }
  }

  async function viewReport() {
    setReportOpen(true)
    if (run?.id) await recordComplianceAuditEvent({ organisationId, clientContactId, runId: run.id, action: 'fica_report_viewed', providerReference: run.providerReference }).catch(() => null)
  }

  if (!canView) return null

  return (
    <>
      {partyType === 'buyer' ? (
        <section
          className={`mt-5 rounded-[20px] border p-5 shadow-[0_10px_28px_rgba(31,54,78,0.035)] sm:p-6 ${buyerState.tone === 'green' ? 'border-[#cbe7d7] bg-[#fbfefd]' : buyerState.tone === 'amber' ? 'border-[#f0d9a5] bg-[#fffdf9]' : buyerState.tone === 'red' ? 'border-[#f0cfcb] bg-[#fffafa]' : 'border-[#dce7f2] bg-white'}`}
          aria-busy={loading || running}
          data-testid="buyer-fica-verification"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${buyerState.tone === 'green' ? 'bg-[#eaf6ef] text-[#157a4d]' : buyerState.tone === 'amber' ? 'bg-[#fff0c9] text-[#8a641d]' : buyerState.tone === 'red' ? 'bg-[#fde8e6] text-[#a43e36]' : 'bg-[#eef5fb] text-[#315b7a]'}`}>
                {buyerState.key === 'verified' ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </span>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#31506b]">FICA Verification</p>
            </div>
            <div className="relative">
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2 text-xs font-semibold text-[#405b75] hover:bg-white/70"
                aria-expanded={infoOpen}
                aria-controls="buyer-fica-checks-info"
                onClick={() => setInfoOpen((open) => !open)}
              >
                <CircleHelp className="h-4 w-4" />
                What is checked?
              </button>
              {infoOpen ? (
                <div id="buyer-fica-checks-info" role="dialog" className="absolute right-0 top-10 z-20 w-[min(20rem,calc(100vw-3rem))] rounded-[14px] border border-[#dce7f2] bg-white p-4 text-left shadow-[0_16px_36px_rgba(16,32,51,0.14)]">
                  <p className="text-sm font-semibold text-[#102033]">Buyer CDD may include</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[#60758b]">
                    <li>Identity and address verification</li>
                    <li>Sanctions and PEP screening</li>
                    <li>Risk assessment</li>
                    {entityType !== 'individual' ? <li>Beneficial-owner and control-person verification</li> : null}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`mt-4 ${buyerState.key === 'verified' ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end' : ''}`}>
            <div>
              <h4 className="text-xl font-semibold tracking-[-0.03em] text-[#102033]">{loading ? 'Loading verification status…' : buyerState.title}</h4>
              <p className="mt-1.5 text-sm leading-6 text-[#526b82]">{buyerState.copy}</p>
              {missingFields.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-[#8a641d]">Missing:</span>
                  {missingFields.map((field) => <span key={field} className="rounded-full border border-[#f0dfbd] bg-white px-2.5 py-1 font-medium text-[#68573b]">{field}</span>)}
                </div>
              ) : null}
            </div>
            {buyerState.key === 'verified' && run?.reportReference ? (
              <Button type="button" size="sm" variant="secondary" className="w-full lg:w-auto" onClick={viewReport}>
                <FileText className="h-4 w-4" /> View verification report
              </Button>
            ) : null}
          </div>

          <div className={`mt-4 grid gap-2 ${buyerState.key === 'verified' ? 'sm:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
            {buyerChecks.map((check) => (
              <div key={check.type} className={`flex min-h-[74px] items-center gap-2.5 rounded-[13px] border px-3 py-2.5 ${buyerCheckTone(check.status)}`}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-current/20 bg-white/70">
                  {checkIcon(check.status, running || status === 'in_progress')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-[#20364c]">{CHECK_LABELS[check.type] || titleCase(check.type)}</span>
                  <span className="mt-0.5 block truncate text-[0.68rem] font-medium text-current">{check.label}</span>
                </span>
              </div>
            ))}
          </div>

          {buyerState.key !== 'verified' ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-[#eceff2] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className={`flex min-w-0 items-center gap-2 text-xs leading-5 ${storageUnavailable ? 'text-[#60758b]' : buyerState.tone === 'amber' ? 'text-[#8a641d]' : buyerState.tone === 'red' ? 'text-[#a43e36]' : 'text-[#60758b]'}`}>
                {storageUnavailable ? <Info className="h-4 w-4 shrink-0" /> : buyerState.key === 'processing' ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                {storageUnavailable
                  ? 'Verification is currently unavailable for this workspace.'
                  : buyerState.key === 'processing'
                    ? 'Verification is being processed. Duplicate submissions are disabled.'
                    : buyerState.key === 'ready'
                      ? `Ready to verify with ${resolvedProviderLabel}.`
                      : buyerState.key === 'review'
                        ? 'Review the highlighted checks before marking this buyer compliant.'
                        : buyerState.key === 'failed'
                          ? 'Verification was unsuccessful. Review the details before retrying.'
                          : 'Verification is unavailable until required information is completed.'}
              </p>
              <div className="w-full shrink-0 sm:w-auto">
                {buyerState.key === 'incomplete' ? (
                  <Button type="button" size="sm" className="w-full sm:w-auto" onClick={onCompleteInformation}>Complete information</Button>
                ) : buyerState.key === 'unavailable' ? (
                  <Button type="button" size="sm" className="w-full sm:w-auto" disabled><Info className="h-4 w-4" />Verification unavailable</Button>
                ) : buyerState.key === 'processing' ? (
                  <Button type="button" size="sm" className="w-full sm:w-auto" disabled><RefreshCw className="h-4 w-4 animate-spin" />Verification in progress</Button>
                ) : buyerState.key === 'review' ? (
                  <Button type="button" size="sm" className="w-full sm:w-auto" onClick={viewReport}><ShieldCheck className="h-4 w-4" />Review verification</Button>
                ) : buyerState.key === 'failed' || buyerState.key === 'expired' ? (
                  <Button type="button" size="sm" className="w-full sm:w-auto" disabled={!canStart} onClick={() => setVerifyOpen(true)}><RefreshCw className="h-4 w-4" />Retry verification</Button>
                ) : (
                  <Button type="button" size="sm" className="w-full sm:w-auto" disabled={!canStart} onClick={() => setVerifyOpen(true)}><ShieldCheck className="h-4 w-4" />Verify with {resolvedProviderLabel}</Button>
                )}
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs font-semibold text-[#a43e36]">{error}</p> : null}
          <p className="mt-4 text-xs text-[#71869b]">Verification powered by <span className="font-semibold text-[#31506b]">{resolvedProviderLabel}</span></p>
        </section>
      ) : (
      <section className={`mt-5 rounded-[20px] border p-5 shadow-[0_12px_30px_rgba(31,54,78,0.04)] sm:p-6 ${cardClass}`} aria-busy={loading || running} data-testid={`${partyType}-fica-verification`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.7fr)]">
          <div className="flex gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${iconClass}`}><ShieldCheck className="h-7 w-7" /></span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#31506b]">FICA Verification</p>
              <h4 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{loading ? 'Loading verification status…' : state.title}</h4>
              <p className="mt-2 text-sm leading-6 text-[#526b82]">{state.copy}</p>
              {partyType === 'buyer' ? <p className="mt-3 rounded-[12px] border border-[#dce8e2] bg-white/70 px-3 py-2 text-xs leading-5 text-[#526b82]">Buyer CDD covers identity, address, sanctions, prominent-person and risk screening. Company and trust purchasers also require beneficial-owner and control-person verification.</p> : null}
              {storageUnavailable ? <p className="mt-3 rounded-[12px] border border-[#f0d9a5] bg-[#fff8e8] px-3 py-2 text-xs font-semibold leading-5 text-[#8a641d]">FICA verification storage is being activated for this workspace. Verification cannot be run yet.</p> : null}
              {missingFields.length ? <p className="mt-3 text-xs font-semibold text-[#8a641d]">Missing: {missingFields.join(' · ')}</p> : null}
              <p className="mt-5 text-xs text-[#71869b]">Verification powered by <span className="font-semibold text-[#31506b]">{run?.provider || 'configured provider'}</span></p>
            </div>
          </div>

          <div className="min-w-0">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {checks.map((check) => {
                const warning = ['potential_match', 'review_required', 'medium', 'high', 'failed', 'unable_to_verify'].includes(check.status)
                return <div key={check.type} className="flex items-center gap-2 rounded-[12px] bg-white/75 px-3 py-2.5 ring-1 ring-[#dce8e2]"><span className={warning ? 'text-[#a26b16]' : ['verified', 'clear', 'low'].includes(check.status) ? 'text-[#148255]' : 'text-[#7890a7]'}>{checkIcon(check.status, running)}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#20364c]">{CHECK_LABELS[check.type] || titleCase(check.type)}</span><span className="block truncate text-[0.68rem] text-[#60758b]">{titleCase(check.result || check.status)}</span></span></div>
              })}
            </div>
            {run ? <div className="mt-5 grid gap-4 border-t border-[#d8e6df] pt-4 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-xs text-[#71869b]">Verified on</p><p className="mt-1 text-xs font-semibold text-[#20364c]">{formatDateTime(run.completedAt)}</p></div><div><p className="text-xs text-[#71869b]">Verified by</p><p className="mt-1 text-xs font-semibold text-[#20364c]">{run.provider || 'Provider'}</p></div><div><p className="text-xs text-[#71869b]">Reference</p><p className="mt-1 truncate text-xs font-semibold text-[#20364c]">{run.providerReference || '—'}</p></div><div><p className="text-xs text-[#71869b]">Risk rating</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${risk === 'low' ? 'bg-[#def4e8] text-[#17643a]' : risk === 'medium' ? 'bg-[#fff0c9] text-[#8a641d]' : risk === 'high' ? 'bg-[#fde8e6] text-[#a43e36]' : 'bg-[#edf2f7] text-[#60758b]'}`}>{titleCase(risk)}</span></div></div> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {missingFields.length || ['failed', 'incomplete'].includes(status) ? <Button type="button" size="sm" onClick={onCompleteInformation}>{missingFields.length ? 'Complete Information' : 'Resolve Information'}</Button> : null}
              {!run && !missingFields.length ? <Button type="button" size="sm" onClick={() => setVerifyOpen(true)} disabled={!canStart}>Verify {partyLabel}</Button> : null}
              {run?.reportReference ? <Button type="button" size="sm" variant="secondary" onClick={viewReport}><FileText className="h-4 w-4" />View Report</Button> : null}
              {status === 'review_required' ? <Button type="button" size="sm" onClick={viewReport}><ShieldCheck className="h-4 w-4" />Review Verification</Button> : null}
              {run && status !== 'in_progress' ? <Button type="button" size="sm" variant="secondary" onClick={() => setVerifyOpen(true)} disabled={!canStart}><RefreshCw className="h-4 w-4" />Re-run Verification</Button> : null}
            </div>
            {error ? <p className="mt-3 text-right text-xs font-semibold text-[#a43e36]">{error}</p> : null}
          </div>
        </div>
      </section>
      )}

      <Drawer open={verifyOpen} onClose={() => setVerifyOpen(false)} title={`Verify ${partyLabel}`} subtitle={displayName} footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setVerifyOpen(false)}>Cancel</Button><Button type="button" onClick={() => void runVerification(Boolean(run))}>Run with {resolvedProviderLabel}</Button></div>}>
        <div className="space-y-6">
          <div className="rounded-[16px] border border-[#dfe8f2] bg-[#fbfdff] p-4"><dl className="space-y-3 text-sm"><div><dt className="text-xs text-[#71869b]">{entityType === 'individual' ? 'Full Name' : 'Entity Name'}</dt><dd className="mt-1 font-semibold text-[#20364c]">{displayName}</dd></div><div><dt className="text-xs text-[#71869b]">{entityType === 'individual' ? 'ID Number' : 'Registration / reference number'}</dt><dd className="mt-1 font-semibold text-[#20364c]">{maskedId}</dd></div><div><dt className="text-xs text-[#71869b]">Nationality</dt><dd className="mt-1 font-semibold text-[#20364c]">{subject.nationality || 'Not captured'}</dd></div><div><dt className="text-xs text-[#71869b]">{entityType === 'individual' ? 'Residential Address' : 'Registered Address'}</dt><dd className="mt-1 font-semibold text-[#20364c]">{address || 'Not captured'}</dd></div></dl></div>
          <div><h4 className="text-sm font-semibold text-[#102033]">Checks to be performed</h4><div className="mt-3 space-y-2">{DEFAULT_CHECKS.map((check) => <div key={check.type} className="flex items-center gap-3 rounded-[12px] border border-[#e2ebf4] px-3 py-2.5 text-sm font-semibold text-[#31506b]"><CheckCircle2 className="h-4 w-4 text-[#168154]" />{CHECK_LABELS[check.type]}</div>)}</div></div>
          {verificationCost !== null ? <div className="flex items-center justify-between rounded-[14px] border border-[#dfe8f2] bg-white px-4 py-3"><span className="text-sm text-[#60758b]">Verification cost</span><strong className="text-sm text-[#20364c]">R {Number(verificationCost || 0).toFixed(2)}</strong></div> : null}
          <div className="rounded-[14px] bg-[#f5f8fb] px-4 py-3 text-xs leading-5 text-[#60758b]">Arch9 sends only the required verification fields to the configured provider. Raw provider responses and credentials are never exposed in this workspace.</div>
        </div>
      </Drawer>

      <Drawer open={reportOpen} onClose={() => setReportOpen(false)} title="FICA Verification Report" subtitle={run?.providerReference || sellerName}>
        <div className="space-y-4"><div className="rounded-[16px] border border-[#dfe8f2] bg-[#fbfdff] p-4"><p className="text-xs text-[#71869b]">Overall result</p><p className="mt-1 text-lg font-semibold text-[#102033]">{titleCase(run?.status)}</p><p className="mt-1 text-sm text-[#60758b]">Risk: {titleCase(run?.riskRating)}</p></div>{checks.map((check) => <div key={check.type} className="flex items-center justify-between gap-4 rounded-[14px] border border-[#e2ebf4] p-4"><span className="font-semibold text-[#20364c]">{CHECK_LABELS[check.type] || titleCase(check.type)}</span><span className="text-sm text-[#60758b]">{titleCase(check.result || check.status)}</span></div>)}<p className="text-xs leading-5 text-[#71869b]">This is Arch9’s normalized verification summary. It is not an agency compliance decision and does not replace another accountable institution’s own FICA assessment.</p></div>
      </Drawer>
    </>
  )
}
