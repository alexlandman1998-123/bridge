import { ArrowRight, Check, Download, FileText, Headphones, HelpCircle, LockKeyhole, Minus, PenLine, Plus, RefreshCw, ShieldCheck } from 'lucide-react'

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function actionIcon(actionId = '') {
  if (actionId === 'view_document') return <FileText className="h-4 w-4" aria-hidden="true" />
  if (actionId === 'finish_signing') return <LockKeyhole className="h-4 w-4" aria-hidden="true" />
  if (actionId === 'open_completed_pdf') return <Download className="h-4 w-4" aria-hidden="true" />
  if (actionId === 'contact_support') return <Headphones className="h-4 w-4" aria-hidden="true" />
  if (actionId === 'next_field') return <PenLine className="h-4 w-4" aria-hidden="true" />
  if (actionId === 'refresh_completion') return <RefreshCw className="h-4 w-4" aria-hidden="true" />
  return <ArrowRight className="h-4 w-4" aria-hidden="true" />
}

function stepClass(status = '') {
  if (status === 'complete') return 'border-[#26875a] bg-[#26875a] text-white'
  if (status === 'current') return 'border-[#12385f] bg-[#12385f] text-white'
  return 'border-[#d7e2ed] bg-white text-[#566b82]'
}

function connectorClass(leftStatus = '', rightStatus = '') {
  if (leftStatus === 'complete' && ['complete', 'current'].includes(rightStatus)) return 'bg-[#26875a]'
  return 'bg-[#dbe3ec]'
}

function actionToneClass(tone = '') {
  if (tone === 'success') return 'border-[#bfe3cd] bg-[#f1fbf5]'
  if (tone === 'danger') return 'border-[#f0c9c1] bg-[#fff5f2]'
  if (tone === 'primary') return 'border-[#cfe3d7] bg-[#f7fcf9]'
  return 'border-[#dbe5ef] bg-white'
}

function buttonToneClass(tone = '') {
  if (tone === 'success' || tone === 'primary') return 'bg-[#187748] text-white hover:bg-[#13643d]'
  if (tone === 'danger') return 'bg-[#8e2b1f] text-white hover:bg-[#762017]'
  return 'bg-[#12385f] text-white hover:bg-[#0f2f50]'
}

export function SimpleSigningProgressStepper({ model = null, onAction = null }) {
  if (!model?.steps?.length) return null
  return (
    <section data-testid="simple-signing-progress" className="rounded-[8px] border border-[#dbe4ee] bg-white p-5 shadow-[0_12px_36px_rgba(15,32,54,0.06)]" aria-label="Signing progress">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#142132]">Your signing progress</h2>
          <p className="mt-2 text-sm font-semibold text-[#4d5f73]">{model.currentStepLabel}</p>
        </div>
        <button type="button" onClick={() => onAction?.('view_document')} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[7px] border border-[#cfd9e5] bg-white px-4 text-sm font-semibold text-[#1f344c] shadow-sm">
          <FileText className="h-4 w-4 text-[#12385f]" aria-hidden="true" />
          View document
        </button>
      </div>
      <ol className="mt-7 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-0 px-2 sm:px-10">
        {model.steps.map((step, index) => (
          <li key={step.id} className={cx('contents', step.isCurrent ? 'font-semibold' : '')}>
            <div className="flex min-w-0 flex-col items-center text-center">
              <span className={cx('flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold shadow-sm', stepClass(step.status))}>
                {step.status === 'complete' ? <Check className="h-4 w-4" aria-hidden="true" /> : step.step}
              </span>
              <span className="mt-2 text-sm font-semibold text-[#29394c]">{step.label}</span>
              <span className="mt-1 text-xs text-[#607387]">{step.status === 'complete' ? 'Completed' : step.status === 'current' ? 'In progress' : 'Pending'}</span>
            </div>
            {index < model.steps.length - 1 ? (
              <span className={cx('mt-[18px] block h-1 min-w-8 rounded-full sm:min-w-24', connectorClass(step.status, model.steps[index + 1]?.status))} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-[#66788b]">{model.copy?.instruction}</p>
    </section>
  )
}

export function SimpleSigningDocumentCard({ model = null, children = null, zoomPercent = 100, onZoomOut = null, onZoomIn = null, onDownload = null }) {
  if (!model?.document) return null
  const pageCopy = model.document.pageCount
    ? `Page ${model.document.currentPage || 1} of ${model.document.pageCount}`
    : `Page ${model.document.currentPage || 1}`
  return (
    <section data-testid="simple-signing-document-card" className="rounded-[8px] border border-[#dbe4ee] bg-white p-4 shadow-[0_12px_36px_rgba(15,32,54,0.06)]" aria-label="Document">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[#142132]">Document</h2>
          <div className="mt-2 flex min-w-0 items-start gap-2">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#12385f]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#29394c]">{model.document.fileName}</p>
              <p className="text-xs text-[#607387]">{pageCopy}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-[7px] border border-[#d7e2ed] bg-white">
            <button type="button" onClick={onZoomOut} className="flex h-10 w-10 items-center justify-center text-[#29394c]" aria-label="Zoom out"><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <span className="min-w-14 border-x border-[#d7e2ed] px-3 text-center text-sm font-bold text-[#29394c]">{zoomPercent}%</span>
            <button type="button" onClick={onZoomIn} className="flex h-10 w-10 items-center justify-center text-[#29394c]" aria-label="Zoom in"><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <button type="button" onClick={onDownload} className="flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#d7e2ed] bg-white text-[#12385f]" aria-label="Download document"><Download className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[7px] border border-[#e1e8f0] bg-[#f8fafc]">
        {children || (
          <div className="flex min-h-[360px] items-center justify-center bg-white p-8 text-center text-sm text-[#607387]">
            Document preview will appear here.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8f0] bg-[#f8fafc] px-4 py-3 text-xs font-semibold text-[#41566c]">
          <span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4 text-[#12385f]" aria-hidden="true" />{model.progress?.nextField ? `${model.progress.nextField.typeLabel} required on page ${model.progress.nextField.pageNumber}` : 'Required fields complete'}</span>
          <span>{model.progress?.nextField ? `Next: Page ${model.progress.nextField.pageNumber}` : 'Ready to finish'}</span>
        </div>
      </div>
    </section>
  )
}

export function SimpleSigningActionCard({ model = null, busy = false, onAction = null }) {
  const card = model?.actionCard
  if (!card) return null
  const action = card.primaryAction || {}
  return (
    <section data-testid="simple-signing-action-card" className={cx('rounded-[8px] border p-5 shadow-[0_12px_36px_rgba(15,32,54,0.06)]', actionToneClass(card.tone))} aria-label="Signing action">
      <div className="flex gap-4">
        <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', card.tone === 'success' ? 'bg-[#26875a] text-white' : 'bg-[#eaf3fb] text-[#12385f]')}>
          {card.tone === 'success' ? <Check className="h-6 w-6" aria-hidden="true" /> : <PenLine className="h-6 w-6" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[#142132]">{card.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#607387]">{card.description}</p>
          {action.id && action.id !== 'close_page' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction?.(action.id)}
              className={cx('mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[7px] px-5 text-sm font-bold shadow-[0_14px_30px_rgba(18,56,95,0.18)] transition sm:w-auto sm:min-w-[280px]', buttonToneClass(card.tone), busy ? 'opacity-60' : '')}
            >
              {actionIcon(action.id)}
              {busy ? 'Saving' : action.label}
              {!busy && !['view_document', 'open_completed_pdf', 'contact_support', 'refresh_completion'].includes(action.id) ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function SimpleSigningHelpCard({ model = null, onHelp = null }) {
  const help = model?.helpCard
  if (!help) return null
  return (
    <section data-testid="simple-signing-help-card" className="rounded-[8px] border border-[#dbe4ee] bg-white p-4 shadow-[0_10px_28px_rgba(15,32,54,0.05)]" aria-label="Help">
      <button type="button" onClick={onHelp} className="flex w-full items-center justify-between gap-4 text-left">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12385f]">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#142132]">{help.title}</span>
            <span className="mt-1 block text-sm text-[#607387]">{help.description}</span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#607387]" aria-hidden="true" />
      </button>
    </section>
  )
}

export function SimpleSigningSecureFooter({ model = null }) {
  const footer = model?.secureFooter
  if (!footer) return null
  return (
    <footer data-testid="simple-signing-secure-footer" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8f0] px-4 py-5 text-xs text-[#607387]">
      <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{footer.left}</span>
      <span>{footer.right}</span>
    </footer>
  )
}

export function SimpleSigningCompleteState({ model = null, busy = false, onAction = null }) {
  if (model?.state !== 'completed') return null
  return (
    <div data-testid="simple-signing-complete-state" className="space-y-4">
      <SimpleSigningProgressStepper model={model} onAction={onAction} />
      <SimpleSigningActionCard model={model} busy={busy} onAction={onAction} />
      <SimpleSigningHelpCard model={model} />
    </div>
  )
}

export default function SimpleSigningShell({
  model = null,
  busy = false,
  documentPreview = null,
  onAction = null,
  onHelp = null,
  zoomPercent = 100,
  onZoomOut = null,
  onZoomIn = null,
  onDownload = null,
}) {
  if (model?.contract !== 'arch9-simple-signing-experience-model-v1') return null
  return (
    <main data-testid="simple-signing-shell" className="min-h-screen bg-[#f6f8fb] text-[#142132]">
      <div className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col px-4 py-6 sm:px-6 lg:max-w-[920px]">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-2xl font-black text-[#142132]">{model.copy?.headline}</p>
            <p className="mt-2 text-base text-[#607387]">{model.copy?.eyebrow}</p>
          </div>
          <button type="button" onClick={onHelp} className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#29394c]">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            Help
          </button>
        </header>

        <div className="flex-1 space-y-4">
          <SimpleSigningProgressStepper model={model} onAction={onAction} />
          {model.state !== 'completed' ? (
            <SimpleSigningDocumentCard model={model} zoomPercent={zoomPercent} onZoomOut={onZoomOut} onZoomIn={onZoomIn} onDownload={onDownload}>
              {documentPreview}
            </SimpleSigningDocumentCard>
          ) : null}
          <SimpleSigningActionCard model={model} busy={busy} onAction={onAction} />
          <SimpleSigningHelpCard model={model} onHelp={onHelp} />
        </div>
      </div>
      <SimpleSigningSecureFooter model={model} />
    </main>
  )
}
