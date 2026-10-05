import { useEffect, useState } from 'react'
import RevoPropertyExperience from './RevoPropertyExperience'
import { createRevoWebsiteClient } from './revoWebsiteClient'

const defaultClient = createRevoWebsiteClient()
const currentProperty = () => new URL(window.location.href).searchParams.get('property') || null

// Mount on a page in Revo's website; the API proxy and credentials stay on its server.
export default function RevoPropertyWebsite({ client = defaultClient, preview = false, showBrandFrame = true, showCollectionIntro = true, showEnquiry = true, bondApplicationUrl, rentalApplicationUrl }) {
  const [propertyId, setPropertyId] = useState(currentProperty)
  useEffect(() => {
    const change = () => setPropertyId(currentProperty())
    window.addEventListener('popstate', change)
    return () => window.removeEventListener('popstate', change)
  }, [])
  function navigate(id) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('property', id)
    else url.searchParams.delete('property')
    window.history.pushState({}, '', url)
    setPropertyId(id)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const propertyHref = (id) => { const url = new URL(window.location.href); url.searchParams.set('property', id); return url.href }
  return <RevoPropertyExperience client={client} propertyId={propertyId} onNavigate={navigate} propertyHref={propertyHref} preview={preview} showBrandFrame={showBrandFrame} showCollectionIntro={showCollectionIntro} showEnquiry={showEnquiry} bondApplicationUrl={bondApplicationUrl} rentalApplicationUrl={rentalApplicationUrl} />
}
