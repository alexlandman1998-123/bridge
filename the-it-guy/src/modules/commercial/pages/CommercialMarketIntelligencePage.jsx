import { Building2, LineChart, SearchCheck } from 'lucide-react'
import CommercialPlaceholderPage from './CommercialPlaceholderPage'

function CommercialMarketIntelligencePage() {
  return (
    <CommercialPlaceholderPage
      title="Market Intelligence"
      description="Prepare commercial market insight around demand, supply, asking rentals, asset classes, and location performance."
      cards={[
        { title: 'Demand Signals', description: 'Track requirements by area, size band, asset class, and budget movement.', icon: SearchCheck },
        { title: 'Supply Signals', description: 'Compare vacancies, available GLA, and landlord instructions by market.', icon: Building2 },
        { title: 'Rental Movement', description: 'Prepare asking rental trends and negotiation benchmarks.', icon: LineChart },
      ]}
    />
  )
}

export default CommercialMarketIntelligencePage
