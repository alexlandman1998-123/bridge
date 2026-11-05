import { createRoot } from 'react-dom/client'
import RevoPropertyWebsite from '../../src/modules/revo/website/RevoPropertyWebsite'
import { previewWebsiteClient } from './previewData'

createRoot(document.getElementById('root')).render(
  <RevoPropertyWebsite client={previewWebsiteClient} preview showBrandFrame={false} showCollectionIntro={false} />,
)
