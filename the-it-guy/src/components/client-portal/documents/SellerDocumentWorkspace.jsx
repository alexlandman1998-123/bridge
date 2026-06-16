import { ArrowRight, CheckCircle2, CircleAlert, Clock3, FileStack, UploadCloud, XCircle } from 'lucide-react'
import { normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'
import SellerDocumentRow from './SellerDocumentRow'

function normalizeStatusForSummary(status = '') {
  const normalized = normalizeDocumentStatus(status)
  if (normalized === 'required' || normalized === 'requested') return 'outstanding'
  if (normalized === 'uploaded') return 'uploaded'
  if (normalized === 'under_review') return 'under_review'
  if (normalized === 'approved' || normalized === 'completed') return 'approved'
  if (normalized === 'rejected') return 'rejected'
  return 'outstanding'
}

function clampPercent(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 100)
}

function buildSummaryModel(requiredItems = []) {
  const applicableRequired = (Array.isArray(requiredItems) ? requiredItems : []).filter((item) => {
    const normalized = normalizeDocumentStatus(item?.status || '')
    return normalized !== 'not_applicable' && normalized !== 'cancelled'
  })

  const counts = applicableRequired.reduce((accumulator, item) => {
    const key = normalizeStatusForSummary(item?.status || '')
    accumulator[key] += 1
    return accumulator
  }, {
    outstanding: 0,
    uploaded: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
  })

  const completed = counts.approved
  const total = applicableRequired.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 100
  const blockingItems = applicableRequired.filter((item) => {
    const normalized = normalizeDocumentStatus(item?.status || '')
    return normalized === 'required' || normalized === 'requested' || normalized === 'rejected'
  })

  return {
    total,
    completed,
    percent,
    counts,
    blockingItems,
  }
}

function SummaryMetric({ label = '', value = 0, tone = 'neutral', icon: Icon = FileStack }) {
  const classes = {
    danger: 'border-[#f3d0ce] bg-[#fff7f6] text-[#ba473f]',
    info: 'border-[#d6e4f5] bg-[#f4f9ff] text-[#1d5fa7]',
    warn: 'border-[#f2ddbb] bg-[#fffaf0] text-[#b66a11]',
    success: 'border-[#d7eadf] bg-[#f3fbf6] text-[#1f7a46]',
    neutral: 'border-[#dde6f0] bg-[#f8fbff] text-[#52657b]',
  }

  return (
    <article className={`rounded-[18px] border px-4 py-3 ${classes[tone] || classes.neutral}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] opacity-80">{label}</span>
      </div>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em]">{value}</p>
    </article>
  )
}

function SellerDocumentWorkspace({
  tabs = [],
  activeTabKey = 'property',
  onTabChange = null,
  requiredItems = [],
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
  errorMessage = '',
  onPrimaryUploadAction = null,
}) {
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) || tabs[0] || null
  const summary = buildSummaryModel(requiredItems)
  const hasRejected = summary.counts.rejected > 0
  const completionLabel = summary.total > 0
    ? `${summary.completed} of ${summary.total} complete`
    : 'No required documents pending'

  if (errorMessage) {
    return (
      <section className="rounded-[30px] border border-[#f0d2cf] bg-[#fff8f7] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-3">
          <CircleAlert size={20} className="mt-0.5 text-[#b42318]" />
          <div>
            <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
            <p className="mt-1 text-sm leading-6 text-[#8b4b46]">Documents could not be loaded. Please try again.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6 rounded-[32px] bg-[#f4f7fb] p-4 sm:p-5 lg:p-6">
      <header className="rounded-[28px] border border-[#dde6f0] bg-white px-5 py-5 shadow-[0_20px_40px_rgba(15,23,42,0.06)] sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Seller Portal</p>
            <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-[#142132] sm:text-[2.125rem]">Documents</h2>
            <p className="mt-2 text-[0.97rem] leading-7 text-[#5f7288]">Upload and track the documents needed for your property sale.</p>
          </div>
          <button
            type="button"
            onClick={() => onPrimaryUploadAction?.()}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[15px] border border-[#cfe0ef] bg-[#2f6fa4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#275f8d]"
          >
            <UploadCloud size={16} />
            Upload documents
          </button>
        </div>
      </header>

      <section className="rounded-[28px] border border-[#dde6f0] bg-white px-5 py-5 shadow-[0_20px_40px_rgba(15,23,42,0.06)] sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Documents</p>
            <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">{completionLabel}</h3>
          </div>
          <div className="text-left lg:text-right">
            <p className="text-[1rem] font-semibold text-[#142132]">{clampPercent(summary.percent)}% complete</p>
            <p className="mt-1 text-sm text-[#6b7d93]">Based on your currently applicable required documents.</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
            <span>Progress</span>
            <span>{summary.completed} / {summary.total || 0}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#e8eef5]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#3e79b2_0%,#2f8a64_100%)] transition-all duration-300"
              style={{ width: `${clampPercent(summary.percent)}%` }}
            />
          </div>
        </div>

        <div className={`mt-5 grid gap-3 ${hasRejected ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
          <SummaryMetric label="Outstanding" value={summary.counts.outstanding} tone="danger" icon={CircleAlert} />
          <SummaryMetric label="Uploaded" value={summary.counts.uploaded} tone="info" icon={UploadCloud} />
          <SummaryMetric label="Under Review" value={summary.counts.under_review} tone="warn" icon={Clock3} />
          <SummaryMetric label="Approved" value={summary.counts.approved} tone="success" icon={CheckCircle2} />
          {hasRejected ? <SummaryMetric label="Rejected" value={summary.counts.rejected} tone="danger" icon={XCircle} /> : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[26px] border border-[#dde6f0] bg-white px-5 py-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Still needed</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">These outstanding required documents are still blocking progress.</p>
              </div>
            </div>
            {summary.blockingItems.length ? (
              <div className="mt-4 space-y-2.5">
                {summary.blockingItems.map((item) => {
                  const normalized = normalizeDocumentStatus(item?.status || '')
                  const needsReupload = normalized === 'rejected'
                  return (
                    <article key={item.id} className="rounded-[18px] border border-[#e4ebf3] bg-[#f9fbfe] px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${needsReupload ? 'bg-[#c24138]' : 'bg-[#d46f62]'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#142132]">{item.title}</p>
                          {needsReupload ? (
                            <p className="mt-1 text-[0.78rem] leading-5 text-[#a14a42]">Re-upload needed{item?.rejectionReason ? `: ${item.rejectionReason}` : ''}</p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-[18px] border border-[#cfe8d8] bg-[#f1fbf4] px-4 py-4 text-sm font-medium text-[#247148]">
                All required documents have been uploaded.
              </div>
            )}
          </section>

          <section className="rounded-[26px] border border-[#dde6f0] bg-white px-5 py-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
            <h3 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">Status summary</h3>
            <div className="mt-4 space-y-2.5">
              {[
                ['Outstanding', summary.counts.outstanding],
                ['Uploaded', summary.counts.uploaded],
                ['Under Review', summary.counts.under_review],
                ['Approved', summary.counts.approved],
                ...(hasRejected ? [['Rejected', summary.counts.rejected]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e5edf5] bg-[#f9fbfe] px-3.5 py-3">
                  <span className="text-sm font-medium text-[#5c7188]">{label}</span>
                  <span className="text-sm font-semibold text-[#142132]">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section id="seller-document-list" className="rounded-[28px] border border-[#dde6f0] bg-white px-4 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.06)] sm:px-5 sm:py-5">
          <div className="overflow-x-auto">
            <nav className="inline-flex min-w-full gap-2 rounded-[18px] bg-[#f3f6fa] p-1.5">
              {tabs.map((tab) => {
                const isActive = tab.key === activeTabKey
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange?.(tab.key)}
                    className={`inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border border-[#d4e2ef] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.07)]'
                        : 'border border-transparent bg-transparent text-[#6a7c92] hover:bg-white hover:text-[#142132]'
                    }`}
                  >
                    <span>{tab.title}</span>
                    <span className={`inline-flex min-w-[24px] items-center justify-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${isActive ? 'bg-[#eef4fb] text-[#35546c]' : 'bg-white text-[#6a7c92]'}`}>
                      {tab.items.length}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>

          {activeTab ? (
            <div className="mt-5">
              <div className="flex flex-col gap-2 border-b border-[#e7eef5] pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{activeTab.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{activeTab.subtitle}</p>
                </div>
              </div>

              {activeTab.items.length ? (
                <div className="mt-5 space-y-3.5">
                  {activeTab.items.map((item) => (
                    <SellerDocumentRow
                      key={item.id}
                      item={item}
                      uploadingDocumentKey={uploadingDocumentKey}
                      openingDocumentPath={openingDocumentPath}
                      onUpload={onUpload}
                      onOpenDocument={onOpenDocument}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[20px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                  No documents required in this category.
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between rounded-[20px] border border-[#e4ebf3] bg-[#f9fbfe] px-4 py-3 text-sm text-[#60748a]">
            <p>Use the row actions to upload, view, or re-upload documents without leaving this page.</p>
            <button
              type="button"
              onClick={() => onPrimaryUploadAction?.()}
              className="hidden items-center gap-2 font-semibold text-[#2f6fa4] md:inline-flex"
            >
              Go to upload actions
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}

export default SellerDocumentWorkspace
