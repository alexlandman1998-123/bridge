import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import RevoPropertyWebsite from './RevoPropertyWebsite'
import { createRevoWebsiteClient } from './revoWebsiteClient'

// Framework-independent mount. Host credentials belong in the website's server proxy.
export function mountRevoProperties(element, { apiBasePath = '/api/arch9', showBrandFrame = false, bondApplicationUrl, rentalApplicationUrl } = {}) {
  if (!(element instanceof HTMLElement)) throw new Error('Provide the property section’s HTML element.')
  const client = createRevoWebsiteClient({ basePath: apiBasePath })
  const root = createRoot(element)
  root.render(createElement(RevoPropertyWebsite, { client, showBrandFrame, bondApplicationUrl, rentalApplicationUrl }))
  return { unmount: () => root.unmount() }
}
