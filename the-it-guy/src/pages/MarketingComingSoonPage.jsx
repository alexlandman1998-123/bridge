import MetaMarketingWorkspace from '../components/marketing/MetaMarketingWorkspace'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import WhatsAppInbox from '../components/marketing/WhatsAppInbox'
import WhatsAppAutomations from '../components/marketing/WhatsAppAutomations'
import { CreateEmailCampaign, EmailCampaignDetail, EmailCampaignOverview } from '../components/marketing/EmailCampaigns'
import { LaunchesOverview } from '../components/marketing/LaunchesAuctions'
import MarketingDashboard from '../components/marketing/MarketingDashboard'
import MarketingCampaigns from '../components/marketing/MarketingCampaigns'
import WebsiteWorkspace from '../components/marketing/WebsiteWorkspace'
import { ShowDayDetail, ShowDaysOverview } from '../components/marketing/ShowDays'
import ShowDayCreate from '../components/marketing/ShowDayCreate'
import { BUSINESS_CAMPAIGN_GOALS } from '../components/marketing/campaignBusinessGoals'
import { CreateWhatsAppCampaign, WhatsAppCampaignDetail, WhatsAppCampaignOverview } from '../components/marketing/WhatsAppCampaigns'
import './MarketingComingSoonPage.css'
import './WhatsAppCampaigns.css'
import './EmailCampaigns.css'
import './ShowDays.css'
import './LaunchesAuctions.css'
import './MarketingDashboard.css'

export default function MarketingComingSoonPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = searchParams.get('section')
  const campaignView = searchParams.get('view')
  const businessGoal = BUSINESS_CAMPAIGN_GOALS.find((goal) => goal.id === searchParams.get('goal'))
  // A business-goal link resolves into the same persisted campaign builder as
  // Studio. Existing detail, editor and property links retain their own context.
  useEffect(() => {
    if (section === 'campaigns' && businessGoal && !campaignView && !searchParams.has('template')) {
      setSearchParams({ ...Object.fromEntries(searchParams), view: 'create', template: businessGoal.approaches[0].template }, { replace: true })
    }
  }, [section, businessGoal, campaignView, searchParams, setSearchParams])

  if (section === 'meta') return <MetaMarketingWorkspace />

  if (section === 'campaigns') return <MarketingCampaigns />

  if (section === 'launches') return <LaunchesOverview />

  if (section === 'show-days') {
    const openOverview = () => setSearchParams({ section: 'show-days' })
    const openShowDay = (showDayId) => setSearchParams({ section: 'show-days', view: 'detail', id: showDayId })
    const openCreateShowDay = () => setSearchParams({ section: 'show-days', view: 'create' })
    return campaignView === 'create'
      ? <ShowDayCreate onBack={openOverview} onCreated={openShowDay} />
      : campaignView === 'detail'
      ? <ShowDayDetail onBack={openOverview} showDayId={searchParams.get('id')} />
      : <ShowDaysOverview onOpenShowDay={openShowDay} onCreateShowDay={openCreateShowDay} />
  }

  if (section === 'email') {
    const emailTab = ['overview', 'past', 'templates', 'audiences', 'settings'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
    const emailParams = { section: 'email', ...(emailTab !== 'overview' ? { tab: emailTab } : {}) }
    const openOverview = () => setSearchParams(emailParams)
    const openEmailTab = (tab) => setSearchParams({ section: 'email', ...(tab !== 'overview' ? { tab } : {}) })
    const openCreateCampaign = (id, ai = false) => setSearchParams({ ...emailParams, view: 'create', ...(ai ? { ai: '1' } : {}), ...(typeof id === 'string' ? { id } : {}) })
    const rememberDraft = (id) => { if (searchParams.get('id') !== id) setSearchParams({ ...Object.fromEntries(searchParams), ...emailParams, view: 'create', id }, { replace: true }) }
    const openCampaign = (id) => setSearchParams({ ...emailParams, view: 'detail', id })
    return campaignView === 'create'
      ? <CreateEmailCampaign initialListingId={searchParams.get('listingId') || ''} initialObjective={searchParams.get('objective') || 'new_listing'} initialEventId={searchParams.get('eventId') || ''} openAiAssistant={searchParams.get('ai') === '1'} initialScheduleDate={searchParams.get('scheduleDate')} onBack={openOverview} campaignId={searchParams.get('id')} onDraftCreated={rememberDraft} onOpenMarketingCampaign={(id) => setSearchParams({ section: 'campaigns', view: 'detail', id, tab: 'results' })} />
      : campaignView === 'detail'
        ? <EmailCampaignDetail campaignId={searchParams.get('id')} onBack={openOverview} onEdit={openCreateCampaign} />
        : <EmailCampaignOverview selectedView={emailTab} onViewChange={openEmailTab} onCreateCampaign={openCreateCampaign} onOpenCampaign={openCampaign} />
  }

  if (section === 'whatsapp') {
    if (campaignView === 'inbox') return <WhatsAppInbox />
    if (campaignView === 'automations') return <WhatsAppAutomations />
    const whatsappTab = ['overview', 'past', 'templates', 'audiences', 'settings'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
    const whatsappParams = { section: 'whatsapp', ...(whatsappTab === 'overview' ? {} : { tab: whatsappTab }) }
    const openWhatsAppTab = (tab) => setSearchParams({ section: 'whatsapp', ...(tab === 'overview' ? {} : { tab }) })
    const openOverview = () => openWhatsAppTab(whatsappTab)
    const openCreateCampaign = (id) => setSearchParams({ ...whatsappParams, view: 'create', ...(typeof id === 'string' ? { id } : {}) })
    const openCampaign = (id) => setSearchParams({ ...whatsappParams, view: 'detail', id })
    const rememberDraft = (id) => setSearchParams({ ...whatsappParams, view: 'create', id }, { replace: true })
    return <><nav aria-label="WhatsApp" className="mb-5 flex flex-wrap gap-5 text-sm font-semibold text-blue-800"><Link to="/marketing?section=whatsapp" aria-current="page">Campaigns</Link><Link to="/marketing?section=whatsapp&view=inbox">Inbox</Link><Link to="/marketing?section=whatsapp&view=automations">Automations</Link><Link to="/settings/integrations/whatsapp">Connections</Link></nav>{campaignView === 'create'
      ? <CreateWhatsAppCampaign onBack={openOverview} campaignId={searchParams.get('id')} onDraftCreated={rememberDraft} onOpenMarketingCampaign={(id) => setSearchParams({ section: 'campaigns', view: 'detail', id, tab: 'results' })} />
      : campaignView === 'detail'
        ? <WhatsAppCampaignDetail campaignId={searchParams.get('id')} onBack={openOverview} onEdit={(id) => setSearchParams({ section: 'whatsapp', view: 'create', id })} onOpenMarketingCampaign={(id) => setSearchParams({ section: 'campaigns', view: 'detail', id, tab: 'results' })} />
        : <WhatsAppCampaignOverview selectedView={whatsappTab} onViewChange={openWhatsAppTab} onCreateCampaign={openCreateCampaign} onOpenCampaign={openCampaign} />}</>
  }

  if (section === 'website') {
    const openBlogEditor = (id) => setSearchParams({ section: 'website', view: 'blog-edit', id })
    const closeBlogEditor = () => setSearchParams({ section: 'website' })
    return <WebsiteWorkspace onBack={() => setSearchParams({})} blogEditorId={campaignView === 'blog-edit' ? searchParams.get('id') : ''} onOpenBlogEditor={openBlogEditor} onCloseBlogEditor={closeBlogEditor} />
  }

  const openMarketingSection = (nextSection) => setSearchParams({ section: nextSection })
  return <MarketingDashboard onNavigate={openMarketingSection} />
}
