import {
  Building2,
  FileText,
  FolderOpen,
  Handshake,
  Home,
  Landmark,
  MessageCircle,
  Route,
  ScrollText,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ActivityTimeline,
  BottomNavigation,
  JourneyDetailSheet,
  JourneyTracker,
  MobileTransactionScreen,
  NextActionCard,
  OwnerPanel,
  PropertyCard,
  TeamSection,
  TransactionHeader,
  TransactionHero,
} from '../../components/mobile-shell/MobileOnboardingDesign'
import { MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { trackMobileMetric } from '../../services/observability/monitoring'

const NAV_ITEMS = [
  { key: 'journey', label: 'Journey', icon: Route },
  { key: 'tasks', label: 'Tasks', icon: FileText },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'property', label: 'Property', icon: Home },
]

const DASHBOARD_CONFIG = {
  buyer: {
    portal_label: 'Buyer Portal',
    upload_module: 'lead',
    transaction: {
      id: 'buyer-local-transaction',
      portal_type: 'buyer',
      stage_label: 'Offer Stage',
    },
    property: {
      address: '2 Pine Avenue',
      price: 'R 2,850,000',
      cover_image: '',
      reference: 'B9-BUY-2048',
      agent: 'Sarah Williams',
      current_stage: 'Buyer Verification',
      listing_status: 'Offer active',
    },
    progress: {
      progress_percentage: 23,
      current_stage: 'Buyer Verification',
      stage_number: 2,
      total_stages: 9,
      estimated_completion: '18 August 2026',
      days_remaining: 42,
      last_updated: 'Updated 09:18',
      stage_icon: UserRound,
    },
    owner: {
      id: 'sarah-agent',
      name: 'Sarah Williams',
      role: 'Estate Agent',
      avatar: '',
      status: 'Online',
    },
    waiting_on: {
      title: 'Buyer ID',
      description: 'Expected Today',
      due_date: 'Due today',
    },
    journey: [
      {
        id: 'offer',
        title: 'Offer',
        icon: Handshake,
        status: 'completed',
        owner: 'Sarah Williams',
        expected_date: '2 Jul',
        completed_date: '2 Jul',
        description: 'The offer has been captured and linked to this property transaction.',
        insight: 'Offer terms are accepted and locked into the buyer transaction file.',
        next_step: 'Buyer verification is now active so finance and attorney work can start cleanly.',
        documents: [
          { label: 'Offer to Purchase', status: 'completed' },
          { label: 'Signed addendum', status: 'completed' },
        ],
        cta_text: 'View offer activity',
        cta_route: 'activity',
      },
      {
        id: 'buyer_verification',
        title: 'Buyer Verification',
        icon: UserRound,
        status: 'active',
        owner: 'Buyer',
        expected_date: 'Today',
        completed_date: '',
        description: 'Your identity, address and affordability documents are being collected.',
        insight: 'This is the current transaction gate. Your agent needs the buyer pack before finance packaging can start.',
        next_step: 'Upload your ID document and the portal will move the transaction toward finance packaging.',
        documents: [
          { label: 'Buyer ID document', status: 'active' },
          { label: 'Proof of income', status: 'waiting' },
          { label: 'FICA declaration', status: 'upcoming' },
        ],
        cta_text: 'Upload ID Document',
        cta_route: 'upload_document',
      },
      {
        id: 'finance',
        title: 'Finance',
        icon: Landmark,
        status: 'waiting',
        owner: 'Bank',
        expected_date: '8 Jul',
        completed_date: '',
        description: 'Finance packaging starts once buyer verification is complete.',
        insight: 'Finance is queued and waiting for the buyer verification documents to clear.',
        next_step: 'The bond team will package the application once your ID and supporting documents are received.',
        documents: [
          { label: 'Income pack', status: 'waiting' },
          { label: 'Bank statements', status: 'upcoming' },
        ],
        cta_text: 'Ask for update',
        cta_route: 'messages',
      },
      {
        id: 'attorney',
        title: 'Attorney',
        icon: ShieldCheck,
        status: 'upcoming',
        owner: 'Transfer Attorney',
        expected_date: '12 Jul',
        completed_date: '',
        description: 'The transfer attorney will be assigned after the offer pack is confirmed.',
        insight: 'Attorney work starts once verification and finance readiness are far enough along.',
        next_step: 'No action is needed yet. The attorney will appear here once assigned.',
        documents: [
          { label: 'Attorney instruction', status: 'upcoming' },
        ],
        cta_text: 'View team',
        cta_route: 'messages',
      },
      {
        id: 'registration',
        title: 'Registration',
        icon: Home,
        status: 'upcoming',
        owner: 'Deeds Office',
        expected_date: '18 Aug',
        completed_date: '',
        description: 'Registration confirms final transfer of the property.',
        insight: 'Registration is the final legal handoff after attorney and finance work completes.',
        next_step: 'The portal will show deeds-office progress once transfer is lodged.',
        documents: [
          { label: 'Registration confirmation', status: 'upcoming' },
        ],
        cta_text: 'Got it',
        cta_route: 'close',
      },
    ],
    next_action: {
      title: 'Upload your ID document',
      description: 'Your agent cannot prepare the Offer to Purchase until this document has been submitted.',
      button_text: 'Upload ID Document',
      button_route: 'upload_document',
      priority: 'active',
      priority_label: 'Required today',
      due_label: 'Due today',
      secondary_text: 'Ask Sarah',
      secondary_route: 'messages',
      requirements: [
        { label: 'Buyer ID', status: 'active' },
        { label: 'Proof of income', status: 'waiting' },
        { label: 'FICA', status: 'upcoming' },
      ],
    },
    completed_action: {
      title: 'Buyer verification received',
      description: 'Your document has been received and the transaction can move toward finance packaging.',
      button_text: 'Review Next Step',
      button_route: 'journey',
      priority: 'completed',
      priority_label: 'Received',
      due_label: 'Just now',
      secondary_text: 'Message Sarah',
      secondary_route: 'messages',
      completion_note: 'Nice. The buyer pack has moved into review and finance packaging can start.',
      requirements: [
        { label: 'Buyer ID', status: 'completed' },
        { label: 'Finance pack', status: 'active' },
        { label: 'Attorney prep', status: 'upcoming' },
      ],
    },
    participants: [
      { id: 'sarah-agent', name: 'Sarah Williams', role: 'Estate Agent', status: 'Online' },
      { id: 'michael-attorney', name: 'Michael Jacobs', role: 'Transfer Attorney', status: 'Waiting for documents' },
      { id: 'nedbank', name: 'Nedbank', role: 'Bond Originator', status: 'Preparing application' },
    ],
    activity: [
      { id: 'buyer-invited', timestamp: '09:18', title: 'Buyer Invited', subtitle: 'Portal opened', actor: 'Sarah Williams', icon: 'invite' },
      { id: 'offer-accepted', timestamp: 'Yesterday', title: 'Offer Accepted', subtitle: 'Offer stage active', actor: 'Agent', icon: 'offer' },
      { id: 'attorney-assigned', timestamp: '2 Jul', title: 'Attorney Assigned', subtitle: 'Transfer team added', actor: 'Arch9', icon: 'attorney' },
    ],
  },
  seller: {
    portal_label: 'Seller Portal',
    upload_module: 'listing',
    transaction: {
      id: 'seller-local-transaction',
      portal_type: 'seller',
      stage_label: 'Listing Stage',
    },
    property: {
      address: '2 Pine Avenue',
      price: 'R 2,850,000',
      cover_image: '',
      reference: 'S9-LIST-2048',
      agent: 'Sarah Williams',
      current_stage: 'Mandate Review',
      listing_status: 'Pre-listing',
    },
    progress: {
      progress_percentage: 31,
      current_stage: 'Mandate Review',
      stage_number: 2,
      total_stages: 8,
      estimated_completion: '22 July 2026',
      days_remaining: 18,
      last_updated: 'Updated 09:18',
      stage_icon: ScrollText,
    },
    owner: {
      id: 'sarah-agent',
      name: 'Sarah Williams',
      role: 'Estate Agent',
      avatar: '',
      status: 'Online',
    },
    waiting_on: {
      title: 'Seller Signature',
      description: 'Expected Today',
      due_date: 'Due today',
    },
    journey: [
      {
        id: 'valuation',
        title: 'Valuation',
        icon: Building2,
        status: 'completed',
        owner: 'Sarah Williams',
        expected_date: '30 Jun',
        completed_date: '30 Jun',
        description: 'The property valuation and listing recommendation were completed.',
        insight: 'The valuation is complete and the listing recommendation is available to the agent.',
        next_step: 'Mandate review is now active and needs seller approval before publication work can continue.',
        documents: [
          { label: 'Valuation report', status: 'completed' },
          { label: 'Pricing recommendation', status: 'completed' },
        ],
        cta_text: 'View valuation activity',
        cta_route: 'activity',
      },
      {
        id: 'mandate',
        title: 'Mandate',
        icon: ScrollText,
        status: 'active',
        owner: 'Seller',
        expected_date: 'Today',
        completed_date: '',
        description: 'The mandate is waiting for review and signature before listing work can continue.',
        insight: 'This is the current seller gate. Your agent cannot publish the listing until the mandate is reviewed.',
        next_step: 'Review and sign the mandate so compliance and media preparation can unlock.',
        documents: [
          { label: 'Listing mandate', status: 'active' },
          { label: 'Seller ID', status: 'waiting' },
          { label: 'Municipal account', status: 'upcoming' },
        ],
        cta_text: 'Review Mandate',
        cta_route: 'upload_document',
      },
      {
        id: 'compliance',
        title: 'Compliance',
        icon: ShieldCheck,
        status: 'waiting',
        owner: 'Seller',
        expected_date: '8 Jul',
        completed_date: '',
        description: 'Seller and property compliance documents are checked in this stage.',
        insight: 'Compliance is queued and will start once the mandate is signed.',
        next_step: 'Prepare municipal and seller documents so this stage can move quickly once unlocked.',
        documents: [
          { label: 'Rates account', status: 'waiting' },
          { label: 'Seller FICA', status: 'upcoming' },
        ],
        cta_text: 'Ask Sarah',
        cta_route: 'messages',
      },
      {
        id: 'media',
        title: 'Media',
        icon: FileText,
        status: 'upcoming',
        owner: 'Creative Media Co.',
        expected_date: '10 Jul',
        completed_date: '',
        description: 'Photography, listing copy and marketing assets are prepared.',
        insight: 'Media preparation starts once mandate and compliance readiness are confirmed.',
        next_step: 'Your agent will coordinate photography and listing copy from this stage.',
        documents: [
          { label: 'Photo brief', status: 'upcoming' },
          { label: 'Listing copy', status: 'upcoming' },
        ],
        cta_text: 'View media team',
        cta_route: 'messages',
      },
      {
        id: 'publish',
        title: 'Publish',
        icon: Home,
        status: 'upcoming',
        owner: 'Sarah Williams',
        expected_date: '12 Jul',
        completed_date: '',
        description: 'The listing is activated once compliance and media are ready.',
        insight: 'Publishing is the final listing launch step after mandate, compliance and media are complete.',
        next_step: 'The portal will show listing approval and launch status when this stage opens.',
        documents: [
          { label: 'Listing approval', status: 'upcoming' },
        ],
        cta_text: 'Got it',
        cta_route: 'close',
      },
    ],
    next_action: {
      title: 'Review and sign the mandate',
      description: 'Your agent cannot publish the listing until the mandate has been signed.',
      button_text: 'Review Mandate',
      button_route: 'upload_document',
      priority: 'active',
      priority_label: 'Required today',
      due_label: 'Expected today',
      secondary_text: 'Ask Sarah',
      secondary_route: 'messages',
      requirements: [
        { label: 'Mandate', status: 'active' },
        { label: 'Seller ID', status: 'waiting' },
        { label: 'Rates account', status: 'upcoming' },
      ],
    },
    completed_action: {
      title: 'Mandate review received',
      description: 'Your mandate response has been received and the listing can move toward compliance.',
      button_text: 'Review Listing',
      button_route: 'journey',
      priority: 'completed',
      priority_label: 'Received',
      due_label: 'Just now',
      secondary_text: 'Message Sarah',
      secondary_route: 'messages',
      completion_note: 'Great. The mandate gate is cleared and compliance is now active.',
      requirements: [
        { label: 'Mandate', status: 'completed' },
        { label: 'Compliance', status: 'active' },
        { label: 'Media prep', status: 'upcoming' },
      ],
    },
    participants: [
      { id: 'sarah-agent', name: 'Sarah Williams', role: 'Estate Agent', status: 'Online' },
      { id: 'media-team', name: 'Creative Media Co.', role: 'Media Team', status: 'Photography pending' },
      { id: 'michael-attorney', name: 'Michael Jacobs', role: 'Transfer Attorney', status: 'Standing by' },
    ],
    activity: [
      { id: 'mandate-sent', timestamp: '09:18', title: 'Mandate Sent', subtitle: 'Ready for review', actor: 'Sarah Williams', icon: 'mandate' },
      { id: 'valuation-complete', timestamp: 'Yesterday', title: 'Valuation Completed', subtitle: 'Listing stage active', actor: 'Agent', icon: 'valuation' },
      { id: 'seller-invited', timestamp: '2 Jul', title: 'Seller Invited', subtitle: 'Portal opened', actor: 'Arch9', icon: 'invite' },
    ],
  },
}

function buildMobileDashboard({ portalType = 'buyer', token = '', actionCompleted = false } = {}) {
  const config = DASHBOARD_CONFIG[portalType] || DASHBOARD_CONFIG.buyer
  const firstWaitingStageId = config.journey.find((stage) => stage.status === 'waiting')?.id
  const journey = config.journey.map((stage) => {
    if (!actionCompleted) return stage
    if (stage.status === 'active') return { ...stage, status: 'completed', completed_date: 'Just now' }
    if (stage.status === 'waiting' && stage.id === firstWaitingStageId) return { ...stage, status: 'active', expected_date: 'Now' }
    return stage
  })
  const activeStageIndex = Math.max(0, journey.findIndex((stage) => stage.status === 'active'))
  const nextStage = journey[activeStageIndex] || journey[0]
  const nextAction = actionCompleted ? config.completed_action : config.next_action

  return {
    transaction: {
      ...config.transaction,
      token,
    },
    property: {
      ...config.property,
      current_stage: actionCompleted ? nextStage?.title || config.property.current_stage : config.property.current_stage,
    },
    progress: {
      ...config.progress,
      progress_percentage: Math.min(100, config.progress.progress_percentage + (actionCompleted ? 9 : 0)),
      current_stage: actionCompleted ? nextStage?.title || config.progress.current_stage : config.progress.current_stage,
      stage_number: actionCompleted ? activeStageIndex + 1 : config.progress.stage_number,
      stage_icon: nextStage?.icon || config.progress.stage_icon,
    },
    owner: config.owner,
    waiting_on: actionCompleted
      ? {
          title: nextStage?.owner || 'Team',
          description: 'Next stage active',
          due_date: 'In progress',
        }
      : config.waiting_on,
    journey,
    next_action: nextAction,
    participants: config.participants,
    activity: actionCompleted
      ? [
          { id: 'just-now', timestamp: 'Now', title: nextAction.title, subtitle: 'Transaction updated', actor: config.portal_label, icon: 'complete' },
          ...config.activity,
        ]
      : config.activity,
    notifications: [],
    messages: [],
    portal_label: config.portal_label,
    upload_module: config.upload_module,
  }
}

export default function MobileOnboardingPage({ portalType = 'buyer' }) {
  const params = useParams()
  const [activeNav, setActiveNav] = useState('journey')
  const [selectedJourneyItem, setSelectedJourneyItem] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [actionCompleted, setActionCompleted] = useState(false)
  const dashboard = useMemo(
    () => buildMobileDashboard({ portalType, token: params.token || '', actionCompleted }),
    [actionCompleted, params.token, portalType],
  )

  function handlePrimaryAction() {
    void trackMobileMetric('transaction_primary_action_clicked', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: {
        portalType,
        token: params.token || '',
        action: dashboard.next_action.button_text,
      },
    })

    if (dashboard.next_action.button_route === 'upload_document') {
      setUploadOpen(true)
      return
    }

    setActiveNav('journey')
  }

  function handleSecondaryAction(action) {
    void trackMobileMetric('transaction_secondary_action_clicked', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: {
        portalType,
        token: params.token || '',
        action: action.secondary_text,
      },
    })

    if (action.secondary_route === 'messages') {
      setActiveNav('messages')
      return
    }

    setActiveNav('journey')
  }

  function handleUploaded(record) {
    setActionCompleted(true)
    setUploadOpen(false)
    void trackMobileMetric('document_uploaded', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: {
        portalType,
        token: params.token || '',
        documentType: record.documentType,
      },
    })
  }

  function handleJourneyAction(item) {
    void trackMobileMetric('journey_stage_action_clicked', {
      route: `/mobile/${portalType}-onboarding`,
      metadata: {
        portalType,
        token: params.token || '',
        stage: item.id,
        action: item.cta_text,
      },
    })

    setSelectedJourneyItem(null)

    if (item.cta_route === 'upload_document') {
      setUploadOpen(true)
      return
    }

    if (item.cta_route === 'messages') {
      setActiveNav('messages')
      return
    }

    if (item.cta_route === 'activity') {
      setActiveNav('journey')
    }
  }

  return (
    <MobileTransactionScreen
      portalType={portalType}
      bottomNav={<BottomNavigation portalType={portalType} items={NAV_ITEMS} active={activeNav} onChange={setActiveNav} />}
    >
      <TransactionHeader
        portalType={portalType}
        eyebrow={dashboard.portal_label}
        address={dashboard.property.address}
        stage={dashboard.transaction.stage_label}
      />

      <TransactionHero portalType={portalType} progress={dashboard.progress} />

      {activeNav === 'journey' ? (
        <>
          <OwnerPanel portalType={portalType} owner={dashboard.owner} waitingOn={dashboard.waiting_on} />
          <JourneyTracker portalType={portalType} items={dashboard.journey} onSelect={setSelectedJourneyItem} />
          <NextActionCard portalType={portalType} action={dashboard.next_action} onAction={handlePrimaryAction} onSecondary={handleSecondaryAction} />
          <TeamSection portalType={portalType} people={dashboard.participants} />
          <ActivityTimeline items={dashboard.activity} />
        </>
      ) : null}

      {activeNav === 'tasks' ? (
        <>
          <NextActionCard portalType={portalType} action={dashboard.next_action} onAction={handlePrimaryAction} onSecondary={handleSecondaryAction} />
          <JourneyTracker portalType={portalType} items={dashboard.journey} onSelect={setSelectedJourneyItem} />
        </>
      ) : null}

      {activeNav === 'documents' ? (
        <>
          <NextActionCard portalType={portalType} action={dashboard.next_action} onAction={handlePrimaryAction} onSecondary={handleSecondaryAction} />
          <ActivityTimeline items={dashboard.activity.slice(0, 2)} />
        </>
      ) : null}

      {activeNav === 'messages' ? (
        <>
          <TeamSection portalType={portalType} people={dashboard.participants} />
          <ActivityTimeline items={dashboard.activity} />
        </>
      ) : null}

      {activeNav === 'property' ? (
        <>
          <PropertyCard portalType={portalType} property={dashboard.property} />
          <JourneyTracker portalType={portalType} items={dashboard.journey} onSelect={setSelectedJourneyItem} />
        </>
      ) : null}

      <JourneyDetailSheet
        portalType={portalType}
        item={selectedJourneyItem}
        onClose={() => setSelectedJourneyItem(null)}
        onAction={handleJourneyAction}
      />

      <MobileUploadSheet
        open={uploadOpen}
        module={dashboard.upload_module}
        workspaceId={params.token || portalType}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />
    </MobileTransactionScreen>
  )
}
