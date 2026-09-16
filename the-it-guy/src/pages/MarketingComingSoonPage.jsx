import { useSearchParams } from 'react-router-dom'
import { CreateEmailCampaign, EmailCampaignDetail, EmailCampaignOverview } from '../components/marketing/EmailCampaigns'
import { LaunchesOverview } from '../components/marketing/LaunchesAuctions'
import MarketingDashboard from '../components/marketing/MarketingDashboard'
import WebsiteWorkspace from '../components/marketing/WebsiteWorkspace'
import { ShowDayDetail, ShowDaysOverview } from '../components/marketing/ShowDays'
import ShowDayCreate from '../components/marketing/ShowDayCreate'
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
    const openOverview = () => setSearchParams({ section: 'email' })
    const openCreateCampaign = (id) => setSearchParams({ section: 'email', view: 'create', ...(typeof id === 'string' ? { id } : {}) })
    const rememberDraft = (id) => { if (searchParams.get('id') !== id) setSearchParams({ section: 'email', view: 'create', id }, { replace: true }) }
    const openCampaign = (id) => setSearchParams({ section: 'email', view: 'detail', id })
    return campaignView === 'create'
      ? <CreateEmailCampaign onBack={openOverview} campaignId={searchParams.get('id')} onDraftCreated={rememberDraft} />
      : campaignView === 'detail'
        ? <EmailCampaignDetail campaignId={searchParams.get('id')} onBack={openOverview} onEdit={openCreateCampaign} />
        : <EmailCampaignOverview onCreateCampaign={openCreateCampaign} onOpenCampaign={openCampaign} />
  }

  if (section === 'whatsapp') {
    const openOverview = () => setSearchParams({ section: 'whatsapp' })
    const openCreateCampaign = (id) => setSearchParams({ section: 'whatsapp', view: 'create', ...(typeof id === 'string' ? { id } : {}) })
    const openCampaign = (id) => setSearchParams({ section: 'whatsapp', view: 'detail', id })
    const rememberDraft = (id) => setSearchParams({ section: 'whatsapp', view: 'create', id }, { replace: true })
    return campaignView === 'create'
      ? <CreateWhatsAppCampaign onBack={openOverview} campaignId={searchParams.get('id')} onDraftCreated={rememberDraft} />
      : campaignView === 'detail'
        ? <WhatsAppCampaignDetail campaignId={searchParams.get('id')} onBack={openOverview} />
        : <WhatsAppCampaignOverview onCreateCampaign={openCreateCampaign} onOpenCampaign={openCampaign} />
  }

  if (section === 'website') {
    const openBlogEditor = (id) => setSearchParams({ section: 'website', view: 'blog-edit', id })
    const closeBlogEditor = () => setSearchParams({ section: 'website' })
    return <WebsiteWorkspace onBack={() => setSearchParams({})} blogEditorId={campaignView === 'blog-edit' ? searchParams.get('id') : ''} onOpenBlogEditor={openBlogEditor} onCloseBlogEditor={closeBlogEditor} />
  }

  const openMarketingSection = (nextSection) => setSearchParams({ section: nextSection })
  return <MarketingDashboard onNavigate={openMarketingSection} />
}
