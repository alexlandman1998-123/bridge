import { Link } from 'react-router-dom'
import WhatsAppInbox from '../components/marketing/WhatsAppInbox'
import './WhatsAppCampaigns.css'

export default function WhatsAppInboxPage() {
  return <div className="p-6">
    <nav aria-label="Inbox navigation" className="mb-4 flex gap-4 text-sm">
      <Link to="/inbox">Back to shared inbox</Link>
      <Link to="/settings/integrations/whatsapp">Manage WhatsApp connection</Link>
    </nav>
    <WhatsAppInbox />
  </div>
}
