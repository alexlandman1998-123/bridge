import { BriefcaseBusiness, Handshake, LineChart } from 'lucide-react'
import CommercialPlaceholderPage from './CommercialPlaceholderPage'

function CommercialBrokerPerformancePage() {
  return (
    <CommercialPlaceholderPage
      title="Broker Performance"
      description="Prepare broker-level performance views across requirements, viewings, proposals, deals, HOT movement, and signed leases or sales."
      cards={[
        { title: 'Pipeline Ownership', description: 'Compare active requirements, vacancies, deals, and follow-up load by broker.', icon: BriefcaseBusiness },
        { title: 'Conversion', description: 'Track requirement-to-viewing, proposal-to-HOT, and HOT-to-signed conversion.', icon: LineChart },
        { title: 'Deal Momentum', description: 'Measure leasing and sales activity moving through the transaction pipeline.', icon: Handshake },
      ]}
    />
  )
}

export default CommercialBrokerPerformancePage
