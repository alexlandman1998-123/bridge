import { Check, FileText, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard } from '../../components/mobile-shell/MobileShellStates'
import { trackMobileMetric } from '../../services/observability/monitoring'

const FLOWS = {
  buyer: {
    title: 'Buyer Onboarding',
    intro: 'Complete buyer information, upload documents and clear outstanding tasks from your phone.',
    uploadModule: 'lead',
    steps: ['Identity', 'Address', 'Financials', 'Review'],
    documents: ['ID', 'Proof of Address', 'Financial documents'],
  },
  seller: {
    title: 'Seller Onboarding',
    intro: 'Upload seller documents, track transfer readiness and receive mobile updates.',
    uploadModule: 'listing',
    steps: ['Property', 'Mandate', 'Documents', 'Review'],
    documents: ['ID', 'Proof of Address', 'Marriage documents'],
  },
}

export default function MobileOnboardingPage({ portalType = 'buyer' }) {
  const params = useParams()
  const flow = FLOWS[portalType] || FLOWS.buyer
  const [completedSteps, setCompletedSteps] = useState([])
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const completion = useMemo(() => {
    const done = completedSteps.length + uploadedDocs.length
    const total = flow.steps.length + flow.documents.length
    return Math.round((done / total) * 100)
  }, [completedSteps.length, flow.documents.length, flow.steps.length, uploadedDocs.length])

  function completeStep(step) {
    setCompletedSteps((current) => current.includes(step) ? current : [...current, step])
    void trackMobileMetric('task_completed', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: { step, portalType, token: params.token || '' },
    })
  }

  function handleUploaded(record) {
    setUploadedDocs((current) => current.includes(record.documentType) ? current : [...current, record.documentType])
    void trackMobileMetric('document_uploaded', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: { portalType, token: params.token || '', documentType: record.documentType },
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[26px] bg-[#10243a] p-5 text-white">
        <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Mobile Portal</p>
        <h1 className="mt-2 text-[28px] font-semibold text-white">{flow.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#dce8f2]">{flow.intro}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full rounded-full bg-[#9fe0bd]" style={{ width: `${Math.max(completion, 6)}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold text-[#dce8f2]">{completion}% complete</p>
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Onboarding Tasks</h2>
        <div className="space-y-3">
          {flow.steps.map((step) => {
            const completed = completedSteps.includes(step)
            return (
              <MobileCard key={step}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${completed ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'bg-[#edf3f8] text-[#274c69]'}`}>
                      {completed ? <Check className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">{step}</p>
                      <p className="mt-1 text-xs text-[#60758d]">{completed ? 'Completed' : 'Ready to complete'}</p>
                    </div>
                  </div>
                  <button type="button" className="min-h-10 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white disabled:bg-[#d7e0ea]" disabled={completed} onClick={() => completeStep(step)}>
                    Complete
                  </button>
                </div>
              </MobileCard>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Documents</h2>
        <MobileCard>
          <div className="space-y-3">
            {flow.documents.map((document) => (
              <div key={document} className="flex items-center justify-between gap-3 rounded-[18px] bg-[#f8fafc] p-3">
                <div>
                  <p className="text-sm font-semibold text-[#10243a]">{document}</p>
                  <p className="mt-1 text-xs text-[#60758d]">{uploadedDocs.includes(document) ? 'Uploaded' : 'Outstanding'}</p>
                </div>
                <button type="button" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1f7a5a] text-white" onClick={() => setUploadOpen(true)} aria-label={`Upload ${document}`}>
                  <Upload className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </MobileCard>
      </section>

      <MobileUploadSheet
        open={uploadOpen}
        module={flow.uploadModule}
        workspaceId={params.token || portalType}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />
    </div>
  )
}
