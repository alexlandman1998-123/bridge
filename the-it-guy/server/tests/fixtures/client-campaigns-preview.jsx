import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ClientCampaignPanel from '../../../src/components/clients/ClientCampaignPanel'
import { getLocalClientPreview } from '../../../src/core/clients/localClientPreview'
import '../../../src/index.css'

const data = getLocalClientPreview({ client: { organisationId: '322c3853-2d82-4413-97e6-b4cd8bc32a7c', email: 'alexlandman1998@gmail.com', name: 'Alexander Landman' } })
createRoot(document.getElementById('root')).render(data ? <MemoryRouter><main style={{ background: '#f6f8fa', minHeight: '100vh', padding: '24px 12px' }}><div style={{ maxWidth: 1150, margin: '0 auto' }}><p style={{ fontSize: 12, color: '#637890', marginBottom: 16 }}>Alexander Landman · Clients / Campaigns · Illustrative campaign designs · Read-only local preview</p><ClientCampaignPanel client={data.client} previewData={data.preview.campaigns} /></div></main></MemoryRouter> : <p>This preview is available on localhost during development only.</p>)
