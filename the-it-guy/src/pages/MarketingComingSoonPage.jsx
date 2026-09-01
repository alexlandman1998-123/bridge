import { useSearchParams } from 'react-router-dom'
import { CreateEmailCampaign, EmailCampaignOverview } from '../components/marketing/EmailCampaigns'
import { LaunchesOverview } from '../components/marketing/LaunchesAuctions'
import MarketingDashboard from '../components/marketing/MarketingDashboard'
import WebsiteWorkspace from '../components/marketing/WebsiteWorkspace'
import { ShowDayDetail, ShowDaysOverview } from '../components/marketing/ShowDays'
import { CreateWhatsAppCampaign, WhatsAppCampaignOverview } from '../components/marketing/WhatsAppCampaigns'
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
    return campaignView === 'detail'
      ? <ShowDayDetail onBack={openOverview} showDayId={searchParams.get('id')} />
      : <ShowDaysOverview onOpenShowDay={openShowDay} />
  }

  if (section === 'email') {
    const openOverview = () => setSearchParams({ section: 'email' })
    const openCreateCampaign = () => setSearchParams({ section: 'email', view: 'create' })
    return campaignView === 'create'
      ? <CreateEmailCampaign onBack={openOverview} />
      : <EmailCampaignOverview onCreateCampaign={openCreateCampaign} />
  }

  if (section === 'whatsapp') {
    const openOverview = () => setSearchParams({ section: 'whatsapp' })
    const openCreateCampaign = () => setSearchParams({ section: 'whatsapp', view: 'create' })
    return campaignView === 'create'
      ? <CreateWhatsAppCampaign onBack={openOverview} />
      : <WhatsAppCampaignOverview onCreateCampaign={openCreateCampaign} />
  }

  if (section === 'website') return <WebsiteWorkspace onBack={() => setSearchParams({})} />

  const openMarketingSection = (nextSection) => setSearchParams({ section: nextSection })
  return <MarketingDashboard onNavigate={openMarketingSection} />
}
