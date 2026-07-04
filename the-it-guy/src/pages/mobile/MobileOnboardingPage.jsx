import {
  BadgeCheck,
  Banknote,
  Building2,
  Handshake,
  Home,
  Landmark,
  MapPin,
  ScrollText,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  MobilePortalDocumentRow,
  MobilePortalHeader,
  MobilePortalHero,
  MobilePortalIconRail,
  MobilePortalMetricStrip,
  MobilePortalNextActionCard,
  MobilePortalReviewCard,
  MobilePortalScreen,
  MobilePortalSearch,
  MobilePortalSectionHeader,
  MobilePortalStickyActionBar,
  MobilePortalTabs,
  MobilePortalTaskRow,
} from '../../components/mobile-shell/MobileOnboardingDesign'
import { MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { trackMobileMetric } from '../../services/observability/monitoring'

const FLOWS = {
  buyer: {
    title: 'Buyer Onboarding',
    greeting: 'Buyer Portal',
    statusLabel: 'Offer readiness file',
    searchPlaceholder: 'Search buyer profile, funding, or documents',
    heroEyebrow: 'Offer readiness',
    heroTitle: 'Get buyer ready for offer.',
    heroBody: 'Confirm the buyer profile, funding route and proof documents before the agent prepares the next offer step.',
    heroIcon: Landmark,
    nextActionEyebrow: 'Buyer action',
    priorityTitle: 'Buyer Readiness',
    tasksTitle: 'Buyer Tasks',
    documentsTitle: 'Buyer Proof Pack',
    documentsPreviewTitle: 'Proof Documents',
    reviewTitlePending: 'Buyer file still needs work',
    reviewTitleComplete: 'Buyer ready for handoff',
    reviewBodyPending: 'Finish the buyer profile, funding and proof checks before the offer workflow moves forward.',
    reviewBodyComplete: 'Buyer details, funding confidence and supporting documents are ready for agent review.',
    uploadLabel: 'Add proof',
    finalPrimaryLabel: 'Review Buyer',
    emptyNextTitle: 'Review buyer readiness',
    emptyNextBody: 'Profile, funding and proof documents are complete. Check the file before handoff.',
    uploadModule: 'lead',
    steps: [
      { key: 'identity', label: 'Buyer Profile', body: 'Confirm buyer details, decision-maker and contact route.', icon: UserRound },
      { key: 'address', label: 'Address Base', body: 'Capture current residential or business address.', icon: Home },
      { key: 'financials', label: 'Funding Route', body: 'Record finance type, deposit strength and readiness.', icon: Banknote },
      { key: 'review', label: 'Offer Readiness', body: 'Check the buyer file before offer preparation.', icon: BadgeCheck },
    ],
    documents: [
      { key: 'id', label: 'Buyer ID', body: 'Identity document or passport for the purchaser.' },
      { key: 'address', label: 'Address Proof', body: 'Recent utility bill, lease or statement.' },
      { key: 'financials', label: 'Funding Proof', body: 'Bank, finance or proof-of-funds pack.' },
    ],
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'tasks', label: 'Profile' },
      { key: 'documents', label: 'Proof' },
      { key: 'review', label: 'Readiness' },
    ],
    metrics: [
      { label: 'Profile', type: 'steps' },
      { label: 'Proof', type: 'documents' },
      { label: 'Ready', type: 'completion' },
    ],
    reviewRows: [
      { label: 'Buyer profile', type: 'steps' },
      { label: 'Funding proof', type: 'documents' },
      { label: 'Offer file', type: 'token' },
    ],
  },
  seller: {
    title: 'Seller Onboarding',
    greeting: 'Seller Portal',
    statusLabel: 'Listing readiness file',
    searchPlaceholder: 'Search property, mandate, or seller documents',
    heroEyebrow: 'Listing readiness',
    heroTitle: 'Prepare seller file for listing.',
    heroBody: 'Validate the property profile, mandate status and seller compliance pack before publication.',
    heroIcon: Building2,
    nextActionEyebrow: 'Seller action',
    priorityTitle: 'Listing Readiness',
    tasksTitle: 'Seller Steps',
    documentsTitle: 'Seller Compliance Pack',
    documentsPreviewTitle: 'Compliance Documents',
    reviewTitlePending: 'Seller file still needs work',
    reviewTitleComplete: 'Seller ready for listing',
    reviewBodyPending: 'Complete property, mandate and compliance checks before the listing can move cleanly.',
    reviewBodyComplete: 'Property details, mandate readiness and seller documents are ready for the agent.',
    uploadLabel: 'Add seller doc',
    finalPrimaryLabel: 'Review Seller',
    emptyNextTitle: 'Review listing readiness',
    emptyNextBody: 'Property, mandate and compliance documents are complete. Check the file before handoff.',
    uploadModule: 'listing',
    steps: [
      { key: 'property', label: 'Property Profile', body: 'Confirm address, area, ownership and listing basics.', icon: MapPin },
      { key: 'mandate', label: 'Mandate Track', body: 'Review mandate status and required signatures.', icon: ScrollText },
      { key: 'documents', label: 'Seller Compliance', body: 'Upload seller and property compliance documents.', icon: ShieldCheck },
      { key: 'review', label: 'Listing Review', body: 'Check listing readiness before the agent proceeds.', icon: Handshake },
    ],
    documents: [
      { key: 'id', label: 'Seller ID', body: 'Seller identity document or passport.' },
      { key: 'address', label: 'Municipal Proof', body: 'Recent municipal, utility or account statement.' },
      { key: 'marriage', label: 'Marital Status', body: 'ANC, marriage certificate or supporting status docs.' },
    ],
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'tasks', label: 'Property' },
      { key: 'documents', label: 'Compliance' },
      { key: 'review', label: 'Listing' },
    ],
    metrics: [
      { label: 'Listing', type: 'steps' },
      { label: 'Docs', type: 'documents' },
      { label: 'Ready', type: 'completion' },
    ],
    reviewRows: [
      { label: 'Seller profile', type: 'steps' },
      { label: 'Compliance pack', type: 'documents' },
      { label: 'Listing file', type: 'token' },
    ],
  },
}

function MobileOnboardingOverviewSection({
  portalType,
  flow,
  nextStep,
  nextDocument,
  taskRows,
  documentRows,
  onShowTasks,
  onShowDocuments,
}) {
  const nextActionTitle = nextStep
    ? `Complete ${nextStep.label}`
    : nextDocument
      ? `Upload ${nextDocument.label}`
      : flow.emptyNextTitle
  const nextActionBody = nextStep?.body || nextDocument?.body || flow.emptyNextBody
  const NextActionIcon = nextStep?.icon || ShieldCheck

  return (
    <div className="space-y-4">
      <MobilePortalNextActionCard
        portalType={portalType}
        eyebrow={flow.nextActionEyebrow}
        title={nextActionTitle}
        body={nextActionBody}
        Icon={NextActionIcon}
      />
      <section className="space-y-3">
        <MobilePortalSectionHeader title={flow.priorityTitle} actionLabel="See all" onAction={onShowTasks} />
        {taskRows.slice(0, 2)}
      </section>
      <section className="space-y-3">
        <MobilePortalSectionHeader title={flow.documentsPreviewTitle} actionLabel="See all" onAction={onShowDocuments} />
        {documentRows.slice(0, 2)}
      </section>
    </div>
  )
}

function MobileOnboardingTasksSection({ title, taskRows }) {
  return (
    <section className="space-y-3">
      <MobilePortalSectionHeader title={title} />
      {taskRows}
    </section>
  )
}

function MobileOnboardingDocumentsSection({ title, documentRows }) {
  return (
    <section className="space-y-3">
      <MobilePortalSectionHeader title={title} />
      {documentRows}
    </section>
  )
}

function MobileOnboardingReviewSection({ portalType, flow, completion, reviewRows }) {
  return (
    <MobilePortalReviewCard
      portalType={portalType}
      title={completion === 100 ? flow.reviewTitleComplete : flow.reviewTitlePending}
      body={completion === 100 ? flow.reviewBodyComplete : flow.reviewBodyPending}
      rows={reviewRows}
    />
  )
}

export default function MobileOnboardingPage({ portalType = 'buyer' }) {
  const params = useParams()
  const flow = FLOWS[portalType] || FLOWS.buyer
  const [completedSteps, setCompletedSteps] = useState([])
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const completion = useMemo(() => {
    const done = completedSteps.length + uploadedDocs.length
    const total = flow.steps.length + flow.documents.length
    return Math.round((done / total) * 100)
  }, [completedSteps.length, flow.documents.length, flow.steps.length, uploadedDocs.length])

  const nextStep = useMemo(
    () => flow.steps.find((step) => !completedSteps.includes(step.key)) || null,
    [completedSteps, flow.steps],
  )

  const nextDocument = useMemo(
    () => flow.documents.find((document) => !uploadedDocs.includes(document.key)) || null,
    [flow.documents, uploadedDocs],
  )

  const reviewRows = useMemo(
    () => flow.reviewRows.map((row) => {
      if (row.type === 'steps') return { label: row.label, value: `${completedSteps.length}/${flow.steps.length}` }
      if (row.type === 'documents') return { label: row.label, value: `${uploadedDocs.length}/${flow.documents.length}` }
      return { label: row.label, value: params.token ? 'Active' : 'Preview' }
    }),
    [completedSteps.length, flow.documents.length, flow.reviewRows, flow.steps.length, params.token, uploadedDocs.length],
  )

  function completeStep(step) {
    const stepKey = typeof step === 'string' ? step : step.key
    setCompletedSteps((current) => current.includes(stepKey) ? current : [...current, stepKey])
    void trackMobileMetric('task_completed', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: { step: stepKey, portalType, token: params.token || '' },
    })
  }

  function handleUploaded(record) {
    const matchedDocument = flow.documents.find((document) => document.label === record.documentType || document.key === record.documentType)
    const documentKey = matchedDocument?.key || nextDocument?.key || record.documentType
    setUploadedDocs((current) => current.includes(documentKey) ? current : [...current, documentKey])
    void trackMobileMetric('document_uploaded', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: { portalType, token: params.token || '', documentType: record.documentType },
    })
  }

  function handlePrimaryAction() {
    if (activeTab === 'documents' || (!nextStep && nextDocument)) {
      setUploadOpen(true)
      return
    }
    if (nextStep) {
      completeStep(nextStep)
      return
    }
    setActiveTab('review')
  }

  const railItems = flow.steps.map((step, index) => ({
    key: step.key,
    label: step.label,
    icon: step.icon,
    active: index === 0 || completedSteps.includes(step.key),
  }))

  const metrics = flow.metrics.map((metric) => {
    if (metric.type === 'steps') return { label: metric.label, value: `${completedSteps.length}/${flow.steps.length}` }
    if (metric.type === 'documents') return { label: metric.label, value: `${uploadedDocs.length}/${flow.documents.length}` }
    return { label: metric.label, value: `${completion}%` }
  })

  const taskRows = flow.steps.map((step) => (
    <MobilePortalTaskRow
      key={step.key}
      portalType={portalType}
      title={step.label}
      subtitle={step.body}
      meta={completedSteps.includes(step.key) ? 'Done' : 'Open'}
      completed={completedSteps.includes(step.key)}
      Icon={step.icon}
      onAction={() => completeStep(step)}
    />
  ))

  const documentRows = flow.documents.map((document) => (
    <MobilePortalDocumentRow
      key={document.key}
      portalType={portalType}
      title={document.label}
      subtitle={document.body}
      uploaded={uploadedDocs.includes(document.key)}
      onUpload={() => setUploadOpen(true)}
    />
  ))

  return (
    <MobilePortalScreen
      portalType={portalType}
      stickyAction={activeTab === 'overview' ? null : (
        <MobilePortalStickyActionBar
          portalType={portalType}
          primaryLabel={nextStep ? nextStep.label : nextDocument ? flow.uploadLabel : flow.finalPrimaryLabel}
          secondaryLabel={flow.uploadLabel}
          onPrimary={handlePrimaryAction}
          onSecondary={() => setUploadOpen(true)}
        />
      )}
    >
      <MobilePortalHeader
        portalType={portalType}
        eyebrow={flow.greeting}
        title={flow.title}
        subtitle={params.token ? flow.statusLabel : 'Preview mode'}
        avatarLabel={portalType}
        completion={completion}
      />

      <MobilePortalSearch portalType={portalType} placeholder={flow.searchPlaceholder} />

      <MobilePortalHero
        portalType={portalType}
        eyebrow={flow.heroEyebrow}
        title={flow.heroTitle}
        body={flow.heroBody}
        completion={completion}
        ctaLabel={nextStep ? nextStep.label : nextDocument ? flow.uploadLabel : flow.finalPrimaryLabel}
        onCta={handlePrimaryAction}
        Icon={flow.heroIcon}
      />

      <MobilePortalIconRail portalType={portalType} items={railItems} />
      <MobilePortalMetricStrip portalType={portalType} items={metrics} />
      <MobilePortalTabs portalType={portalType} items={flow.tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <MobileOnboardingOverviewSection
          portalType={portalType}
          flow={flow}
          nextStep={nextStep}
          nextDocument={nextDocument}
          taskRows={taskRows}
          documentRows={documentRows}
          onShowTasks={() => setActiveTab('tasks')}
          onShowDocuments={() => setActiveTab('documents')}
        />
      ) : null}

      {activeTab === 'tasks' ? (
        <MobileOnboardingTasksSection title={flow.tasksTitle} taskRows={taskRows} />
      ) : null}

      {activeTab === 'documents' ? (
        <MobileOnboardingDocumentsSection title={flow.documentsTitle} documentRows={documentRows} />
      ) : null}

      {activeTab === 'review' ? (
        <MobileOnboardingReviewSection
          portalType={portalType}
          flow={flow}
          completion={completion}
          reviewRows={reviewRows}
        />
      ) : null}

      <MobileUploadSheet
        open={uploadOpen}
        module={flow.uploadModule}
        workspaceId={params.token || portalType}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />
    </MobilePortalScreen>
  )
}
