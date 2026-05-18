import { Building2, Settings, Users } from 'lucide-react'
import CommercialPlaceholderPage from './CommercialPlaceholderPage'

function CommercialSettingsPage() {
  return (
    <CommercialPlaceholderPage
      title="Commercial Settings"
      description="Prepare commercial workspace settings without changing residential organisation configuration or workflows."
      cards={[
        { title: 'Workspace Preferences', description: 'Configure commercial module preferences, terminology, and default views.', icon: Settings },
        { title: 'Broker Assignment Rules', description: 'Prepare defaults for broker ownership across demand, supply, and transactions.', icon: Users },
        { title: 'Portfolio Defaults', description: 'Prepare commercial property types, vacancy statuses, and portfolio reporting defaults.', icon: Building2 },
      ]}
    />
  )
}

export default CommercialSettingsPage
