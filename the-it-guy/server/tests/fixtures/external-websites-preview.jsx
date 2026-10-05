import { createRoot } from 'react-dom/client'
import { ExternalWebsiteWorkspace } from '../../../src/pages/settings/SettingsExternalWebsitesPage'
import '../../../src/index.css'
async function manage(organisationId, action = 'list', connectionId = null, config = {}) {
  const response = await fetch('/__external-websites-test/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_organisation_id: organisationId, p_action: action, p_connection_id: connectionId, p_config: config }) })
  const { data, error } = await response.json()
  if (error) throw new Error(error.message)
  return data
}
createRoot(document.getElementById('root')).render(<main className="min-h-screen bg-[#f7fafc] p-4 sm:p-8"><ExternalWebsiteWorkspace organisationId="322c3853-2d82-4413-97e6-b4cd8bc32a7c" manage={manage} /></main>)
